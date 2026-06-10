import { NextResponse } from 'next/server';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { addManualInjury, deleteManualInjury, listAllActiveManualInjuries } from '@/services/manualInjuryService';
import { logAction } from '@/services/actionLogService';

// ADMIN ONLY. Manual injury entry — for leagues no free API covers (NCAA Baseball,
// KBO, AFL, lower-tier soccer). Owner types in what they hear from news / Twitter
// and the engine consumes it like ESPN-sourced data.
//
//   GET    /api/admin/injuries           → all active manual entries
//   POST   /api/admin/injuries           → add one
//        body: { teamName, league, playerName, status, position?, note?, hoursValid? }
//   DELETE /api/admin/injuries?id=...    → remove one

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  const rows = await listAllActiveManualInjuries();
  return NextResponse.json({ success: true, count: rows.length, injuries: rows });
}

export async function POST(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'bad json' }, { status: 400 }); }
  const required = ['teamName', 'league', 'playerName', 'status'];
  for (const k of required) {
    if (!body?.[k]) return NextResponse.json({ success: false, error: `missing ${k}` }, { status: 400 });
  }
  if (!['OUT', 'DOUBTFUL', 'QUESTIONABLE'].includes(body.status)) {
    return NextResponse.json({ success: false, error: 'status must be OUT|DOUBTFUL|QUESTIONABLE' }, { status: 400 });
  }
  const id = await addManualInjury({
    teamName: body.teamName, league: body.league, playerName: body.playerName,
    status: body.status, position: body.position, note: body.note,
    hoursValid: body.hoursValid, addedBy: body.addedBy || 'admin',
  });
  if (!id) return NextResponse.json({ success: false, error: 'insert failed' }, { status: 500 });
  await logAction({
    action: 'PRODUCT_CHANGED', actor: body.addedBy || 'admin', subject: `${body.teamName}|${body.playerName}`,
    summary: `Manual injury added: ${body.playerName} (${body.teamName}, ${body.league}) → ${body.status}`,
    details: { id, ...body },
  });
  return NextResponse.json({ success: true, id });
}

export async function DELETE(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'missing id' }, { status: 400 });
  const ok = await deleteManualInjury(id);
  if (ok) {
    await logAction({
      action: 'PRODUCT_CHANGED', actor: 'admin', subject: id,
      summary: `Manual injury removed: ${id}`,
    });
  }
  return NextResponse.json({ success: ok });
}
