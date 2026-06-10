// BATTER vs PITCHER (BvP) — MLB Stats API
//
// Career head-to-head numbers between each starting-lineup batter and the
// opposing starter. Where a batter has meaningful sample size (≥10 AB) and
// outsized production (≥.900 OPS or ≥2 HR), that's a real edge signal for
// team total, player-prop, and over/under picks.
//
// Endpoint: GET /people/{batterId}/stats?stats=vsPlayerTotal&opposingPlayerId={pitcherId}&group=hitting
// All free, no auth. Cached in-process for 60 min (BvP doesn't shift fast).

const BASE = 'https://statsapi.mlb.com/api/v1';
const TTL_MS = 60 * 60 * 1000;
const cache: Map<string, { data: BvpStat | null; at: number }> = new Map();

export interface BvpStat {
  batterId: number;
  batterName: string;
  pitcherId: number;
  pitcherName: string;
  ab: number;
  hits: number;
  hr: number;
  bb: number;
  so: number;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  // Quick verdict used for tagging: 'dominant' = batter owns pitcher, 'owned' =
  // pitcher owns batter, 'neutral' otherwise. Requires ≥10 AB to be non-neutral.
  verdict: 'dominant' | 'owned' | 'neutral';
}

export interface LineupBvp {
  pitcherId: number;
  pitcherName: string;
  stats: BvpStat[];
  // Aggregate diagnostics
  highlightDominant: BvpStat[];   // batters with ≥10 AB AND OPS ≥ .900 OR ≥2 HR
  highlightOwned: BvpStat[];      // batters with ≥10 AB AND AVG ≤ .150 OR K-rate ≥ 35%
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function parseNum(v: any): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function verdictFor(ab: number, ops: number | null, hr: number, avg: number | null, so: number): BvpStat['verdict'] {
  if (ab < 10) return 'neutral';
  if ((ops != null && ops >= 0.900) || hr >= 2) return 'dominant';
  if ((avg != null && avg <= 0.150) || (ab > 0 && so / ab >= 0.35)) return 'owned';
  return 'neutral';
}

export async function getBvp(batterId: number, batterName: string, pitcherId: number, pitcherName: string): Promise<BvpStat | null> {
  if (!batterId || !pitcherId) return null;
  const key = `${batterId}|${pitcherId}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;

  const url = `${BASE}/people/${batterId}/stats?stats=vsPlayerTotal&opposingPlayerId=${pitcherId}&group=hitting`;
  const data = await fetchJson(url);
  const splits = data?.stats?.[0]?.splits?.[0]?.stat;
  if (!splits) {
    cache.set(key, { data: null, at: Date.now() });
    return null;
  }
  const ab = parseNum(splits.atBats) ?? 0;
  const hits = parseNum(splits.hits) ?? 0;
  const hr = parseNum(splits.homeRuns) ?? 0;
  const bb = parseNum(splits.baseOnBalls) ?? 0;
  const so = parseNum(splits.strikeOuts) ?? 0;
  const avg = parseNum(splits.avg);
  const obp = parseNum(splits.obp);
  const slg = parseNum(splits.slg);
  const ops = parseNum(splits.ops);

  const result: BvpStat = {
    batterId, batterName, pitcherId, pitcherName,
    ab, hits, hr, bb, so, avg, obp, slg, ops,
    verdict: verdictFor(ab, ops, hr, avg, so),
  };
  cache.set(key, { data: result, at: Date.now() });
  return result;
}

// Pull BvP for an entire lineup against one opposing pitcher.
export async function getLineupBvp(
  pitcher: { id: number; name: string },
  lineup: Array<{ playerId: number; playerName: string }>,
): Promise<LineupBvp> {
  const results = await Promise.allSettled(
    lineup.map(b => getBvp(b.playerId, b.playerName, pitcher.id, pitcher.name)),
  );
  const stats: BvpStat[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value && r.value.ab > 0) stats.push(r.value);
  }
  const highlightDominant = stats.filter(s => s.verdict === 'dominant');
  const highlightOwned = stats.filter(s => s.verdict === 'owned');
  return { pitcherId: pitcher.id, pitcherName: pitcher.name, stats, highlightDominant, highlightOwned };
}

// Returns a one-line natural-language summary suitable for admin display.
export function summarizeLineupBvp(lb: LineupBvp): string {
  if (lb.highlightDominant.length === 0 && lb.highlightOwned.length === 0) {
    if (lb.stats.length === 0) return `No prior matchups against ${lb.pitcherName}.`;
    return `${lb.stats.length} batters have history vs ${lb.pitcherName}, none dominant.`;
  }
  const parts: string[] = [];
  if (lb.highlightDominant.length) {
    parts.push(
      'Owns him: ' + lb.highlightDominant
        .map(s => `${s.batterName} ${s.hits}-for-${s.ab}` + (s.hr > 0 ? `, ${s.hr} HR` : '') + (s.ops != null ? ` (OPS ${s.ops.toFixed(3)})` : ''))
        .join('; '),
    );
  }
  if (lb.highlightOwned.length) {
    parts.push(
      'Owned by him: ' + lb.highlightOwned
        .map(s => `${s.batterName} ${s.hits}-for-${s.ab}` + (s.avg != null ? ` (AVG ${s.avg.toFixed(3)})` : ''))
        .join('; '),
    );
  }
  return parts.join(' · ');
}

// Confidence nudge a pick can absorb from BvP evidence. Modest by design —
// BvP is one signal among many. Caps at ±2 points.
export function bvpConfidenceNudge(opts: {
  // Our pick favors batters scoring runs (over, team-total over, batter prop over)
  pickFavorsOffense: boolean;
  // Which lineup matters for our pick — usually the team we're picking, or
  // the opposing team if we picked the pitcher / their team's under.
  lineupBvp: LineupBvp;
}): { delta: number; reasons: string[] } {
  const reasons: string[] = [];
  let delta = 0;
  const { highlightDominant, highlightOwned } = opts.lineupBvp;
  if (opts.pickFavorsOffense) {
    if (highlightDominant.length >= 2) {
      delta += 2;
      reasons.push(`${highlightDominant.length} batters with strong history vs ${opts.lineupBvp.pitcherName}`);
    } else if (highlightDominant.length === 1) {
      delta += 1;
      reasons.push(`${highlightDominant[0].batterName} owns ${opts.lineupBvp.pitcherName} historically`);
    }
    if (highlightOwned.length >= 3) {
      delta -= 1;
      reasons.push(`${highlightOwned.length} batters owned by ${opts.lineupBvp.pitcherName} historically`);
    }
  } else {
    if (highlightOwned.length >= 2) {
      delta += 1;
      reasons.push(`${highlightOwned.length} key batters owned by ${opts.lineupBvp.pitcherName}`);
    }
    if (highlightDominant.length >= 2) {
      delta -= 1;
      reasons.push(`${highlightDominant.length} batters have hit ${opts.lineupBvp.pitcherName} hard`);
    }
  }
  return { delta: Math.max(-2, Math.min(2, delta)), reasons };
}
