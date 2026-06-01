import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';
import { LEAGUE_URLS } from '@/lib/validation';

// Public-facing loss feed for /transparency/losses. Pulls the last 30 days of graded
// losses, joins each with the evidence captured at publish (reasonsFor, scoreGap from
// research_payload.evidence) AND tries to surface the actual ESPN final as the
// "what happened" line. No admin auth — this is intentionally public.
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

async function fetchEspnFinal(league: string, eventId: string): Promise<string | null> {
  const base = LEAGUE_URLS[league];
  if (!base || !eventId) return null;
  try {
    const r = await fetch(`${base}/summary?event=${eventId}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    const comp = d.header?.competitions?.[0];
    if (!comp) return null;
    const competitors = comp.competitors || [];
    const home = competitors.find((c: any) => c.homeAway === 'home');
    const away = competitors.find((c: any) => c.homeAway === 'away');
    if (!home || !away) return null;
    return `Final: ${away?.team?.abbreviation || ''} ${away?.score || 0}-${home?.score || 0} ${home?.team?.abbreviation || ''}`;
  } catch { return null; }
}

export async function GET() {
  if (!hasDatabase()) return NextResponse.json({ success: true, losses: [] });
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, board_date, category, league, event_id, selection, odds,
              research_payload, edge_score
         FROM himothy_pick_registry
         WHERE result = 'loss'
           AND board_date >= NOW() - INTERVAL '30 days'
           AND is_public = TRUE
         ORDER BY board_date DESC, created_at DESC
         LIMIT 50`,
    );
    const out: any[] = [];
    for (const r of rows) {
      const payload = r.research_payload || {};
      const reasonsFor: string[] = Array.isArray(payload.reasonsFor) ? payload.reasonsFor.slice(0, 2) : [];
      const ev = payload.evidence || {};
      const finalLine = r.event_id ? await fetchEspnFinal(r.league, String(r.event_id)) : null;
      out.push({
        id: r.id,
        date: new Date(r.board_date).toISOString().slice(0, 10),
        category: r.category || 'PICK',
        league: r.league || '',
        selection: r.selection,
        odds: r.odds || '',
        closingNote: finalLine,
        whyWeLikedIt: reasonsFor,
        whatHappened: null, // will be auto-generated in v2 from evidence vs final
        scoreGap: ev.scoreGap ?? null,
      });
    }
    return NextResponse.json({ success: true, losses: out });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}
