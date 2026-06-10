import { NextResponse } from 'next/server';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { LEAGUE_URLS } from '@/lib/validation';
import { prisma } from '@/lib/prisma';

// ADMIN ONLY. Per-loss forensic dump.
//
// GET /api/admin/postmortem?since=YYYY-MM-DD[&category=PRESSURE_PACK&result=loss]
//
// For every matching graded pick: pulls research_payload.evidence (both sides' signals
// + scores frozen at publish) AND the actual ESPN final score, computes the cover
// margin, and reports whether we picked the dog or the chalk. This is the file you
// read after a bad week to answer "should we have flipped this one?"
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

type PostmortemRow = {
  id: string;
  date: string;
  category: string | null;
  league: string | null;
  selection: string;
  odds: string | null;
  result: string | null;
  pickedSide: 'home' | 'away' | null;
  homeScore: number | null;     // engine signal score for home
  awayScore: number | null;     // engine signal score for away
  scoreGap: number | null;
  oppEngineScore: number | null; // score the dog had
  baseScore: number | null;
  confidenceAtPublish: number | null;
  signalsPicked: any;
  signalsOpp: any;
  pickedInjuries: any;
  oppInjuries: any;
  starOutPick: string | null;
  starOutOpp: string | null;
  dataQuality: number | null;
  game: {
    home: string;
    away: string;
    homeFinal: number;
    awayFinal: number;
    total: number;
    pickedTeamFinal: number;
    oppTeamFinal: number;
    rawMargin: number;
    completed: boolean;
  } | null;
  coverNote: string | null;     // human-readable "covered by 3.5" / "lost by 2"
  flippedSideWouldHaveWon: boolean | null; // ML loss + dog won outright = TRUE
  verdict: string;              // one-line synthesis
};

