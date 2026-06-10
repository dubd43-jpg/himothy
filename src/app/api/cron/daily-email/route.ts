import { NextResponse } from 'next/server';
import { getOrComputeBoard } from '@/services/dailyBoardCache';
import { sendEmail } from '@/lib/email';
import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';
import { isAdminRequest } from '@/lib/adminAuth';
import { getUserEntitlements } from '@/lib/entitlements';
import type { ProductKey } from '@/lib/products';

// DAILY DIGEST EMAIL — owner directive 2026-06-03.
//
// Per-subscriber filtering: each user only gets the sections they pay for.
// A Grand Slam-only subscriber sees ONLY the Grand Slam. The owner gets the
// whole board for ops visibility. Free, non-gated sections (Big Games,
// Sleepers, NRFI, $10 Parlay, Period Plays) go to everyone who opted in.
//
// Cron fires at 12:15 UTC (8:15 AM EDT / 7:15 AM EST), 15min after the
// slate-generation cron at 12:00 UTC.

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const OWNER_EMAIL = 'rentalsgradea@gmail.com';

// Every customer-facing section now has its own product key. Sections only render
// in a subscriber's email when they have access to the matching key. Owner sees all.
interface Section {
  key: ProductKey;
  label: string;
  // Slate field or fetched-extra to read the picks from.
  source: 'board' | 'extras';
  field: string;
}
const SECTIONS: Section[] = [
  { key: 'grand_slam',       label: 'Grand Slam',             source: 'board',  field: 'grandSlam' },
  { key: 'himothy_personal', label: 'HIMOTHY Personal Pick',  source: 'extras', field: 'personalPick' },
  { key: 'pressure_pack',    label: 'Pressure Pack',          source: 'board',  field: 'pressurePack' },
  { key: 'vip_4_pack',       label: 'VIP 4-Pack',             source: 'board',  field: 'vip4Pack' },
  { key: 'power_20',         label: 'Power 20 Parlay',        source: 'extras', field: 'power20' },
  { key: 'power_10',         label: 'Power 10 Parlay',        source: 'extras', field: 'power10' },
  { key: 'parlay_plan',      label: '$10 Parlay Plan',        source: 'board',  field: 'parlayPlan' },
  { key: 'sport_parlays',    label: 'Sport Parlays',          source: 'extras', field: 'sportParlays' },
  { key: 'big_games',        label: "Tonight's Big Games",    source: 'board',  field: 'marquee' },
  { key: 'sleeper_picks',    label: 'Sleeper Picks',          source: 'board',  field: 'asleepPicks' },
  { key: 'nrfi',             label: 'NRFI',                   source: 'board',  field: 'nrfi' },
  { key: 'value_plays',      label: 'Value Plays',            source: 'board',  field: 'valuePlays' },
  { key: 'period_plays',     label: 'Period Plays',           source: 'extras', field: 'periodPlays' },
];

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  return isAdminRequest(req);
}

interface SubscriberRow {
  userId: string;
  email: string;
}

// Batch-load entitlements for many users in ONE query instead of N. Honors the
// same UNLOCK_ALL_PRODUCTS env var as getUserEntitlements — when unlocked, every
// user gets every product. When paywalls are live, we read each user's active
// Subscription rows in a single SQL.
async function batchEntitlements(userIds: string[]): Promise<Map<string, Set<ProductKey>>> {
  const out = new Map<string, Set<ProductKey>>();
  if (userIds.length === 0) return out;
  const UNLOCK_ALL = process.env.UNLOCK_ALL_PRODUCTS !== 'false';
  if (UNLOCK_ALL) {
    const { ALL_PRODUCT_KEYS } = await import('@/lib/products');
    for (const id of userIds) out.set(id, new Set<ProductKey>(ALL_PRODUCT_KEYS));
    return out;
  }
  if (!hasDatabase()) return out;
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ userId: string; productKey: string }>>(
      `SELECT "userId", "productKey"
       FROM "Subscription"
       WHERE "userId" = ANY($1::text[]) AND "accessUntil" > NOW()`,
      userIds,
    );
    for (const r of rows) {
      const set = out.get(r.userId) || new Set<ProductKey>();
      set.add(r.productKey as ProductKey);
      out.set(r.userId, set);
    }
  } catch { /* non-fatal */ }
  return out;
}

