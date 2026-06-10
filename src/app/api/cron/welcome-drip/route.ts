import { NextResponse } from 'next/server';
import { runWelcomeDripCycle } from '@/services/welcomeEmailService';
import { isAdminRequest } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';

// Daily cron that walks all active trial users and sends the day-2/4/6
// welcome emails to anyone who's hit those thresholds since signup. Day 0
// fires inline at signup via the signup route, not here.

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
    const result = await runWelcomeDripCycle();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[welcome-drip cron] failed', err);
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
