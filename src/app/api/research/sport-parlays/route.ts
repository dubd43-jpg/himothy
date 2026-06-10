import { NextResponse } from 'next/server';
import { buildSportParlays } from '@/services/deepResearchService';
import { getCachedBoardPicks, getOrComputeBoard, getFrozenDaily } from '@/services/dailyBoardCache';
import { isAdminRequest } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// One 4-leg parlay per major NA sport, single-sport each. FROZEN once per ET-day (persisted
// to Postgres) so the posted parlays don't shift mid-day across Vercel instances.

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
