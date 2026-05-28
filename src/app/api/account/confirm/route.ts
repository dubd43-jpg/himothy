import { NextResponse } from 'next/server';
import { getStripe, hasStripe, upsertSubscriptionFromEvent } from '@/services/stripeService';
import { findProduct, type ProductKey } from '@/lib/products';
import { getUserEntitlements } from '@/lib/entitlements';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

// POST /api/account/confirm  { session_id }
// Called by the /account page right after Stripe redirects back. It reads the completed
// Checkout Session, grants access immediately (so the customer doesn't have to wait for
// the async webhook), and sets an httpOnly cookie binding this browser to the userId.
//
// This is the safety net for the webhook: even if the webhook is delayed or missed, the
// buyer who lands on /account gets their access provisioned from the verified session.
export async function POST(req: Request) {
  if (!hasStripe()) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const sessionId = String(body?.session_id || '');
  if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'payment_intent'],
    });

    const paid = session.payment_status === 'paid' || session.status === 'complete';
    const userId = session.metadata?.userId || '';
    const productKey = session.metadata?.productKey as ProductKey | undefined;
    if (!paid || !userId || !productKey) {
      return NextResponse.json({ ok: false, error: 'Session not completed' }, { status: 409 });
    }

    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || '';

    if (session.mode === 'subscription' && session.subscription && typeof session.subscription !== 'string') {
      const sub = session.subscription;
      const periodEnd = new Date((sub.current_period_end || 0) * 1000);
      await upsertSubscriptionFromEvent({
        userId, productKey, stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        stripePriceId: sub.items.data[0]?.price?.id,
        status: sub.status,
        isOneTime: false,
        accessUntil: periodEnd,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      });
    } else {
      // One-time pass (day/week). Grant accessDays from the catalog.
      const accessDays = findProduct(productKey)?.prices.find((p) => !p.isRecurring)?.accessDays
        || Number(session.metadata?.accessDays || '1');
      const paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
      await upsertSubscriptionFromEvent({
        userId, productKey, stripeCustomerId: customerId,
        stripePaymentIntentId: paymentIntentId,
        status: 'one_time',
        isOneTime: true,
        accessUntil: new Date(Date.now() + accessDays * 24 * 60 * 60 * 1000),
        amountPaidCents: session.amount_total ?? undefined,
        currency: session.currency || 'usd',
      });
    }

    const entitlements = await getUserEntitlements(userId);
    const res = NextResponse.json({
      ok: true,
      productKeys: Array.from(entitlements.productKeys),
    });
    // Bind this browser to the userId server-side so /api/account/me can trust the cookie
    // instead of a query param. 400 days so access persists across visits.
    res.cookies.set('himothy_uid', userId, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 400 * 24 * 60 * 60,
    });
    return res;
  } catch (err: any) {
    console.error('account/confirm error', err?.message);
    return NextResponse.json({ ok: false, error: err?.message || 'Confirm failed' }, { status: 500 });
  }
}
