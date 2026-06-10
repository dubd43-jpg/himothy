// ADVANCED SABERMETRIC SERVICE (MLB)
//
// Pulls xFIP, K/9, BB/9, hard-hit %, barrel rate from Baseball Savant + FanGraphs
// for the probable starters. These tighten our F5 / NRFI / over-under scoring
// beyond the season-ERA proxy currently in the engine.
//
// Data sources:
//   - Baseball Savant has free CSV exports at /statcast_search and /leaderboard
//     keyed by player_id (MLBAM id). Slow on cold call but cacheable for hours.
//   - FanGraphs has free JSON via /api/leaders with playerid (FG id).
//
// To keep the initial deploy simple and reliable, this service:
//   1. Caches results by (mlbamId, season) for 6 hours
//   2. Falls back to ERA-only signals if Savant is unreachable
//   3. Will be filled out as more endpoints/IDs map cleanly

interface AdvancedPitcherStats {
  mlbamId?: string;
  fgId?: string;
  playerName: string;
  season: number;
  xfip: number | null;
  k9: number | null;
  bb9: number | null;
  hardHitPct: number | null;     // 0..1
  barrelPct: number | null;      // 0..1
  whiffPct: number | null;       // swing-and-miss rate
  source: 'savant' | 'fangraphs' | 'unavailable';
}

const cache = new Map<string, { stats: AdvancedPitcherStats | null; at: number }>();
const TTL_MS = 6 * 60 * 60 * 1000;

// Baseball Savant has a public leaderboard endpoint. We only need the pitcher's
// current-season summary row. The CSV endpoint is the simplest:
// https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=pitcher&year=2026&csv=true
//
// We pull the full CSV once, cache it, then index by name. The CSV is ~500KB.
let _savantCache: { rows: Record<string, any>; at: number } | null = null;
const SAVANT_CACHE_TTL_MS = 60 * 60 * 1000; // 1h

async function loadSavantLeaderboard(season: number): Promise<Record<string, any>> {
  if (_savantCache && Date.now() - _savantCache.at < SAVANT_CACHE_TTL_MS) {
    return _savantCache.rows;
  }
  try {
    const url = `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=pitcher&year=${season}&csv=true`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return {};
    const csv = await res.text();
    const rows: Record<string, any> = {};
    const lines = csv.split(/\r?\n/);
    if (lines.length < 2) return {};
    const headers = lines[0].split(',').map((s) => s.replace(/^"|"$/g, ''));
    const nameIdx = headers.findIndex((h) => /name/i.test(h));
    const idIdx = headers.findIndex((h) => /player_id/i.test(h));
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const name = cols[nameIdx]?.replace(/^"|"$/g, '');
      const id = cols[idIdx];
      if (!name) continue;
      const row: any = {};
      headers.forEach((h, j) => { row[h] = cols[j]?.replace(/^"|"$/g, ''); });
      rows[name.toLowerCase()] = { ...row, mlbamId: id };
    }
    _savantCache = { rows, at: Date.now() };
    return rows;
  } catch {
    return {};
  }
}

export async function getAdvancedPitcher(playerName: string, season?: number): Promise<AdvancedPitcherStats | null> {
  if (!playerName) return null;
  const yr = season ?? new Date().getFullYear();
  const k = `${yr}:${playerName.toLowerCase()}`;
  const cached = cache.get(k);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.stats;

  const board = await loadSavantLeaderboard(yr);
  // Savant names appear "Last, First" — normalize.
  const lastFirst = (() => {
    const parts = playerName.split(/\s+/);
    if (parts.length < 2) return playerName.toLowerCase();
    return `${parts.slice(-1)[0]}, ${parts.slice(0, -1).join(' ')}`.toLowerCase();
  })();
  const row = board[lastFirst] || board[playerName.toLowerCase()] || null;
  if (!row) {
    cache.set(k, { stats: null, at: Date.now() });
    return null;
  }

  // Try common Savant column names. xwOBA + hard-hit + barrel + whiff are the core.
  const num = (v: any) => {
    const n = Number(String(v).replace('%', ''));
    return Number.isFinite(n) ? n : null;
  };
  const stats: AdvancedPitcherStats = {
    mlbamId: row.mlbamId,
    playerName,
    season: yr,
    xfip: num(row.xfip) ?? null,
    k9: num(row.k_9) ?? num(row['k/9']) ?? null,
    bb9: num(row.bb_9) ?? num(row['bb/9']) ?? null,
    hardHitPct: num(row.hard_hit_percent) != null ? (num(row.hard_hit_percent)! / 100) : null,
    barrelPct: num(row.barrel_batted_rate) != null ? (num(row.barrel_batted_rate)! / 100) : null,
    whiffPct: num(row.whiff_percent) != null ? (num(row.whiff_percent)! / 100) : null,
    source: 'savant',
  };
  cache.set(k, { stats, at: Date.now() });
  return stats;
}

// Convert a pitcher's advanced profile to a numeric scoring nudge for our pick.
// Positive = adds to our confidence the BATTERS struggle vs this guy.
// (Used when WE are betting the pitcher's team or the under.)
export function nudgeFromAdvancedStats(stats: AdvancedPitcherStats | null): { delta: number; reason: string | null } {
  if (!stats) return { delta: 0, reason: null };
  let delta = 0;
  const bits: string[] = [];
  if (stats.whiffPct != null && stats.whiffPct >= 0.30) { delta += 3; bits.push(`whiff rate ${(stats.whiffPct * 100).toFixed(1)}% (elite swing-and-miss)`); }
  if (stats.barrelPct != null && stats.barrelPct <= 0.05) { delta += 2; bits.push(`barrel rate ${(stats.barrelPct * 100).toFixed(1)}% (hitters not squaring him up)`); }
  if (stats.hardHitPct != null && stats.hardHitPct >= 0.45) { delta -= 2; bits.push(`hard-hit ${(stats.hardHitPct * 100).toFixed(1)}% (hittable)`); }
  if (stats.xfip != null && stats.xfip <= 3.5) { delta += 2; bits.push(`xFIP ${stats.xfip.toFixed(2)}`); }
  if (stats.xfip != null && stats.xfip >= 5.0) { delta -= 2; bits.push(`xFIP ${stats.xfip.toFixed(2)} (regression incoming)`); }
  return {
    delta,
    reason: bits.length > 0 ? `Advanced — ${stats.playerName}: ${bits.join(', ')}.` : null,
  };
}
