import { NextResponse } from 'next/server';
import { createCheckoutSession, hasStripe } from '@/services/stripeService';
import { findProduct, type ProductKey } from '@/lib/products';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// POST /api/stripe/checkout
// Body: { productKey: ProductKey, interval: 'one_day'|'one_week'|'one_month'|'one_year' }
// Returns: { url: <Stripe Checkout URL> } — frontend redirects to that URL.
//
// User identification: for now we read userId + email from request body. When auth is
// wired up, swap to read from the session (NextAuth or similar). The Stripe customer
// is keyed off the userId so repeat purchases go through one Stripe customer record.

export async function POST(req: Request) {
  if (!hasStripe()) {
    return NextResponse.json(
      { error: 'Stripe not configured. Set STRIPE_SECRET_KEY env var.' },
      { status: 503 },
    );
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { productKey, interval, userId, email } = body as {
    productKey: ProductKey; interval: string; userId: string; email: string;
  };
  if (!productKey || !interval || !userId || !email) {
    return NextResponse.json({ error: 'Missing productKey, interval, userId, or email' }, { status: 400 });
  }

  const product = findProduct(productKey);
  if (!product) return NextResponse.json({ error: `Unknown product: ${productKey}` }, { status: 404 });
  const price = product.prices.find((p) => p.interval === interval);
  if (!price || !price.stripePriceId) {
    return NextResponse.json(
      { error: `Price not configured for ${productKey} @ ${interval}. Set STRIPE_PRICE_* env vars.` },
      { status: 503 },
    );
  }

  try {
    const result = await createCheckoutSession({
      userId, userEmail: email,
      stripePriceId: price.stripePriceId,
      successPath: `/account?checkout=success&product=${productKey}`,
      cancelPath: `/pricing?checkout=cancel&product=${productKey}`,
    });
    if (!result?.url) return NextResponse.json({ error: 'Checkout session creation failed' }, { status: 500 });
    return NextResponse.json({ url: result.url });
  } catch (err: any) {
    console.error('Checkout error', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
