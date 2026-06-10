// SUBSCRIPTION + RECEIPT EMAILER
//
// Fires on every Stripe webhook event that creates, renews, refunds, or
// cancels a customer's access. Owner directive 2026-06-05:
//
//   "When someone subscribes, send them a welcome email. Also a real receipt
//    with the full breakdown — amount, what they bought, when access ends.
//    Notify ME when a customer subscribes or pays. Not just a 'thanks'."
//
// Two emails per event:
//   1. CUSTOMER — receipt or lifecycle notice
//   2. OWNER (rentalsgradea@gmail.com) — operational notification
//
// Both fire-and-forget. Webhook handler stays the source of truth for
// database writes; this service ONLY handles email rendering + sending.

import { sendEmail } from '@/lib/email';
import { findProduct, type ProductKey } from '@/lib/products';

const OWNER_EMAIL = 'rentalsgradea@gmail.com';

export interface NewSubscriptionEvent {
  customerEmail: string | null;
  productKey?: ProductKey;
  bundleKey?: string;
  includesProducts?: string[]; // for bundles
  amountPaidCents?: number | null;
  currency?: string;
  isOneTime: boolean;
  accessUntilIso: string;
  stripeSubscriptionId?: string;
  stripeSessionId?: string;
}

export interface RenewalEvent {
  customerEmail: string | null;
  productKey?: ProductKey;
  bundleKey?: string;
  amountPaidCents?: number | null;
  currency?: string;
  newAccessUntilIso: string;
  stripeSubscriptionId: string;
}

export interface CancellationEvent {
  customerEmail: string | null;
  productKey?: ProductKey;
  bundleKey?: string;
  accessUntilIso: string | null; // null = revoked immediately
  reason: 'cancelled' | 'refunded' | 'disputed' | 'paused';
  stripeSubscriptionId?: string;
}

