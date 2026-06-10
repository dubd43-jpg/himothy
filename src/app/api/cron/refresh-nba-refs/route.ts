import { NextResponse } from 'next/server';
import { refreshNbaRefTendencies } from '@/services/nbaRefStatsService';
import { isAdminRequest } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { logAction } from '@/services/actionLogService';

// Nightly cron — walks the last 7 days of completed NBA games and updates
// per-official tendency rows in `referee_tendencies`. extraSignalsService picks
// up the leaning automatically the next time a totals pick runs.
//
// Initial backfill: hit this endpoint with `?days=60` once to seed the table
// with two months of games, then the daily run keeps it current.

export const maxDuration = 300;   // 5 min — backfill scans many games
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  return isAdminRequest(req);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const daysBack = Math.min(180, Math.max(1, Number(searchParams.get('days') || 7)));

  try {
    const result = await refreshNbaRefTendencies(daysBack);
    await logAction({
      action: 'BACKFILL_TRIGGERED', actor: 'cron', subject: 'nba-refs-nightly',
      summary: `NBA refs refreshed: ${result.gamesScanned} games, ${result.officialsTouched} updates`,
      details: result,
    }).catch(() => null);
    return NextResponse.json({ success: true, daysBack, ...result });
  } catch (err: any) {
    console.error('[refresh-nba-refs] failed', err);
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
