import { NextResponse } from 'next/server';
import { dedupeRegistry } from '@/services/pickRegistryService';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';

// ADMIN ONLY. Removes duplicate straight picks (the SAME bet logged twice — e.g. a play that
// landed under both GRAND_SLAM and PRESSURE_PACK because old dedup keyed on the event-name
// string). Keeps one row per bet, preferring the higher tier. Pass ?date=YYYY-MM-DD to limit
// to one board day; omit to clean the whole registry.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  return isAdminRequest(req);
}

async function handle(req: Request) {
  if (!authorized(req)) return adminUnauthorized();
  if (!hasDatabase()) {
    return NextResponse.json({ success: false, error: 'no database connected' }, { status: 400 });
  }
  try {
    const date = new URL(req.url).searchParams.get('date') || undefined;
    const removed = await dedupeRegistry(date);
    return NextResponse.json({ success: true, scope: date || 'all dates', removed });
  } catch (error: any) {
    console.error('dedupe-registry failed', error);
    return NextResponse.json({ success: false, error: String(error?.message || error) }, { status: 500 });
  }
}

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
