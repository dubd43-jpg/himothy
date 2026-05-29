import { NextResponse } from 'next/server';
import { getEngineDiagnostics } from '@/services/pickRegistryService';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';

// ADMIN ONLY. "Why are we winning / losing" — calibration (does conviction predict wins?),
// plus record + units by market / league / category, and value-at-entry vs cover-margin for
// wins vs losses. This is the back-end read that drives tuning toward becoming a top capper.
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) {
    return NextResponse.json({ success: false, error: 'no database connected' }, { status: 400 });
  }
  try {
    const diagnostics = await getEngineDiagnostics();
    return NextResponse.json({ success: true, ...diagnostics });
  } catch (error: any) {
    console.error('diagnostics failed', error);
    return NextResponse.json({ success: false, error: String(error?.message || error) }, { status: 500 });
  }
}
