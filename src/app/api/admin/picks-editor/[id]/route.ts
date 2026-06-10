import { NextResponse } from 'next/server';
import { getPickById, updatePickById, deletePickById } from '@/services/pickRegistryService';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { logAction } from '@/services/actionLogService';
import { captureSnapshot } from '@/services/slateSnapshotService';
import { getCachedBoard } from '@/services/dailyBoardCache';

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
    const before = await getPickById(params.id);
    const ok = await updatePickById(params.id, body || {});
    await logAction({
      action: 'PICK_MANUALLY_EDITED', actor: 'admin', subject: params.id,
      summary: `Pick ${params.id} edited`,
      details: { changes: body || {}, before },
    });
    // FIX 2026-06-02: capture the slate state at edit time so the snapshot log
    // reflects every change. Pulls from cache (no recompute) — if cache is cold,
    // snapshot still captures the event via the action log entry above.
    const cached = getCachedBoard('north-american');
    if (cached?.data) {
      await captureSnapshot(cached.data, 'north-american', 'edit').catch(() => null);
    }
    return NextResponse.json({ success: true, updated: ok });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  try {
    const before = await getPickById(params.id);
    // ?silent=true suppresses the PULLED email — used when cleaning up stale rows
    // that should never have been recorded in the first place (e.g. dev regen
    // duplicates). Default behavior still emails on legitimate pulls.
    const silent = new URL(req.url).searchParams.get('silent') === 'true';
    await deletePickById(params.id, { silent });
    await logAction({
      action: 'PICK_MANUALLY_DELETED', actor: 'admin', subject: params.id,
      summary: `Pick ${params.id} deleted`,
      details: { before },
    });
    const cached = getCachedBoard('north-american');
    if (cached?.data) {
      await captureSnapshot(cached.data, 'north-american', 'edit').catch(() => null);
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
}
