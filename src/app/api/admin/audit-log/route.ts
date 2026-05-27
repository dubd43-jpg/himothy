import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/adminAuth';
import {
  getAuditLogForBoardDate,
  getAuditLogForPick,
  getRecentAuditLog,
} from '@/services/pickAuditLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Admin-only: query the pick audit log so we can investigate any "where did this pick
// go" question. Filters: by pickKey, by boardDate, or recent N.
//
// Usage:
//   /api/admin/audit-log?pickKey=401815526|Cleveland Guardians ML
//   /api/admin/audit-log?boardDate=2026-05-27
//   /api/admin/audit-log?limit=200

export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const pickKey = url.searchParams.get('pickKey');
  const boardDate = url.searchParams.get('boardDate');
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 100)));

  try {
    if (pickKey) {
      const rows = await getAuditLogForPick(pickKey);
      return NextResponse.json({ success: true, count: rows.length, events: rows });
    }
    if (boardDate) {
      const rows = await getAuditLogForBoardDate(boardDate);
      return NextResponse.json({ success: true, count: rows.length, events: rows });
    }
    const rows = await getRecentAuditLog(limit);
    return NextResponse.json({ success: true, count: rows.length, events: rows });
  } catch (err: any) {
    console.error('audit-log query error', err);
    return NextResponse.json({ error: err?.message || 'query failed' }, { status: 500 });
  }
}
