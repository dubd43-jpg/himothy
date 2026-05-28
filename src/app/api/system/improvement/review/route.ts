import { NextResponse } from 'next/server';
import { reviewAndAdaptPolicy } from '@/services/adaptiveIntelligenceService';
import { isAdminRequest } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

// Mutates the live adaptive pick-selection policy — must be authorized (Vercel cron
// Bearer CRON_SECRET, or an admin header). Never open to the public.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  return isAdminRequest(req);
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const windowDays = Number.isFinite(Number(body.windowDays)) ? Number(body.windowDays) : 7;

    const result = await reviewAndAdaptPolicy(windowDays);

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Adaptive policy review failed:', error);
    return NextResponse.json({ success: false, error: 'Adaptive policy review failed' }, { status: 500 });
  }
}
