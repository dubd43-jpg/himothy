import { NextResponse } from 'next/server';
import { createCustomerPortalSession, hasStripe } from '@/services/stripeService';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// POST /api/stripe/portal
// Body: { userId, email }
// Returns: { url } — frontend redirects to Stripe-hosted customer portal where the user
// can update payment method, cancel, see invoices. Stripe handles the entire UI.

export async function POST(req: Request) {
  if (!hasStripe()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { userId, email } = body as { userId: string; email: string };
  if (!userId || !email) return NextResponse.json({ error: 'Missing userId or email' }, { status: 400 });

  try {
    const url = await createCustomerPortalSession(userId, email);
    if (!url) return NextResponse.json({ error: 'Portal session failed' }, { status: 500 });
    return NextResponse.json({ url });
  } catch (err: any) {
    console.error('Portal error', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
