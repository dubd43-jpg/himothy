import { NextResponse } from 'next/server';
import { buildSportParlays } from '@/services/deepResearchService';
import { getCachedBoardPicks, getOrComputeBoard, getFrozenDaily } from '@/services/dailyBoardCache';
import { isAdminRequest } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// One 4-leg parlay per major NA sport, single-sport each. FROZEN once per ET-day (persisted
// to Postgres) so the posted parlays don't shift mid-day across Vercel instances.

function buildExclusionSet(boardPicks: any[]): Set<string> {
  // Owner directive 2026-06-01: Sport Parlays cannot include ANY leg on a game the
  // main board already picked. Was previously exact (gameId|selection) which let
  // Sport Parlays pick the OPPOSITE SIDE on a shared game — the engine flipped
  // Detroit ML via tendency, Sport Parlays kept Tampa ML via raw win-prob — and
  // the site appeared to contradict itself. Now: game-level dedup. Sport Parlays
  // plays only on games the main board left alone.
  const out = new Set<string>();
  for (const p of boardPicks) {
    if (!p?.gameId) continue;
    out.add(`game:${p.gameId}`);
    // Keep the legacy pick-level key too in case any downstream code still reads it.
    if (p.selection) {
      const norm = String(p.selection).toLowerCase().replace(/\s+/g, ' ').trim();
      out.add(`${p.gameId}|${norm}`);
    }
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('refresh') === 'true' && isAdminRequest(req);

    const data = await getFrozenDaily('sport-parlays', async () => {
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
      return { parlays, generatedAt: new Date().toISOString() };
    }, force);

    return NextResponse.json({ success: true, ...data });
  } catch (err: any) {
    console.error('[sport-parlays] route error', err);
    return NextResponse.json({ success: false, error: err?.message || 'sport-parlay scan failed' }, { status: 500 });
  }
}
