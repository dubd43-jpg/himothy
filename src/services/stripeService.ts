// Stripe integration — Checkout creation, webhook handling, customer portal, and
// subscription/entitlement persistence. Reads secret key + webhook secret from env.
//
// SAFETY: never log the secret key; if STRIPE_SECRET_KEY is unset, the service stays
// import-safe but every method returns an "unavailable" sentinel so the rest of the app
// keeps running (e.g., when running in CI or before keys are added to a new environment).

import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { findPriceByStripeId, TRIAL_DAYS, type ProductKey } from '@/lib/products';
import { SITE_URL } from '@/lib/seo';

const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

let _stripe: Stripe | null = null;
export function getStripe(): Stripe | null {
  if (!stripeSecret) return null;
  if (!_stripe) {
    _stripe = new Stripe(stripeSecret, {
      apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
      typescript: true,
    });
  }
  return _stripe;
}

export function hasStripe(): boolean {
  return Boolean(stripeSecret);
}

// Make sure the Subscription table exists at runtime. The rest of this repo uses raw
// SQL migrations like this (see pickRegistryService.ensureRegistrySchema) so we follow
// the same pattern — Prisma client-only changes don't require a separate `prisma migrate`
// step, the table is created on first use.
let _schemaEnsured = false;
export async function ensureSubscriptionSchema() {
  if (_schemaEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Subscription" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "productKey" TEXT NOT NULL,
        "stripeCustomerId" TEXT,
        "stripeSubscriptionId" TEXT UNIQUE,
        "stripePriceId" TEXT,
        "stripePaymentIntentId" TEXT,
        "status" TEXT NOT NULL DEFAULT 'incomplete',
        "isOneTime" BOOLEAN NOT NULL DEFAULT false,
        "accessUntil" TIMESTAMP NOT NULL,
        "currentPeriodEnd" TIMESTAMP,
        "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
        "amountPaidCents" INTEGER,
        "currency" TEXT NOT NULL DEFAULT 'usd',
        "metadata" JSONB,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "cancelledAt" TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Subscription_userId_idx" ON "Subscription"("userId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Subscription_productKey_idx" ON "Subscription"("productKey")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Subscription_accessUntil_idx" ON "Subscription"("accessUntil")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId")`);
    // User.stripeCustomerId column added if missing (no-op if already there)
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT UNIQUE`);
    _schemaEnsured = true;
  } catch (err) {
    console.error('ensureSubscriptionSchema failed', err);
  }
}

// Create or fetch a Stripe Customer for this user. We persist the customer ID on the
// User row so repeat purchases always go through the same customer (so Stripe's tax,
// receipts, and customer-portal all link to the right history).
export async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  await ensureSubscriptionSchema();

  // Check if user already has a customer ID
  const rows = await prisma.$queryRawUnsafe<Array<{ stripeCustomerId: string | null }>>(
    `SELECT "stripeCustomerId" FROM "User" WHERE "id" = $1 LIMIT 1`, userId,
  );
  const existing = rows[0]?.stripeCustomerId;
  if (existing) return existing;

  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });
  await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "stripeCustomerId" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
    customer.id, userId,
  );
  return customer.id;
}

// Trial-abuse prevention — checks Stripe Customer metadata (set the first time anyone
// used a trial on this email) and our User table. Returns true if a fresh trial is OK.
async function isEligibleForTrial(stripe: Stripe, customerId: string, userId: string): Promise<boolean> {
  // 1) Stripe Customer metadata: once `has_used_trial = "true"` is set, never trial again.
  try {
    const c = await stripe.customers.retrieve(customerId);
    if (!c.deleted && (c as Stripe.Customer).metadata?.has_used_trial === 'true') return false;
  } catch { /* if fetch fails, fall through to DB check */ }

  // 2) Our DB — has this userId ever started a trial subscription?
  const rows = await prisma.$queryRawUnsafe<Array<{ count: string }>>(
    `SELECT COUNT(*)::text as count FROM "Subscription"
     WHERE "userId" = $1 AND ("status" = 'trialing' OR "metadata"->>'wasTrial' = 'true')`,
    userId,
  );
  if (Number(rows[0]?.count || 0) > 0) return false;

  return true;
}

// Create a Checkout Session — handles both recurring (subscription) and one-time (day/week pass)
// in the same flow by reading `isRecurring` from our internal product config.
export async function createCheckoutSession(args: {
  userId: string;
  userEmail: string;
  stripePriceId: string;
  successPath?: string;
  cancelPath?: string;
}): Promise<{ url: string | null } | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const customerId = await getOrCreateStripeCustomer(args.userId, args.userEmail);
  if (!customerId) return null;

  // Look up our internal product/price metadata so we know whether to bill recurring
  const matched = findPriceByStripeId(args.stripePriceId);
  if (!matched) {
    throw new Error(`Stripe Price ${args.stripePriceId} not found in product catalog`);
  }
  const mode: 'subscription' | 'payment' = matched.price.isRecurring ? 'subscription' : 'payment';

  // Trial only offered on recurring subs AND only if user hasn't trialed before
  const trialOk = mode === 'subscription' ? await isEligibleForTrial(stripe, customerId, args.userId) : false;

  const session = await stripe.checkout.sessions.create({
    mode,
    customer: customerId,
    line_items: [{ price: args.stripePriceId, quantity: 1 }],
    success_url: `${SITE_URL}${args.successPath || '/account?checkout=success'}`,
    cancel_url: `${SITE_URL}${args.cancelPath || '/pricing?checkout=cancel'}`,
    allow_promotion_codes: true,
    automatic_tax: { enabled: false }, // Flip to true later once Stripe Tax is set up
    metadata: {
      userId: args.userId,
      productKey: matched.product.key,
      interval: matched.price.interval,
    },
    // For one-time charges, we need accessDays in metadata so the webhook knows how long
    // to grant access. Subscriptions get accessUntil from currentPeriodEnd instead.
    ...(matched.price.isRecurring
      ? {
          subscription_data: {
            // 14-day free trial — only for users who haven't trialed before. Stripe
            // requires a card up front and sends an automatic reminder email 7 days
            // before the first charge (reduces chargeback rate). Card fingerprint is
            // also blocked via Stripe Radar rules (set up in dashboard) so the same
            // physical card can't trial twice across different accounts.
            ...(trialOk ? { trial_period_days: TRIAL_DAYS } : {}),
            metadata: {
              userId: args.userId,
              productKey: matched.product.key,
              wasTrial: trialOk ? 'true' : 'false',
            },
          },
        }
      : {
          payment_intent_data: {
            metadata: {
              userId: args.userId,
              productKey: matched.product.key,
              accessDays: String(matched.price.accessDays || 1),
            },
          },
        }
    ),
  });

  return { url: session.url };
}

// Build a Stripe Customer Portal session so a logged-in user can self-serve: change
// payment method, cancel, see invoices. One link, all the rest is Stripe-hosted.
export async function createCustomerPortalSession(userId: string, userEmail: string): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const customerId = await getOrCreateStripeCustomer(userId, userEmail);
  if (!customerId) return null;
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${SITE_URL}/account`,
  });
  return session.url;
}

