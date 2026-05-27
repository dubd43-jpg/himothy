import { NextResponse } from 'next/server';
import { getUserEntitlements, hasYearlyAccess } from '@/lib/entitlements';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// GET /api/account/me?userId=...
// Returns the user's active entitlements + whether they have any yearly subscription.
// Used by the YearlyMemberGate component to decide whether to show gated content.
//
// When real auth is wired, swap to reading userId from the session instead of query string.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId') || '';
  if (!userId) {
    return NextResponse.json({
      authenticated: false,
      hasYearlyAccess: false,
      productKeys: [],
      details: [],
    });
  }
  try {
    const [entitlements, yearly] = await Promise.all([
      getUserEntitlements(userId),
      hasYearlyAccess(userId),
    ]);
    return NextResponse.json({
      authenticated: true,
      hasYearlyAccess: yearly,
      productKeys: Array.from(entitlements.productKeys),
      details: entitlements.details,
    });
  } catch (err: any) {
    console.error('account/me error', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
