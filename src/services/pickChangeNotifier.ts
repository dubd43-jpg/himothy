// PICK-CHANGE EMAIL NOTIFICATIONS
//
// When a pick is added, modified, replaced, or pulled — fire an email to:
//   1. The owner (always — operational visibility)
//   2. Active subscribers (Stripe entitlement = active) — when the subscription
//      tier exists. Until subscriptions launch, only the owner is notified.
//
// Called from the pick mutation paths (registry insert/update, admin force-regen,
// late-scratch detection).

import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';
import { sendEmail } from '@/lib/email';

const OWNER_EMAIL = 'rentalsgradea@gmail.com';

export type PickChangeKind = 'ADDED' | 'UPDATED' | 'REPLACED' | 'PULLED' | 'LATE_SCRATCH';

export interface PickChangeNotice {
  kind: PickChangeKind;
  category: string;          // GRAND_SLAM, PRESSURE_PACK, MARQUEE, etc.
  gameId: string;
  eventName: string;
  selection: string;
  odds?: string | null;
  reason?: string | null;    // why this change happened
  previousSelection?: string | null;
  triggeredBy?: string;      // cron name, admin user, system
}

// Map registry category → product key (used to filter Subscription / Entitlement rows).
// Owner directive 2026-06-05: "no customer that does not have a subscription should be
// getting these emails. If you have grand slam subscription, you should get only grand
// slam unless you buy the other ones as well." So we filter recipients by which product
// the pick belongs to.
const CATEGORY_TO_PRODUCT_KEY: Record<string, string> = {
  GRAND_SLAM: 'grand_slam',
  PRESSURE_PACK: 'pressure_pack',
  VIP_4_PACK: 'vip_4_pack',
  PARLAY_PLAN: 'parlay_plan',
  MARQUEE: 'big_games',
  BIG_GAMES: 'big_games',
  ASLEEP_PICKS: 'sleeper_picks',
  NRFI: 'nrfi',
  PERIOD_PLAYS: 'period_plays',
  HAILMARY: 'power_10',
  POWER_20: 'power_20',
  POWER_10: 'power_10',
  PERSONAL_PICK: 'himothy_personal',
};

// Bundles grant access to multiple products. When a bundle is active, its
// included product keys count as subscribed. Source of truth: src/lib/products.ts.
const BUNDLE_INCLUDES: Record<string, string[]> = {
  all_access: ['grand_slam','pressure_pack','vip_4_pack','power_20','power_10','parlay_plan','big_games','sleeper_picks','sport_parlays','value_plays','period_plays','nrfi'],
  flagship_pack: ['grand_slam','pressure_pack','vip_4_pack'],
  parlay_pack: ['power_20','power_10','parlay_plan','sport_parlays'],
};

function expandBundleProductKey(key: string): string[] {
  return BUNDLE_INCLUDES[key] ? BUNDLE_INCLUDES[key] : [key];
}

// Pull customer emails for a SPECIFIC product. Returns only customers whose
// active subscription includes that product (direct or via a bundle).
async function getSubscriberEmails(productCategory: string): Promise<string[]> {
  if (!hasDatabase()) return [];
  const targetKey = CATEGORY_TO_PRODUCT_KEY[productCategory];
  if (!targetKey) return []; // unknown category → no emails (safer than spam)

  const emails = new Set<string>();

  // Source 1: Subscription table (canonical source — Stripe-active rows).
  // Pull all distinct subscribed productKeys per email + expand bundles.
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ email: string; productKey: string }>>(
      `SELECT DISTINCT u.email, s."productKey"
         FROM "User" u
         JOIN "Subscription" s ON s."userId" = u.id
        WHERE u.email IS NOT NULL AND u.email <> ''
          AND s."accessUntil" > NOW()`,
    );
    for (const r of rows) {
      const expanded = expandBundleProductKey(r.productKey);
      if (expanded.includes(targetKey)) emails.add(r.email);
    }
  } catch { /* tables may not exist */ }

  // Source 2: Entitlement (older path; some customers may live here).
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ email: string; productKey: string }>>(
      `SELECT DISTINCT email, "productKey"
         FROM "Entitlement"
        WHERE status = 'active'
          AND notifications_opt_in = TRUE
          AND email IS NOT NULL AND email <> ''`,
    );
    for (const r of rows) {
      const expanded = expandBundleProductKey(r.productKey);
      if (expanded.includes(targetKey)) emails.add(r.email);
    }
  } catch { /* table may not exist */ }

  return Array.from(emails);
}

function renderHtml(notice: PickChangeNotice): string {
  const kindLabel: Record<PickChangeKind, string> = {
    ADDED: 'New pick posted',
    UPDATED: 'Pick updated',
    REPLACED: 'Pick replaced',
    PULLED: 'Pick pulled',
    LATE_SCRATCH: '⚠️ Late scratch — pick re-evaluated',
  };
  const headline = kindLabel[notice.kind];
  const body: string[] = [];
  body.push(`<h2 style="margin:0 0 12px 0;font-size:18px;font-weight:900">${headline}</h2>`);
  body.push(`<p style="margin:0 0 6px 0;color:#9ca3af;font-size:13px">${notice.category} · ${notice.eventName}</p>`);
  body.push(`<p style="margin:8px 0 0 0;font-size:15px;font-weight:700">${notice.selection}${notice.odds ? ` <span style="color:#9ca3af">(${notice.odds})</span>` : ''}</p>`);
  if (notice.previousSelection && notice.kind === 'REPLACED') {
    body.push(`<p style="margin:6px 0 0 0;color:#9ca3af;font-size:12px"><s>${notice.previousSelection}</s></p>`);
  }
  if (notice.reason) {
    body.push(`<p style="margin:14px 0 0 0;color:#d1d5db;font-size:13px;line-height:1.6">${notice.reason}</p>`);
  }
  body.push(`<p style="margin:20px 0 0 0;color:#6b7280;font-size:11px">himothypicks.com${notice.triggeredBy ? ` · ${notice.triggeredBy}` : ''}</p>`);
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#e5e7eb;padding:24px;border-radius:16px">
${body.join('\n')}
</div>`.trim();
}

// Fire-and-forget — never throws. Call from anywhere that mutates a pick.
// 2026-06-05: recipients are filtered by subscription tier. A customer only
// gets pick-change emails for products they're subscribed to (direct or via
// bundle). Owner is always copied for operational visibility.
export async function notifyPickChange(notice: PickChangeNotice): Promise<void> {
  try {
    const subscribers = await getSubscriberEmails(notice.category);
    // Owner always included for operational visibility regardless of subscription.
    const recipients = Array.from(new Set([OWNER_EMAIL, ...subscribers]));
    const subject = `[HIMOTHY] ${notice.kind === 'LATE_SCRATCH' ? '⚠️ ' : ''}${notice.category}: ${notice.selection}`;
    const html = renderHtml(notice);
    // Single send to ALL — Gmail caps ~500 recipients per email. Past that we'd batch.
    await sendEmail({ to: recipients, subject, html, replyTo: OWNER_EMAIL });
  } catch (err) {
    console.error('[notifyPickChange] failed', err);
  }
}
