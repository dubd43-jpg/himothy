// Admin: odds bucket performance report.
// Shows how every price band (e.g. +105 vs -135) has performed over the last 60 days
// and since tracking started — so we know exactly which price ranges are +EV and which
// are bleeding.
//
// GET /api/admin/odds-bucket-report?days=60

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';
import { oddsBucket } from '@/lib/oddsBucket';

function impliedBreakEven(odds: number): number {
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100) * 100;
  return 100 / (odds + 100) * 100;
}

// Estimate ROI per $100 risked for a bucket's W/L record
function roi(wins: number, losses: number, avgOdds: number): number {
  if (wins + losses === 0) return 0;
  const payout = avgOdds > 0 ? avgOdds : 100 / Math.abs(avgOdds) * 100;
  const profit = wins * (avgOdds > 0 ? avgOdds : 100 * (100 / Math.abs(avgOdds))) - losses * 100;
  return Math.round((profit / ((wins + losses) * 100)) * 1000) / 10;
}

// Canonical bucket sort order (worst chalk → best dog)
const BUCKET_ORDER = [
  'Heavy fav (-200+)',
  'Solid fav (-150 to -199)',
  'Moderate fav (-130 to -149)',
  'Slight fav (-110 to -129)',
  'Pickem (-110 to +109)',
  'Slight dog (+110 to +129)',
  'Moderate dog (+130 to +149)',
  'Big dog (+150+)',
];

// Midpoint odds for each bucket — used for break-even calc and ROI estimate
const BUCKET_MIDPOINT: Record<string, number> = {
  'Heavy fav (-200+)': -225,
  'Solid fav (-150 to -199)': -170,
  'Moderate fav (-130 to -149)': -138,
  'Slight fav (-110 to -129)': -118,
  'Pickem (-110 to +109)': -105,
  'Slight dog (+110 to +129)': 118,
  'Moderate dog (+130 to +149)': 138,
  'Big dog (+150+)': 165,
};

function isParlayLine(pl: string): boolean {
  return ['parlay_plan', 'sport_parlays', 'big_games', 'sleeper_picks', 'power_20', 'power_10'].includes(pl);
}

