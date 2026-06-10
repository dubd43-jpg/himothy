// PLAYER MATCHUP HISTORY
//
// Pulls player-vs-team historical splits from ESPN's athlete stats endpoint.
// Used by prop scoring: "LeBron averages 32 pts vs Spurs over last 5 meetings" is
// a separate signal from "LeBron averages 28 pts season" — the matchup-specific
// average often diverges and represents real edge.

import { LEAGUE_URLS } from '@/lib/validation';

export interface PlayerMatchupSnapshot {
  athleteId: string;
  playerName: string;
  league: string;
  opponentTeamId: string;
  opponentName: string;
  // Aggregate across the rolling N most recent meetings (typically last 3-5).
  sample: number;
  avgPoints?: number;
  avgRebounds?: number;
  avgAssists?: number;
  avgThrees?: number;
  // For each prop market we score, project an adjustment vs season baseline.
  // E.g., a positive matchupDelta on "points" means this player puts up MORE pts
  // vs this opponent than against the average opponent.
  perMarketDelta: Record<string, number>;
  source: 'espn-gamelog';
}

const cache = new Map<string, { snap: PlayerMatchupSnapshot | null; at: number }>();
const TTL_MS = 60 * 60 * 1000; // 1h — gamelog changes slowly

async function fetchAthleteGamelog(league: string, athleteId: string): Promise<any | null> {
  const baseUrl = LEAGUE_URLS[league];
  if (!baseUrl) return null;
  // ESPN's web endpoint exposes gamelog grouped by event with opponent info.
  const url = `${baseUrl}/athletes/${athleteId}/gamelog`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

// Returns the column index given a label-keyed labels array. ESPN gamelog rows
// are positional arrays; the labels live in a separate array.
function colIdx(labels: string[], target: string): number {
  return labels.findIndex((l) => String(l).toLowerCase() === target.toLowerCase());
}

function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getPlayerMatchup(args: {
  athleteId: string;
  playerName: string;
  league: string;
  opponentTeamId: string;
  opponentName: string;
}): Promise<PlayerMatchupSnapshot | null> {
  const k = `${args.league}:${args.athleteId}:${args.opponentTeamId}`;
  const cached = cache.get(k);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.snap;

  const data = await fetchAthleteGamelog(args.league, args.athleteId);
  if (!data) {
    cache.set(k, { snap: null, at: Date.now() });
    return null;
  }

  // ESPN gamelog structure: { seasonTypes: [{ categories: [{ events: { eventId: {...} } }] }] }
  // Each event has opponent.id (or opponent team), stats array, and a labels block
  // somewhere at the parent level.
  let labels: string[] = [];
  const allEvents: any[] = [];
  const seasons = data?.seasonTypes || [];
  for (const st of seasons) {
    for (const cat of (st?.categories || [])) {
      const evs = cat?.events || [];
      for (const ev of evs) {
        const lbls = cat?.labels || st?.labels || data?.labels;
        if (Array.isArray(lbls) && lbls.length > labels.length) labels = lbls;
        allEvents.push(ev);
      }
    }
  }
  if (allEvents.length === 0 || labels.length === 0) {
    cache.set(k, { snap: null, at: Date.now() });
    return null;
  }

  // Filter to events vs this opponent. ESPN exposes opponent on each event row.
  const matchupEvents = allEvents.filter((e: any) => {
    const opp = e?.opponent?.id || e?.atVs?.id || e?.opponentTeamId;
    return opp != null && String(opp) === String(args.opponentTeamId);
  }).slice(-5); // last 5 meetings

  if (matchupEvents.length === 0) {
    cache.set(k, { snap: null, at: Date.now() });
    return null;
  }

  const ptsIdx = colIdx(labels, 'PTS');
  const rebIdx = colIdx(labels, 'REB');
  const astIdx = colIdx(labels, 'AST');
  const threesIdx = Math.max(colIdx(labels, '3PT'), colIdx(labels, '3PM'));

  const sums = { pts: 0, reb: 0, ast: 0, threes: 0 };
  const counts = { pts: 0, reb: 0, ast: 0, threes: 0 };
  for (const ev of matchupEvents) {
    const stats = ev?.stats || [];
    if (ptsIdx >= 0) { const v = num(stats[ptsIdx]); if (v != null) { sums.pts += v; counts.pts += 1; } }
    if (rebIdx >= 0) { const v = num(stats[rebIdx]); if (v != null) { sums.reb += v; counts.reb += 1; } }
    if (astIdx >= 0) { const v = num(stats[astIdx]); if (v != null) { sums.ast += v; counts.ast += 1; } }
    if (threesIdx >= 0) { const v = num(stats[threesIdx]); if (v != null) { sums.threes += v; counts.threes += 1; } }
  }

  // Also compute season averages from the full gamelog so we can compute delta.
  const sumsSeason = { pts: 0, reb: 0, ast: 0, threes: 0 };
  const countsSeason = { pts: 0, reb: 0, ast: 0, threes: 0 };
  for (const ev of allEvents.slice(-20)) {
    const stats = ev?.stats || [];
    if (ptsIdx >= 0) { const v = num(stats[ptsIdx]); if (v != null) { sumsSeason.pts += v; countsSeason.pts += 1; } }
    if (rebIdx >= 0) { const v = num(stats[rebIdx]); if (v != null) { sumsSeason.reb += v; countsSeason.reb += 1; } }
    if (astIdx >= 0) { const v = num(stats[astIdx]); if (v != null) { sumsSeason.ast += v; countsSeason.ast += 1; } }
    if (threesIdx >= 0) { const v = num(stats[threesIdx]); if (v != null) { sumsSeason.threes += v; countsSeason.threes += 1; } }
  }

  const avg = (s: number, c: number) => c > 0 ? s / c : null;
  const matchupAvg = {
    pts: avg(sums.pts, counts.pts),
    reb: avg(sums.reb, counts.reb),
    ast: avg(sums.ast, counts.ast),
    threes: avg(sums.threes, counts.threes),
  };
  const seasonAvg = {
    pts: avg(sumsSeason.pts, countsSeason.pts),
    reb: avg(sumsSeason.reb, countsSeason.reb),
    ast: avg(sumsSeason.ast, countsSeason.ast),
    threes: avg(sumsSeason.threes, countsSeason.threes),
  };
  const delta = (m: number | null, s: number | null) => (m != null && s != null) ? Number((m - s).toFixed(2)) : 0;

  const snap: PlayerMatchupSnapshot = {
    athleteId: args.athleteId,
    playerName: args.playerName,
    league: args.league,
    opponentTeamId: args.opponentTeamId,
    opponentName: args.opponentName,
    sample: matchupEvents.length,
    avgPoints: matchupAvg.pts != null ? Math.round(matchupAvg.pts * 10) / 10 : undefined,
    avgRebounds: matchupAvg.reb != null ? Math.round(matchupAvg.reb * 10) / 10 : undefined,
    avgAssists: matchupAvg.ast != null ? Math.round(matchupAvg.ast * 10) / 10 : undefined,
    avgThrees: matchupAvg.threes != null ? Math.round(matchupAvg.threes * 10) / 10 : undefined,
    perMarketDelta: {
      points: delta(matchupAvg.pts, seasonAvg.pts),
      rebounds: delta(matchupAvg.reb, seasonAvg.reb),
      assists: delta(matchupAvg.ast, seasonAvg.ast),
      threes: delta(matchupAvg.threes, seasonAvg.threes),
    },
    source: 'espn-gamelog',
  };
  cache.set(k, { snap, at: Date.now() });
  return snap;
}
