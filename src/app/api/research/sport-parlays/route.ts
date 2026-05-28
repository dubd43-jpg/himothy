import { NextResponse } from 'next/server';
import { buildSportParlays } from '@/services/deepResearchService';
import { getCachedBoardPicks, getOrComputeBoard } from '@/services/dailyBoardCache';
import { etDayKey } from '@/lib/datetime';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// One 4-leg parlay per major NA sport, single-sport each. Skips any sport that can't
// produce 4 quality legs. Single-game sports (NBA playoffs) fill from player/game props.
// Cached 10 min in-process so repeated loads don't re-scan every sport — but keyed to the
// ET day so a warm instance never serves yesterday's parlays after the slate rolls over.
let cache: { data: any; at: number; day: string } | null = null;
const TTL_MS = 10 * 60 * 1000;

function buildExclusionSet(boardPicks: any[]): Set<string> {
  // We never repeat the main-board picks inside a parlay. Exclude each exact pick
  // (gameId|selection) so the sport parlay has to find different angles.
  const out = new Set<string>();
  for (const p of boardPicks) {
    if (!p?.gameId || !p?.selection) continue;
    const norm = String(p.selection).toLowerCase().replace(/\s+/g, ' ').trim();
    out.add(`${p.gameId}|${norm}`);
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('refresh') === 'true';
    const today = etDayKey();
    if (!force && cache && cache.day === today && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json({ success: true, cached: true, ...cache.data });
    }

    // Pull the regular-card picks first so the sport parlays can dedupe against them —
    // the user does not want main picks repeated inside parlays.
    let boardPicks = getCachedBoardPicks('north-american');
    if (boardPicks.length === 0) {
      try {
        await getOrComputeBoard('north-american');
        boardPicks = getCachedBoardPicks('north-american');
      } catch { /* non-fatal — exclusion just won't apply */ }
    }
    const excludedKeys = buildExclusionSet(boardPicks);

    const parlays = await buildSportParlays(excludedKeys);
    const data = { parlays, generatedAt: new Date().toISOString() };
    cache = { data, at: Date.now(), day: today };
    return NextResponse.json({ success: true, cached: false, ...data });
  } catch (err: any) {
    console.error('[sport-parlays] route error', err);
    return NextResponse.json({ success: false, error: err?.message || 'sport-parlay scan failed' }, { status: 500 });
  }
}
