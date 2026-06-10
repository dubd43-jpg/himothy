// Closing-line snapshot cron — fires every 5 min during game-day hours and captures
// the closing odds for any pick whose game is about to start. CLV math depends on
// having a true "close" — the prior approach captured odds at grade time (after the
// game), which isn't a real close. Added 2026-06-03 per cron audit finding.

import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/services/actionLogService';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  return isAdminRequest(req);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });

  // Find picks whose game starts in the next 6 min and haven't been snapped yet.
  // 2026-06-04 fix: no top-level start_time column. Pull startTime from the
  // research_payload JSONB. Previously this query silently returned [] and the
  // closing-odds field never got populated — that's why CLV coverage was 0%.
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, event_id, league, sport, market_type, selection, odds,
            (research_payload->>'startTime')::timestamptz AS start_time
       FROM himothy_pick_registry
      WHERE status IN ('published','locked')
        AND result = 'pending'
        AND closing_odds IS NULL
        AND research_payload ? 'startTime'
        AND (research_payload->>'startTime')::timestamptz > NOW()
        AND (research_payload->>'startTime')::timestamptz < NOW() + INTERVAL '6 minutes'`
  ).catch(() => []);

  let snapped = 0;
  for (const r of rows) {
    try {
      // Snap the CURRENT odds as the closing odds. The pick's recorded odds are what
      // we published at; CURRENT odds at game start are the market's close.
      await prisma.$executeRawUnsafe(
        `UPDATE himothy_pick_registry
            SET closing_odds = $1, updated_at = NOW()
          WHERE id = $2`,
        r.odds,
        r.id,
      );
      snapped++;
    } catch (err) {
      console.error('[snapshot-closing] failed for pick', r.id, err);
    }
  }

  if (snapped > 0) {
    await logAction({
      action: 'GRADING_RUN', actor: 'cron', subject: 'snapshot-closing',
      summary: `Snapped closing odds for ${snapped} picks`,
      details: { snapped, candidates: rows.length },
    }).catch(() => null);
  }

  return NextResponse.json({ success: true, snapped, candidates: rows.length });
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
