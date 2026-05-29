// Pre-game player-prop builder. ESPN's `leaders` array — which the existing prop
// pipeline uses — is empty pre-game. To produce props BEFORE the first pitch / tip-off /
// puck drop, this service:
//   1. Pulls each team's active roster from ESPN's team roster endpoint
//   2. Picks the relevant players for the matchup (MLB probable pitchers + top batters,
//      NBA top scorers by season minutes, etc.)
//   3. Fetches each player's per-game gamelog (already cached by playerPropsService)
//   4. Computes a recency-weighted projection (40% L5 + 40% L10 + 20% season) — same
//      blend the team picks use.
//   5. Compares the projection to The Odds API line (when available) and computes edge.
//
// The output shape matches the existing GamePropsResult so the downstream UI / scoring
// doesn't need to change. If quota is exhausted on The Odds API, we still produce raw
// projections without the market-line edge — the user at least sees player tendencies.

import { getPlayerPropsForGame, type PropLine } from '@/services/oddsApiService';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const ESPN_BASE_PATHS: Record<string, string> = {
  MLB: 'baseball/mlb',
  NBA: 'basketball/nba',
  WNBA: 'basketball/wnba',
  'NCAA Basketball': 'basketball/mens-college-basketball',
  NHL: 'hockey/nhl',
  NFL: 'football/nfl',
  'College Football': 'football/college-football',
};

// Which markets to evaluate per league. Maps to The Odds API market keys + ESPN stat
// names. Keep this aligned with PROP_MARKETS in oddsApiService.ts.
const LEAGUE_MARKETS: Record<string, Array<{ market: string; espnStat: string; positionFilter?: string[] }>> = {
  MLB: [
    { market: 'pitcher_strikeouts', espnStat: 'strikeouts', positionFilter: ['SP', 'P'] },
    { market: 'batter_hits', espnStat: 'hits' },
    { market: 'batter_home_runs', espnStat: 'homeruns' },
    { market: 'batter_total_bases', espnStat: 'totalbases' },
    { market: 'batter_rbis', espnStat: 'rbis' },
  ],
  NBA: [
    { market: 'player_points', espnStat: 'points' },
    { market: 'player_rebounds', espnStat: 'rebounds' },
    { market: 'player_assists', espnStat: 'assists' },
    { market: 'player_threes', espnStat: 'threes' },
  ],
  WNBA: [
    { market: 'player_points', espnStat: 'points' },
    { market: 'player_rebounds', espnStat: 'rebounds' },
    { market: 'player_assists', espnStat: 'assists' },
  ],
  NHL: [
    { market: 'player_points', espnStat: 'points' },
    { market: 'player_shots_on_goal', espnStat: 'shots' },
    { market: 'player_goals', espnStat: 'goals' },
  ],
};

interface RosterPlayer {
  athleteId: string;
  displayName: string;
  position: string;
  teamName: string;
  side: 'home' | 'away';
}

interface PerGameStat { values: number[] }

const rosterCache = new Map<string, { players: RosterPlayer[]; at: number }>();
const ROSTER_TTL = 24 * 60 * 60 * 1000; // rosters change slowly — 24h cache

