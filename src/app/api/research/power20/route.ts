import { NextResponse } from 'next/server';
import { runPower20Research } from '@/services/deepResearchService';
import { getCachedBoardPicks, getOrComputeBoard, getFrozenDaily } from '@/services/dailyBoardCache';
import { isAdminRequest } from '@/lib/adminAuth';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// FROZEN once per ET-day (persisted to Postgres) so the posted Power parlays don't shift
// mid-day across Vercel instances.

function buildExclusionSet(boardPicks: any[]): Set<string> {
  // Exclude exact pick selections (gameId|selection) so the parlay can't reuse the same
  // pick that's on Pressure Pack / VIP / Parlay Plan. Same game, different angle is OK
  // (Yankees -1.5 on the regular card; Yankees ML in the parlay is allowed). Reverted
  // from gameId-level exclusion (2026-05-27) — that was too strict and wiped 18+ games
  // from the parlay pool on normal slates, leaving Power of Parlays / Power 10 empty.
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
    const forceRefresh = url.searchParams.get('refresh') === 'true' && isAdminRequest(req);

    const result = await getFrozenDaily('power20', async () => {
      // Pull the regular-card picks first so the Power 20 parlay can dedupe against them.
      let boardPicks = getCachedBoardPicks('north-american');
      if (boardPicks.length === 0) {
        try {
          await getOrComputeBoard('north-american');
          boardPicks = getCachedBoardPicks('north-american');
        } catch { /* non-fatal — exclusion just won't apply */ }
      }
      const excludedKeys = buildExclusionSet(boardPicks);
      return await runPower20Research(excludedKeys);
    }, forceRefresh);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Power 20 research failed', error);
    return NextResponse.json({ success: false, error: 'Power 20 scan failed.' }, { status: 500 });
  }
}
