import { NextResponse } from 'next/server';
import { refreshVsinSplits } from '@/services/vsinBettingService';
import { isAdminRequest } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { logAction } from '@/services/actionLogService';

// Pulls the latest VSiN betting splits (public bets % vs handle %) across all
// NA leagues. Replaces the dead Action Network sharp signal. Runs every 30 min
// while games are active so the engine sees fresh sharp-money reads.

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
    const result = await refreshVsinSplits();
    await logAction({
      action: 'DATA_SOURCE_ADDED', actor: 'cron', subject: 'vsin-splits',
      summary: `VSiN refresh: scanned ${result.scanned} games, persisted ${result.persisted}`,
      details: result,
    }).catch(() => null);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[refresh-vsin] failed', err);
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
