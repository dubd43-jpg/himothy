import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { sendNightlyDigest } from '@/services/settlementDigestService';

// One email per night with the day's W/L/Push summary. Replaces per-pick
// settlement emails. Cron fires at 5:00 AM UTC = 1:00 AM ET so late West-Coast
// games are fully graded by the time it sends.

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
    const r = await sendNightlyDigest();
    return NextResponse.json({ success: true, ...r });
  } catch (err: any) {
    console.error('[settlement-digest cron] failed', err);
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
