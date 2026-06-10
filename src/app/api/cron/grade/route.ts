// Grading cron — fires every 30 min during evening + late-night hours so finals get
// graded the same night they complete (not waiting until tomorrow morning's record-
// board run). Added 2026-06-03 per cron audit P2 #9.

import { NextResponse } from 'next/server';
import { gradeRegistryBoard } from '@/services/pickRegistryService';
import { isAdminRequest } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { logAction } from '@/services/actionLogService';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  return isAdminRequest(req);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  try {
    const result = await gradeRegistryBoard();
    await logAction({
      action: 'GRADING_RUN', actor: 'cron', subject: 'evening-grade',
      summary: `Graded ${result.gradedCount} picks`,
      details: result,
    }).catch(() => null);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[grade cron] failed', err);
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
