import { NextResponse } from 'next/server';
import { getPersonalPick, invalidatePersonalPick } from '@/services/personalPickService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// HIMOTHY Personal Pick — single highest-edge player prop across every sport today.
// Cached in Postgres so the answer freezes for the ET-day (same model as the daily slate).
// Pass ?refresh=true to bust the cache.

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';
    if (forceRefresh) await invalidatePersonalPick();
    const result = await getPersonalPick(forceRefresh);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[personal-pick] route error', err);
    return NextResponse.json({ success: false, error: err?.message || 'scan failed' }, { status: 500 });
  }
}