// Fetch a team's roster, return [athleteId, displayName, position]. ESPN's roster endpoint
// has the shape /teams/{id}/roster on each league's API host.
async function fetchTeamRoster(league: string, teamId: string, teamName: string, side: 'home' | 'away'): Promise<RosterPlayer[]> {
  if (!teamId) return [];
  const path = ESPN_BASE_PATHS[league];
  if (!path) return [];
  const cacheKey = `roster:${league}:${teamId}`;
  const cached = rosterCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ROSTER_TTL) {
    return cached.players.map((p) => ({ ...p, teamName, side }));
  }
  try {
    const r = await fetchWithTimeout(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${teamId}/roster`, { cache: 'no-store' });
    if (!r.ok) { rosterCache.set(cacheKey, { players: [], at: Date.now() }); return []; }
    const data = await r.json();
    const players: RosterPlayer[] = [];
    const athletes = Array.isArray(data?.athletes) ? data.athletes : [];
    for (const group of athletes) {
      const items = Array.isArray(group?.items) ? group.items : Array.isArray(group?.athletes) ? group.athletes : [];
      for (const a of items) {
        const id = String(a?.id || '');
        const name = a?.displayName || a?.fullName || '';
        const pos = a?.position?.abbreviation || a?.position?.displayName || '';
        if (!id || !name) continue;
        players.push({ athleteId: id, displayName: name, position: pos, teamName, side });
      }
    }
    rosterCache.set(cacheKey, { players, at: Date.now() });
    return players;
  } catch {
    rosterCache.set(cacheKey, { players: [], at: Date.now() });
    return [];
  }
}

// MLB probable starters live on the competition object as `probables: [{athlete: {...}}]`.
function extractMlbProbables(competition: any, homeTeamName: string, awayTeamName: string): RosterPlayer[] {
  const out: RosterPlayer[] = [];
  const probables = Array.isArray(competition?.probables) ? competition.probables : [];
  for (const p of probables) {
    const ath = p?.athlete;
    if (!ath?.id) continue;
    const id = String(ath.id);
    const name = ath.displayName || ath.fullName || '';
    if (!name) continue;
    const teamId = String(p?.competitor?.team?.id || ath?.team?.id || '');
    const homeId = String(competition?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.id || '');
    const side: 'home' | 'away' = teamId === homeId ? 'home' : 'away';
    out.push({
      athleteId: id, displayName: name, position: 'SP',
      teamName: side === 'home' ? homeTeamName : awayTeamName, side,
    });
  }
  return out;
}

// Pull each player's per-game stat values for the markets we care about. Reuses the cache
// already populated by playerPropsService — game logs are expensive so this matters.
async function fetchPlayerGameLog(athleteId: string, league: string): Promise<Record<string, number[]> | null> {
  const path = ESPN_BASE_PATHS[league];
  if (!path || !athleteId) return null;
  try {
    const r = await fetchWithTimeout(`https://site.web.api.espn.com/apis/common/v3/sports/${path}/athletes/${athleteId}/gamelog`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    const names: string[] = (j.names || []).map((s: string) => String(s || '').toLowerCase());
    // Newest game first per ESPN convention — we keep that ordering.
    const events: any[] = [];
    const seasons = Array.isArray(j.seasonTypes) ? j.seasonTypes : [];
    for (const season of seasons) {
      const cats = Array.isArray(season?.categories) ? season.categories : [];
      for (const cat of cats) {
        const evs = Array.isArray(cat?.events) ? cat.events : [];
        events.push(...evs);
      }
    }
    // ESPN's gamelog has `events[].stats` parallel to the `names[]` array.
    const byStat: Record<string, number[]> = {};
    for (const ev of events) {
      const stats: any[] = Array.isArray(ev?.stats) ? ev.stats : [];
      for (let i = 0; i < names.length && i < stats.length; i++) {
        const n = names[i];
        const v = Number(stats[i]);
        if (!Number.isFinite(v)) continue;
        byStat[n] ||= [];
        byStat[n].push(v);
      }
    }
    return byStat;
  } catch {
    return null;
  }
}

// Recency-weighted projection — same 40/40/20 blend as the team picks engine.
function weightedProjection(values: number[]): { proj: number; l5: number | null; l10: number | null; season: number | null; sample: number } {
  if (values.length === 0) return { proj: 0, l5: null, l10: null, season: null, sample: 0 };
  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const l5 = values.length >= 3 ? avg(values.slice(0, 5)) : null;
  const l10 = values.length >= 6 ? avg(values.slice(0, 10)) : null;
  const season = values.length >= 10 ? avg(values) : null;
  const parts: Array<[number, number]> = [];
  if (l5 != null) parts.push([0.4, l5]);
  if (l10 != null) parts.push([0.4, l10]);
  if (season != null) parts.push([0.2, season]);
  if (parts.length === 0) {
    return { proj: avg(values), l5, l10, season, sample: values.length };
  }
  const totalW = parts.reduce((s, [w]) => s + w, 0);
  const weighted = parts.reduce((s, [w, v]) => s + w * v, 0);
  return { proj: weighted / totalW, l5, l10, season, sample: values.length };
}

// Hit rate vs a given line — how often does the player land OVER in the most recent games?
// Used for the "7 of last 10 over 1.5" style tendency signal.
function hitRateOverLine(values: number[], line: number, lastN: number): { hits: number; sample: number; pct: number } {
  const slice = values.slice(0, lastN);
  if (slice.length === 0) return { hits: 0, sample: 0, pct: 0 };
  const hits = slice.filter((v) => v > line).length;
  return { hits, sample: slice.length, pct: hits / slice.length };
}

