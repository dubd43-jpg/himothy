import { NextResponse } from 'next/server';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { getSnapshotAt } from '@/services/slateSnapshotService';
import { adminOverwritePersistedSlate, invalidateBoardCache } from '@/services/dailyBoardCache';
import { getEtDateKey } from '@/lib/officialTracking';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// POST /api/admin/slate/revert-to-snapshot
// Body: { board: 'north-american', beforeIso: '2026-06-03T17:53:00Z' }
// Reverts the cached slate to whatever was captured before `beforeIso`. Used to
// undo an accidental mid-day regen that swapped picks on live games.
export async function POST(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const board = String(body?.board || 'north-american');
  const beforeIso = String(body?.beforeIso || '');
  if (!beforeIso) return NextResponse.json({ error: 'beforeIso required' }, { status: 400 });

  const snap = await getSnapshotAt(beforeIso, board);
  if (!snap) return NextResponse.json({ error: 'no snapshot found before that timestamp' }, { status: 404 });

  const etDate = getEtDateKey();
  await invalidateBoardCache(board as any);
  await adminOverwritePersistedSlate(etDate, board, snap);
  return NextResponse.json({ success: true, board, etDate, snapshotKeys: Object.keys(snap) });
}
