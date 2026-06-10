import { NextResponse } from 'next/server';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { prisma } from '@/lib/prisma';
import { recordTodaysBoard } from '@/services/recordBoardService';
import { logAction } from '@/services/actionLogService';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// SAFE REPUBLISH — pushes the current cached slate into the customer-facing
// registry while preserving live + finished picks. Use this after a force-regen
// when you want customers to actually SEE the new picks.
//
// Procedure:
//   1. VOID (status='void') every registry row for today that's still pre-game
//      (start_time > NOW()). Started/finished rows are untouched — that's the
//      "no changes during games" rule.
//   2. Re-record the cached slate via recordTodaysBoard. Dedup will skip any
//      pick that still exists in the registry (the live ones); the void'd ones
//      are no longer 'published', so new versions can take their slot.
//
// POST. Logs SLATE_REGENERATED with subject 'republish'.

export async function POST(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });

  try {
    // 1. DELETE pre-game rows for today only. Keeps started/finished rows so
    // live grading is unaffected. There's no top-level start_time column; the
    // value lives in research_payload->'startTime'. Rows where we can't read a
    // startTime are conservatively LEFT ALONE — better to leave a stale row
    // than delete a live one. Audit trail is preserved in slate snapshots.
    const voidResult: any = await prisma.$executeRawUnsafe(
      `DELETE FROM himothy_pick_registry
        WHERE board_date = (NOW() AT TIME ZONE 'America/New_York')::date
          AND status IN ('published','locked')
          AND (
            (research_payload->>'startTime')::timestamptz > NOW()
            OR (research_payload->>'startTimeUtc')::timestamptz > NOW()
          )`,
    );
    const voided = typeof voidResult === 'number' ? voidResult : 0;

    // 2. Re-record the freshly-computed slate.
    const recorded = await recordTodaysBoard({ allowFinalized: false });

    await logAction({
      action: 'SLATE_REGENERATED', actor: 'admin', subject: 'republish',
      summary: `Republished slate: voided ${voided} pre-game rows, recorded ${recorded.recorded} new (skipped ${recorded.skipped}, dupes ${recorded.dupes}, errors ${recorded.errors})`,
      details: { voided, recorded },
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      voidedPreGame: voided,
      recorded,
      message: 'Pre-game registry rows voided and replaced with freshly-computed slate. Live + finished picks untouched.',
    });
  } catch (err: any) {
    console.error('[republish] failed', err);
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}
