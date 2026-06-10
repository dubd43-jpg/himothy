import { NextResponse } from 'next/server';
import { runSignalWatchCycle } from '@/services/signalWatchService';
import { isAdminRequest } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';

// Continuous line-movement watcher. Fires every 5 minutes during betting
// hours. Pulls every pre-game pick from the registry, compares the current
// consensus odds to entry, and flags any movement >=100¢ against us. Auto-
// caps confidence so the customer board shows the downgrade immediately.

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
    const result = await runSignalWatchCycle();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[line-watch cron] failed', err);
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
