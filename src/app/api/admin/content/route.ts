import { NextResponse } from 'next/server';
import { getContent, setContent, listContent } from '@/lib/siteContent';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';

// ADMIN ONLY. Read / write site content (the owner-editable text fields used across pages).
// GET ?key=X     -> { key, value } (one field)
// GET            -> { items: [{key, value, updatedAt}, ...] } (all fields)
// POST { key, value } -> upsert one field
// POST { items: [{key, value}, ...] } -> upsert many (one Save click for many fields)
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  const key = new URL(req.url).searchParams.get('key');
  if (key) {
    const value = await getContent(key);
    return NextResponse.json({ success: true, key, value });
  }
  const items = await listContent();
  return NextResponse.json({ success: true, items });
}

export async function POST(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'bad json' }, { status: 400 }); }
  const items: Array<{ key: string; value: string }> = Array.isArray(body?.items)
    ? body.items
    : (body?.key ? [{ key: String(body.key), value: String(body.value ?? '') }] : []);
  if (items.length === 0) return NextResponse.json({ success: false, error: 'no items to save' }, { status: 400 });
  let saved = 0;
  for (const it of items) {
    const k = String(it.key || '').trim();
    if (!k) continue;
    await setContent(k, String(it.value ?? ''));
    saved++;
  }
  return NextResponse.json({ success: true, saved });
}
