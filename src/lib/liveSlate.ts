import { LEAGUE_URLS } from '@/lib/validation';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

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

// Must include every league the picks engine can produce a pick on. If a league is
// missing here, the live-scores feed won't carry its games, computeLiveState will return
// null, and pick cards freeze at "starts at 3 PM" forever. The picks engine pulls from
// BOARD_LEAGUES in deepResearchService.ts — this list must stay aligned with that.
const DEFAULT_ACTIVE_LEAGUES = [
  // North American
  'NFL', 'NHL', 'NBA', 'WNBA', 'MLB', 'College Football', 'NCAA Basketball', 'NCAA Baseball',
  // Soccer (every league the engine surfaces)
  'Soccer - EPL', 'Soccer - La Liga', 'Soccer - Bundesliga', 'Soccer - Serie A',
  'Soccer - Ligue 1', 'Soccer - Champions League', 'Soccer - Europa', 'Soccer - Conference',
  'Soccer - MLS', 'Soccer - Liga MX',
  // Tennis tournaments (ATP / WTA tour stops)
  'Tennis - ATP', 'Tennis - WTA',
  // Combat
  'MMA - UFC', 'MMA - PFL', 'Boxing',
  // Individual (golf / racing)
  'Golf - PGA', 'Golf - LIV', 'Golf - LPGA', 'Golf - European',
  'F1', 'NASCAR', 'IndyCar',
  // Global team sports
  'Cricket - IPL', 'Cricket', 'Rugby - NRL', 'Rugby - Top 14', 'Rugby - Premiership',
  'AFL', 'Soccer - Brazil Serie A', 'Soccer - Argentina',
  'Denmark Superliga', 'Romania Liga 1', 'Netherlands Eredivisie',
];

function toLeagueDate(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function getDateWindow() {
  // EASTERN-anchored. The old version used the server clock (UTC on Vercel), so late ET
  // evening the window shifted forward and today's finished games could fall outside it.
  // We are an Eastern-time product — build the ET calendar date, then walk -1/0/+1 ET days.
  const etParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = Number(etParts.find((p) => p.type === 'year')!.value);
  const m = Number(etParts.find((p) => p.type === 'month')!.value);
  const dd = Number(etParts.find((p) => p.type === 'day')!.value);
  // Anchor at UTC-noon so ±1 day arithmetic is DST-safe, then format YYYYMMDD for ESPN.
  const base = new Date(Date.UTC(y, m - 1, dd, 12, 0, 0));
  return [-1, 0, 1].map((offset) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + offset);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
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
  if (league === 'College Football' || league === 'NCAA Football') return 'College Football';
  if (league === 'WNBA') return 'Basketball';
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
  // Use spread for the line value (run line / point spread), NOT overUnder
  // overUnder is the game total — showing it as "Team 7.5" would be misleading
  const spreadNum: number | null = typeof oddsNode?.spread === 'number' ? oddsNode.spread : null;
  const lineValue = spreadNum !== null
    ? `${spreadNum > 0 ? '+' : ''}${spreadNum}`
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
        const res = await fetchWithTimeout(`${leagueUrl}/scoreboard?dates=${date}`, { cache: 'no-store', timeoutMs: 7000 });
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
  // Order: LIVE first, then FINAL (most-recent first), then SCHEDULED (soonest first). This
  // matters because the caller slices to maxGames — the OLD order put finals LAST, so on a
  // busy multi-day slate finished games got cut from the feed entirely and the pick pages
  // (which read this feed) could never show WON/LOST. Keeping finals near the top fixes that;
  // only far-future scheduled games get trimmed, which is correct for a "live" feed.
  const rank = (g: LiveSlateGame) => (g.isLive ? 0 : g.isFinal ? 1 : 2);
  return games.sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const aTs = a.startTime ? new Date(a.startTime).getTime() : Number.MAX_SAFE_INTEGER;
    const bTs = b.startTime ? new Date(b.startTime).getTime() : Number.MAX_SAFE_INTEGER;
    // Finals: most recent first. Live/scheduled: soonest first.
    return rank(a) === 1 ? bTs - aTs : aTs - bTs;
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
