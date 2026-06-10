import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { freshenAllSlates } from '@/services/slateFreshenerService';

// Background worker: refresh odds + signals on every persisted slate without
// changing pick selections. Runs every 30 minutes during active hours so
// customers always see current Hard Rock prices instead of morning prices.

export const maxDuration = 120;
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
    const result = await freshenAllSlates();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[freshen-slate cron] failed', err);
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