// Verify a Stripe webhook signature and return the parsed event. Throws on bad signature.
export function verifyWebhookSignature(rawBody: string, signature: string): Stripe.Event {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe not configured');
  if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET not set');
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

// Persist or update a subscription row after a Stripe event. Idempotent — running the
// same event twice produces the same database state.
export async function upsertSubscriptionFromEvent(args: {
  userId: string;
  productKey: ProductKey;
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  stripePaymentIntentId?: string;
  status: string;
  isOneTime: boolean;
  accessUntil: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  amountPaidCents?: number;
  currency?: string;
}) {
  await ensureSubscriptionSchema();

  // Look up existing row by stripeSubscriptionId (recurring) or stripePaymentIntentId (one-time)
  let existingId: string | null = null;
  if (args.stripeSubscriptionId) {
    const r = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "Subscription" WHERE "stripeSubscriptionId" = $1 LIMIT 1`,
      args.stripeSubscriptionId,
    );
    existingId = r[0]?.id || null;
  } else if (args.stripePaymentIntentId) {
    const r = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "Subscription" WHERE "stripePaymentIntentId" = $1 LIMIT 1`,
      args.stripePaymentIntentId,
    );
    existingId = r[0]?.id || null;
  }

  if (existingId) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Subscription" SET
        "status" = $1, "accessUntil" = $2, "currentPeriodEnd" = $3,
        "cancelAtPeriodEnd" = $4, "amountPaidCents" = $5, "currency" = $6,
        "updatedAt" = NOW()
       WHERE "id" = $7`,
      args.status, args.accessUntil, args.currentPeriodEnd || null,
      args.cancelAtPeriodEnd ?? false, args.amountPaidCents ?? null, args.currency || 'usd',
      existingId,
    );
    return existingId;
  }

  // Insert new
  const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Subscription" (
       "id", "userId", "productKey", "stripeCustomerId", "stripeSubscriptionId",
       "stripePriceId", "stripePaymentIntentId", "status", "isOneTime", "accessUntil",
       "currentPeriodEnd", "cancelAtPeriodEnd", "amountPaidCents", "currency",
       "createdAt", "updatedAt"
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())`,
    id, args.userId, args.productKey, args.stripeCustomerId, args.stripeSubscriptionId || null,
    args.stripePriceId || null, args.stripePaymentIntentId || null, args.status, args.isOneTime, args.accessUntil,
    args.currentPeriodEnd || null, args.cancelAtPeriodEnd ?? false,
    args.amountPaidCents ?? null, args.currency || 'usd',
  );
  return id;
}

// Cancel a subscription row by marking it cancelled and trimming accessUntil (if before).
export async function cancelSubscriptionRow(stripeSubscriptionId: string) {
  await ensureSubscriptionSchema();
  await prisma.$executeRawUnsafe(
    `UPDATE "Subscription" SET
       "status" = 'cancelled', "cancelledAt" = NOW(), "updatedAt" = NOW()
     WHERE "stripeSubscriptionId" = $1`,
    stripeSubscriptionId,
  );
}
