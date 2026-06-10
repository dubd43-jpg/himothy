import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { runDailyDeepResearch } from '@/services/deepResearchService';
import { prisma } from '@/lib/prisma';
import { getEtDateKey } from '@/lib/officialTracking';

// EMERGENCY FORCE REGEN — bypasses all frozen-slate logic and directly calls the engine.
// For use when the daily board is blank and normal regen paths are failing.
// Requires ADMIN_SECRET header.

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const log: string[] = [];
  const t0 = Date.now();

  try {
    log.push('step1: starting runDailyDeepResearch...');
    const result = await runDailyDeepResearch('north-american');
    const ms1 = Date.now() - t0;
    log.push(`step1 done in ${ms1}ms — GS=${!!result.grandSlam} PP=${result.pressurePack?.length??0} VIP=${result.vip4Pack?.length??0}`);

    // Wipe today's frozen slate so the next read gets fresh data.
    if (hasDatabase()) {
      const etDate = getEtDateKey();
      try {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "DailySlateCache" WHERE "etDate" = $1 AND "board" = $2`,
          etDate, 'north-american',
        );
        log.push('step2: wiped stale DailySlateCache row');
      } catch (e) { log.push(`step2 wipe error: ${e}`); }

      // Persist the fresh slate.
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "DailySlateCache" ("version","etDate","board","data","generatedAt")
           VALUES ('force-regen',$1,$2,$3::jsonb,NOW())
           ON CONFLICT ("version","etDate","board") DO UPDATE SET "data"=EXCLUDED."data","generatedAt"=NOW()`,
          etDate, 'north-american', JSON.stringify(result),
        );
        log.push('step3: persisted fresh slate');
      } catch (e) { log.push(`step3 persist error: ${e}`); }

      // Record picks to registry.
      try {
        const { recordTodaysBoard } = await import('@/services/recordBoardService');
        const recorded = await recordTodaysBoard();
        log.push(`step4: recorded ${JSON.stringify(recorded)}`);
      } catch (e) { log.push(`step4 record error: ${e}`); }
    } else {
      log.push('no database — skipping persist + record');
    }

    return NextResponse.json({
      success: true,
      totalMs: Date.now() - t0,
      grandSlam: result.grandSlam?.selection ?? null,
      pressurePack: result.pressurePack?.length ?? 0,
      vip4Pack: result.vip4Pack?.length ?? 0,
      parlayPlan: result.parlayPlan?.length ?? 0,
      marquee: result.marquee?.length ?? 0,
      asleepPicks: result.asleepPicks?.length ?? 0,
      log,
    });
  } catch (err: any) {
    log.push(`FAILED: ${err?.message || String(err)}`);
    return NextResponse.json({ success: false, error: String(err?.message || err), log }, { status: 500 });
  }
}
