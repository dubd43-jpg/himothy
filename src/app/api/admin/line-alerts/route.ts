import { NextResponse } from 'next/server';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string; board_date: Date; category: string; league: string;
      selection: string; odds: string | null; edge_score: number | null;
      line_alert_level: string | null; line_move_cents: number | null;
      line_alert_flagged_at: Date | null; pre_alert_edge_score: number | null;
      signal_alert_reasons: any;
      research_payload: any;
    }>>(
      `SELECT id, board_date, category, league, selection, odds, edge_score,
              line_alert_level, line_move_cents, line_alert_flagged_at,
              pre_alert_edge_score, signal_alert_reasons, research_payload
         FROM himothy_pick_registry
        WHERE status IN ('published','locked')
          AND result = 'pending'
          AND research_payload ? 'startTime'
          AND (research_payload->>'startTime')::timestamptz > NOW()
        ORDER BY line_alert_level NULLS LAST, line_move_cents DESC NULLS LAST`
    );

    const alerts = rows.map((r) => ({
      id: r.id,
      date: new Date(r.board_date).toISOString().slice(0, 10),
      category: r.category,
      league: r.league,
      selection: r.selection,
      entryOdds: r.odds,
      currentConf: r.edge_score == null ? null : Number(r.edge_score),
      preAlertConf: r.pre_alert_edge_score == null ? null : Number(r.pre_alert_edge_score),
      alertLevel: r.line_alert_level,
      moveCents: r.line_move_cents == null ? null : Number(r.line_move_cents),
      flaggedAt: r.line_alert_flagged_at ? new Date(r.line_alert_flagged_at).toISOString() : null,
      reasons: Array.isArray(r.signal_alert_reasons) ? r.signal_alert_reasons : [],
      startTime: r.research_payload?.startTime || null,
    }));

    const summary = {
      total: alerts.length,
      red: alerts.filter((a) => a.alertLevel === 'red').length,
      yellow: alerts.filter((a) => a.alertLevel === 'yellow').length,
      watch: alerts.filter((a) => a.alertLevel === 'watch').length,
      clean: alerts.filter((a) => a.alertLevel == null).length,
    };

    return NextResponse.json({ success: true, summary, alerts });
  } catch (err: any) {
    console.error('[line-alerts] failed', err);
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}
