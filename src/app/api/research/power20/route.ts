import { NextResponse } from 'next/server';
import { runPower20Research } from '@/services/deepResearchService';
import { getCachedBoardPicks, getOrComputeBoard } from '@/services/dailyBoardCache';
import { etDayKey } from '@/lib/datetime';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Keyed to the ET day so a warm instance never serves yesterday's parlays after the slate
// regenerates in the morning.
let cache: { data: any; generatedAt: number; day: string } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

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
    const forceRefresh = url.searchParams.get('refresh') === 'true';
    const today = etDayKey();

    if (!forceRefresh && cache && cache.day === today && Date.now() - cache.generatedAt < CACHE_TTL_MS) {
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
    cache = { data: result, generatedAt: Date.now(), day: today };

    return NextResponse.json({ success: true, cached: false, ...result });
  } catch (error) {
    console.error('Power 20 research failed', error);
    return NextResponse.json({ success: false, error: 'Power 20 scan failed.' }, { status: 500 });
  }
}
