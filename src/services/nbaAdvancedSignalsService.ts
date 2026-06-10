// NBA advanced signals — net rating, bench scoring, 4th quarter clutch,
// pace, free throw rate, turnover rate, referee tendencies.

import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const ESPN_NBA = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const TTL = 60 * 60 * 1000;
const cache = new Map<string, { data: NBATeamSignals; at: number }>();
const matchupCache = new Map<string, { data: NBAMatchupSignals; at: number }>();

// ─── Referee tendencies ───────────────────────────────────────────────────────
// Refs with strong over/under or pace tendencies.
// FTA/game: fouls called → more free throws → more scoring → over lean.
// Pace: some refs let more physicality go → fewer whistles → under lean.
const REF_TENDENCIES: Record<string, {
  ftaBoost: number;       // free throws awarded per game vs avg (+/-)
  overRate: number;       // historical over% in their games
  notes: string;
}> = {
  'Scott Foster':    { ftaBoost: 4.2, overRate: 56, notes: 'Most FTAs called in NBA — home teams benefit disproportionately. Strong over lean.' },
  'Tony Brothers':   { ftaBoost: 3.1, overRate: 55, notes: 'Calls lots of fouls, game flows stop-and-go. Over lean.' },
  'Marc Davis':      { ftaBoost: 2.8, overRate: 54, notes: 'High FTA count, over lean.' },
  'James Capers':    { ftaBoost: 1.5, overRate: 52, notes: 'Slightly above average FTAs.' },
  'Ed Malloy':       { ftaBoost: -2.0, overRate: 47, notes: 'Lets game flow, fewer whistles. Under lean.' },
  'Kane Fitzgerald': { ftaBoost: -1.8, overRate: 47, notes: 'Below average FTAs, under lean.' },
  'Josh Tiven':      { ftaBoost: 2.5, overRate: 53, notes: 'High foul caller.' },
  'Dedric Taylor':   { ftaBoost: -2.5, overRate: 46, notes: 'Very low FTA count — game flows physically. Under lean.' },
};

export function getNBARefereeImpact(refNames: string[]) {
  let totalFtaBoost = 0;
  let count = 0;
  const matchedRefs: string[] = [];
  for (const name of refNames) {
    for (const [k, v] of Object.entries(REF_TENDENCIES)) {
      if (name.toLowerCase().includes(k.toLowerCase())) {
        totalFtaBoost += v.ftaBoost;
        count++;
        matchedRefs.push(`${k} (FTA boost: ${v.ftaBoost > 0 ? '+' : ''}${v.ftaBoost}, over rate: ${v.overRate}%)`);
      }
    }
  }
  const avgFtaBoost = count > 0 ? Math.round((totalFtaBoost / count) * 10) / 10 : 0;
  return { avgFtaBoost, matchedRefs, overLean: avgFtaBoost >= 2.5, underLean: avgFtaBoost <= -1.5 };
}

// ─── Team signals ─────────────────────────────────────────────────────────────

export interface NBATeamSignals {
  teamName: string;
  gamesAnalyzed: number;
  // Net rating
  offensiveRating: number;    // points per 100 possessions — offense
  defensiveRating: number;    // points allowed per 100 possessions — defense (lower = better)
  netRating: number;          // ortg - drtg
  pace: number;               // possessions per game
  // Scoring
  pointsPerGame: number;
  pointsAllowedPerGame: number;
  // Bench
  benchPointsPerGame: number;
  starterPointsPerGame: number;
  benchPct: number;           // % of team scoring from bench
  // Q4 clutch
  q4PointsPerGame: number;
  q4PointsAllowedPerGame: number;
  q4NetPoints: number;        // positive = clutch team, negative = fades late
  // Free throws
  ftaPerGame: number;
  ftPct: number;
  ftAttemptRateDiff: number;  // team FTA - opp FTA per game (positive = get to line more)
  // Turnovers
  turnoversPerGame: number;
  oppTurnoversPerGame: number;
  turnoverDiff: number;       // positive = more steals than you give away
  // 3-point
  threePtMade: number;
  threePtAttempted: number;
  threePtPct: number;
  // Rebounding
  reboundPct: number;         // % of available rebounds
  // Recent form
  last10Record: string;
  last10Win: number;
  last5PointDiff: number;     // avg point differential last 5 games
}

