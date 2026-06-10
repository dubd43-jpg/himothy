import { NextResponse } from 'next/server';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { getActionsForDate, getRecentActions, searchActions, logAction } from '@/services/actionLogService';

// ADMIN ONLY. Browse the universal action log.
//   GET ?date=YYYY-MM-DD  → all actions on that ET-date
//   GET ?q=text            → free-text search across summary/subject/action
//   GET (no params)        → 200 most-recent actions site-wide
//   POST { action, summary, details } → manually log a SESSION_NOTE-style entry
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  const q = url.searchParams.get('q');
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') || 200)));
  try {
    if (q) {
      const rows = await searchActions(q, limit);
      return NextResponse.json({ success: true, count: rows.length, actions: rows });
    }
    if (date) {
      const rows = await getActionsForDate(date, limit);
      return NextResponse.json({ success: true, count: rows.length, actions: rows });
    }
    const rows = await getRecentActions(limit);
    return NextResponse.json({ success: true, count: rows.length, actions: rows });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'bad json' }, { status: 400 }); }
  if (!body?.summary) return NextResponse.json({ success: false, error: 'summary required' }, { status: 400 });
  try {
    const id = await logAction({
      action: body.action || 'SESSION_NOTE',
      actor: body.actor || 'claude',
      summary: String(body.summary),
      subject: body.subject || null,
      details: body.details || {},
    });
    return NextResponse.json({ success: true, id });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
}
