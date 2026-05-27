import { NextResponse } from 'next/server';
import { runPower20Research } from '@/services/deepResearchService';
import { getCachedBoardPicks, getOrComputeBoard } from '@/services/dailyBoardCache';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

let cache: { data: any; generatedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function buildExclusionSet(boardPicks: any[]): Set<string> {
  // Per user: the two parlays must NEVER share a game with any of our exclusive picks
  // (Grand Slam, Pressure Pack, VIP 4-Pack, Parlay Plan). Parlays are built from
  // separate games entirely — heavy-favorite MLs, props, run lines from a different
  // pool. So we exclude by gameId, not by gameId|selection. This is stricter than the
  // old "same game, different angle is fine" rule and matches the new product intent.
  const out = new Set<string>();
  for (const p of boardPicks) {
    if (!p?.gameId) continue;
    out.add(`game:${p.gameId}`);
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    if (!forceRefresh && cache && Date.now() - cache.generatedAt < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, cached: true, ...cache.data });
    }

    // Pull the regular-card picks first so the Power 20 parlay can dedupe against them.
    // The board cache is warm if /api/research/daily-picks has been hit recently; if not,
    // run the research now (cold path).
    let boardPicks = getCachedBoardPicks('north-american');
    if (boardPicks.length === 0) {
      try {
        await getOrComputeBoard('north-american');
        boardPicks = getCachedBoardPicks('north-american');
      } catch { /* non-fatal — exclusion just won't apply */ }
    }
    const excludedKeys = buildExclusionSet(boardPicks);

    const result = await runPower20Research(excludedKeys);
    cache = { data: result, generatedAt: Date.now() };

    return NextResponse.json({ success: true, cached: false, ...result });
  } catch (error) {
    console.error('Power 20 research failed', error);
    return NextResponse.json({ success: false, error: 'Power 20 scan failed.' }, { status: 500 });
  }
}