export async function GET(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ error: 'no db' }, { status: 503 });

  const days = Math.max(7, Math.min(365, Number(req.nextUrl.searchParams.get('days') || 60)));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  try {
    // Query all settled singles in the window
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT odds, result, product_line, board_date
       FROM himothy_pick_registry
       WHERE board_date >= $1::date
         AND result IN ('win', 'loss', 'push')
       ORDER BY board_date ASC`,
      cutoffStr,
    );

    // Also pull all-time for comparison
    const allRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT odds, result, product_line
       FROM himothy_pick_registry
       WHERE result IN ('win', 'loss', 'push')`,
    );

    function buildStats(data: any[]) {
      const buckets: Record<string, {
        wins: number; losses: number; pushes: number;
        oddsSum: number; oddsCount: number;
        byDate: Record<string, { wins: number; losses: number }>;
      }> = {};

      for (const r of data) {
        const pl = String(r.product_line || '');
        if (isParlayLine(pl)) continue; // straights only
        const odds = Number(r.odds);
        const b = oddsBucket(odds);
        if (!b) continue;
        buckets[b] = buckets[b] || { wins: 0, losses: 0, pushes: 0, oddsSum: 0, oddsCount: 0, byDate: {} };
        if (r.result === 'win') buckets[b].wins++;
        else if (r.result === 'loss') buckets[b].losses++;
        else buckets[b].pushes++;
        buckets[b].oddsSum += odds;
        buckets[b].oddsCount++;
        if (r.board_date) {
          const d = String(r.board_date).slice(0, 10);
          buckets[b].byDate[d] = buckets[b].byDate[d] || { wins: 0, losses: 0 };
          if (r.result === 'win') buckets[b].byDate[d].wins++;
          else if (r.result === 'loss') buckets[b].byDate[d].losses++;
        }
      }

      return BUCKET_ORDER
        .filter((b) => buckets[b])
        .map((b) => {
          const bk = buckets[b];
          const total = bk.wins + bk.losses;
          const midOdds = BUCKET_MIDPOINT[b] ?? -110;
          const avgOdds = bk.oddsCount > 0 ? Math.round(bk.oddsSum / bk.oddsCount) : midOdds;
          const winRate = total > 0 ? Math.round((bk.wins / total) * 100) : 0;
          const breakEven = Math.round(impliedBreakEven(avgOdds) * 10) / 10;
          const edge = Math.round((winRate - breakEven) * 10) / 10;
          const estimatedRoi = roi(bk.wins, bk.losses, avgOdds);
          const trend = Object.entries(bk.byDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-14)
            .map(([date, d]) => ({ date, wins: d.wins, losses: d.losses }));

          return {
            bucket: b,
            wins: bk.wins,
            losses: bk.losses,
            pushes: bk.pushes,
            total,
            winRate: `${winRate}%`,
            breakEven: `${breakEven}%`,
            edge: `${edge > 0 ? '+' : ''}${edge}%`,
            edgeNum: edge,
            avgOdds,
            estimatedRoi: `${estimatedRoi > 0 ? '+' : ''}${estimatedRoi}%`,
            roiNum: estimatedRoi,
            recentTrend: trend,
            // Summary label
            status: edge >= 5 ? '🔥 Strong' : edge >= 1 ? '✅ Positive' : edge >= -3 ? '⚠️ Neutral' : '❌ Bleeding',
          };
        });
    }

    const windowStats = buildStats(rows);
    const allTimeStats = buildStats(allRows);

    // Find best and worst performing buckets
    const sorted = [...windowStats].sort((a, b) => b.edgeNum - a.edgeNum);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    // Total singles performance
    const totalW = windowStats.reduce((s, b) => s + b.wins, 0);
    const totalL = windowStats.reduce((s, b) => s + b.losses, 0);
    const totalBets = totalW + totalL;
    const overallWinRate = totalBets > 0 ? Math.round((totalW / totalBets) * 100) : 0;

    return NextResponse.json({
      window: `Last ${days} days`,
      cutoff: cutoffStr,
      summary: {
        totalStraightBets: totalBets,
        wins: totalW,
        losses: totalL,
        winRate: `${overallWinRate}%`,
        bestBucket: best ? { bucket: best.bucket, edge: best.edge, record: `${best.wins}-${best.losses}` } : null,
        worstBucket: worst ? { bucket: worst.bucket, edge: worst.edge, record: `${worst.wins}-${worst.losses}` } : null,
      },
      buckets: windowStats,
      allTimeBuckets: allTimeStats,
      insight: windowStats
        .filter((b) => b.total >= 5)
        .map((b) => {
          if (b.edgeNum >= 8) return `${b.bucket}: ${b.wins}-${b.losses} — hitting ${b.winRate} vs ${b.breakEven} break-even. This price band is PRINTING. Prioritize.`;
          if (b.edgeNum >= 3) return `${b.bucket}: ${b.wins}-${b.losses} — ${b.winRate} win rate, ${b.edge} above break-even. Solid.`;
          if (b.edgeNum <= -8) return `${b.bucket}: ${b.wins}-${b.losses} — only ${b.winRate} vs ${b.breakEven} needed. BLEEDING. Avoid this range until it corrects.`;
          if (b.edgeNum <= -3) return `${b.bucket}: ${b.wins}-${b.losses} — ${b.edge} below break-even. Underperforming, tread carefully.`;
          return `${b.bucket}: ${b.wins}-${b.losses} — ${b.winRate} (neutral, near break-even at ${b.breakEven}).`;
        }),
    });
  } catch (err) {
    console.error('[odds-bucket-report]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
