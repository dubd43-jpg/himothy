import { NextResponse } from 'next/server';
import {
  verifyWebhookSignature,
  upsertSubscriptionFromEvent,
  cancelSubscriptionRow,
  hasStripe,
} from '@/services/stripeService';
import { findPriceByStripeId, type ProductKey } from '@/lib/products';
import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
// Stripe requires the raw body to verify the signature — Next.js gives us text() directly.

// POST /api/stripe/webhook
// Configured in Stripe Dashboard → Developers → Webhooks with URL
// https://himothypicks.com/api/stripe/webhook and the events listed below.
// The webhook signing secret goes in env: STRIPE_WEBHOOK_SECRET.
//
// Events handled:
//   - checkout.session.completed         → first payment (one-time pass or first sub charge)
//   - customer.subscription.created      → new recurring sub
//   - customer.subscription.updated      → status/period change
//   - customer.subscription.deleted      → final cancellation
//   - invoice.paid                       → renewal succeeded; extend accessUntil
//   - invoice.payment_failed             → payment failed; let access lapse naturally

export async function POST(req: Request) {
  if (!hasStripe()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }
  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = verifyWebhookSignature(rawBody, signature);
  } catch (err: any) {
    console.error('Webhook signature verification failed', err?.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await cancelSubscriptionRow(sub.id);
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          // Re-fetch the subscription so we have the freshest currentPeriodEnd
          const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id;
          await handleInvoiceForSubscription(subId, invoice);
        }
        break;
      }
      case 'invoice.payment_failed':
        // We don't immediately revoke — let access lapse on accessUntil. Stripe will retry.
        break;
      default:
        // Other events ignored
        break;
    }
  } catch (err) {
    console.error('Webhook handler error', err);
    // Return 200 anyway so Stripe doesn't retry the same broken event forever
  }

  return NextResponse.json({ received: true });
}

// One-time charges (day/week passes) come through as checkout.session.completed with
// mode=payment. Recurring subs also fire this but mode=subscription — we let the
// customer.subscription.* events handle those, so here we only act on `mode=payment`.
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== 'payment') return; // subs handled elsewhere

  const userId = session.metadata?.userId;
  const productKey = session.metadata?.productKey as ProductKey | undefined;
  const accessDays = Number(session.metadata?.accessDays || '1');
  if (!userId || !productKey) {
    console.warn('checkout.session.completed missing userId or productKey', { sessionId: session.id });
    return;
  }
  const accessUntil = new Date(Date.now() + accessDays * 24 * 60 * 60 * 1000);
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || '';
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

  await upsertSubscriptionFromEvent({
    userId,
    productKey,
    stripeCustomerId: customerId,
    stripePaymentIntentId: paymentIntentId,
    status: 'one_time',
    isOneTime: true,
    accessUntil,
    amountPaidCents: session.amount_total ?? undefined,
    currency: session.currency || 'usd',
  });
}

// Subscription state changed — update our row. accessUntil mirrors currentPeriodEnd so the
// gate works without polling Stripe. ALSO: when the subscription is `trialing`, set
// `has_used_trial = "true"` on the Stripe Customer so they can't trial again from any
// future signup with the same Stripe customer record.
async function handleSubscriptionChange(sub: Stripe.Subscription) {
  const userId = sub.metadata?.userId;
  const productKey = (sub.metadata?.productKey as ProductKey | undefined);
  if (!userId || !productKey) {
    console.warn('subscription event missing userId/productKey metadata', { subId: sub.id });
    return;
  }
  const priceId = sub.items.data[0]?.price?.id;
  const periodEnd = new Date((sub.current_period_end || 0) * 1000);
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  // Mark trial as used on the Stripe Customer (one-way flag).
  if (sub.status === 'trialing') {
    try {
      const { getStripe } = await import('@/services/stripeService');
      const stripe = getStripe();
      if (stripe) {
        await stripe.customers.update(customerId, {
          metadata: { has_used_trial: 'true', trial_started_at: new Date().toISOString() },
        });
      }
    } catch (err) {
      console.error('Failed to mark customer.has_used_trial', err);
    }
  }

  await upsertSubscriptionFromEvent({
    userId,
    productKey,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    status: sub.status,
    isOneTime: false,
    accessUntil: periodEnd,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  });
}

// On successful renewal, push accessUntil forward to the new period end. Same upsert
// path as subscription-change so renewals stay idempotent.
async function handleInvoiceForSubscription(subscriptionId: string, _invoice: Stripe.Invoice) {
  // We could re-fetch the subscription via Stripe API, but the subscription.updated event
  // will also fire for renewals — so this handler is mostly a no-op safeguard.
  // (Left here to make the routing explicit for future logging / receipts work.)
  void subscriptionId;
}
