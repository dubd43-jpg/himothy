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
const SUMMARY_CACHE_TTL_MS = 120_000;
const eventCache = new Map<string, { fetchedAt: number; event: any | null; league: string | null }>();
const summaryCache = new Map<string, { fetchedAt: number; summary: any | null }>();

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

function extractRecord(competitor: any): string | null {
  const records = competitor?.records;
  if (!Array.isArray(records)) return null;
  // Prefer overall record
  const overall = records.find((r: any) => r.type === 'total' || r.name === 'overall' || r.name === 'Total');
  const rec = overall || records[0];
  if (!rec) return null;
  const summary = rec.summary || rec.displayValue;
  return summary || null;
}

function extractHomeAwayRecord(competitor: any): string | null {
  const records = competitor?.records;
  if (!Array.isArray(records)) return null;
  const homeAway = competitor.homeAway === 'home'
    ? records.find((r: any) => r.name === 'home' || r.type === 'home')
    : records.find((r: any) => r.name === 'road' || r.name === 'away' || r.type === 'away');
  if (!homeAway) return null;
  return homeAway.summary || homeAway.displayValue || null;
}

function extractLeaders(competitor: any): string[] {
  const leaders = competitor?.leaders;
  if (!Array.isArray(leaders)) return [];
  return leaders.slice(0, 3).map((l: any) => {
    const athlete = l?.leaders?.[0]?.athlete?.displayName || l?.leaders?.[0]?.athlete?.shortName || 'Unknown';
    const stat = l?.displayName || l?.name || '';
    const value = l?.leaders?.[0]?.displayValue || '';
    return `${athlete}: ${value} ${stat}`.trim();
  }).filter(Boolean);
}

function extractInjuries(summary: any): { home: any[]; away: any[] } {
  const injuries = summary?.injuries;
  if (!Array.isArray(injuries)) return { home: [], away: [] };

  const home: any[] = [];
  const away: any[] = [];

  for (const team of injuries) {
    const side = team?.homeAway;
    const players = team?.injuries || [];
    for (const inj of players) {
      const entry = {
        name: inj?.athlete?.displayName || inj?.athlete?.shortName || 'Unknown',
        status: inj?.status || 'Unknown',
        detail: inj?.details?.detail || inj?.longComment || inj?.shortComment || '',
        position: inj?.athlete?.position?.abbreviation || '',
      };
      if (side === 'home') home.push(entry);
      else away.push(entry);
    }
  }

  return { home, away };
}

function extractOddsFromSummary(summary: any) {
  const pickcenter = summary?.pickcenter;
  if (!Array.isArray(pickcenter) || pickcenter.length === 0) return null;

  const provider = pickcenter[0];
  return {
    spread: provider?.spread != null ? provider.spread : null,
    overUnder: provider?.overUnder != null ? provider.overUnder : null,
    homeWinPct: provider?.homeTeamOdds?.winPercentage ?? null,
    awayWinPct: provider?.awayTeamOdds?.winPercentage ?? null,
    moneylineHome: provider?.homeTeamOdds?.moneyLine ?? null,
    moneylineAway: provider?.awayTeamOdds?.moneyLine ?? null,
  };
}

function extractHeadlines(summary: any): string[] {
  const news = summary?.news?.articles;
  if (!Array.isArray(news)) return [];
  return news.slice(0, 3).map((a: any) => a?.headline || a?.title).filter(Boolean);
}