async function fetchEspnFinal(league: string, eventId: string): Promise<any | null> {
  const base = LEAGUE_URLS[league];
  if (!base || !eventId) return null;
  try {
    const r = await fetch(`${base}/summary?event=${eventId}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function americanToInt(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/[-+]?\d+/);
  return m ? Number(m[0]) : null;
}

function parseLine(line: string | null | undefined): number {
  if (!line) return 0;
  const m = String(line).match(/[-+]?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

function buildVerdict(row: PostmortemRow): string {
  if (!row.game) return 'No final score available.';
  if (row.result !== 'loss') return `${row.result?.toUpperCase()} — ${row.coverNote ?? ''}`;
  const bits: string[] = [];
  if (row.flippedSideWouldHaveWon) bits.push('FLIP would have won outright.');
  if (row.scoreGap != null && row.scoreGap <= 3) bits.push(`Engine score gap only ${row.scoreGap} — coin flip.`);
  if (row.starOutPick) bits.push(`Key player OUT on our side at publish (${row.starOutPick}).`);
  if (row.dataQuality != null && row.dataQuality < 50) bits.push(`Data quality ${row.dataQuality} — thin signal.`);
  if (row.coverNote) bits.push(row.coverNote);
  return bits.join(' ');
}

export async function GET(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });

  const url = new URL(req.url);
  const since = url.searchParams.get('since') || '2026-05-27';
  const category = url.searchParams.get('category'); // optional
  const resultFilter = url.searchParams.get('result'); // 'loss' | 'win' | null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return NextResponse.json({ success: false, error: 'pass ?since=YYYY-MM-DD' }, { status: 400 });
  }

  const params: any[] = [since];
  const where: string[] = [`board_date >= $1::date`, `status IN ('published','locked','graded','archived')`];
  if (category) { params.push(category); where.push(`category = $${params.length}`); }
  if (resultFilter) { params.push(resultFilter); where.push(`result = $${params.length}`); }
  else { where.push(`result IN ('win','loss')`); }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, board_date, category, league, sport, event_id, event_name, home_team, away_team,
            market_type, selection, line, odds, result, edge_score, confidence_tier,
            research_payload
       FROM himothy_pick_registry
       WHERE ${where.join(' AND ')}
       ORDER BY board_date DESC, category, created_at`,
    ...params
  );

  // Perf 2026-06-04: was sequential await per row (N RTTs to ESPN).
  // Now prefetch every ESPN summary in parallel, then iterate locally.
  const espnByRow = await Promise.all(rows.map((r) =>
    r.event_id && r.league ? fetchEspnFinal(r.league, String(r.event_id)) : Promise.resolve(null)
  ));

  const out: PostmortemRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const payload = r.research_payload || {};
    const ev = payload.evidence || null;
    const espn = espnByRow[i];

    let gameOut: PostmortemRow['game'] = null;
    let coverNote: string | null = null;
    let flipWouldHaveWon: boolean | null = null;

    if (espn) {
      const comp = espn.header?.competitions?.[0] || espn.boxscore?.teams?.[0]?.competitions?.[0];
      const competitors = comp?.competitors || [];
      const homeC = competitors.find((c: any) => c.homeAway === 'home');
      const awayC = competitors.find((c: any) => c.homeAway === 'away');
      const homeFinal = Number(homeC?.score || 0);
      const awayFinal = Number(awayC?.score || 0);
      const completed = comp?.status?.type?.completed === true || comp?.status?.type?.state === 'post';
      const pickedSide = ev?.pickedSide || (/.*/.test(r.selection) ? null : null);
      const pickedFinal = pickedSide === 'home' ? homeFinal : awayFinal;
      const oppFinal = pickedSide === 'home' ? awayFinal : homeFinal;
      const rawMargin = pickedFinal - oppFinal;

      gameOut = {
        home: homeC?.team?.displayName || r.home_team || '?',
        away: awayC?.team?.displayName || r.away_team || '?',
        homeFinal, awayFinal,
        total: homeFinal + awayFinal,
        pickedTeamFinal: pickedFinal, oppTeamFinal: oppFinal,
        rawMargin,
        completed,
      };

      const sel = String(r.selection).toLowerCase();
      const market = String(r.market_type).toLowerCase();
      if (market === 'spread') {
        const ln = parseLine(r.line || r.selection);
        const cover = rawMargin + ln;
        coverNote = `Spread ${ln >= 0 ? '+' : ''}${ln} | raw margin ${rawMargin >= 0 ? '+' : ''}${rawMargin} → cover ${cover >= 0 ? '+' : ''}${cover.toFixed(1)}`;
      } else if (market === 'moneyline') {
        coverNote = `ML | raw margin ${rawMargin >= 0 ? '+' : ''}${rawMargin}`;
        if (r.result === 'loss' && rawMargin < 0) flipWouldHaveWon = true;
      } else if (market === 'total') {
        const ln = parseLine(r.line || r.selection);
        const total = homeFinal + awayFinal;
        const isOver = /over/i.test(sel);
        coverNote = `Total ${total} vs ${ln} → ${total > ln ? 'OVER' : (total < ln ? 'UNDER' : 'PUSH')}${ln ? ` by ${Math.abs(total - ln).toFixed(1)}` : ''}` +
                    (isOver !== undefined ? ` (we played ${isOver ? 'OVER' : 'UNDER'})` : '');
      }
    }

    const row: PostmortemRow = {
      id: r.id,
      date: new Date(r.board_date).toISOString().slice(0, 10),
      category: r.category,
      league: r.league,
      selection: r.selection,
      odds: r.odds,
      result: r.result,
      pickedSide: ev?.pickedSide ?? null,
      homeScore: ev?.homeScore ?? null,
      awayScore: ev?.awayScore ?? null,
      scoreGap: ev?.scoreGap ?? null,
      oppEngineScore: ev ? (ev.pickedSide === 'home' ? ev.awayScore : ev.homeScore) : null,
      baseScore: ev?.baseScore ?? null,
      confidenceAtPublish: r.edge_score == null ? null : Number(r.edge_score),
      signalsPicked: ev ? (ev.pickedSide === 'home' ? ev.homeSignals : ev.awaySignals) : null,
      signalsOpp: ev ? (ev.pickedSide === 'home' ? ev.awaySignals : ev.homeSignals) : null,
      pickedInjuries: ev?.pickedInjuries ?? null,
      oppInjuries: ev?.oppInjuries ?? null,
      starOutPick: ev?.starOutPickSide ?? null,
      starOutOpp: ev?.starOutOppSide ?? null,
      dataQuality: ev?.dataQuality ?? null,
      game: gameOut,
      coverNote,
      flippedSideWouldHaveWon: flipWouldHaveWon,
      verdict: '',
    };
    row.verdict = buildVerdict(row);
    out.push(row);
  }

  const losses = out.filter((r) => r.result === 'loss');
  const wins = out.filter((r) => r.result === 'win');
  const flipWins = losses.filter((r) => r.flippedSideWouldHaveWon).length;
  const hasEvidence = out.filter((r) => r.signalsPicked !== null).length;

  return NextResponse.json({
    success: true,
    since,
    filter: { category, result: resultFilter },
    summary: {
      total: out.length,
      wins: wins.length,
      losses: losses.length,
      flipWouldHaveWon: flipWins,
      flipRate: losses.length ? Number((flipWins / losses.length * 100).toFixed(1)) : 0,
      withEvidence: hasEvidence,
      evidenceCoverage: out.length ? Number((hasEvidence / out.length * 100).toFixed(1)) : 0,
    },
    picks: out,
  });
}
