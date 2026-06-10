import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// PUBLIC track-record API. No auth — this is the conversion proof every
// visitor wants to see before subscribing. Returns lifetime + last-30 + last-7
// performance, broken out by product and league.

interface Row {
  category: string;
  league: string;
  result: string;
  odds: string | null;
  board_date: Date;
}

function americanToUnits(odds: string | null, result: string): number {
  if (!odds || (result !== 'win' && result !== 'loss' && result !== 'push')) return 0;
  if (result === 'push') return 0;
  const m = String(odds).match(/[+-]?\d{2,4}/);
  if (!m) return result === 'win' ? 1 : -1;
  const n = Number(m[0]);
  if (!isFinite(n) || n === 0) return result === 'win' ? 1 : -1;
  if (result === 'loss') return -1;
  // Win: payout in units (-110 → +0.91, +120 → +1.20)
  return n > 0 ? n / 100 : 100 / Math.abs(n);
}

interface Bucket {
  picks: number; wins: number; losses: number; pushes: number;
  units: number; winRate: number | null; roi: number | null;
}
function emptyBucket(): Bucket { return { picks: 0, wins: 0, losses: 0, pushes: 0, units: 0, winRate: null, roi: null }; }
function tally(b: Bucket, r: Row) {
  if (r.result !== 'win' && r.result !== 'loss' && r.result !== 'push') return;
  b.picks++;
  if (r.result === 'win') b.wins++;
  else if (r.result === 'loss') b.losses++;
  else b.pushes++;
  b.units += americanToUnits(r.odds, r.result);
}
function finalize(b: Bucket) {
  const decided = b.wins + b.losses;
  b.winRate = decided === 0 ? null : Number(((b.wins / decided) * 100).toFixed(1));
  // ROI = units / risk. Assuming each pick risks 1u, total risked = picks * 1.
  b.roi = b.picks === 0 ? null : Number(((b.units / b.picks) * 100).toFixed(1));
  b.units = Number(b.units.toFixed(2));
}

function computeStreak(decidedRows: Row[]): { type: 'win' | 'loss' | 'push' | null; length: number } {
  if (decidedRows.length === 0) return { type: null, length: 0 };
  // decidedRows assumed sorted DESC by date
  const head = decidedRows[0].result as 'win' | 'loss' | 'push';
  if (!['win', 'loss', 'push'].includes(head)) return { type: null, length: 0 };
  let n = 0;
  for (const r of decidedRows) {
    if (r.result === head) n++;
    else break;
  }
  return { type: head, length: n };
}

export async function GET() {
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  try {
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT category, league, result, odds, board_date
         FROM himothy_pick_registry
        WHERE status IN ('published','locked','graded','archived','settled')
          AND result IN ('win','loss','push')
        ORDER BY board_date DESC`
    );

    const now = Date.now();
    const day30 = now - 30 * 24 * 60 * 60 * 1000;
    const day7 = now - 7 * 24 * 60 * 60 * 1000;
    const rows30 = rows.filter((r) => new Date(r.board_date).getTime() >= day30);
    const rows7 = rows.filter((r) => new Date(r.board_date).getTime() >= day7);

    const lifetime = emptyBucket();
    const last30 = emptyBucket();
    const last7 = emptyBucket();
    for (const r of rows) tally(lifetime, r);
    for (const r of rows30) tally(last30, r);
    for (const r of rows7) tally(last7, r);
    finalize(lifetime); finalize(last30); finalize(last7);

    const byProduct: Record<string, Bucket> = {};
    const byLeague: Record<string, Bucket> = {};
    for (const r of rows) {
      const cat = r.category || 'OTHER';
      const lg = r.league || 'OTHER';
      if (!byProduct[cat]) byProduct[cat] = emptyBucket();
      if (!byLeague[lg]) byLeague[lg] = emptyBucket();
      tally(byProduct[cat], r);
      tally(byLeague[lg], r);
    }
    for (const k of Object.keys(byProduct)) finalize(byProduct[k]);
    for (const k of Object.keys(byLeague)) finalize(byLeague[k]);

    const streak = computeStreak(rows);
    const recentDecided = rows.filter((r) => r.result === 'win' || r.result === 'loss').slice(0, 20);

    return NextResponse.json({
      success: true,
      asOf: new Date().toISOString(),
      lifetime,
      last30,
      last7,
      streak,
      byProduct,
      byLeague,
      recentForm: recentDecided.map((r) => ({
        date: new Date(r.board_date).toISOString().slice(0, 10),
        category: r.category,
        league: r.league,
        result: r.result,
        odds: r.odds,
      })),
    });
  } catch (err: any) {
    console.error('[track-record] failed', err);
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}
