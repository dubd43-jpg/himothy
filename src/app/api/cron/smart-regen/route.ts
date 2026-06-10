import { NextResponse } from 'next/server';
import { runDailyDeepResearch, type BoardType } from '@/services/deepResearchService';
import { getCachedBoard, getPersistedBoardForDate, adminOverwritePersistedSlate, invalidateBoardCache } from '@/services/dailyBoardCache';
import { isAdminRequest } from '@/lib/adminAuth';
import { getEtDateKey } from '@/lib/officialTracking';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// SMART REGEN — owner directive 2026-06-03: refresh picks BEFORE games start
// (12 PM ET for afternoon games, 6:30 PM ET for evening games) BUT NEVER
// touch picks on games that have already started. Live-game picks stay frozen
// to whatever was posted pre-game.
//
// Process:
//   1. Snapshot current cached slate (live + pre-game picks intact)
//   2. Generate a FRESH slate via runDailyDeepResearch (includes new supplements)
//   3. For each product bucket: keep live-game picks from snapshot, replace
//      pre-game picks with fresh engine output
//   4. Persist merged result

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  return isAdminRequest(req);
}

function isPregame(p: any): boolean {
  const ts = p?.startTime;
  if (!ts) return true; // no time = treat as pregame
  try {
    return new Date(ts).getTime() > Date.now();
  } catch { return true; }
}

function mergePreservingLive(previous: any, fresh: any): any {
  // For SINGLE-pick fields (grandSlam), keep the previous pick if its game is live.
  // For ARRAY fields, partition: live picks from previous + pregame picks from fresh.
  const out: any = { ...fresh };
  const SINGLE_FIELDS = ['grandSlam'];
  const ARRAY_FIELDS = ['pressurePack', 'vip4Pack', 'parlayPlan', 'marquee', 'asleepPicks', 'nrfi', 'valuePlays'];

  for (const f of SINGLE_FIELDS) {
    const prev = previous?.[f];
    if (prev && !isPregame(prev)) out[f] = prev;
  }
  for (const f of ARRAY_FIELDS) {
    const prevArr: any[] = Array.isArray(previous?.[f]) ? previous[f] : [];
    const freshArr: any[] = Array.isArray(fresh?.[f]) ? fresh[f] : [];
    // Keep live-game picks from previous
    const live = prevArr.filter((p) => !isPregame(p));
    const liveGameIds = new Set(live.map((p) => String(p.gameId)));
    // Pre-game slots come from fresh, EXCLUDING any game already locked-live above
    const pregame = freshArr.filter((p) => !liveGameIds.has(String(p.gameId)));
    out[f] = [...live, ...pregame];
  }
  return out;
}

async function handle(req: Request, board: BoardType = 'north-american') {
  if (!authorized(req)) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    // 1. Snapshot current state
    const previousCached = getCachedBoard(board)?.data
      || await getPersistedBoardForDate(getEtDateKey(), board);

    // 2. Fresh compute (engine includes new supplemental candidates + late-news)
    const fresh = await runDailyDeepResearch(board);

    // 3. Merge: live picks preserved, pregame picks updated
    const merged = previousCached ? mergePreservingLive(previousCached, fresh) : fresh;

    // 4. Persist + invalidate in-memory cache so next read serves merged
    await invalidateBoardCache(board);
    await adminOverwritePersistedSlate(getEtDateKey(), board, merged);

    return NextResponse.json({
      success: true,
      board,
      regeneratedAt: new Date().toISOString(),
      preservedLive: {
        grandSlam: !!(merged.grandSlam && !isPregame(merged.grandSlam)),
        pressurePack: (merged.pressurePack || []).filter((p: any) => !isPregame(p)).length,
        vip4Pack: (merged.vip4Pack || []).filter((p: any) => !isPregame(p)).length,
        parlayPlan: (merged.parlayPlan || []).filter((p: any) => !isPregame(p)).length,
      },
      refreshed: {
        pressurePack: (merged.pressurePack || []).filter((p: any) => isPregame(p)).length,
        vip4Pack: (merged.vip4Pack || []).filter((p: any) => isPregame(p)).length,
        parlayPlan: (merged.parlayPlan || []).filter((p: any) => isPregame(p)).length,
      },
    });
  } catch (error: any) {
    console.error('smart-regen failed', error);
    return NextResponse.json({ success: false, error: String(error?.message || error) }, { status: 500 });
  }
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
