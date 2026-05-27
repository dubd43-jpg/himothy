import { NextResponse } from 'next/server';
import { prewarmClosingLines } from '@/services/deepResearchService';
import { isAdminRequest } from '@/lib/adminAuth';

// Fills closingLineCache for every team in tonight's major-league slate with the last 20
// games each. Runs FIRST in the daily warmup chain (7:30am ET) so that `warm-cache`
// (8:00am ET) finds a warm cache and can compute every board's L20 ATS data inside its
// own 60s budget.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  return isAdminRequest(req);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const leagues = ['MLB', 'NBA', 'WNBA', 'NHL', 'NFL', 'College Football', 'NCAA Basketball', 'NCAA Baseball'];
  const t0 = Date.now();
  try {
    const stats = await prewarmClosingLines(leagues, 20);
    return NextResponse.json({ success: true, ...stats, totalMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err), tookMs: Date.now() - t0 }, { status: 500 });
  }
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