async function getSubscribersWithEmails(): Promise<SubscriberRow[]> {
  if (!hasDatabase()) return [];
  try {
    // Pull every distinct user with at least one active access grant.
    const rows = await prisma.$queryRawUnsafe<Array<{ userId: string; email: string }>>(
      `SELECT DISTINCT u.id AS "userId", u.email
       FROM "User" u
       JOIN "Subscription" s ON s."userId" = u.id
       WHERE s."accessUntil" > NOW()
         AND u.email IS NOT NULL
         AND u.email <> ''`,
    );
    return rows;
  } catch { return []; }
}

function pickLine(p: any): string {
  if (!p) return '';
  const odds = p.odds ? `<span style="color:#9ca3af;font-weight:500">  ${p.odds}</span>` : '';
  return `<tr><td style="padding:4px 0;font-weight:600;color:#fff">${p.selection}${odds}</td></tr>`;
}

function sectionHeader(label: string, count: number): string {
  if (count === 0) return '';
  return `<tr><td style="padding:14px 0 6px 0;color:#d4a843;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em">${label}${count > 1 ? ` <span style="color:#6b7280;font-weight:600">· ${count}</span>` : ''}</td></tr>`;
}

function renderSection(label: string, raw: any): string {
  if (!raw) return '';
  // Grand Slam / Personal Pick / Power 20 / Power 10 are SINGLE picks (or single
  // parlay tickets). Other sections are arrays.
  if (Array.isArray(raw)) {
    if (raw.length === 0) return '';
    return `${sectionHeader(label, raw.length)}${raw.map(pickLine).join('')}`;
  }
  // Power 20 / Power 10 come as a parlay object with legs.
  if (raw.legs && Array.isArray(raw.legs)) {
    if (raw.legs.length === 0) return '';
    const oddsHeader = raw.estimatedOdds ? `<span style="color:#9ca3af;font-weight:500"> · ${raw.estimatedOdds}</span>` : '';
    return `${sectionHeader(label + oddsHeader, 1)}${raw.legs.map((leg: any) => pickLine({ selection: leg.selection, odds: leg.odds })).join('')}`;
  }
  return `${sectionHeader(label, 1)}${pickLine(raw)}`;
}

