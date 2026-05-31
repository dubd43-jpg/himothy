import { NextResponse } from 'next/server';
import { getPickById, updatePickById, deletePickById } from '@/services/pickRegistryService';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';

// ADMIN ONLY. Per-pick read / update / delete by id.
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  const pick = await getPickById(params.id);
  if (!pick) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
  return NextResponse.json({ success: true, pick });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'bad json' }, { status: 400 }); }
  try {
    const ok = await updatePickById(params.id, body || {});
    return NextResponse.json({ success: true, updated: ok });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  try {
    await deletePickById(params.id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
}