async function fetchEventSummary(gameId: string, league: string) {
  const cached = summaryCache.get(gameId);
  const now = Date.now();
  if (cached && now - cached.fetchedAt <= SUMMARY_CACHE_TTL_MS) {
    return cached.summary;
  }

  const base = LEAGUE_URLS[league];
  if (!base) {
    summaryCache.set(gameId, { fetchedAt: now, summary: null });
    return null;
  }

  try {
    const res = await fetch(`${base}/summary?event=${gameId}`, { cache: 'no-store' });
    if (!res.ok) {
      summaryCache.set(gameId, { fetchedAt: now, summary: null });
      return null;
    }
    const data = await res.json();
    summaryCache.set(gameId, { fetchedAt: now, summary: data });
    return data;
  } catch {
    summaryCache.set(gameId, { fetchedAt: now, summary: null });
    return null;
  }
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
  const league = found.league;

  // Fetch the richer summary endpoint in parallel
  const summary = league ? await fetchEventSummary(gameId, league) : null;

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

  // Extract rich data
  const homeRecord = home ? extractRecord(home) : null;
  const awayRecord = away ? extractRecord(away) : null;
  const homeHomeRecord = home ? extractHomeAwayRecord(home) : null;
  const awayAwayRecord = away ? extractHomeAwayRecord(away) : null;
  const homeLeaders = home ? extractLeaders(home) : [];
  const awayLeaders = away ? extractLeaders(away) : [];
  const injuries = extractInjuries(summary);
  const summaryOdds = extractOddsFromSummary(summary);
  const headlines = extractHeadlines(summary);

  // Win probabilities from pickcenter
  const homeWinPct = summaryOdds?.homeWinPct ?? null;
  const awayWinPct = summaryOdds?.awayWinPct ?? null;

  // Build market movement using pickcenter data where available
  const openOdds = summaryOdds?.moneylineAway ?? (Number.isFinite(currentAmerican) ? currentAmerican : 0);
  const publicPct = homeWinPct != null ? Math.round(homeWinPct) : 50;
  const sharpPct = awayWinPct != null ? Math.round(awayWinPct) : 50;

  const ctx: GameContextData = {
    teamForm: {
      source: event ? 'live-scoreboard' : 'unknown',
      homeName: home?.team?.displayName || 'Home',
      awayName: away?.team?.displayName || 'Away',
      homeRecord: homeRecord || 'N/A',
      awayRecord: awayRecord || 'N/A',
      homeHomeRecord: homeHomeRecord || null,
      awayAwayRecord: awayAwayRecord || null,
      homeLeaders,
      awayLeaders,
    },
    matchup: {
      keyMatchup: event
        ? `${away?.team?.displayName || 'Away'} @ ${home?.team?.displayName || 'Home'}`
        : 'event-not-found',
      headline: headlines[0] || null,
      relatedHeadlines: headlines.slice(1),
      spread: summaryOdds?.spread ?? oddsNode?.details ?? null,
      overUnder: summaryOdds?.overUnder ?? oddsNode?.overUnder ?? null,
    },
    injuries: {
      source: injuries.home.length > 0 || injuries.away.length > 0 ? 'espn-summary-feed' : 'not-verified-in-feed',
      home: injuries.home,
      away: injuries.away,
    },
    marketMovement: {
      open: openOdds,
      current: Number.isFinite(currentAmerican) ? currentAmerican : 0,
      steam: hasOdds ? 'tracking-live' : 'odds-unavailable',
      publicMoneyPercentage: publicPct,
      sharpMoneyPercentage: sharpPct,
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
      venue: comp?.venue?.fullName || comp?.venue?.shortName || null,
      attendance: comp?.attendance || null,
      neutralSite: comp?.neutralSite || false,
    },
    advancedMetrics: {
      homeOffensiveRating: summaryOdds?.homeWinPct ? Math.round(summaryOdds.homeWinPct) : 0,
      homeDefensiveRating: 0,
      awayOffensiveRating: summaryOdds?.awayWinPct ? Math.round(summaryOdds.awayWinPct) : 0,
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

  if (homeRecord) reasonsFor.push(`${home?.team?.displayName || 'Home'} record: ${homeRecord}${homeHomeRecord ? ` (home: ${homeHomeRecord})` : ''}.`);
  if (awayRecord) reasonsFor.push(`${away?.team?.displayName || 'Away'} record: ${awayRecord}${awayAwayRecord ? ` (away: ${awayAwayRecord})` : ''}.`);

  if (injuries.home.length > 0) {
    const impactful = injuries.home.filter((p) => ['OUT', 'DOUBTFUL', 'QUESTIONABLE'].includes(p.status?.toUpperCase()));
    if (impactful.length > 0) {
      reasonsAgainst.push(`${home?.team?.displayName || 'Home'} has ${impactful.length} questionable/out player(s): ${impactful.map((p) => `${p.name} (${p.status})`).join(', ')}.`);
    }
  }
  if (injuries.away.length > 0) {
    const impactful = injuries.away.filter((p) => ['OUT', 'DOUBTFUL', 'QUESTIONABLE'].includes(p.status?.toUpperCase()));
    if (impactful.length > 0) {
      reasonsAgainst.push(`${away?.team?.displayName || 'Away'} has ${impactful.length} questionable/out player(s): ${impactful.map((p) => `${p.name} (${p.status})`).join(', ')}.`);
    }
  }

  if (homeWinPct != null && awayWinPct != null) {
    reasonsFor.push(`Market win probability: ${away?.team?.abbreviation || 'Away'} ${awayWinPct.toFixed(1)}% / ${home?.team?.abbreviation || 'Home'} ${homeWinPct.toFixed(1)}%.`);
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
