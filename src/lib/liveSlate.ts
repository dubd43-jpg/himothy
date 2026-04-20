import { LEAGUE_URLS } from '@/lib/validation';

export interface LiveSlateGame {
  id: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  period: string;
  clock: string;
  status: string;
  isLive: boolean;
  isFinal: boolean;
  isScheduled: boolean;
  startTime: string;
  externalLink: string;
  verified: boolean;
  line: string | null;
  odds: string | null;
  oddsSource: string | null;
  lineTimestampUtc: string | null;
  oddsAvailable: boolean;
  feedLastUpdatedUtc: string;
  freshnessMinutes: number;
}

const DEFAULT_ACTIVE_LEAGUES = [
  'NBA',
  'NFL',
  'MLB',
  'NHL',
  'Soccer - EPL',
  'Soccer - La Liga',
  'Soccer - Serie A',
  'Soccer - Bundesliga',
  'Soccer - Ligue 1',
];

function toLeagueDate(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function getDateWindow() {
  const now = new Date();
  const windows = [-1, 0, 1];

  return windows.map((offset) => {
    const d = new Date(now);
    d.setDate(now.getDate() + offset);
    return toLeagueDate(d);
  });
}

function getSportSlugFromLeagueUrl(url: string) {
  if (url.includes('/soccer/')) return 'soccer';
  if (url.includes('/football/nfl')) return 'nfl';
  if (url.includes('/baseball/mlb')) return 'mlb';
  if (url.includes('/hockey/nhl')) return 'nhl';
  if (url.includes('/basketball/nba')) return 'nba';
  if (url.includes('/basketball/mens-college-basketball')) return 'mens-college-basketball';
  return 'sports';
}

function getSportLabel(league: string) {
  if (league.includes('Soccer')) return 'Soccer';
  if (league === 'NHL') return 'Hockey';
  if (league === 'MLB') return 'Baseball';
  if (league === 'NFL') return 'Football';
  if (league.includes('NCAA')) return 'College Basketball';
  return 'Basketball';
}

function parseGame(league: string, leagueUrl: string, event: any): LiveSlateGame {
  const comp = event.competitions?.[0];
  const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
  const oddsNode = comp?.odds?.[0];
  const oddsDetails = typeof oddsNode?.details === 'string' ? oddsNode.details : null;
  const sourceName = oddsNode?.provider?.name || oddsNode?.provider?.displayName || oddsNode?.source || null;
  const lineValue = typeof oddsNode?.overUnder === 'number'
    ? `${oddsNode.overUnder}`
    : oddsDetails
      ? (oddsDetails.match(/[+-]\d+(\.\d+)?/)?.[0] || null)
      : null;
  const now = new Date();
  const lineTs = oddsNode?.timestamp ? new Date(oddsNode.timestamp) : now;
  const freshnessMinutes = Math.max(0, Math.floor((now.getTime() - lineTs.getTime()) / 60000));

  const state = event.status?.type?.state;
  const isLive = state === 'in';
  const isFinal = state === 'post' || Boolean(event.status?.type?.completed);
  const isScheduled = !isLive && !isFinal;

  return {
    id: String(event.id),
    sport: getSportLabel(league),
    league,
    homeTeam: home?.team?.displayName || 'Home',
    awayTeam: away?.team?.displayName || 'Away',
    homeScore: Number.parseInt(home?.score || '0', 10),
    awayScore: Number.parseInt(away?.score || '0', 10),
    period: event.status?.type?.shortDetail || event.status?.type?.description || 'Scheduled',
    clock: event.status?.displayClock || '',
    status: event.status?.type?.detail || event.status?.type?.description || 'Scheduled',
    isLive,
    isFinal,
    isScheduled,
    startTime: event.date || '',
    externalLink: `https://www.espn.com/${getSportSlugFromLeagueUrl(leagueUrl)}/game/_/gameId/${event.id}`,
    verified: Boolean(event.id && home?.team?.displayName && away?.team?.displayName && event.date),
    line: lineValue,
    odds: oddsDetails,
    oddsSource: sourceName,
    lineTimestampUtc: lineTs.toISOString(),
    oddsAvailable: Boolean(oddsDetails && sourceName),
    feedLastUpdatedUtc: now.toISOString(),
    freshnessMinutes,
  };
}

async function fetchLeagueGames(league: string, leagueUrl: string, dates: string[]): Promise<LiveSlateGame[]> {
  const eventMap = new Map<string, LiveSlateGame>();

  await Promise.all(
    dates.map(async (date) => {
      try {
        const res = await fetch(`${leagueUrl}/scoreboard?dates=${date}`, { cache: 'no-store' });
        if (!res.ok) return;

        const data = await res.json();
        const events = data.events || [];

        for (const event of events) {
          eventMap.set(String(event.id), parseGame(league, leagueUrl, event));
        }
      } catch {
        // Ignore a single league/date fetch failure and keep other data sources alive.
      }
    })
  );

  return Array.from(eventMap.values());
}

function sortGames(games: LiveSlateGame[]) {
  return games.sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
    if (a.isScheduled !== b.isScheduled) return a.isScheduled ? -1 : 1;

    const aTs = a.startTime ? new Date(a.startTime).getTime() : Number.MAX_SAFE_INTEGER;
    const bTs = b.startTime ? new Date(b.startTime).getTime() : Number.MAX_SAFE_INTEGER;
    return aTs - bTs;
  });
}

export async function fetchLiveSlate({
  leagues = DEFAULT_ACTIVE_LEAGUES,
  maxGames = 24,
}: {
  leagues?: string[];
  maxGames?: number;
} = {}): Promise<LiveSlateGame[]> {
  const dates = getDateWindow();

  const leaguesWithUrls = leagues
    .map((league) => ({ league, url: LEAGUE_URLS[league] }))
    .filter((entry): entry is { league: string; url: string } => Boolean(entry.url));

  const allResults = await Promise.all(
    leaguesWithUrls.map(({ league, url }) => fetchLeagueGames(league, url, dates))
  );

  const games = allResults.flat();
  return sortGames(games).slice(0, maxGames);
}