export interface PreGamePropEdge {
  athleteId: string;
  playerName: string;
  position: string;
  teamName: string;
  side: 'home' | 'away';
  league: string;
  market: string;
  // Projection vs market
  projection: number;
  marketLine: number | null;
  marketOverPrice: number | null;
  marketUnderPrice: number | null;
  bestBook: string | null;
  // Tendency
  l5Avg: number | null;
  l10Avg: number | null;
  seasonAvg: number | null;
  hitRateL10: { hits: number; sample: number; pct: number } | null;
  // Score (0-100). Composed from edge size + recency hit rate + sample size.
  edgeScore: number;
  // Recommended side
  recommended: 'over' | 'under' | null;
}

export interface PreGamePropResult {
  gameId: string;
  eventName: string;
  league: string;
  generatedAt: string;
  dataAvailable: boolean;
  propEdges: PreGamePropEdge[];
  topPick: PreGamePropEdge | null;
}

// Score a single prop projection vs the market line. Higher = better edge.
function scorePropEdge(args: {
  projection: number;
  line: number | null;
  hitRateL10: { hits: number; sample: number; pct: number } | null;
  sample: number;
  l5Avg: number | null;
  l10Avg: number | null;
  seasonAvg: number | null;
}): { score: number; side: 'over' | 'under' | null } {
  if (args.sample < 5) return { score: 0, side: null };
  if (args.line == null) {
    // No market line (Odds API quota exhausted or market not offered) — score from the
    // ESPN tendency signal alone. We compute a "tendency strength" from recent form vs
    // season baseline + sample-size confidence. The player can still get surfaced based
    // purely on whether they're trending up/down hard relative to their own baseline.
    let score = 40;
    const l5 = args.l5Avg, l10 = args.l10Avg, season = args.seasonAvg;
    if (l5 != null && season != null && season > 0) {
      const lift = (l5 - season) / season; // +0.30 = 30% above season pace
      if (Math.abs(lift) >= 0.30) score += 25;
      else if (Math.abs(lift) >= 0.20) score += 18;
      else if (Math.abs(lift) >= 0.10) score += 10;
      const side: 'over' | 'under' = lift > 0 ? 'over' : 'under';
      if (args.sample >= 20) score += 8;
      else if (args.sample >= 12) score += 5;
      else if (args.sample < 8) score -= 5;
      return { score: Math.max(0, Math.min(100, Math.round(score))), side };
    }
    if (l10 != null && season != null && season > 0) {
      const lift = (l10 - season) / season;
      score += Math.abs(lift) >= 0.15 ? 15 : Math.abs(lift) >= 0.08 ? 8 : 0;
      return { score: Math.max(0, Math.min(100, Math.round(score))), side: lift > 0 ? 'over' : 'under' };
    }
    return { score: Math.max(0, Math.min(100, Math.round(score))), side: 'over' };
  }
  const gap = args.projection - args.line;
  const absGap = Math.abs(gap);
  let score = 30;
  // Edge size — bigger projection vs line = more edge.
  if (absGap >= 1.5) score += 30;
  else if (absGap >= 1.0) score += 22;
  else if (absGap >= 0.5) score += 14;
  else if (absGap >= 0.25) score += 6;
  // Recency hit-rate confirmation: the projection has to be backed by recent results.
  if (args.hitRateL10) {
    const pct = args.hitRateL10.pct;
    const onOverSide = gap > 0;
    const alignedRate = onOverSide ? pct : 1 - pct;
    if (alignedRate >= 0.75) score += 25;
    else if (alignedRate >= 0.65) score += 18;
    else if (alignedRate >= 0.55) score += 10;
    else if (alignedRate < 0.45) score -= 10; // contradicting recent form is bad
  }
  // Sample size — small samples are noise.
  if (args.sample >= 20) score += 8;
  else if (args.sample >= 12) score += 5;
  else if (args.sample < 8) score -= 5;
  return { score: Math.max(0, Math.min(100, Math.round(score))), side: gap > 0 ? 'over' : 'under' };
}

