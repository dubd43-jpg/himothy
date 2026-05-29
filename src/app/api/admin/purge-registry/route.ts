import { NextResponse } from 'next/server';
import { deleteRegistryBefore } from '@/services/pickRegistryService';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';

// ADMIN ONLY. Clears all recorded picks BEFORE ?before=YYYY-MM-DD so the official record can
// start fresh from the day the upgraded engine launched. Destructive — requires the admin
// secret and an explicit date. Keeps everything on/after the date.
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
  const before = new URL(req.url).searchParams.get('before');
  if (!before || !/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    return NextResponse.json({ success: false, error: 'pass ?before=YYYY-MM-DD' }, { status: 400 });
  }
  try {
    const result = await deleteRegistryBefore(before);
    return NextResponse.json({ success: true, before, ...result });
  } catch (error: any) {
    console.error('purge-registry failed', error);
    return NextResponse.json({ success: false, error: String(error?.message || error) }, { status: 500 });
  }
}

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
