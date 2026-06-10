import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';
import { LEAGUE_URLS } from '@/lib/validation';

// LATE-NEWS MONITOR — owner directive: safety win.
// Polls ESPN injury feed for every game in today's slate that hasn't started yet.
// If a key player on the picked side goes OUT (or scratches late), flag the pick
// with a 'LATE NEWS' notes field so customers see "⚠ Verify before betting."
//
// Auth: CRON_SECRET (Vercel cron) or x-admin-secret. Schedule: every 30 min between
// 11am ET and last first-pitch ET (~10pm). Configured in vercel.json.
//
// Conservative behavior: we WARN, we don't auto-pull. The slate-cut admin endpoint
// still requires explicit approval to remove a pick. This avoids false-positive
// scrubs from ESPN's flaky injury feed.

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SCHEMA_READY: { v: boolean } = { v: false };
async function ensureLateNewsSchema() {
  if (SCHEMA_READY.v || !hasDatabase()) return;
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE himothy_pick_registry
      ADD COLUMN IF NOT EXISTS late_news_flag BOOLEAN DEFAULT FALSE
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE himothy_pick_registry
      ADD COLUMN IF NOT EXISTS late_news_note TEXT
    `);
    SCHEMA_READY.v = true;
  } catch { /* tolerate */ }
}

async function fetchEspnInjuries(league: string, eventId: string): Promise<{ home: string[]; away: string[] }> {
  const empty = { home: [] as string[], away: [] as string[] };
  const base = LEAGUE_URLS[league];
  if (!base || !eventId) return empty;
  try {
    const r = await fetch(`${base}/summary?event=${eventId}`, { cache: 'no-store' });
    if (!r.ok) return empty;
    const d = await r.json();
    const out = { home: [] as string[], away: [] as string[] };
    for (const team of (d.injuries || [])) {
      const isHome = team.team?.id === d.header?.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.id;
      const slot = isHome ? out.home : out.away;
      for (const inj of (team.injuries || [])) {
        const status = (inj.status || '').toUpperCase();
        // OUT, OUT FOR SEASON, DAY-TO-DAY (DOUBTFUL), SUSPENDED — all qualify
        if (['OUT', 'OUT FOR SEASON', 'SUSPENDED', 'DOUBTFUL', 'DAY-TO-DAY'].includes(status)) {
          const name = inj.athlete?.displayName || 'Unknown';
          slot.push(`${name} (${status})`);
        }
      }
    }
    return out;
  } catch {
    return empty;
  }
}

function isAuthed(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const adminSecret = process.env.ADMIN_SECRET?.trim();
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const adminHeader = req.headers.get('x-admin-secret')?.trim();
  if (cronSecret && bearer === cronSecret) return true;
  if (adminSecret && adminHeader === adminSecret) return true;
  // SECURITY 2026-06-02: dropped the user-agent: vercel-cron bypass — it's a
  // client-controlled header and was spoofable. Vercel cron sends
  // Authorization: Bearer ${CRON_SECRET}, already accepted above.
  return false;
}

export async function GET(req: Request) {
  if (!isAuthed(req)) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  await ensureLateNewsSchema();

  // Today's ET date
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const etDate = `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}-${parts.find((p) => p.type === 'day')?.value}`;

  // Pull today's published, ungraded, PREGAME picks with an event_id. The pregame
  // filter is critical — late-news must never modify a pick whose game has already
  // started (violates the no-changes-during-games rule). Added 2026-06-02.
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, event_id, league, selection, market_type, home_team, away_team, research_payload
       FROM himothy_pick_registry
       WHERE board_date = $1::date
         AND status IN ('published','locked')
         AND result = 'pending'
         AND event_id IS NOT NULL
         AND (start_time IS NULL OR start_time > NOW())`,
    etDate,
  );

  const checked: any[] = [];
  let flagged = 0;
  for (const row of rows) {
    const evidence = (row.research_payload || {}).evidence || {};
    // What we knew at publish: the OUTs we captured. Late news = anyone OUT now that
    // wasn't OUT then.
    const knownOut: Set<string> = new Set((evidence.pickedInjuries?.out || []).concat(evidence.oppInjuries?.out || []));
    const live = await fetchEspnInjuries(row.league, String(row.event_id));
    const allLive = [...live.home, ...live.away];
    const newOuts = allLive.filter((entry) => {
      const playerName = entry.split(' (')[0];
      return !Array.from(knownOut).some((k) => k.includes(playerName));
    });
    let lateFlag = false;
    let lateNote: string | null = null;
    if (newOuts.length > 0) {
      lateFlag = true;
      lateNote = `Late news (${new Date().toISOString().slice(11, 16)} UTC): ${newOuts.slice(0, 3).join('; ')}`;
      flagged += 1;
    }
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE himothy_pick_registry
           SET late_news_flag = $2,
               late_news_note = $3,
               updated_at = NOW()
         WHERE id = $1`,
        row.id, lateFlag, lateNote,
      );
    } catch { /* tolerate */ }
    checked.push({ id: row.id, selection: row.selection, flagged: lateFlag, note: lateNote });
  }

  return NextResponse.json({ success: true, etDate, checked: checked.length, flagged, picks: checked });
}