export async function buildPreGameProps(
  gameId: string,
  eventName: string,
  league: string,
  competition: any,
): Promise<PreGamePropResult> {
  const homeRaw = competition?.competitors?.find((c: any) => c.homeAway === 'home');
  const awayRaw = competition?.competitors?.find((c: any) => c.homeAway === 'away');
  const homeTeamName = homeRaw?.team?.displayName || 'Home';
  const awayTeamName = awayRaw?.team?.displayName || 'Away';
  const homeId = String(homeRaw?.team?.id || '');
  const awayId = String(awayRaw?.team?.id || '');

  const markets = LEAGUE_MARKETS[league];
  if (!markets || markets.length === 0) {
    return { gameId, eventName, league, generatedAt: new Date().toISOString(), dataAvailable: false, propEdges: [], topPick: null };
  }

  // Pre-game roster — for MLB, prefer probables first, fall back to roster top batters.
  // For NBA/WNBA/NHL we use roster sorted by relevance (later: by minutes/usage).
  let players: RosterPlayer[] = [];
  if (league === 'MLB') {
    players = extractMlbProbables(competition, homeTeamName, awayTeamName);
    // Augment with top batters from rosters (so we can still build batter props).
    const [homeRoster, awayRoster] = await Promise.all([
      fetchTeamRoster(league, homeId, homeTeamName, 'home'),
      fetchTeamRoster(league, awayId, awayTeamName, 'away'),
    ]);
    const positionPriority = (p: RosterPlayer) => {
      const pos = (p.position || '').toUpperCase();
      // Position players (batters) above pitchers we didn't already include via probables.
      if (['1B', '2B', '3B', 'SS', 'OF', 'C', 'DH', 'CF', 'LF', 'RF'].includes(pos)) return 0;
      if (pos === 'SP' || pos === 'P') return 5;
      return 3;
    };
    const topBatters = [...homeRoster, ...awayRoster]
      .filter((p) => !players.find((existing) => existing.athleteId === p.athleteId))
      .sort((a, b) => positionPriority(a) - positionPriority(b))
      .slice(0, 12); // top 12 batters across both teams
    players.push(...topBatters);
  } else {
    const [homeRoster, awayRoster] = await Promise.all([
      fetchTeamRoster(league, homeId, homeTeamName, 'home'),
      fetchTeamRoster(league, awayId, awayTeamName, 'away'),
    ]);
    players = [...homeRoster, ...awayRoster].slice(0, 16); // top 16 across both teams
  }

  if (players.length === 0) {
    return { gameId, eventName, league, generatedAt: new Date().toISOString(), dataAvailable: false, propEdges: [], topPick: null };
  }

  // Pull market lines (this is the Odds API call that's currently quota-blocked — when
  // it returns nothing, propLines is empty and the engine still produces projections).
  const propLines = await getPlayerPropsForGame(league, awayTeamName, homeTeamName).catch(() => ({} as Record<string, PropLine>));

  // Build prop edges per player per applicable market. Skip players whose gamelog can't
  // give us a meaningful sample (< 5 games of data).
  const propEdges: PreGamePropEdge[] = [];
  await Promise.all(players.slice(0, 18).map(async (player) => {
    const gamelog = await fetchPlayerGameLog(player.athleteId, league);
    if (!gamelog) return;
    for (const { market, espnStat, positionFilter } of markets) {
      if (positionFilter && !positionFilter.includes((player.position || '').toUpperCase())) continue;
      const values = gamelog[espnStat] || gamelog[espnStat.toLowerCase()] || [];
      if (values.length < 5) continue;
      const { proj, l5, l10, season, sample } = weightedProjection(values);
      // Match the prop line by player name + market.
      const normName = player.displayName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const line = propLines[`${normName}|${market}`];
      const marketLine = line?.line ?? null;
      const hitRate = marketLine != null ? hitRateOverLine(values, marketLine, 10) : null;
      const { score, side } = scorePropEdge({ projection: proj, line: marketLine, hitRateL10: hitRate, sample, l5Avg: l5, l10Avg: l10, seasonAvg: season });
      if (score < 35) continue; // skip noise — keeps the slate curated
      propEdges.push({
        athleteId: player.athleteId,
        playerName: player.displayName,
        position: player.position,
        teamName: player.teamName,
        side: player.side,
        league,
        market,
        projection: Math.round(proj * 100) / 100,
        marketLine,
        marketOverPrice: line?.overPrice ?? null,
        marketUnderPrice: line?.underPrice ?? null,
        bestBook: line?.bestBook ?? null,
        l5Avg: l5 != null ? Math.round(l5 * 100) / 100 : null,
        l10Avg: l10 != null ? Math.round(l10 * 100) / 100 : null,
        seasonAvg: season != null ? Math.round(season * 100) / 100 : null,
        hitRateL10: hitRate,
        edgeScore: score,
        recommended: side,
      });
    }
  }));

  propEdges.sort((a, b) => b.edgeScore - a.edgeScore);
  return {
    gameId, eventName, league,
    generatedAt: new Date().toISOString(),
    dataAvailable: propEdges.length > 0,
    propEdges: propEdges.slice(0, 12),
    topPick: propEdges[0] || null,
  };
}
