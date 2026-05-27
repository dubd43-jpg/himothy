import { NextResponse } from 'next/server';
import { recordTodaysBoard } from '@/services/recordBoardService';
import { gradeRegistryBoard } from '@/services/pickRegistryService';
import { isAdminRequest } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';

// Records today's pregame picks into the permanent registry and grades any that have
// finished. Triggered by Vercel Cron (Authorization: Bearer <CRON_SECRET>) or manually
// with the admin secret header for verification.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  return isAdminRequest(req);
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ success: false, error: 'no database connected' }, { status: 400 });
  }
  try {
    const recorded = await recordTodaysBoard();
    const graded = await gradeRegistryBoard();
    return NextResponse.json({ success: true, recorded, graded });
  } catch (error: any) {
    console.error('record-board failed', error);
    return NextResponse.json({ success: false, error: String(error?.message || error) }, { status: 500 });
  }
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
