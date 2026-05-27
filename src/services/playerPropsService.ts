/**
 * Player Props Service
 *
 * Pulls player stats from ESPN game leaders + athlete game logs,
 * estimates prop lines, scores each prop's edge, and builds SGP
 * (Same Game Parlay) combinations with positively correlated legs.
 *
 * Prop types covered:
 *   NBA/NCAAB: Points, Assists, Rebounds, 3-Pointers
 *   NHL:       Goals, Assists, Shots on Goal
 *   MLB:       Hits, RBIs, Strikeouts (SP)
 *   NFL:       Pass Yards, Rush Yards, Receiving Yards
 *   Soccer:    Goals, Assists, Shots
 *   Tennis:    Match Winner (ML), Total Games, Set betting
 *
 * SGP Builder rules:
 *   ✓ Team wins ML + star player over points (positive correlation)
 *   ✓ High-pace game + both star scorers over (positive correlation)
 *   ✓ Injury-spot: teammate OUT → remaining player usage boost
 *   ✗ Never combine negatively correlated picks in the same SGP
 */

import { LEAGUE_URLS } from '@/lib/validation';
import { getPlayerPropsForGame, normTeam, type PropLine } from '@/services/oddsApiService';

// Map our internal stat -> The Odds API market key, so we can look up the REAL line.
function statToMarketKey(stat: PropStat): string | null {
  switch (stat) {
    case 'points': return 'player_points';
    case 'rebounds': return 'player_rebounds';
    case 'assists': return 'player_assists';
    case 'threes': return 'player_threes';
    case 'goals': return 'player_goals';
    case 'shots': return 'player_shots_on_goal';
    case 'hits': return 'batter_hits';
    case 'rbis': return 'batter_rbis';
    case 'strikeouts': return 'pitcher_strikeouts';
    case 'passyards': return 'player_pass_yds';
    case 'rushyards': return 'player_rush_yds';
    case 'recyards': return 'player_reception_yds';
    case 'steals': return 'player_steals';
    case 'blocks': return 'player_blocks';
    case 'passtd': return 'player_pass_tds';
    case 'rushtd': return 'player_rush_tds';
    case 'receptions': return 'player_receptions';
    case 'homeruns': return 'batter_home_runs';
    case 'totalbases': return 'batter_total_bases';
    case 'walks': return 'batter_walks';
    default: return null;
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type PropStat = 'points' | 'assists' | 'rebounds' | 'threes' | 'goals' | 'shots' | 'hits' | 'rbis' | 'strikeouts' | 'passyards' | 'rushyards' | 'recyards' | 'steals' | 'blocks' | 'passtd' | 'rushtd' | 'receptions' | 'homeruns' | 'totalbases' | 'walks';
export type PropDirection = 'over' | 'under';
export type PropConfidence = 'ELITE' | 'HIGH' | 'MEDIUM' | 'LOW';

const STAT_DISPLAY: Record<PropStat, string> = {
  points: 'Points', assists: 'Assists', rebounds: 'Rebounds', threes: '3-Pointers',
  goals: 'Goals', shots: 'Shots on Goal', hits: 'Hits', rbis: 'RBIs',
  strikeouts: 'Strikeouts', passyards: 'Pass Yards', rushyards: 'Rush Yards', recyards: 'Rec Yards',
  steals: 'Steals', blocks: 'Blocks', passtd: 'Pass TDs', rushtd: 'Rush TDs',
  receptions: 'Receptions', homeruns: 'Home Runs', totalbases: 'Total Bases', walks: 'Walks',
};

// How much of a player's season average the prop line is typically set at.
// Lines are set BELOW season avg to generate balanced over/under action.
const PROP_LINE_DISCOUNT: Record<PropStat, number> = {
  points: 0.87,    // 13% below avg — stars get juiced lines
  assists: 0.88,
  rebounds: 0.89,
  threes: 0.85,    // highly variable, books shave more
  goals: 0.80,
  shots: 0.88,
  hits: 0.86,
  rbis: 0.84,
  strikeouts: 0.88,
  passyards: 0.87,
  rushyards: 0.85,
  recyards: 0.85,
  steals: 0.78,    // very volatile defensive stat
  blocks: 0.76,    // even more volatile
  passtd: 0.80,
  rushtd: 0.75,    // TDs are inherently low-frequency
  receptions: 0.86,
  homeruns: 0.65,  // HR props are roughly 0.5 or 1.5; line set low
  totalbases: 0.84,
  walks: 0.78,
};

export interface PlayerPropEdge {
  athleteId: string;
  playerName: string;
  position: string;
  side: 'home' | 'away';
  teamName: string;
  seasonAvg: Partial<Record<PropStat, number>>;
  recentAvg: Partial<Record<PropStat, number>> | null;
  injuryStatus: string | null;
  usageBoostReason: string | null;
  propRecs: PropRec[];
}

export interface PropRec {
  stat: PropStat;
  displayStat: string;
  seasonAvg: number;
  recentAvg: number | null;
  estimatedLine: number;        // the line we display (REAL market line when available, else a projection)
  marketLine: number | null;    // the real sportsbook line, if we got one
  hasRealLine: boolean;         // true = edge measured against the real line (a true value play)
  overPrice: number | null;
  underPrice: number | null;
  bestBook: string | null;
  direction: PropDirection;
  edgePct: number;
  confidence: PropConfidence;
  reason: string;
  sgpFriendly: boolean;
  // Per-game trend signals (from ESPN gamelog). Populated when game-by-game data exists.
  last5Avg: number | null;
  last3Avg: number | null;
  streakOver: number;          // # of last N games that went OVER the real line
  streakWindow: number;        // size of the streak window (typically 5)
  trendDirection: 'up' | 'down' | 'flat';
}

export interface SGPLeg {
  type: 'player_prop' | 'spread' | 'moneyline' | 'total';
  description: string;
  player: string | null;
  team: string | null;
  correlation: 'positive' | 'neutral';
}

export interface SGPBuild {
  label: string;
  legs: SGPLeg[];
  theme: string;
  rationale: string;
  estimatedMultiple: number;    // rough odds multiple (e.g. 4x = +300)
  riskLevel: 'Conservative' | 'Standard' | 'Aggressive';
}

export interface GamePropsResult {
  gameId: string;
  eventName: string;
  league: string;
  sport: string;
  playerProps: PlayerPropEdge[];
  sgpBuilds: SGPBuild[];
  topProps: PropRec[];   // best 4 props across both teams, for quick display
  dataAvailable: boolean;
}

// ─── ESPN Fetch Helpers ──────────────────────────────────────────────────────

const gamelogCache = new Map<string, { fetchedAt: number; stats: Partial<Record<PropStat, number>> | null }>();
const GAMELOG_TTL = 600_000; // 10 min

// ─── PER-GAME GAMELOG (last N games, per stat) ──────────────────────────────
// Pulls each individual game's stats so we can compute last-5 averages, streak vs the
// real prop line ("over 4 of 5"), and trend direction — the real prop edge.

const SPORT_URL_PATH: Record<string, string> = {
  MLB: 'baseball/mlb',
  NBA: 'basketball/nba',
  WNBA: 'basketball/wnba',
  'NCAA Basketball': 'basketball/mens-college-basketball',
  NHL: 'hockey/nhl',
  NFL: 'football/nfl',
  'College Football': 'football/college-football',
  'NCAA Football': 'football/college-football',
};

// PropStat -> possible field names in ESPN gamelog `names[]` array (case-insensitive).
const STAT_NAME_MAP: Record<PropStat, string[]> = {
  points: ['points', 'pts'],
  rebounds: ['rebounds', 'totalRebounds', 'reb'],
  assists: ['assists', 'ast'],
  threes: ['threePointFieldGoalsMade', 'threes', 'three3pt', '3pm'],
  goals: ['goals'],
  shots: ['shotsOnGoal', 'shots'],
  hits: ['hits'],
  rbis: ['RBIs', 'rbi'],
  strikeouts: ['strikeouts', 'strikeOuts'],
  passyards: ['passingYards', 'passYards', 'passingYds'],
  rushyards: ['rushingYards', 'rushYards', 'rushingYds'],
  recyards: ['receivingYards', 'recyards', 'receivingYds'],
  steals: ['steals', 'stl'],
  blocks: ['blocks', 'blk'],
  passtd: ['passingTouchdowns', 'passTouchdowns', 'passingTDs'],
  rushtd: ['rushingTouchdowns', 'rushTouchdowns', 'rushingTDs'],
  receptions: ['receptions', 'rec'],
  homeruns: ['homeRuns', 'hr'],
  totalbases: ['totalBases', 'totalBasesAB'],
  walks: ['walks', 'bb', 'baseOnBalls'],
};

interface PerGameResult { perGame: Partial<Record<PropStat, number[]>>; gameCount: number }
const perGameCache = new Map<string, { fetchedAt: number; data: PerGameResult | null }>();
const PERGAME_TTL = 30 * 60_000; // 30 min — game-by-game data doesn't change between fetches

async function fetchAthletePerGameStats(
  athleteId: string,
  league: string,
  statKeys: PropStat[],
): Promise<PerGameResult | null> {
  const path = SPORT_URL_PATH[league];
  if (!path || !athleteId) return null;
  const cacheKey = `pergame:${league}:${athleteId}`;
  const cached = perGameCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < PERGAME_TTL) return cached.data;
  try {
    const r = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/${path}/athletes/${athleteId}/gamelog`, { cache: 'no-store' });
    if (!r.ok) { perGameCache.set(cacheKey, { fetchedAt: Date.now(), data: null }); return null; }
    const j = await r.json();
    const names: string[] = (j.names || []).map((s: string) => s.toLowerCase());
    const eventsMap: Record<string, any> = j.events || {};
    const seasonTypes: any[] = j.seasonTypes || [];

    // Pull every per-game entry across all categories of the current season type.
    const allEntries: Array<{ eventId: string; date: string; stats: string[] }> = [];
    for (const sT of seasonTypes) {
      for (const cat of sT?.categories || []) {
        for (const ev of cat?.events || []) {
          const eventId = String(ev.eventId || ev.id || '');
          const meta = eventsMap[eventId] || {};
          const date = meta.gameDate || ev.gameDate || '';
          const stats = ev.stats || [];
          if (date && Array.isArray(stats)) allEntries.push({ eventId, date, stats });
        }
      }
    }
    // Most recent first.
    allEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const perGame: Partial<Record<PropStat, number[]>> = {};
    for (const sk of statKeys) {
      const candidates = STAT_NAME_MAP[sk] || [];
      let idx = -1;
      for (const c of candidates) {
        idx = names.indexOf(c.toLowerCase());
        if (idx >= 0) break;
      }
      if (idx < 0) continue;
      const series: number[] = [];
      for (const e of allEntries) {
        const v = Number.parseFloat(e.stats[idx]);
        if (Number.isFinite(v)) series.push(v);
      }
      if (series.length > 0) perGame[sk] = series;
    }

    const result: PerGameResult = { perGame, gameCount: allEntries.length };
    perGameCache.set(cacheKey, { fetchedAt: Date.now(), data: result });
    return result;
  } catch {
    return null;
  }
}

// Compute trend signals for a single (player, stat, line) combo from per-game data.
function computePropTrend(games: number[] | undefined, line: number | null): { last5Avg: number | null; last3Avg: number | null; streakOver: number; streakWindow: number; trendDirection: 'up' | 'down' | 'flat' } {
  if (!games || games.length === 0) return { last5Avg: null, last3Avg: null, streakOver: 0, streakWindow: 0, trendDirection: 'flat' };
  const last5 = games.slice(0, 5);
  const last3 = games.slice(0, 3);
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const last5Avg = last5.length ? Math.round(avg(last5) * 10) / 10 : null;
  const last3Avg = last3.length ? Math.round(avg(last3) * 10) / 10 : null;
  let streakOver = 0;
  if (line != null && Number.isFinite(line)) {
    for (const g of last5) if (g > line) streakOver++;
  }
  const seasonAvg = avg(games);
  const last5Real = avg(last5);
  const trendDirection: 'up' | 'down' | 'flat' = last5Real > seasonAvg * 1.08 ? 'up' : last5Real < seasonAvg * 0.92 ? 'down' : 'flat';
  return { last5Avg, last3Avg, streakOver, streakWindow: last5.length, trendDirection };
}

async function fetchAthleteRecentStats(
  athleteId: string,
  league: string,
  statKeys: PropStat[],
): Promise<Partial<Record<PropStat, number>> | null> {
  const baseUrl = LEAGUE_URLS[league];
  if (!baseUrl) return null;
  const cacheKey = `${league}:${athleteId}`;
  const cached = gamelogCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < GAMELOG_TTL) return cached.stats;

  try {
    const res = await fetch(`${baseUrl}/athletes/${athleteId}/statisticslog`, { cache: 'no-store' });
    if (!res.ok) {
      gamelogCache.set(cacheKey, { fetchedAt: Date.now(), stats: null });
      return null;
    }
    const data = await res.json();

    // ESPN statisticslog: splits.categories[].stats[] keyed by name
    const categories: any[] = data?.splits?.categories || [];
    const recent: Partial<Record<PropStat, number>> = {};

    for (const cat of categories) {
      for (const stat of cat.stats || []) {
        const name = (stat.name || '').toLowerCase();
        const value = typeof stat.value === 'number' ? stat.value : null;
        if (value === null) continue;

        if (name === 'avgpoints' || name === 'pointspergame' || name === 'avgpts') recent.points = value;
        if (name === 'avgassists' || name === 'assistspergame' || name === 'avgast') recent.assists = value;
        if (name === 'avgrebounds' || name === 'reboundspergame' || name === 'avgrb') recent.rebounds = value;
        if (name === 'avgthreepointfieldgoalsmade' || name === 'avg3pm' || name === 'three3pm') recent.threes = value;
        if (name === 'goals' || name === 'avggoals') recent.goals = value;
        if (name === 'shots' || name === 'avgshots' || name === 'shotsontarget') recent.shots = value;
        if (name === 'avghits' || name === 'hits') recent.hits = value;
        if (name === 'avgrbi' || name === 'rbi') recent.rbis = value;
        if (name === 'avgstrikeouts' || name === 'strikeouts') recent.strikeouts = value;
      }
    }

    const result = Object.keys(recent).length > 0 ? recent : null;
    gamelogCache.set(cacheKey, { fetchedAt: Date.now(), stats: result });
    return result;
  } catch {
    gamelogCache.set(cacheKey, { fetchedAt: Date.now(), stats: null });
    return null;
  }
}

// ─── Stat Extraction from Scoreboard ─────────────────────────────────────────

interface RawLeader {
  athleteId: string;
  playerName: string;
  position: string;
  side: 'home' | 'away';
  teamName: string;
  statKey: PropStat;
  seasonAvg: number;
}

function mapLeaderName(name: string): PropStat | null {
  const n = name.toLowerCase();
  if (n.includes('point') || n === 'pts') return 'points';
  if (n.includes('assist')) return 'assists';
  if (n.includes('rebound')) return 'rebounds';
  if (n.includes('three') || n.includes('3pt') || n.includes('3pm')) return 'threes';
  if (n.includes('goal')) return 'goals';
  if (n.includes('shot')) return 'shots';
  if (n === 'hits') return 'hits';
  if (n === 'rbi') return 'rbis';
  if (n.includes('strikeout')) return 'strikeouts';
  if (n.includes('passyards') || n.includes('passingyards')) return 'passyards';
  if (n.includes('rushyards') || n.includes('rushingyards')) return 'rushyards';
  if (n.includes('receivingyards') || n.includes('recyards')) return 'recyards';
  return null;
}

function extractLeadersFromCompetitor(competitor: any): RawLeader[] {
  const results: RawLeader[] = [];
  const side: 'home' | 'away' = competitor?.homeAway === 'home' ? 'home' : 'away';
  const teamName = competitor?.team?.displayName || '';

  for (const leaderCat of competitor?.leaders || []) {
    const statKey = mapLeaderName(leaderCat?.name || leaderCat?.displayName || '');
    if (!statKey) continue;

    for (const entry of leaderCat?.leaders || []) {
      const athleteId = String(entry?.athlete?.id || '');
      const playerName = entry?.athlete?.displayName || entry?.athlete?.shortName || '';
      const position = entry?.athlete?.position?.abbreviation || '';
      const value = typeof entry?.value === 'number' ? entry.value : Number.parseFloat(entry?.displayValue || '');
      if (!athleteId || !playerName || !Number.isFinite(value) || value <= 0) continue;

      results.push({ athleteId, playerName, position, side, teamName, statKey, seasonAvg: value });
    }
  }
  return results;
}

function buildPlayerProfiles(rawLeaders: RawLeader[]): Map<string, PlayerPropEdge> {
  const map = new Map<string, PlayerPropEdge>();

  for (const leader of rawLeaders) {
    if (!map.has(leader.athleteId)) {
      map.set(leader.athleteId, {
        athleteId: leader.athleteId, playerName: leader.playerName, position: leader.position,
        side: leader.side, teamName: leader.teamName, seasonAvg: {}, recentAvg: null,
        injuryStatus: null, usageBoostReason: null, propRecs: [],
      });
    }
    const profile = map.get(leader.athleteId)!;
    profile.seasonAvg[leader.statKey] = leader.seasonAvg;
  }

  return map;
}

// ─── Prop Edge Scoring ────────────────────────────────────────────────────────

function scoreProp(
  stat: PropStat,
  seasonAvg: number,
  recentAvg: number | null,
  injuryStatus: string | null,
  usageBoost: boolean,
  realLine: PropLine | null,
  trend: { last5Avg: number | null; last3Avg: number | null; streakOver: number; streakWindow: number; trendDirection: 'up' | 'down' | 'flat' } | null,
): PropRec | null {
  if (seasonAvg < 3) return null;  // too small to be meaningful

  const hasRealLine = !!realLine && Number.isFinite(realLine.line);
  // Use the REAL sportsbook line when we have it. Only fall back to a projected line for
  // display when there's no market line — and in that case we do NOT claim any edge.
  const line = hasRealLine ? realLine!.line : Math.round(seasonAvg * (PROP_LINE_DISCOUNT[stat] ?? 0.88) * 2) / 2;

  // Projection priority: last-5 game average > recent-aggregated > season avg. Trend > average.
  const effectiveAvg = trend?.last5Avg ?? recentAvg ?? seasonAvg;
  const projection = usageBoost ? effectiveAvg * 1.12 : effectiveAvg;

  const edge = projection - line;
  const edgePct = line > 0 ? (edge / line) * 100 : 0;
  const direction: PropDirection = edge >= 0 ? 'over' : 'under';
  const absEdgePct = Math.abs(edgePct);

  const injuredSelf = injuryStatus != null && ['OUT', 'DOUBTFUL'].includes(injuryStatus.toUpperCase());

  let confidence: PropConfidence;
  if (!hasRealLine) {
    // No real market line → this is a projection only, never a graded value play.
    confidence = 'LOW';
  } else if (injuredSelf) {
    confidence = 'LOW';
  } else if (absEdgePct >= 18) confidence = 'ELITE';
  else if (absEdgePct >= 11) confidence = 'HIGH';
  else if (absEdgePct >= 6) confidence = 'MEDIUM';
  else confidence = 'LOW';

  let reason: string;
  if (!hasRealLine) {
    reason = `No live market line for this prop yet — shown as a projection (${projection.toFixed(1)}), not a graded value play.`;
  } else if (direction === 'over') {
    reason = `We project ${projection.toFixed(1)} vs the real line of ${line} — OVER by ${edge.toFixed(1)} (${edgePct.toFixed(0)}% edge).`;
    if (recentAvg && recentAvg > seasonAvg) reason += ` Trending up: ${recentAvg.toFixed(1)} recently vs ${seasonAvg.toFixed(1)} on the season.`;
  } else {
    reason = `We project ${projection.toFixed(1)} vs the real line of ${line} — UNDER by ${Math.abs(edge).toFixed(1)} (${Math.abs(edgePct).toFixed(0)}% edge).`;
    if (recentAvg && recentAvg < seasonAvg) reason += ` Cooling off: ${recentAvg.toFixed(1)} recently vs ${seasonAvg.toFixed(1)} on the season.`;
  }
  if (usageBoost && hasRealLine) reason += ' Usage bump applied — a teammate is out.';
  // Trend reason: weave in the real "X of last N" + heating/cooling signal.
  if (hasRealLine && trend && trend.streakWindow > 0) {
    reason += ` OVER in ${trend.streakOver} of last ${trend.streakWindow}.`;
    if (trend.trendDirection === 'up') reason += ' Trending up.';
    else if (trend.trendDirection === 'down') reason += ' Cooling off.';
  }

  return {
    stat, displayStat: STAT_DISPLAY[stat], seasonAvg, recentAvg: recentAvg ?? null,
    estimatedLine: line, marketLine: hasRealLine ? realLine!.line : null, hasRealLine,
    overPrice: realLine?.overPrice ?? null, underPrice: realLine?.underPrice ?? null, bestBook: realLine?.bestBook ?? null,
    direction, edgePct: Math.round(edgePct * 10) / 10, confidence, reason,
    sgpFriendly: hasRealLine && confidence !== 'LOW' && !injuredSelf,
    last5Avg: trend?.last5Avg ?? null,
    last3Avg: trend?.last3Avg ?? null,
    streakOver: trend?.streakOver ?? 0,
    streakWindow: trend?.streakWindow ?? 0,
    trendDirection: trend?.trendDirection ?? 'flat',
  };
}

// ─── SGP Builder ──────────────────────────────────────────────────────────────

function buildSGPs(
  props: PlayerPropEdge[],
  gameSpread: number | null,
  gameTotal: number | null,
  homeTeamName: string,
  awayTeamName: string,
  league: string,
): SGPBuild[] {
  const sgps: SGPBuild[] = [];

  // Collect all high-quality over props (confidence HIGH+, direction over)
  const eliteOverProps = props
    .flatMap((p) => p.propRecs.filter((r) => r.direction === 'over' && (r.confidence === 'ELITE' || r.confidence === 'HIGH') && r.sgpFriendly))
    .sort((a, b) => Math.abs(b.edgePct) - Math.abs(a.edgePct));

  const topPlayer = props.sort((a, b) => (b.seasonAvg.points ?? 0) - (a.seasonAvg.points ?? 0))[0];
  const topPointsRec = topPlayer?.propRecs.find((r) => r.stat === 'points' && r.direction === 'over');

  // ── SGP 1: Conservative 2-3 leg ─────────────────────────────────────────
  // Best player over points + best player over assists (same team, positive correlation)
  const favHome = gameSpread !== null && gameSpread < 0;  // negative spread = home favorite
  const favoredTeamName = favHome ? homeTeamName : awayTeamName;

  const favTeamSide: 'home' | 'away' = favHome ? 'home' : 'away';
  const favTeamPlayers = props.filter((p) => p.side === favTeamSide);
  const favStarPoints = favTeamPlayers.flatMap((p) => p.propRecs).find((r) => r.stat === 'points' && r.direction === 'over' && r.sgpFriendly);
  const favStarAssists = favTeamPlayers.flatMap((p) => p.propRecs).find((r) => r.stat === 'assists' && r.direction === 'over' && r.sgpFriendly);

  if (favStarPoints && favStarAssists && favTeamPlayers.length > 0) {
    const playerPoints = favTeamPlayers.find((p) => p.propRecs.includes(favStarPoints));
    const playerAssists = favTeamPlayers.find((p) => p.propRecs.includes(favStarAssists));
    if (playerPoints && playerAssists) {
      sgps.push({
        label: 'Conservative SGP — Favored Team Star Stack',
        legs: [
          { type: 'moneyline', description: `${favoredTeamName} to Win`, player: null, team: favoredTeamName, correlation: 'positive' },
          { type: 'player_prop', description: `${playerPoints.playerName} O ${favStarPoints.estimatedLine} ${favStarPoints.displayStat}`, player: playerPoints.playerName, team: favTeamPlayers[0]?.teamName, correlation: 'positive' },
          ...(playerAssists !== playerPoints ? [{ type: 'player_prop' as const, description: `${playerAssists.playerName} O ${favStarAssists.estimatedLine} ${favStarAssists.displayStat}`, player: playerAssists.playerName, team: null, correlation: 'positive' as const }] : []),
        ],
        theme: 'Correlated: favored team wins → star player produces',
        rationale: `${favoredTeamName} is favored. When they win, their key players typically hit their props. Stacking the ML with player performance is one of the strongest SGP correlations in sports betting.`,
        estimatedMultiple: 4,
        riskLevel: 'Conservative',
      });
    }
  }

  // ── SGP 2: High-Total Stack ───────────────────────────────────────────────
  // If game total is high, stack both star scorers over their points
  if (gameTotal && gameTotal >= 220 && eliteOverProps.length >= 2) {
    const top2 = eliteOverProps.slice(0, 2);
    const topPlayers = top2.map((rec) => props.find((p) => p.propRecs.includes(rec)));
    if (topPlayers.every(Boolean)) {
      sgps.push({
        label: 'High-Pace Stack SGP',
        legs: [
          { type: 'total', description: `Game Over ${gameTotal}`, player: null, team: null, correlation: 'positive' },
          ...top2.map((rec, i) => ({
            type: 'player_prop' as const,
            description: `${topPlayers[i]!.playerName} O ${rec.estimatedLine} ${rec.displayStat}`,
            player: topPlayers[i]!.playerName, team: topPlayers[i]!.teamName,
            correlation: 'positive' as const,
          })),
        ],
        theme: 'Correlated: high-scoring game → both stars pad stat lines',
        rationale: `Game total of ${gameTotal} indicates a fast-paced, high-scoring game expected. High totals mean more possessions and opportunities for both star players to exceed their lines. All three legs point the same direction.`,
        estimatedMultiple: 6,
        riskLevel: 'Standard',
      });
    }
  }

  // ── SGP 3: Injury Spot Usage Boost Stack ─────────────────────────────────
  const boostedPlayers = props.filter((p) => p.usageBoostReason && p.propRecs.some((r) => r.confidence !== 'LOW'));
  if (boostedPlayers.length >= 1) {
    const boosted = boostedPlayers[0];
    const boostedRec = boosted.propRecs.find((r) => r.direction === 'over' && r.sgpFriendly);
    if (boostedRec) {
      sgps.push({
        label: 'Injury Spot SGP',
        legs: [
          { type: 'player_prop', description: `${boosted.playerName} O ${boostedRec.estimatedLine} ${boostedRec.displayStat}`, player: boosted.playerName, team: boosted.teamName, correlation: 'positive' },
          ...(boostedPlayers.length >= 2 ? [{
            type: 'player_prop' as const,
            description: `${boostedPlayers[1].playerName} O ${boostedPlayers[1].propRecs.find((r) => r.direction === 'over' && r.sgpFriendly)?.estimatedLine} ${STAT_DISPLAY.points}`,
            player: boostedPlayers[1].playerName, team: boostedPlayers[1].teamName,
            correlation: 'positive' as const,
          }] : []),
        ],
        theme: 'Injury-created usage spike',
        rationale: `${boosted.usageBoostReason}. When a key player is out, their usage and touches are redistributed — the remaining players see their opportunities spike. This is one of the most reliable edges in player props.`,
        estimatedMultiple: 5,
        riskLevel: 'Standard',
      });
    }
  }

  // ── SGP 4: Tennis/Soccer Alternative ─────────────────────────────────────
  if (['Tennis - ATP', 'Tennis - WTA', 'Tennis'].includes(league)) {
    const favorite = props.find((p) => (p.seasonAvg.points ?? 0) > 0) || props[0];
    if (favorite) {
      sgps.push({
        label: 'Tennis SGP — Dominant Performance',
        legs: [
          { type: 'moneyline', description: `${favorite.playerName} to Win`, player: favorite.playerName, team: null, correlation: 'positive' },
          { type: 'total', description: `Under Total Games (tight finish expected)`, player: null, team: null, correlation: 'neutral' },
        ],
        theme: 'If heavy favorite wins, often wins in straight sets',
        rationale: 'Heavy favorites in tennis tend to close out matches efficiently. Pairing the ML win with the under on total games exploits this tendency. Both legs benefit when the favorite plays their best tennis.',
        estimatedMultiple: 3,
        riskLevel: 'Conservative',
      });
    }
  }

  return sgps.slice(0, 3);  // max 3 SGPs per game
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export async function buildGamePropsResearch(
  gameId: string,
  eventName: string,
  league: string,
  comp: any,        // the competition object from ESPN scoreboard event
  summary: any,     // the ESPN game summary
  injuredOut: { home: string[]; away: string[] },
): Promise<GamePropsResult> {
  const homeRaw = comp?.competitors?.find((c: any) => c.homeAway === 'home');
  const awayRaw = comp?.competitors?.find((c: any) => c.homeAway === 'away');
  const homeTeamName = homeRaw?.team?.displayName || 'Home';
  const awayTeamName = awayRaw?.team?.displayName || 'Away';

  // Extract leaders from both teams
  const rawLeaders: RawLeader[] = [
    ...extractLeadersFromCompetitor(homeRaw),
    ...extractLeadersFromCompetitor(awayRaw),
  ];

  // Also extract from game summary leaders if available
  if (Array.isArray(summary?.leaders)) {
    for (const cat of summary.leaders) {
      const statKey = mapLeaderName(cat?.name || cat?.displayName || '');
      if (!statKey) continue;
      for (const entry of cat?.leaders || []) {
        const athleteId = String(entry?.athlete?.id || '');
        const playerName = entry?.athlete?.displayName || '';
        if (!athleteId || !playerName) continue;
        // Determine side from competitor
        const side: 'home' | 'away' = homeRaw?.team?.id === String(entry?.athlete?.team?.id || '') ? 'home' : 'away';
        const teamName = side === 'home' ? homeTeamName : awayTeamName;
        const value = typeof entry?.value === 'number' ? entry.value : 0;
        if (value > 0) rawLeaders.push({ athleteId, playerName, position: '', side, teamName, statKey, seasonAvg: value });
      }
    }
  }

  if (rawLeaders.length === 0) {
    return { gameId, eventName, league, sport: league, playerProps: [], sgpBuilds: [], topProps: [], dataAvailable: false };
  }

  // Build player profiles grouped by athlete
  const profiles = buildPlayerProfiles(rawLeaders);

  // Extract pickcenter data for SGP building
  const pickcenter = Array.isArray(summary?.pickcenter) ? summary.pickcenter : [];
  const spread = pickcenter[0]?.spread != null ? Number(pickcenter[0].spread) : null;
  const gameTotal = pickcenter[0]?.overUnder != null ? Number(pickcenter[0].overUnder) : null;

  // Real player-prop lines from the multi-book feed (empty if no key / quota / coverage).
  const propsMap = await getPlayerPropsForGame(league, awayTeamName, homeTeamName);

  // Identify injured players for usage boost detection
  const allInjuredHome = injuredOut.home;
  const allInjuredAway = injuredOut.away;

  // Fetch recent stats for top players (limit to top 4 per team to stay fast)
  const topProfiles = Array.from(profiles.values())
    .sort((a, b) => (b.seasonAvg.points ?? 0) - (a.seasonAvg.points ?? 0))
    .slice(0, 8);

  await Promise.allSettled(
    topProfiles.map(async (profile) => {
      const recentStats = await fetchAthleteRecentStats(profile.athleteId, league, ['points', 'assists', 'rebounds', 'threes']);
      if (recentStats) profile.recentAvg = recentStats;
    })
  );

  // Score props for each player
  for (const profile of topProfiles) {
    const usageBoost = profile.side === 'home'
      ? allInjuredHome.length > 0
      : allInjuredAway.length > 0;

    const usageBoostReason = usageBoost
      ? `${profile.side === 'home' ? homeTeamName : awayTeamName} missing ${(profile.side === 'home' ? allInjuredHome : allInjuredAway).slice(0, 1).join(', ')}`
      : null;

    if (usageBoostReason) profile.usageBoostReason = usageBoostReason;

    const statsToScore: PropStat[] = [
      'points', 'assists', 'rebounds', 'threes', 'steals', 'blocks',          // NBA / WNBA / NCAAB
      'goals', 'shots',                                                       // NHL (assists already in)
      'hits', 'rbis', 'strikeouts', 'homeruns', 'totalbases', 'walks',        // MLB
      'passyards', 'passtd', 'rushyards', 'rushtd', 'recyards', 'receptions', // NFL / CFB
    ];
    // Pull per-game gamelog ONCE per player — feeds last-5 + streak vs the real line.
    let perGame: PerGameResult | null = null;
    try { perGame = await fetchAthletePerGameStats(profile.athleteId, league, statsToScore); } catch { /* non-blocking */ }
    for (const stat of statsToScore) {
      const seasonAvg = profile.seasonAvg[stat];
      if (seasonAvg === undefined || seasonAvg < 3) continue;

      const recentAvg = profile.recentAvg?.[stat] ?? null;
      const marketKey = statToMarketKey(stat);
      const realLine = marketKey ? (propsMap[`${normTeam(profile.playerName)}|${marketKey}`] ?? null) : null;
      const games = perGame?.perGame?.[stat];
      const trend = games && games.length > 0 ? computePropTrend(games, realLine?.line ?? null) : null;
      const rec = scoreProp(stat, seasonAvg, recentAvg, profile.injuryStatus, usageBoost, realLine, trend);
      if (rec) profile.propRecs.push(rec);
    }

    // Sort by confidence then edge size
    profile.propRecs.sort((a, b) => {
      const confOrder: PropConfidence[] = ['ELITE', 'HIGH', 'MEDIUM', 'LOW'];
      const confDiff = confOrder.indexOf(a.confidence) - confOrder.indexOf(b.confidence);
      if (confDiff !== 0) return confDiff;
      return Math.abs(b.edgePct) - Math.abs(a.edgePct);
    });
  }

  // Build SGPs
  const sgpBuilds = buildSGPs(topProfiles, spread, gameTotal, homeTeamName, awayTeamName, league);

  // Collect top props across all players (best 4)
  const allProps = topProfiles
    .flatMap((p) => p.propRecs.map((r) => ({ ...r, playerName: p.playerName })))
    .filter((r) => r.confidence !== 'LOW')
    .sort((a, b) => {
      const confOrder: PropConfidence[] = ['ELITE', 'HIGH', 'MEDIUM', 'LOW'];
      return confOrder.indexOf(a.confidence) - confOrder.indexOf(b.confidence);
    });

  return {
    gameId, eventName, league, sport: league,
    playerProps: topProfiles.filter((p) => p.propRecs.length > 0),
    sgpBuilds,
    topProps: allProps.slice(0, 5),
    dataAvailable: topProfiles.length > 0,
  };
}
