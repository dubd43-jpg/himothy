import { NextResponse } from 'next/server';
import { reconcileTodayToFrozenSlate, reconcileDateToFrozenSlate } from '@/services/recordBoardService';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';

// ADMIN ONLY. Re-syncs today's permanent record to the frozen slate customers actually saw:
// wipes today's recorded picks and re-records the exact current frozen board, then grades.
// Use this when the record drifted from the displayed slate (e.g. the board was recomputed
// mid-day before the freeze locked). The frozen slate is immutable evidence of what we
// posted — this corrects the record to match it, never invents a result.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  return isAdminRequest(req);
}

async function handle(req: Request) {
  if (!authorized(req)) return adminUnauthorized();
  if (!hasDatabase()) {
    return NextResponse.json({ success: false, error: 'no database connected' }, { status: 400 });
  }
  try {
    // ?date=YYYY-MM-DD reconciles a PAST day from its frozen slate; omit for today.
    const date = new URL(req.url).searchParams.get('date');
    const result = date
      ? await reconcileDateToFrozenSlate(date)
      : await reconcileTodayToFrozenSlate();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('reconcile-board failed', error);
    return NextResponse.json({ success: false, error: String(error?.message || error) }, { status: 500 });
  }
}

// POST is the real trigger (it mutates). GET allowed too so it can be run from a browser
// with the admin secret header during a manual fix.
export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
