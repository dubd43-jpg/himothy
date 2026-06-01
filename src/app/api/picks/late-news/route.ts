import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';

// PUBLIC late-news flag lookup. Returns a {eventId → note} map for today's picks
// that the late-news cron flagged. Customer pick cards fetch this in parallel with
// daily-picks and display a ⚠ badge when a pick has a late-news note.
//
// Auth: NONE — this is intentionally public so the badge appears on every pick card.
// No sensitive data exposed — just (event_id, selection, note) for flagged picks.
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET() {
  if (!hasDatabase()) return NextResponse.json({ success: true, flags: {} });
  // Today's ET date
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const etDate = `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}-${parts.find((p) => p.type === 'day')?.value}`;
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ event_id: string; selection: string; late_news_note: string }>>(
      `SELECT event_id, selection, late_news_note
         FROM himothy_pick_registry
         WHERE board_date = $1::date
           AND late_news_flag = TRUE
           AND late_news_note IS NOT NULL`,
      etDate,
    );
    const flags: Record<string, string> = {};
    for (const r of rows) {
      if (r.event_id) flags[r.event_id] = r.late_news_note;
    }
    return NextResponse.json({ success: true, etDate, flags });
  } catch {
    // Schema may not exist yet on first run (cron hasn't fired) — return empty map.
    return NextResponse.json({ success: true, flags: {} });
  }
}
