import { NextResponse } from 'next/server';
import { getOrComputeBoard } from '@/services/dailyBoardCache';
import { isAdminRequest } from '@/lib/adminAuth';

// Pre-warms the daily-picks board cache and the closing-line cache for every league on
// the active boards. Runs early (8am ET) so the first real user request is already warm.
// First scan of the day fetches summary endpoints (1 per game) for ATS/O/U history — this
// cron eats that latency so the live page stays snappy.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  return isAdminRequest(req);
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Only warm the heavy board (north-american). Tennis takes ~15s on its own (298 events
  // to flatten), combat is already fast (<1s), soccer is light. Bundling them all in one
  // parallel Promise.all consistently hit the 60s ceiling; warming just NA keeps the cron
  // safely under budget and is what 90% of traffic loads.
  const boardsToWarm = ['north-american'] as const;

  const results: Record<string, { ok: boolean; tookMs: number; error?: string }> = {};
  const t0 = Date.now();

  // Closing-line cache should already be warm from /api/cron/prewarm-lines which runs
  // 30 min ahead. Running the 4 board computes in parallel so the total stays within the
  // 60s cron budget (the sequential version was 120s+ even with a warm line cache).
  await Promise.all(boardsToWarm.map(async (board) => {
    const bt0 = Date.now();
    try {
      await getOrComputeBoard(board);
      results[board] = { ok: true, tookMs: Date.now() - bt0 };
    } catch (err) {
      results[board] = { ok: false, tookMs: Date.now() - bt0, error: String(err) };
    }
  }));

  return NextResponse.json({
    success: true,
    totalMs: Date.now() - t0,
    results,
  });
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
