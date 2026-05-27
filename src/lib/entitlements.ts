// Server-side access gate. Single function answers: does this user have access to this
// product right now? Reads from the Subscription table and just checks accessUntil > now.
//
// Whether the subscription is recurring or one-time (day pass), cancelled or active,
// the source of truth is the accessUntil timestamp — set by the webhook handler when
// a payment lands. Past expiration = no access, period.
//
// TRIAL BEHAVIOR (per user spec):
//   Days 1-2 of trial:   Pressure Pack only (lead with the wow product)
//   Days 3-14 of trial:  HIMOTHY Pick + VIP 4-Pack + Power 20 + Power 10 (breadth tasting)
//   Any day:             Grand Slam, IF it drops (rare event)
//   Trial users do NOT see Trends/Edges/Asleep (those are yearly-paid only)

import { prisma } from '@/lib/prisma';
import { ensureSubscriptionSchema } from '@/services/stripeService';
import type { ProductKey } from '@/lib/products';

// Day-restricted trial product mapping. Active trial subscriptions (status='trialing')
// substitute their actual single-product entitlement for this rolling sampler.
//
// Note: Grand Slam and HIMOTHY Personal Pick are NOT in the trial sampler — both are
// rare-drop high-conviction products. They appear during trial only if they actually
// fire (handled separately in the picks API by checking trial-active status).
function trialProductsForDay(daysIntoTrial: number): ProductKey[] {
  // Day 0 = first 24 hours, Day 1 = second 24 hours, so "first 2 days" = daysIntoTrial 0 or 1
  if (daysIntoTrial < 2) return ['pressure_pack'];
  if (daysIntoTrial < 14) return ['vip_4_pack', 'power_20', 'power_10'];
  return [];
}

export interface UserEntitlements {
  userId: string;
  productKeys: Set<ProductKey>;
  details: Array<{
    productKey: ProductKey;
    accessUntil: Date;
    isOneTime: boolean;
    status: string;
  }>;
}

// Pulls all active entitlements for a user. Active = accessUntil > now.
// Cancelled-but-still-in-period subscriptions stay active until accessUntil passes —
// customers paid for the period and we honor it.
export async function getUserEntitlements(userId: string): Promise<UserEntitlements> {
  await ensureSubscriptionSchema();
  if (!userId) return { userId: '', productKeys: new Set(), details: [] };

  const rows = await prisma.$queryRawUnsafe<Array<{
    productKey: string;
    accessUntil: Date;
    isOneTime: boolean;
    status: string;
    createdAt: Date;
  }>>(
    `SELECT "productKey", "accessUntil", "isOneTime", "status", "createdAt"
     FROM "Subscription"
     WHERE "userId" = $1 AND "accessUntil" > NOW()
     ORDER BY "accessUntil" DESC`,
    userId,
  );

  const productKeys = new Set<ProductKey>();
  const details: UserEntitlements['details'] = [];

  for (const r of rows) {
    // For trial subscriptions, substitute the actual product with the day-restricted
    // trial sampler (see trialProductsForDay above). The Stripe Subscription has a
    // single Price selected, but during the trial we let them taste multiple products.
    if (r.status === 'trialing') {
      const daysIntoTrial = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / (24 * 60 * 60 * 1000));
      const trialProducts = trialProductsForDay(daysIntoTrial);
      for (const tk of trialProducts) {
        if (!productKeys.has(tk)) {
          productKeys.add(tk);
          details.push({ productKey: tk, accessUntil: r.accessUntil, isOneTime: false, status: 'trialing' });
        }
      }
      continue;
    }
    productKeys.add(r.productKey as ProductKey);
    details.push({
      productKey: r.productKey as ProductKey,
      accessUntil: r.accessUntil,
      isOneTime: r.isOneTime,
      status: r.status,
    });
  }

  return { userId, productKeys, details };
}

// Single product check — convenience wrapper.
export async function hasAccessTo(userId: string, productKey: ProductKey): Promise<boolean> {
  const e = await getUserEntitlements(userId);
  return e.productKeys.has(productKey);
}

// During an active trial, when a Grand Slam or HIMOTHY Personal Pick drops, the trial
// user gets ONE-day access to that pick. Tracks consumption per product per trial so
// they can't farm multiple drops — once they've claimed the Grand Slam bonus during
// this trial, future drops are paywalled until they convert.
//
// Implementation note: the picks API checks `isTrialActive(userId)` + counts how many
// rare-drop unlocks they've used via the Subscription metadata.bonusGrants field.
export async function isTrialActive(userId: string): Promise<boolean> {
  await ensureSubscriptionSchema();
  const rows = await prisma.$queryRawUnsafe<Array<{ count: string }>>(
    `SELECT COUNT(*)::text as count FROM "Subscription"
     WHERE "userId" = $1 AND "status" = 'trialing' AND "accessUntil" > NOW()`,
    userId,
  );
  return Number(rows[0]?.count || 0) > 0;
}

// "Yearly Member" benefit — any active annual subscription on ANY product unlocks the
// research moat tools (Trends, Edges, Asleep Picks, Hot Tendencies). The pricing page
// advertises this as the annual upgrade incentive.
//
// Detected by checking the row's stripePriceId against the catalog: if any active
// row's price has interval 'one_year', the user is a yearly member.
export async function hasYearlyAccess(userId: string): Promise<boolean> {
  await ensureSubscriptionSchema();
  if (!userId) return false;
  const rows = await prisma.$queryRawUnsafe<Array<{ stripePriceId: string | null }>>(
    `SELECT "stripePriceId" FROM "Subscription"
     WHERE "userId" = $1 AND "accessUntil" > NOW() AND "isOneTime" = false
     LIMIT 50`,
    userId,
  );
  if (rows.length === 0) return false;
  // Look up each row's price and check the interval — yearly = unlocks moat tools.
  const { findPriceByStripeId } = await import('@/lib/products');
  for (const r of rows) {
    if (!r.stripePriceId) continue;
    const matched = findPriceByStripeId(r.stripePriceId);
    if (matched?.price.interval === 'one_year') return true;
  }
  return false;
}

// Useful for the picks-board API: filter premium picks out for free users.
export async function filterPicksByAccess<T extends { tier?: string; isAsleepPick?: boolean }>(
  userId: string | null,
  picks: T[],
  productKeyForTier: (tier?: string) => ProductKey | null,
): Promise<{ accessible: T[]; lockedCount: number }> {
  if (!userId) {
    // No user → still show everything by default (the UI handles teaser/lock state).
    // The gate matters on the per-pick reveal page, not the board summary.
    return { accessible: picks, lockedCount: 0 };
  }
  const entitlements = await getUserEntitlements(userId);
  let lockedCount = 0;
  const accessible = picks.filter((p) => {
    const productKey = productKeyForTier(p.tier);
    if (!productKey) return true; // No gate required
    if (entitlements.productKeys.has(productKey)) return true;
    lockedCount++;
    return false;
  });
  return { accessible, lockedCount };
}
