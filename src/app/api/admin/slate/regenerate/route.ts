import { NextResponse } from 'next/server';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { invalidateBoardCache, getOrComputeBoard } from '@/services/dailyBoardCache';
import { logAction } from '@/services/actionLogService';
import { captureSnapshot } from '@/services/slateSnapshotService';

// ADMIN ONLY. Hard-reset today's slate for a board and recompute it fresh under
// whatever the engine's CURRENT logic is. BLOCKED by default once today's registry
// has rows — that was the 2026-06-01 lesson (mid-day regen broke the registry/board
// sync). Pass { force: true } to deliberately override for a genuine emergency
// (postponed game, etc.) — this is logged.
//
// POST body: { board: 'north-american'|'soccer'|'global'|..., force?: boolean }
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'bad json' }, { status: 400 }); }
  const board = body?.board || 'north-american';
  const force = body?.force === true;

  // FROZEN-SLATE GUARD — 2026-06-04 incident: a mid-day regen swapped a winning
  // Liberty -9.5 pick to a losing Tempo +8.5 pick on a game that hadn't started
  // yet but the regen also touched live games. Now the endpoint refuses to run
  // when ANY game on today's NA slate has already started, unless force=true.
  // smart-regen cron is the safe replacement and only updates pre-game picks.
  if (!force) {
    try {
      const { getCachedBoard } = await import('@/services/dailyBoardCache');
      const cached = getCachedBoard(board)?.data;
      if (cached) {
        const allPicks: any[] = [
          cached.grandSlam,
          ...(cached.pressurePack || []),
          ...(cached.vip4Pack || []),
          ...(cached.parlayPlan || []),
          ...(cached.marquee || []),
        ].filter(Boolean);
        const now = Date.now();
        const liveStarted = allPicks.find((p) => {
          if (!p?.startTime) return false;
          try { return new Date(p.startTime).getTime() <= now; } catch { return false; }
        });
        if (liveStarted) {
          return NextResponse.json({
            success: false, locked: true,
            error: `Regen blocked: at least one game on today's slate has already started (${liveStarted.eventName}). Use /api/cron/smart-regen for pre-game-only refresh, or pass {force:true} to override (logged).`,
          }, { status: 423 });
        }
      }
    } catch { /* if cache check fails, allow the regen */ }
  }

  try {
    await invalidateBoardCache(board, { force });
    const fresh = await getOrComputeBoard(board);
    const counts = {
      grandSlam: fresh?.grandSlam ? 1 : 0,
      pressurePack: (fresh?.pressurePack || []).length,
      vip4Pack: (fresh?.vip4Pack || []).length,
      parlayPlan: (fresh?.parlayPlan || []).length,
      marquee: (fresh?.marquee || []).length,
      asleepPicks: (fresh?.asleepPicks || []).length,
    };
    await logAction({
      action: 'SLATE_REGENERATED', actor: 'admin', subject: board,
      summary: `Slate regenerated${force ? ' (FORCE override)' : ''}: GS=${counts.grandSlam} PP=${counts.pressurePack} VIP=${counts.vip4Pack} PP10=${counts.parlayPlan} MAR=${counts.marquee} ASLP=${counts.asleepPicks}`,
      details: { counts, force },
    });
    // Tag the snapshot with the right trigger so we can tell apart "8am cron" vs
    // "manual mid-day regen" vs "force override" when looking at history later.
    await captureSnapshot(fresh, board, force ? 'manual-regen-force' : 'manual-regen').catch(() => null);
    return NextResponse.json({ success: true, board, counts, force, regeneratedAt: new Date().toISOString() });
  } catch (e: any) {
    const msg = String(e?.message || e);
    const status = msg.startsWith('SLATE_LOCKED') ? 423 : 500;
    if (status === 423) {
      await logAction({
        action: 'SLATE_LOCK_REJECTED', actor: 'admin', subject: board,
        summary: `Regen blocked by hard-lock: ${msg}`,
        details: { force },
      });
    }
    return NextResponse.json({ success: false, error: msg, locked: status === 423 }, { status });
  }
}
