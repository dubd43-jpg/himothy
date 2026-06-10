import { NextResponse } from 'next/server';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { getSnapshotsForDate, getSnapshotAt } from '@/services/slateSnapshotService';

// ADMIN ONLY. Query the slate snapshot log — what was on the board at any moment.
// Owner directive 2026-06-02: "every time you put a new set of picks out, you need
// to save them somewhere." This is the read side; writes happen automatically from
// dailyBoardCache + regenerate endpoint.
//
//   GET /api/admin/slate/snapshots?date=YYYY-MM-DD          → all snapshots that day
//   GET /api/admin/slate/snapshots?date=YYYY-MM-DD&board=X  → filter to one board
//   GET /api/admin/slate/snapshots?at=ISO8601&board=X       → "what was on the board at time T?"

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  const at = url.searchParams.get('at');
  const board = url.searchParams.get('board') || 'north-american';

  try {
    if (at) {
      const snap = await getSnapshotAt(at, board);
      return NextResponse.json({ success: true, snapshot: snap });
    }
    if (date) {
      const snaps = await getSnapshotsForDate(date, board);
      return NextResponse.json({ success: true, count: snaps.length, snapshots: snaps });
    }
    return NextResponse.json({ success: false, error: 'pass ?date= or ?at=' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
}