function renderDigest(args: {
  board: any;
  extras: Record<string, any>;
  productKeys: Set<ProductKey> | 'all';
  dateLabel: string;
}): string {
  const { board, extras, productKeys, dateLabel } = args;
  const has = (k: ProductKey) => productKeys === 'all' || productKeys.has(k);

  const blocks: string[] = [];
  for (const s of SECTIONS) {
    if (!has(s.key)) continue;
    const raw = s.source === 'board' ? board[s.field] : extras[s.field];
    if (s.field === 'nrfi' && Array.isArray(raw) && raw.length > 0) {
      // NRFI rows have a different shape — synthesize a selection string.
      blocks.push(`${sectionHeader(s.label, raw.length)}${raw.map((n: any) => pickLine({ selection: n.selection || `NRFI — ${n.eventName || ''}`, odds: n.odds })).join('')}`);
    } else {
      blocks.push(renderSection(s.label, raw));
    }
  }
  const sections = blocks.filter(Boolean).join('');

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e5e7eb;padding:28px;border-radius:18px">
  <h1 style="font-size:24px;font-weight:900;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:-0.02em">HIMOTHY Plays &amp; Parlays</h1>
  <p style="margin:0 0 20px 0;color:#9ca3af;font-size:13px;font-weight:600">${dateLabel} — your daily board</p>
  <table style="width:100%;border-collapse:collapse">
    ${sections || '<tr><td style="padding:8px 0;color:#9ca3af;font-size:13px">No picks today in the categories you subscribe to. <a href="https://himothypicks.com/pricing" style="color:#d4a843">Upgrade</a> to unlock more.</td></tr>'}
  </table>
  <p style="margin:24px 0 0 0;padding:16px;background:#171717;border-radius:12px;color:#d1d5db;font-size:13px;line-height:1.6">
    <strong style="color:#fff">How to bet it:</strong> the straight plays (Grand Slam, Pressure Pack, VIP 4-Pack) are single tickets — one play per ticket. Parlay products are the only combined plays.
  </p>
  <p style="margin:16px 0 0 0;color:#9ca3af;font-size:12px;line-height:1.6">
    Full breakdowns at <a href="https://himothypicks.com/picks" style="color:#d4a843;text-decoration:none">himothypicks.com/picks</a>. Reply with any questions.
  </p>
  <p style="margin:14px 0 0 0;color:#6b7280;font-size:11px">himothypicks.com</p>
</div>`.trim();
}

async function fetchExtras(): Promise<Record<string, any>> {
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://himothypicks.com';
  const out: Record<string, any> = {};
  // Best-effort; if any fail the per-subscriber render just omits that section.
  await Promise.allSettled([
    fetch(`${base}/api/research/power20`, { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (d?.parlay20) out.power20 = d.parlay20;
      if (d?.parlay10) out.power10 = d.parlay10;
    }),
    fetch(`${base}/api/research/personal-pick`, { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (d?.pick || d?.topPick) out.personalPick = d.pick || d.topPick;
    }),
    fetch(`${base}/api/research/sport-parlays`, { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (Array.isArray(d?.parlays) && d.parlays.length > 0) out.sportParlays = d.parlays;
    }),
    fetch(`${base}/api/research/period-plays`, { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (Array.isArray(d?.plays) && d.plays.length > 0) out.periodPlays = d.plays;
    }),
  ]);
  return out;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    const board = await getOrComputeBoard('north-american');
    if (!board) {
      return NextResponse.json({ success: false, error: 'no board available' }, { status: 500 });
    }
    const dateLabel = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York',
    });
    const extras = await fetchExtras();

    // 1. OWNER — gets the full board, no filtering.
    const ownerHtml = renderDigest({ board, extras, productKeys: 'all', dateLabel });
    const ownerSend = await sendEmail({
      to: OWNER_EMAIL,
      subject: `[HIMOTHY] Today's full board — ${dateLabel}`,
      html: ownerHtml,
      replyTo: OWNER_EMAIL,
    });

    // 2. SUBSCRIBERS — per-user filtered emails. UNLOCK_ALL=true (current default)
    //    will treat every subscriber as having access to every product key, which
    //    is what we want until pricing actually launches.
    // Perf fix 2026-06-04: was running serial getUserEntitlements() per subscriber
    // (N DB queries). Now batches all entitlements in one SQL + sends in parallel.
    const subscribers = await getSubscribersWithEmails();
    const targets = subscribers.filter((s) => s.email !== OWNER_EMAIL);
    const entitlementsMap = await batchEntitlements(targets.map((t) => t.userId));
    const sends = await Promise.allSettled(targets.map(async (sub) => {
      const productKeys = entitlementsMap.get(sub.userId) || new Set<ProductKey>();
      return sendEmail({
        to: sub.email,
        subject: `[HIMOTHY] Today's picks — ${dateLabel}`,
        html: renderDigest({ board, extras, productKeys, dateLabel }),
        replyTo: OWNER_EMAIL,
      });
    }));
    let subscriberSends = 0;
    let subscriberErrors = 0;
    for (const r of sends) {
      if (r.status === 'fulfilled' && r.value?.ok) subscriberSends += 1;
      else subscriberErrors += 1;
    }

    return NextResponse.json({
      success: ownerSend.ok,
      ownerError: ownerSend.error,
      subscribers: subscribers.length,
      subscriberSends,
      subscriberErrors,
    });
  } catch (error: any) {
    console.error('daily-email failed', error);
    return NextResponse.json({ success: false, error: String(error?.message || error) }, { status: 500 });
  }
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