async function fetchTeamStats(teamId: string): Promise<any> {
  try {
    const r = await fetchWithTimeout(
      `${ESPN_NBA}/teams/${teamId}/statistics`,
      { cache: 'no-store' },
    );
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function fetchTeamSchedule(teamId: string): Promise<any[]> {
  try {
    const season = new Date().getFullYear();
    const r = await fetchWithTimeout(
      `${ESPN_NBA}/teams/${teamId}/schedule?season=${season}`,
      { cache: 'no-store' },
    );
    if (!r.ok) return [];
    const j = await r.json();
    return (j.events || []) as any[];
  } catch { return []; }
}

function statValue(stats: any[], name: string): number {
  if (!stats) return 0;
  const s = stats.find((s: any) =>
    (s.name || '').toLowerCase().includes(name.toLowerCase()) ||
    (s.label || '').toLowerCase().includes(name.toLowerCase())
  );
  return s ? Number(s.value ?? s.displayValue ?? 0) : 0;
}

export async function getNBATeamSignals(teamId: string, teamName: string): Promise<NBATeamSignals | null> {
  const hit = cache.get(teamId);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  try {
    const [statsData, schedule] = await Promise.all([
      fetchTeamStats(teamId),
      fetchTeamSchedule(teamId),
    ]);

    const categories = statsData?.results?.stats?.categories || statsData?.team?.statistics || [];
    const allStats: any[] = categories.flatMap ? categories.flatMap((c: any) => c.stats || []) : categories;

    const ppg = statValue(allStats, 'points');
    const papg = statValue(allStats, 'pointsAllowed') || statValue(allStats, 'opponentPoints');
    const pace = statValue(allStats, 'pace') || statValue(allStats, 'possessions');
    const ftaPg = statValue(allStats, 'freeThrowAttempts') || statValue(allStats, 'ftAttempts');
    const ftPct = statValue(allStats, 'freeThrowPct') || statValue(allStats, 'ftPct');
    const toPg = statValue(allStats, 'turnovers');
    const oppTo = statValue(allStats, 'opponentTurnovers') || statValue(allStats, 'steals');
    const threeM = statValue(allStats, 'threePointFieldGoalsMade') || statValue(allStats, '3ptMade');
    const threeA = statValue(allStats, 'threePointFieldGoalsAttempted') || statValue(allStats, '3ptAtt');
    const threePct = threeA > 0 ? threeM / threeA : statValue(allStats, 'threePointPct') / 100 || 0.35;
    const reb = statValue(allStats, 'totalRebounds') || statValue(allStats, 'rebounds');

    // Build from schedule
    const completed = (schedule || [])
      .filter((e: any) => e.competitions?.[0]?.status?.type?.completed === true)
      .sort((a: any, b: any) => String(a.date || '').localeCompare(String(b.date || '')));

    let benchPts = 0, starterPts = 0, q4For = 0, q4Against = 0;
    let last10W = 0; const last10: string[] = [];
    let last5Diff = 0;
    const n = completed.length;

    for (let i = Math.max(0, n - 40); i < n; i++) {
      const ev = completed[i];
      const comp = ev.competitions?.[0];
      if (!comp) continue;
      const competitors: any[] = comp.competitors || [];
      const me = competitors.find((c: any) => String(c.team?.id) === String(teamId));
      const opp = competitors.find((c: any) => String(c.team?.id) !== String(teamId));
      if (!me || !opp) continue;

      const myScore = Number(me.score ?? 0);
      const oppScore = Number(opp.score ?? 0);

      // Q4 from line scores
      const lineScores: any[] = comp.linescores || [];
      if (lineScores.length >= 4) {
        const meQ4 = Number(lineScores[3]?.score?.away ?? lineScores[3]?.score?.home ?? 0);
        const oppQ4 = Number(lineScores[3]?.score?.home ?? lineScores[3]?.score?.away ?? 0);
        q4For += meQ4;
        q4Against += oppQ4;
      }

      // Bench scoring from boxscore (if included)
      const leaders = me.leaders || [];
      const benchLeader = leaders.find((l: any) => /bench/i.test(l.name || ''));
      if (benchLeader) benchPts += Number(benchLeader.leaders?.[0]?.value ?? 0);

      if (i >= n - 10) {
        const won = myScore > oppScore;
        last10.push(won ? 'W' : 'L');
        if (won) last10W++;
        if (i >= n - 5) last5Diff += (myScore - oppScore);
      }
    }

    const gamesAnalyzed = Math.min(n, 40);
    const avgQ = gamesAnalyzed > 0 ? 1 : 0;

    // Estimate net rating from raw PPG if advanced stats not available
    const defRating = papg > 0 ? papg : 110;
    const offRating = ppg > 0 ? ppg : 110;
    const netRating = Math.round((offRating - defRating) * 10) / 10;

    const signals: NBATeamSignals = {
      teamName,
      gamesAnalyzed,
      offensiveRating: offRating,
      defensiveRating: defRating,
      netRating,
      pace: pace || 100,
      pointsPerGame: ppg,
      pointsAllowedPerGame: papg,
      benchPointsPerGame: gamesAnalyzed > 0 ? Math.round(benchPts / gamesAnalyzed * 10) / 10 : 0,
      starterPointsPerGame: gamesAnalyzed > 0 && ppg > 0 ? Math.max(0, ppg - Math.round(benchPts / gamesAnalyzed * 10) / 10) : ppg,
      benchPct: ppg > 0 && gamesAnalyzed > 0 ? Math.round((benchPts / gamesAnalyzed / ppg) * 100) : 0,
      q4PointsPerGame: gamesAnalyzed > 0 ? Math.round(q4For / gamesAnalyzed * 10) / 10 : 0,
      q4PointsAllowedPerGame: gamesAnalyzed > 0 ? Math.round(q4Against / gamesAnalyzed * 10) / 10 : 0,
      q4NetPoints: gamesAnalyzed > 0 ? Math.round(((q4For - q4Against) / gamesAnalyzed) * 10) / 10 : 0,
      ftaPerGame: ftaPg,
      ftPct: ftPct > 1 ? ftPct / 100 : ftPct,
      ftAttemptRateDiff: 0,   // needs matchup context
      turnoversPerGame: toPg,
      oppTurnoversPerGame: oppTo,
      turnoverDiff: Math.round((oppTo - toPg) * 10) / 10,
      threePtMade: threeM,
      threePtAttempted: threeA,
      threePtPct: Math.round(threePct * 1000) / 10,
      reboundPct: reb > 0 ? Math.round((reb / (reb * 2)) * 100) : 50,
      last10Record: `${last10W}-${10 - last10W}`,
      last10Win: last10W,
      last5PointDiff: last10.length >= 5 ? Math.round(last5Diff / 5 * 10) / 10 : 0,
    };

    cache.set(teamId, { data: signals, at: Date.now() });
    return signals;
  } catch (err) {
    console.error('[nbaAdvancedSignalsService]', err);
    return null;
  }
}

// ─── Matchup ──────────────────────────────────────────────────────────────────

export interface NBAMatchupSignals {
  home: NBATeamSignals;
  away: NBATeamSignals;
  paceScore: number;          // combined pace indicator (high = more possessions = over lean)
  netRatingEdge: number;      // home.netRating - away.netRating
  clutchEdge: number;         // home.q4NetPoints - away.q4NetPoints
  bullets: string[];
}

export async function getNBAMatchupSignals(
  homeTeamId: string, homeTeamName: string,
  awayTeamId: string, awayTeamName: string,
): Promise<NBAMatchupSignals | null> {
  const key = `nba-matchup:${homeTeamId}|${awayTeamId}`;
  const hit = matchupCache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const [home, away] = await Promise.all([
    getNBATeamSignals(homeTeamId, homeTeamName),
    getNBATeamSignals(awayTeamId, awayTeamName),
  ]);
  if (!home || !away) return null;

  const paceScore = ((home.pace || 100) + (away.pace || 100)) / 2;
  const netRatingEdge = Math.round((home.netRating - away.netRating) * 10) / 10;
  const clutchEdge = Math.round((home.q4NetPoints - away.q4NetPoints) * 10) / 10;
  const bullets: string[] = [];

  // Net rating edge
  if (Math.abs(netRatingEdge) >= 6) {
    const stronger = netRatingEdge > 0 ? homeTeamName : awayTeamName;
    bullets.push(`Net rating edge: ${stronger} is +${Math.abs(netRatingEdge)} per 100 possessions — significant quality gap.`);
  }

  // Pace and over/under lean
  if (paceScore >= 102) bullets.push(`High-pace matchup (avg ${Math.round(paceScore)} poss/game) — more possessions = more scoring opportunities. Lean over.`);
  else if (paceScore <= 97) bullets.push(`Slow-paced matchup (avg ${Math.round(paceScore)} poss/game) — expect a defensive battle. Lean under.`);

  // Q4 clutch
  if (clutchEdge >= 4) bullets.push(`${homeTeamName} outscores opponents by ${home.q4NetPoints.toFixed(1)} pts in Q4 — strong closer at home.`);
  else if (clutchEdge <= -4) bullets.push(`${awayTeamName} is the better Q4 team (+${Math.abs(away.q4NetPoints).toFixed(1)} net) — away team closes better.`);

  // 3-point dependency
  if (home.threePtPct < 33 && home.threePtAttempted > 30) bullets.push(`${homeTeamName} shooting ${home.threePtPct}% from 3 on high volume — cold streak risk; line may be inflated.`);
  if (away.threePtPct < 33 && away.threePtAttempted > 30) bullets.push(`${awayTeamName} ${away.threePtPct}% from deep on high volume — variance pick if you like them.`);

  // Turnover differential
  if (home.turnoverDiff >= 3) bullets.push(`${homeTeamName} forces ${home.turnoverDiff.toFixed(1)} more turnovers than they commit — excellent takeaway team.`);
  if (away.turnoverDiff >= 3) bullets.push(`${awayTeamName} turnover margin: +${away.turnoverDiff.toFixed(1)} — creates extra possessions on the road.`);

  // Recent form
  if (home.last10Win >= 8) bullets.push(`${homeTeamName} hot — ${home.last10Record} last 10, averaging +${home.last5PointDiff.toFixed(1)} margin last 5.`);
  else if (home.last10Win <= 3) bullets.push(`${homeTeamName} cold — only ${home.last10Record} last 10.`);
  if (away.last10Win >= 8) bullets.push(`${awayTeamName} rolling — ${away.last10Record} last 10.`);
  else if (away.last10Win <= 3) bullets.push(`${awayTeamName} struggling — ${away.last10Record} last 10.`);

  // Free throw edge
  if (home.ftaPerGame - away.ftaPerGame >= 5) bullets.push(`${homeTeamName} gets to the line ${(home.ftaPerGame - away.ftaPerGame).toFixed(1)} more times/game — FT rate fuels scoring floor.`);

  const result: NBAMatchupSignals = { home, away, paceScore, netRatingEdge, clutchEdge, bullets };
  matchupCache.set(key, { data: result, at: Date.now() });
  return result;
}
