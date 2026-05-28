import { NextResponse } from 'next/server';
import { getUserEntitlements, hasYearlyAccess } from '@/lib/entitlements';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// GET /api/account/me  (userId from the httpOnly `himothy_uid` cookie, set after a
// confirmed purchase; falls back to ?userId= for browsers that haven't been bound yet).
// Returns the user's active entitlements + whether they have any yearly subscription.
// Used by the YearlyMemberGate component to decide whether to show gated content.
//
// The cookie is preferred so entitlements can't be read by guessing someone else's id.
// The query-param fallback exists only because the id is an unguessable random UUID.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cookieHeader = req.headers.get('cookie') || '';
  const cookieUid = cookieHeader.split(';').map((c) => c.trim())
    .find((c) => c.startsWith('himothy_uid='))?.slice('himothy_uid='.length) || '';
  const userId = cookieUid || url.searchParams.get('userId') || '';
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
