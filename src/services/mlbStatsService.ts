// MLB Stats API client — completely free, comprehensive.
//
// Fills the gap that ESPN doesn't: per-pitcher splits vs handedness, team batting
// splits vs LHP/RHP, accurate probable starters. Tonight's Tampa-TT-Under loss
// happened because we trusted Madden's 2.38 ERA L3 without knowing what Tampa's
// lineup actually hits against RHP. This service closes that loop.
//
// Endpoints documented at https://github.com/MLB-StatsAPI/MLB-StatsAPI
// All endpoints are free, no auth required, with reasonable rate limits.

const BASE = 'https://statsapi.mlb.com/api/v1';
const TTL_MS = 60 * 60 * 1000; // 1 hour cache per pitcher / team
const _pitcherCache: Map<string, { data: PitcherEnhancedStats; at: number }> = new Map();
const _teamCache: Map<string, { data: TeamBattingSplits; at: number }> = new Map();
const _probableCache: Map<string, { data: GameProbables; at: number }> = new Map();

export interface PitcherEnhancedStats {
  id: string;
  name: string;
  throwsHand: 'L' | 'R' | null;
  // Season splits — KEY for matchup math
  vsLHB: { ops: number | null; avg: number | null; ip: number | null } | null;
  vsRHB: { ops: number | null; avg: number | null; ip: number | null } | null;
  // Season totals
  seasonERA: number | null;
  seasonWHIP: number | null;
  // Overall opponent average + power allowed (the "what they hit off you")
  seasonBAA: number | null;        // batting AVG against — opponents .XXX
  seasonOPSAgainst: number | null; // overall OPS against
}

export interface TeamBattingSplits {
  teamId: string;
  // vs RHP / LHP — the lineup's actual production against the hand they'll see
  vsLHP: { ops: number | null; avg: number | null; hr: number | null; kRate: number | null } | null;
  vsRHP: { ops: number | null; avg: number | null; hr: number | null; kRate: number | null } | null;
}

// Team-level scoring + pitching rates — the "expected total" floor.
export interface TeamSeasonRates {
  teamId: string;
  teamName: string;
  // Offense
  runsScoredPerGame: number | null;
  teamAVG: number | null;
  teamOPS: number | null;
  // Pitching staff
  runsAllowedPerGame: number | null;
  staffERA: number | null;
  staffWHIP: number | null;
  staffBAA: number | null;
  gamesPlayed: number | null;
}

