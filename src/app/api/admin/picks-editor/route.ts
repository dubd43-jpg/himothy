import { NextResponse } from 'next/server';
import { listPicksForDate, createPickManual } from '@/services/pickRegistryService';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';

// ADMIN ONLY. Per-pick CRUD.
// GET ?date=YYYY-MM-DD -> list all picks for that board date.
// POST { ...fields }   -> create a new pick (bypasses engine dedup/pregame guards).
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  const date = new URL(req.url).searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, error: 'pass ?date=YYYY-MM-DD' }, { status: 400 });
  }
  const picks = await listPicksForDate(date);
  return NextResponse.json({ success: true, date, picks });
}

export async function POST(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'bad json' }, { status: 400 }); }
  try {
    const id = await createPickManual(body || {});
    return NextResponse.json({ success: true, id });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
}
