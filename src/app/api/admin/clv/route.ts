import { NextResponse } from 'next/server';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// CLOSING LINE VALUE (CLV) DASHBOARD
//
// For each graded pick we have three odds:
//   - market_open_odds: the line when the market opened
//   - odds: the line we published at (our entry)
//   - closing_odds: the line right before tipoff (captured by snapshot-closing cron)
//
// CLV = closing implied probability - entry implied probability. Positive CLV
// means we beat the close (got a better number than the market settled on); over
// many bets, +CLV is the truth of whether your process is sharp, independent of
// short-term win/loss variance.
//
// Returns per-pick rows + aggregates by category + a 7d / 30d roll-up.

function americanToImplied(odds: string | null): number | null {
  if (!odds) return null;
  const m = String(odds).match(/[+-]?\d{2,4}/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!isFinite(n) || n === 0) return null;
  if (n > 0) return 100 / (n + 100);
  return Math.abs(n) / (Math.abs(n) + 100);
}

// Devig: a sportsbook's two-sided market sums to >100% (the overround).
// Without the other side's odds we can't perfectly devig per pick, but we
// approximate using the slate-wide overround of ~4.8% baked into most US
// books. This isn't a substitute for proper devigging but keeps numbers honest.
function devig(p: number | null): number | null {
  if (p == null) return null;
  return p / 1.048;
}

function clvPctFromOdds(entry: string | null, close: string | null): number | null {
  const e = devig(americanToImplied(entry));
  const c = devig(americanToImplied(close));
  if (e == null || c == null) return null;
  return (c - e) * 100;   // positive = entry was better than close
}

export async function GET(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const sinceDays = Math.max(1, Math.min(180, Number(searchParams.get('days') || 30)));

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string; board_date: Date; category: string; league: string;
      selection: string; result: string; market_open_odds: string | null;
      odds: string | null; closing_odds: string | null;
    }>>(
      `SELECT id, board_date, category, league, selection, result,
              market_open_odds, odds, closing_odds
         FROM himothy_pick_registry
        WHERE board_date >= NOW() - INTERVAL '${sinceDays} days'
          AND status IN ('published','locked','graded','settled')
          AND result IN ('win','loss','push')
        ORDER BY board_date DESC, category`
    );

    const picks = rows.map((r) => {
      const clv = clvPctFromOdds(r.odds, r.closing_odds);
      const lineMoveAmerican = (() => {
        if (!r.odds || !r.closing_odds) return null;
        const a = Number(String(r.odds).replace(/[^\-+\d]/g, ''));
        const b = Number(String(r.closing_odds).replace(/[^\-+\d]/g, ''));
        if (!isFinite(a) || !isFinite(b)) return null;
        return b - a;
      })();
      return {
        id: r.id,
        date: new Date(r.board_date).toISOString().slice(0, 10),
        category: r.category,
        league: r.league,
        selection: r.selection,
        result: r.result,
        openOdds: r.market_open_odds,
        entryOdds: r.odds,
        closingOdds: r.closing_odds,
        clvPct: clv == null ? null : Number(clv.toFixed(2)),
        lineMoveAmerican,
      };
    });

    // Roll-ups: overall + by category + by league.
    const withClv = picks.filter((p) => p.clvPct != null);
    const avg = (arr: number[]) => arr.length === 0 ? null : Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2));
    const overallAvg = avg(withClv.map((p) => p.clvPct as number));
    const byCategory: Record<string, { count: number; avgClv: number | null; winRate: number | null }> = {};
    const byLeague: Record<string, { count: number; avgClv: number | null; winRate: number | null }> = {};

    for (const p of picks) {
      const cBucket = (byCategory[p.category] ||= { count: 0, avgClv: null, winRate: null });
      cBucket.count++;
      const lBucket = (byLeague[p.league] ||= { count: 0, avgClv: null, winRate: null });
      lBucket.count++;
    }
    for (const cat of Object.keys(byCategory)) {
      const sub = picks.filter((p) => p.category === cat);
      byCategory[cat].avgClv = avg(sub.filter((p) => p.clvPct != null).map((p) => p.clvPct as number));
      const decided = sub.filter((p) => p.result === 'win' || p.result === 'loss');
      byCategory[cat].winRate = decided.length === 0 ? null
        : Number((decided.filter((p) => p.result === 'win').length / decided.length * 100).toFixed(1));
    }
    for (const lg of Object.keys(byLeague)) {
      const sub = picks.filter((p) => p.league === lg);
      byLeague[lg].avgClv = avg(sub.filter((p) => p.clvPct != null).map((p) => p.clvPct as number));
      const decided = sub.filter((p) => p.result === 'win' || p.result === 'loss');
      byLeague[lg].winRate = decided.length === 0 ? null
        : Number((decided.filter((p) => p.result === 'win').length / decided.length * 100).toFixed(1));
    }

    const totalDecided = picks.filter((p) => p.result === 'win' || p.result === 'loss').length;
    const totalWins = picks.filter((p) => p.result === 'win').length;

    return NextResponse.json({
      success: true,
      sinceDays,
      summary: {
        totalPicks: picks.length,
        decidedPicks: totalDecided,
        wins: totalWins,
        losses: picks.filter((p) => p.result === 'loss').length,
        pushes: picks.filter((p) => p.result === 'push').length,
        winRate: totalDecided === 0 ? null : Number((totalWins / totalDecided * 100).toFixed(1)),
        clvCoverage: picks.length === 0 ? 0 : Number((withClv.length / picks.length * 100).toFixed(1)),
        avgClvPct: overallAvg,
        // Interpretation hint: positive CLV = we're beating the close (sharp).
        // Sub-1% is noise. 1%+ is meaningful edge. 3%+ is professional grade.
        interpretation: overallAvg == null ? 'Not enough closing-odds data yet.'
          : overallAvg >= 3 ? 'Professional-grade edge.'
          : overallAvg >= 1 ? 'Meaningful edge — we are beating the close.'
          : overallAvg >= 0 ? 'Marginal edge — close to flat.'
          : 'Negative CLV — we are losing to the close over this window.',
      },
      byCategory,
      byLeague,
      picks: picks.slice(0, 200), // cap the per-pick list
    });
  } catch (err: any) {
    console.error('[clv] failed', err);
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}