function formatMoney(cents: number | null | undefined, currency = 'usd'): string {
  if (cents == null || !isFinite(cents)) return '—';
  const dollars = cents / 100;
  const sym = currency.toLowerCase() === 'usd' ? '$' : currency.toUpperCase() + ' ';
  return `${sym}${dollars.toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: 'America/New_York',
    });
  } catch {
    return iso;
  }
}

function productLabel(productKey?: ProductKey, bundleKey?: string, includes?: string[]): string {
  if (bundleKey) {
    const includedNames = (includes || []).map((k) => findProduct(k as ProductKey)?.name).filter(Boolean).join(', ');
    return `${bundleKey} bundle${includedNames ? ` (${includedNames})` : ''}`;
  }
  if (productKey) {
    const p = findProduct(productKey);
    return p?.name || productKey;
  }
  return 'HIMOTHY Subscription';
}

// ─── Customer-facing email: receipt + welcome ─────────────────────────────

function customerReceiptHtml(e: NewSubscriptionEvent): string {
  const product = productLabel(e.productKey, e.bundleKey, e.includesProducts);
  const amount = formatMoney(e.amountPaidCents, e.currency);
  const accessUntilLabel = formatDate(e.accessUntilIso);
  const renewalCopy = e.isOneTime
    ? `<p style="margin:14px 0 0 0;color:#9ca3af;font-size:13px">This is a one-time purchase. Your access runs through the date above and won't auto-renew.</p>`
    : `<p style="margin:14px 0 0 0;color:#9ca3af;font-size:13px">This is a recurring subscription. We'll charge ${amount} on each renewal and email you a receipt every time.</p>`;
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#e5e7eb;padding:24px;border-radius:16px">
  <h2 style="margin:0 0 6px 0;font-size:20px;font-weight:900">Welcome to HIMOTHY 🏆</h2>
  <p style="margin:0 0 20px 0;color:#9ca3af;font-size:13px">Your subscription is active. Receipt below.</p>

  <div style="background:#111827;border-radius:12px;padding:18px;margin-bottom:18px">
    <div style="font-size:11px;font-weight:900;letter-spacing:0.1em;color:#10b981;text-transform:uppercase;margin-bottom:8px">Receipt</div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#e5e7eb">
      <tr><td style="padding:6px 0;color:#9ca3af">Product</td><td style="padding:6px 0;text-align:right;font-weight:700">${product}</td></tr>
      <tr><td style="padding:6px 0;color:#9ca3af">Amount paid</td><td style="padding:6px 0;text-align:right;font-weight:700">${amount}</td></tr>
      <tr><td style="padding:6px 0;color:#9ca3af">Type</td><td style="padding:6px 0;text-align:right;font-weight:700">${e.isOneTime ? 'One-time pass' : 'Recurring subscription'}</td></tr>
      <tr><td style="padding:6px 0;color:#9ca3af">Access through</td><td style="padding:6px 0;text-align:right;font-weight:700">${accessUntilLabel}</td></tr>
      ${e.stripeSessionId ? `<tr><td style="padding:6px 0;color:#9ca3af">Reference</td><td style="padding:6px 0;text-align:right;font-family:monospace;font-size:12px;color:#6b7280">${e.stripeSessionId}</td></tr>` : ''}
    </table>
  </div>

  ${renewalCopy}

  <div style="margin:24px 0 0 0;padding-top:18px;border-top:1px solid #1f2937;color:#6b7280;font-size:12px">
    <p style="margin:0">Questions about your subscription? Reply to this email — we read every message at <a href="mailto:${OWNER_EMAIL}" style="color:#10b981">${OWNER_EMAIL}</a>.</p>
    <p style="margin:8px 0 0 0">Manage your subscription anytime via the Stripe customer portal link in your account page on himothypicks.com.</p>
  </div>
</div>`.trim();
}

function customerRenewalHtml(e: RenewalEvent): string {
  const product = productLabel(e.productKey, e.bundleKey);
  const amount = formatMoney(e.amountPaidCents, e.currency);
  const accessUntilLabel = formatDate(e.newAccessUntilIso);
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#e5e7eb;padding:24px;border-radius:16px">
  <h2 style="margin:0 0 6px 0;font-size:20px;font-weight:900">Renewal receipt</h2>
  <p style="margin:0 0 20px 0;color:#9ca3af;font-size:13px">Your HIMOTHY subscription just renewed.</p>
  <div style="background:#111827;border-radius:12px;padding:18px;margin-bottom:18px">
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#e5e7eb">
      <tr><td style="padding:6px 0;color:#9ca3af">Product</td><td style="padding:6px 0;text-align:right;font-weight:700">${product}</td></tr>
      <tr><td style="padding:6px 0;color:#9ca3af">Amount charged</td><td style="padding:6px 0;text-align:right;font-weight:700">${amount}</td></tr>
      <tr><td style="padding:6px 0;color:#9ca3af">Access extended through</td><td style="padding:6px 0;text-align:right;font-weight:700">${accessUntilLabel}</td></tr>
      <tr><td style="padding:6px 0;color:#9ca3af">Reference</td><td style="padding:6px 0;text-align:right;font-family:monospace;font-size:12px;color:#6b7280">${e.stripeSubscriptionId}</td></tr>
    </table>
  </div>
  <div style="color:#6b7280;font-size:12px">
    <p style="margin:0">Questions? Reply or email <a href="mailto:${OWNER_EMAIL}" style="color:#10b981">${OWNER_EMAIL}</a>.</p>
  </div>
</div>`.trim();
}

