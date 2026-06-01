import { NextResponse } from 'next/server';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { invalidateBoardCache, getOrComputeBoard } from '@/services/dailyBoardCache';

// ADMIN ONLY. Hard-reset today's slate for a board and recompute it fresh under
// whatever the engine's CURRENT logic is. Use when the engine's scoring or
// projection logic changed and today's cached slate is stale.
//
// POST body: { board: 'north-american'|'soccer'|'global'|... }
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'bad json' }, { status: 400 }); }
  const board = body?.board || 'north-american';
  try {
    await invalidateBoardCache(board);
    const fresh = await getOrComputeBoard(board);
    const counts = {
      grandSlam: fresh?.grandSlam ? 1 : 0,
      pressurePack: (fresh?.pressurePack || []).length,
      vip4Pack: (fresh?.vip4Pack || []).length,
      parlayPlan: (fresh?.parlayPlan || []).length,
      marquee: (fresh?.marquee || []).length,
      asleepPicks: (fresh?.asleepPicks || []).length,
    };
    return NextResponse.json({ success: true, board, counts, regeneratedAt: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
}
