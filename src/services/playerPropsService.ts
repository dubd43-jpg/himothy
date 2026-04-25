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

// ─── Types ──────────────────────────────────────────────────────────────────

export type PropStat = 'points' | 'assists' | 'rebounds' | 'threes' | 'goals' | 'shots' | 'hits' | 'rbis' | 'strikeouts' | 'passyards' | 'rushyards' | 'recyards';
export type PropDirection = 'over' | 'under';
export type PropConfidence = 'ELITE' | 'HIGH' | 'MEDIUM' | 'LOW';

const STAT_DISPLAY: Record<PropStat, string> = {
  points: 'Points', assists: 'Assists', rebounds: 'Rebounds', threes: '3-Pointers',
  goals: 'Goals', shots: 'Shots on Goal', hits: 'Hits', rbis: 'RBIs',
  strikeouts: 'Strikeouts', passyards: 'Pass Yards', rushyards: 'Rush Yards', recyards: 'Rec Yards',
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
  estimatedLine: number;
  direction: PropDirection;
  edgePct: number;
  confidence: PropConfidence;
  reason: string;
  sgpFriendly: boolean;
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
): PropRec | null {
  if (seasonAvg < 3) return null;  // too small to be meaningful

  const discount = PROP_LINE_DISCOUNT[stat] ?? 0.88;
  const estimatedLine = Math.round(seasonAvg * discount * 2) / 2;  // round to nearest .5

  // Use recent form if available, otherwise season avg
  const effectiveAvg = recentAvg ?? seasonAvg;

  // Apply usage boost if a key teammate is injured
  const boostedAvg = usageBoost ? effectiveAvg * 1.12 : effectiveAvg;

  const edge = boostedAvg - estimatedLine;
  const edgePct = (edge / estimatedLine) * 100;

  const direction: PropDirection = edge >= 0 ? 'over' : 'under';
  const absEdgePct = Math.abs(edgePct);

  let confidence: PropConfidence;
  if (absEdgePct >= 20) confidence = 'ELITE';
  else if (absEdgePct >= 12) confidence = 'HIGH';
  else if (absEdgePct >= 6) confidence = 'MEDIUM';
  else confidence = 'LOW';

  // Injury on pick side degrades confidence
  if (injuryStatus && ['OUT', 'DOUBTFUL'].includes((injuryStatus || '').toUpperCase())) {
    confidence = 'LOW';
  }

  let reason = '';
  if (direction === 'over') {
    if (recentAvg && recentAvg > seasonAvg) {
      reason = `Averaging ${seasonAvg.toFixed(1)} for the season but ${recentAvg.toFixed(1)} recently — line of ~${estimatedLine} is soft.`;
    } else {
      reason = `Season avg of ${seasonAvg.toFixed(1)} clears estimated line of ~${estimatedLine} by ${edge.toFixed(1)} (${edgePct.toFixed(0)}% edge).`;
    }
  } else {
    if (recentAvg && recentAvg < seasonAvg) {
      reason = `Averaging ${seasonAvg.toFixed(1)} for the season but only ${recentAvg.toFixed(1)} recently — line may be inflated.`;
    } else {
      reason = `Line of ~${estimatedLine} exceeds effective avg of ${effectiveAvg.toFixed(1)} — UNDER has value here.`;
    }
  }

  if (usageBoost) reason += ' Usage boost factored in due to teammate injury.';

  return {
    stat, displayStat: STAT_DISPLAY[stat], seasonAvg, recentAvg: recentAvg ?? null,
    estimatedLine, direction, edgePct: Math.round(edgePct * 10) / 10, confidence, reason,
    sgpFriendly: confidence !== 'LOW' && !['OUT', 'DOUBTFUL'].includes((injuryStatus || '').toUpperCase()),
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

    const statsToScore: PropStat[] = ['points', 'assists', 'rebounds', 'threes', 'goals', 'shots', 'hits', 'rbis', 'strikeouts'];
    for (const stat of statsToScore) {
      const seasonAvg = profile.seasonAvg[stat];
      if (seasonAvg === undefined || seasonAvg < 3) continue;

      const recentAvg = profile.recentAvg?.[stat] ?? null;
      const rec = scoreProp(stat, seasonAvg, recentAvg, profile.injuryStatus, usageBoost);
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