function customerCancellationHtml(e: CancellationEvent): string {
  const product = productLabel(e.productKey, e.bundleKey);
  const verb = e.reason === 'refunded' ? 'Refunded'
    : e.reason === 'disputed' ? 'Access revoked (dispute filed)'
    : e.reason === 'paused' ? 'Subscription paused'
    : 'Subscription cancelled';
  const accessCopy = e.accessUntilIso
    ? `<p style="margin:0 0 12px 0;color:#e5e7eb">You still have access until <strong>${formatDate(e.accessUntilIso)}</strong>.</p>`
    : `<p style="margin:0 0 12px 0;color:#f87171"><strong>Access has been revoked effective immediately.</strong></p>`;
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#e5e7eb;padding:24px;border-radius:16px">
  <h2 style="margin:0 0 6px 0;font-size:20px;font-weight:900">${verb}</h2>
  <p style="margin:0 0 20px 0;color:#9ca3af;font-size:13px">${product}</p>
  ${accessCopy}
  <p style="margin:12px 0 0 0;color:#9ca3af;font-size:13px">If this wasn't intentional or you'd like to resubscribe, reply to this email or visit himothypicks.com.</p>
</div>`.trim();
}

// ─── Owner-facing notification ────────────────────────────────────────────

function ownerHtml(headline: string, e: NewSubscriptionEvent | RenewalEvent | CancellationEvent, ev: 'new' | 'renewal' | 'cancellation'): string {
  const product = productLabel((e as any).productKey, (e as any).bundleKey, (e as any).includesProducts);
  const amount = ev !== 'cancellation' ? formatMoney((e as any).amountPaidCents, (e as any).currency) : null;
  const accessIso = ev === 'cancellation' ? (e as CancellationEvent).accessUntilIso
    : ev === 'renewal' ? (e as RenewalEvent).newAccessUntilIso
    : (e as NewSubscriptionEvent).accessUntilIso;
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#e5e7eb;padding:24px;border-radius:16px">
  <h2 style="margin:0 0 6px 0;font-size:18px;font-weight:900">${headline}</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;color:#e5e7eb;margin-top:14px">
    <tr><td style="padding:6px 0;color:#9ca3af">Customer email</td><td style="padding:6px 0;text-align:right;font-weight:700">${e.customerEmail || '(unknown)'}</td></tr>
    <tr><td style="padding:6px 0;color:#9ca3af">Product</td><td style="padding:6px 0;text-align:right;font-weight:700">${product}</td></tr>
    ${amount != null ? `<tr><td style="padding:6px 0;color:#9ca3af">Amount</td><td style="padding:6px 0;text-align:right;font-weight:700">${amount}</td></tr>` : ''}
    <tr><td style="padding:6px 0;color:#9ca3af">Access through</td><td style="padding:6px 0;text-align:right;font-weight:700">${formatDate(accessIso)}</td></tr>
    ${(e as any).stripeSubscriptionId ? `<tr><td style="padding:6px 0;color:#9ca3af">Subscription ID</td><td style="padding:6px 0;text-align:right;font-family:monospace;font-size:12px;color:#6b7280">${(e as any).stripeSubscriptionId}</td></tr>` : ''}
    ${(e as any).stripeSessionId ? `<tr><td style="padding:6px 0;color:#9ca3af">Session ID</td><td style="padding:6px 0;text-align:right;font-family:monospace;font-size:12px;color:#6b7280">${(e as any).stripeSessionId}</td></tr>` : ''}
  </table>
  <p style="margin:16px 0 0 0;color:#6b7280;font-size:11px">View this customer at himothypicks.com/admin/customers</p>
</div>`.trim();
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function emailNewSubscription(e: NewSubscriptionEvent): Promise<void> {
  try {
    const product = productLabel(e.productKey, e.bundleKey, e.includesProducts);
    if (e.customerEmail) {
      await sendEmail({
        to: [e.customerEmail],
        subject: `[HIMOTHY] Welcome — receipt for ${product}`,
        html: customerReceiptHtml(e),
        replyTo: OWNER_EMAIL,
      });
    }
    await sendEmail({
      to: [OWNER_EMAIL],
      subject: `[HIMOTHY · NEW SUBSCRIBER] ${product} — ${formatMoney(e.amountPaidCents, e.currency)}`,
      html: ownerHtml('💸 New subscription', e, 'new'),
      replyTo: OWNER_EMAIL,
    });
  } catch (err) {
    console.error('[emailNewSubscription] failed', err);
  }
}

export async function emailRenewal(e: RenewalEvent): Promise<void> {
  try {
    const product = productLabel(e.productKey, e.bundleKey);
    if (e.customerEmail) {
      await sendEmail({
        to: [e.customerEmail],
        subject: `[HIMOTHY] Renewal receipt — ${product}`,
        html: customerRenewalHtml(e),
        replyTo: OWNER_EMAIL,
      });
    }
    await sendEmail({
      to: [OWNER_EMAIL],
      subject: `[HIMOTHY · RENEWAL] ${product} — ${formatMoney(e.amountPaidCents, e.currency)}`,
      html: ownerHtml('🔁 Subscription renewed', e, 'renewal'),
      replyTo: OWNER_EMAIL,
    });
  } catch (err) {
    console.error('[emailRenewal] failed', err);
  }
}

export async function emailCancellation(e: CancellationEvent): Promise<void> {
  try {
    const product = productLabel(e.productKey, e.bundleKey);
    const headline = e.reason === 'refunded' ? '↩️ Refund issued'
      : e.reason === 'disputed' ? '⚠️ Dispute filed'
      : e.reason === 'paused' ? '⏸ Subscription paused'
      : '👋 Subscription cancelled';
    if (e.customerEmail) {
      await sendEmail({
        to: [e.customerEmail],
        subject: `[HIMOTHY] ${e.reason === 'refunded' ? 'Refund' : 'Subscription update'} — ${product}`,
        html: customerCancellationHtml(e),
        replyTo: OWNER_EMAIL,
      });
    }
    await sendEmail({
      to: [OWNER_EMAIL],
      subject: `[HIMOTHY · ${e.reason.toUpperCase()}] ${product} — ${e.customerEmail || 'unknown'}`,
      html: ownerHtml(headline, e, 'cancellation'),
      replyTo: OWNER_EMAIL,
    });
  } catch (err) {
    console.error('[emailCancellation] failed', err);
  }
}
