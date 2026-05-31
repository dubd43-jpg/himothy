import { NextResponse } from 'next/server';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { getPersistedBoardForDate, adminOverwritePersistedSlate } from '@/services/dailyBoardCache';

// ADMIN ONLY. Surgical mid-day cut — removes one or more picks from the live frozen slate.
//
// POST body: { board: 'north-american'|'soccer'|'overseas', etDate?: 'YYYYMMDD', cuts: [{ gameId?, selection?, market? }] }
// A pick is dropped if EVERY provided field matches (case-insensitive on selection).
//
// Use case: a pick's deep-tendency data turned bad after the morning post (avg margin
// contradicts a -1.5, opponent has hotter streak, etc.) and we want it off the customer
// slate before games start. The data-honest move, not a panic cut.
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

function todayEtKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === 'year')?.value}${parts.find((p) => p.type === 'month')?.value}${parts.find((p) => p.type === 'day')?.value}`;
}

type Cut = { gameId?: string; selection?: string; market?: string };

function pickMatches(p: any, c: Cut): boolean {
  if (!p) return false;
  if (c.gameId && String(p.gameId) !== String(c.gameId)) return false;
  if (c.selection && String(p.selection || '').toLowerCase() !== c.selection.toLowerCase()) return false;
  if (c.market && String(p.marketType || '').toLowerCase() !== c.market.toLowerCase()) return false;
  return Boolean(c.gameId || c.selection || c.market);
}

export async function POST(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'bad json' }, { status: 400 }); }

  const board = body?.board || 'north-american';
  const etDate = body?.etDate || todayEtKey();
  const cuts: Cut[] = Array.isArray(body?.cuts) ? body.cuts : [];
  if (!cuts.length) return NextResponse.json({ success: false, error: 'pass cuts: []' }, { status: 400 });

  const slate = await getPersistedBoardForDate(etDate, board);
  if (!slate) return NextResponse.json({ success: false, error: 'no slate for date+board' }, { status: 404 });

  const removed: any[] = [];
  const filterArr = (arr: any[]) => arr.filter((p) => {
    const hit = cuts.find((c) => pickMatches(p, c));
    if (hit) { removed.push({ category: 'unknown', pick: { gameId: p.gameId, selection: p.selection, market: p.marketType, odds: p.odds } }); return false; }
    return true;
  });

  if (slate.grandSlam && cuts.find((c) => pickMatches(slate.grandSlam, c))) {
    removed.push({ category: 'grandSlam', pick: { gameId: slate.grandSlam.gameId, selection: slate.grandSlam.selection } });
    slate.grandSlam = null;
  }
  for (const k of ['pressurePack', 'vip4Pack', 'parlayPlan', 'marquee', 'asleepPicks', 'valuePlays'] as const) {
    if (Array.isArray((slate as any)[k])) {
      const before = (slate as any)[k].length;
      (slate as any)[k] = (slate as any)[k].filter((p: any) => {
        const hit = cuts.find((c) => pickMatches(p, c));
        if (hit) {
          removed.push({ category: k, pick: { gameId: p.gameId, selection: p.selection, market: p.marketType, odds: p.odds } });
          return false;
        }
        return true;
      });
    }
  }

  if (!removed.length) return NextResponse.json({ success: false, error: 'no matches', cuts });

  await adminOverwritePersistedSlate(etDate, board, slate);
  return NextResponse.json({ success: true, etDate, board, removed });
}

export async function GET(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  const board = new URL(req.url).searchParams.get('board') || 'north-american';
  const etDate = new URL(req.url).searchParams.get('etDate') || todayEtKey();
  const slate = await getPersistedBoardForDate(etDate, board);
  if (!slate) return NextResponse.json({ success: false, error: 'no slate' }, { status: 404 });
  const summarize = (p: any) => p ? ({ gameId: p.gameId, selection: p.selection, market: p.marketType, odds: p.odds }) : null;
  return NextResponse.json({
    success: true, etDate, board,
    grandSlam: summarize(slate.grandSlam),
    pressurePack: (slate.pressurePack || []).map(summarize),
    vip4Pack: (slate.vip4Pack || []).map(summarize),
    parlayPlan: (slate.parlayPlan || []).map(summarize),
    asleepPicks: (slate.asleepPicks || []).map(summarize),
  });
}
