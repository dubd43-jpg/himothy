import { NextResponse } from 'next/server';
import { hasDatabase } from '@/lib/hasDatabase';
import { getPickById } from '@/services/pickRegistryService';

// PUBLIC lookup by registry pick id. Used by /pick-by-id/[id] to redirect legacy
// admin-published card links into the standard /pick/[gameId] breakdown view.
// Returns a minimal {pick: {eventId}} payload — the redirect page only needs eventId.
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!hasDatabase()) return NextResponse.json({ success: false }, { status: 404 });
  try {
    const p = await getPickById(params.id);
    if (!p) return NextResponse.json({ success: false }, { status: 404 });
    return NextResponse.json({ success: true, pick: { eventId: p.eventId, selection: p.selection } });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