export interface GameProbables {
  gamePk: string;
  startTime: string;
  homePitcherId: string | null;
  awayPitcherId: string | null;
  homePitcherName: string | null;
  awayPitcherName: string | null;
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Find MLB Stats API gamePk for a matchup on a date. Lets the engine wire
// MLB-Stats-only features (BvP, season rates, per-pitcher BAA) when the
// upstream ESPN ID can't be used directly.
// Cached by (homeId|awayId|date) for 60 min.
const _gamePkLookupCache: Map<string, { data: string | null; at: number }> = new Map();
export async function findMlbGamePk(
  homeStatsApiId: number | string | null | undefined,
  awayStatsApiId: number | string | null | undefined,
  dateMmDdYyyy: string,
): Promise<string | null> {
  if (!homeStatsApiId || !awayStatsApiId) return null;
  const home = String(homeStatsApiId);
  const away = String(awayStatsApiId);
  const key = `${home}|${away}|${dateMmDdYyyy}`;
  const hit = _gamePkLookupCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const data = await fetchJson(`${BASE}/schedule?sportId=1&date=${dateMmDdYyyy}`);
  let found: string | null = null;
  for (const day of data?.dates || []) {
    for (const g of day.games || []) {
      const hId = String(g.teams?.home?.team?.id ?? '');
      const aId = String(g.teams?.away?.team?.id ?? '');
      if (hId === home && aId === away) {
        found = String(g.gamePk);
        break;
      }
    }
    if (found) break;
  }
  _gamePkLookupCache.set(key, { data: found, at: Date.now() });
  return found;
}

// Today/tomorrow's schedule with probable pitchers attached.
export async function getMlbScheduleWithProbables(dateMmDdYyyy: string): Promise<GameProbables[]> {
  const data = await fetchJson(`${BASE}/schedule?sportId=1&date=${dateMmDdYyyy}&hydrate=probablePitcher`);
  if (!data) return [];
  const out: GameProbables[] = [];
  for (const day of data.dates || []) {
    for (const g of day.games || []) {
      const home = g.teams?.home || {};
      const away = g.teams?.away || {};
      const hp = home.probablePitcher;
      const ap = away.probablePitcher;
      out.push({
        gamePk: String(g.gamePk),
        startTime: g.gameDate || '',
        homePitcherId: hp?.id != null ? String(hp.id) : null,
        awayPitcherId: ap?.id != null ? String(ap.id) : null,
        homePitcherName: hp?.fullName || null,
        awayPitcherName: ap?.fullName || null,
      });
    }
  }
  return out;
}

// Pitcher's full enhanced stats including splits vs each side of the plate.
export async function getPitcherEnhancedStats(pitcherId: string, season?: number): Promise<PitcherEnhancedStats | null> {
  const s = season || new Date().getFullYear();
  const key = `${pitcherId}|${s}`;
  const hit = _pitcherCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  // Fetch basic info + season splits
  const [personRes, seasonStats, splitStats] = await Promise.all([
    fetchJson(`${BASE}/people/${pitcherId}`),
    fetchJson(`${BASE}/people/${pitcherId}/stats?stats=season&group=pitching&season=${s}`),
    fetchJson(`${BASE}/people/${pitcherId}/stats?stats=statSplits&group=pitching&sitCodes=vl,vr&season=${s}`),
  ]);

  const person = (personRes?.people || [])[0];
  if (!person) return null;
  const throwsCode = person.pitchHand?.code;
  const throws: 'L' | 'R' | null = throwsCode === 'L' ? 'L' : throwsCode === 'R' ? 'R' : null;

  const seasonSplit = ((seasonStats?.stats || [])[0]?.splits || [])[0]?.stat || {};
  const seasonERA = seasonSplit.era != null ? Number(seasonSplit.era) : null;
  const seasonWHIP = seasonSplit.whip != null ? Number(seasonSplit.whip) : null;
  const seasonBAA = seasonSplit.avg != null ? Number(seasonSplit.avg) : null;
  const seasonOPSAgainst = seasonSplit.ops != null ? Number(seasonSplit.ops) : null;

  let vsLHB: PitcherEnhancedStats['vsLHB'] = null;
  let vsRHB: PitcherEnhancedStats['vsRHB'] = null;
  for (const s2 of splitStats?.stats || []) {
    for (const sp of s2.splits || []) {
      const code = sp.split?.code;
      const st = sp.stat || {};
      const data = {
        ops: st.ops != null ? Number(st.ops) : null,
        avg: st.avg != null ? Number(st.avg) : null,
        ip: st.inningsPitched != null ? Number(st.inningsPitched) : null,
      };
      if (code === 'vl') vsLHB = data;
      else if (code === 'vr') vsRHB = data;
    }
  }

  const data: PitcherEnhancedStats = {
    id: pitcherId,
    name: person.fullName || 'Unknown',
    throwsHand: throws,
    vsLHB, vsRHB,
    seasonERA, seasonWHIP, seasonBAA, seasonOPSAgainst,
  };
  _pitcherCache.set(key, { data, at: Date.now() });
  return data;
}

// Team's batting splits vs LHP/RHP for the season.
export async function getTeamBattingSplits(teamId: string, season?: number): Promise<TeamBattingSplits | null> {
  const s = season || new Date().getFullYear();
  const key = `${teamId}|${s}`;
  const hit = _teamCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const data = await fetchJson(`${BASE}/teams/${teamId}/stats?stats=statSplits&group=hitting&sitCodes=vl,vr&season=${s}`);
  if (!data) return null;

  let vsLHP: TeamBattingSplits['vsLHP'] = null;
  let vsRHP: TeamBattingSplits['vsRHP'] = null;
  for (const s2 of data.stats || []) {
    for (const sp of s2.splits || []) {
      const code = sp.split?.code;
      const st = sp.stat || {};
      const pa = st.plateAppearances != null ? Number(st.plateAppearances) : 0;
      const k = st.strikeOuts != null ? Number(st.strikeOuts) : 0;
      const stats = {
        ops: st.ops != null ? Number(st.ops) : null,
        avg: st.avg != null ? Number(st.avg) : null,
        hr: st.homeRuns != null ? Number(st.homeRuns) : null,
        kRate: pa > 0 ? Number((k / pa).toFixed(3)) : null,
      };
      // Note: sitCodes vl/vr on HITTING refer to vs LHP / vs RHP
      if (code === 'vl') vsLHP = stats;
      else if (code === 'vr') vsRHP = stats;
    }
  }

  const out: TeamBattingSplits = { teamId, vsLHP, vsRHP };
  _teamCache.set(key, { data: out, at: Date.now() });
  return out;
}

// Team-level season offensive + pitching rates.
// Powers "opponent average" context — runs scored/game, runs allowed/game, etc.
const _teamRatesCache: Map<string, { data: TeamSeasonRates; at: number }> = new Map();
export async function getTeamSeasonRates(teamId: string, season?: number): Promise<TeamSeasonRates | null> {
  const s = season || new Date().getFullYear();
  const key = `${teamId}|${s}`;
  const hit = _teamRatesCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const [teamInfo, batData, pitData] = await Promise.all([
    fetchJson(`${BASE}/teams/${teamId}`),
    fetchJson(`${BASE}/teams/${teamId}/stats?stats=season&group=hitting&season=${s}`),
    fetchJson(`${BASE}/teams/${teamId}/stats?stats=season&group=pitching&season=${s}`),
  ]);

  const teamName = teamInfo?.teams?.[0]?.name || '';
  const batStat = batData?.stats?.[0]?.splits?.[0]?.stat || {};
  const pitStat = pitData?.stats?.[0]?.splits?.[0]?.stat || {};

  const gp = batStat.gamesPlayed != null ? Number(batStat.gamesPlayed) : null;
  const runsScored = batStat.runs != null ? Number(batStat.runs) : null;
  const runsAllowed = pitStat.runs != null ? Number(pitStat.runs) : null;

  const out: TeamSeasonRates = {
    teamId,
    teamName,
    runsScoredPerGame: gp && runsScored != null ? Number((runsScored / gp).toFixed(2)) : null,
    teamAVG: batStat.avg != null ? Number(batStat.avg) : null,
    teamOPS: batStat.ops != null ? Number(batStat.ops) : null,
    runsAllowedPerGame: gp && runsAllowed != null ? Number((runsAllowed / gp).toFixed(2)) : null,
    staffERA: pitStat.era != null ? Number(pitStat.era) : null,
    staffWHIP: pitStat.whip != null ? Number(pitStat.whip) : null,
    staffBAA: pitStat.avg != null ? Number(pitStat.avg) : null,
    gamesPlayed: gp,
  };
  _teamRatesCache.set(key, { data: out, at: Date.now() });
  return out;
}

// Compute an OPS-based matchup edge: opposing lineup's OPS vs the pitcher's hand
// MINUS the pitcher's OPS-allowed against that side of the plate. A POSITIVE delta
// means the opposing lineup will hit this pitcher harder than average; NEGATIVE
// means the pitcher's been suppressing this side better than the lineup typically hits.
//
// Returns null when data is missing on either side.
export function computeMatchupEdge(
  pitcher: PitcherEnhancedStats | null,
  oppHittingSplits: TeamBattingSplits | null,
): { delta: number; lineupOps: number; pitcherOps: number; side: 'L' | 'R' } | null {
  if (!pitcher || !pitcher.throwsHand || !oppHittingSplits) return null;
  const side = pitcher.throwsHand;
  // Opposing lineup vs the pitcher's hand:
  const lineupSplit = side === 'L' ? oppHittingSplits.vsLHP : oppHittingSplits.vsRHP;
  // Pitcher's split — note "vsLHB" means batters who hit lefty (LHB). When pitcher is
  // RIGHT-handed, RHB face him at "platoon disadvantage" but LHB at advantage; lineups
  // generally hit better off opposite-hand pitchers. We compare each lineup's vs-LHP
  // (when pitcher is L) or vs-RHP (when pitcher is R) directly to the pitcher's
  // OPS-allowed to the AVG side of the plate (use whichever has more IP for stability).
  const lineupOps = lineupSplit?.ops;
  // For pitcher, average their vs-L and vs-R OPS-allowed weighted by IP for a stable read.
  const pL = pitcher.vsLHB;
  const pR = pitcher.vsRHB;
  if (lineupOps == null) return null;
  let pitcherOps: number | null = null;
  if (pL?.ops != null && pR?.ops != null && pL.ip != null && pR.ip != null) {
    const total = pL.ip + pR.ip;
    pitcherOps = (pL.ops * pL.ip + pR.ops * pR.ip) / (total || 1);
  } else if (pL?.ops != null) pitcherOps = pL.ops;
  else if (pR?.ops != null) pitcherOps = pR.ops;
  if (pitcherOps == null) return null;

  return {
    delta: Number((lineupOps - pitcherOps).toFixed(3)),
    lineupOps: Number(lineupOps.toFixed(3)),
    pitcherOps: Number(pitcherOps.toFixed(3)),
    side,
  };
}
