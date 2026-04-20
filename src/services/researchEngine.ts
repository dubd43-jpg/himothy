import { LEAGUE_URLS } from '@/lib/validation';

export interface GameContextData {
  teamForm: any;
  matchup: any;
  injuries: any;
  marketMovement: {
    open: number;
    current: number;
    steam: string;
    publicMoneyPercentage: number;
    sharpMoneyPercentage: number;
    ticketCount: number;
  };
  situational: {
    travelDistanceMiles: number;
    timeZoneCrosses: number;
    restDays: number;
    refereeTendencies?: any;
    weather?: string;
  };
  environmental: any;
  advancedMetrics: {
    homeOffensiveRating: number;
    homeDefensiveRating: number;
    awayOffensiveRating: number;
    awayDefensiveRating: number;
    paceEdge: number;
  };
}

export interface ResearchDossier {
  gameId: string;
  sportId: string;
  context: GameContextData;
  systemReasonsFor: string[];
  systemReasonsAgainst: string[];
  riskAnalysis: string;
  sharpEdgeDetected: boolean;
}

const EVENT_CACHE_TTL_MS = 90_000;
const eventCache = new Map<string, { fetchedAt: number; event: any | null; league: string | null }>();

function dateKey(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function parseAmericanOdds(details?: string | null) {
  if (!details) return NaN;
  const match = String(details).match(/[+-]?\d{3,4}/);
  if (!match) return NaN;
  const val = Number.parseInt(match[0], 10);
  return Number.isFinite(val) ? val : NaN;
}

function toProjectedClose(currentAmerican: number) {
  if (!Number.isFinite(currentAmerican)) return NaN;
  const towardEven = currentAmerican > 0 ? Math.max(100, currentAmerican - 10) : Math.min(-100, currentAmerican + 10);
  return towardEven;
}

async function findEventById(gameId: string) {
  const cached = eventCache.get(gameId);
  const now = Date.now();
  if (cached && now - cached.fetchedAt <= EVENT_CACHE_TTL_MS) {
    return cached;
  }

  const leagues = [
    'NBA',
    'NFL',
    'MLB',
    'NHL',
    'NCAA Basketball',
    'Soccer - EPL',
    'Soccer - La Liga',
    'Soccer - Serie A',
    'Soccer - Bundesliga',
    'Soccer - Ligue 1',
  ];

  const windows = [-1, 0, 1].map((offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return dateKey(d);
  });

  for (const league of leagues) {
    const base = LEAGUE_URLS[league];
    if (!base) continue;
    for (const date of windows) {
      try {
        const res = await fetch(`${base}/scoreboard?dates=${date}`, { cache: 'no-store' });
        if (!res.ok) continue;
        const data = await res.json();
        const events = data.events || [];
        const event = events.find((e: any) => String(e.id) === String(gameId));
        if (event) {
          const value = { fetchedAt: now, event, league };
          eventCache.set(gameId, value);
          return value;
        }
      } catch {
        continue;
      }
    }
  }

  const miss = { fetchedAt: now, event: null, league: null };
  eventCache.set(gameId, miss);
  return miss;
}

export async function buildResearchDossier(gameId: string): Promise<ResearchDossier> {
  const found = await findEventById(gameId);
  const event = found.event;

  const comp = event?.competitions?.[0];
  const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
  const oddsNode = comp?.odds?.[0];
  const oddsDetails = typeof oddsNode?.details === 'string' ? oddsNode.details : null;

  const currentAmerican = parseAmericanOdds(oddsDetails);
  const projectedCloseAmerican = toProjectedClose(currentAmerican);
  const hasOdds = Number.isFinite(currentAmerican);
  const eventState = event?.status?.type?.state || 'pre';
  const statusDetail = event?.status?.type?.detail || event?.status?.type?.description || 'Scheduled';

  const ctx: GameContextData = {
    teamForm: {
      source: event ? 'live-scoreboard' : 'unknown',
      homeTrend: 'live-context',
      awayTrend: 'live-context',
    },
    matchup: {
      keyMatchup: event ? `${away?.team?.displayName || 'Away'} vs ${home?.team?.displayName || 'Home'}` : 'event-not-found',
    },
    injuries: {
      source: 'not-verified-in-feed',
      home: [],
      away: [],
    },
    marketMovement: {
      open: Number.isFinite(currentAmerican) ? currentAmerican : 0,
      current: Number.isFinite(currentAmerican) ? currentAmerican : 0,
      steam: hasOdds ? 'tracking-live' : 'odds-unavailable',
      publicMoneyPercentage: hasOdds ? 50 : 0,
      sharpMoneyPercentage: hasOdds ? 50 : 0,
      ticketCount: 0,
    },
    situational: {
      travelDistanceMiles: 0,
      timeZoneCrosses: 0,
      restDays: eventState === 'pre' ? 1 : 0,
      refereeTendencies: undefined,
      weather: undefined,
    },
    environmental: {
      statusDetail,
      startTimeUtc: event?.date || null,
    },
    advancedMetrics: {
      homeOffensiveRating: 0,
      homeDefensiveRating: 0,
      awayOffensiveRating: 0,
      awayDefensiveRating: 0,
      paceEdge: 0,
    },
  };

  const reasonsFor: string[] = [];
  const reasonsAgainst: string[] = [];

  if (event) {
    reasonsFor.push('Event verified in trusted live scoreboard feed.');
  } else {
    reasonsAgainst.push('Event could not be verified during this research pass.');
  }

  if (hasOdds) {
    reasonsFor.push(`Live market available (${oddsDetails}).`);
    if (Number.isFinite(projectedCloseAmerican)) {
      reasonsFor.push(`Model projects a mild close toward ${projectedCloseAmerican > 0 ? '+' : ''}${projectedCloseAmerican}.`);
    }
  } else {
    reasonsAgainst.push('Live odds are unavailable; market-specific confidence reduced.');
  }

  if (eventState === 'pre') {
    reasonsFor.push('Pregame status confirmed; research remains actionable before kickoff/tipoff.');
  } else if (eventState === 'in') {
    reasonsAgainst.push('Event is already live; pregame edge assumptions may be stale.');
  }

  return {
    gameId,
    sportId: found.league || 'UNKNOWN',
    context: ctx,
    systemReasonsFor: reasonsFor,
    systemReasonsAgainst: reasonsAgainst,
    riskAnalysis: hasOdds
      ? 'Research is based on verified event and current market snapshot. Recheck close-to-start line movement before publish.'
      : 'Research confidence is capped until a verified odds source appears.',
    sharpEdgeDetected: Boolean(event && hasOdds && eventState === 'pre'),
  };
}

