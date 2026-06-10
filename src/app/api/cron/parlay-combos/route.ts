import { NextResponse } from 'next/server';
import { sendOwnerParlayCombos } from '@/services/parlayCombinationsService';
import { isAdminRequest } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';

// Owner-only "every possible parlay" digest. Runs:
//  - Daily at 12:30 UTC (8:30 AM ET) after the daily-email cron
//  - Daily at 22:00 UTC (6:00 PM ET) to catch late-available afternoon/evening picks
// Manual override via ?maxLegs=N&maxPicks=N.

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
    return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  }
  const { searchParams } = new URL(req.url);
  const maxLegs = Number(searchParams.get('maxLegs') || 6);
  const maxPicks = Number(searchParams.get('maxPicks') || 12);
  try {
    const result = await sendOwnerParlayCombos({ maxLegs, maxPicks });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[parlay-combos cron] failed', err);
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
