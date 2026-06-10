// END-OF-NIGHT SETTLEMENT DIGEST
//
// 2026-06-06 owner directive: "Same thing when we are done at the end of the
// night. Just one email that shows me all the wins and losses. I don't want
// so many emails."
//
// One email per night with every settled pick (W / L / Push). Subscription-tier
// filtered so a Grand-Slam-only customer only sees GS results. Idempotent —
// reuses the existing settlement_email_log table so re-runs don't double-send.

import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';
import { sendEmail } from '@/lib/email';

const OWNER_EMAIL = 'rentalsgradea@gmail.com';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://himothypicks.com';

// Mirror of settlementEmailService.ts — keep in sync.
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
const BUNDLE_INCLUDES: Record<string, string[]> = {
  all_access: ['grand_slam','pressure_pack','vip_4_pack','power_20','power_10','parlay_plan','big_games','sleeper_picks','sport_parlays','value_plays','period_plays','nrfi'],
  flagship_pack: ['grand_slam','pressure_pack','vip_4_pack'],
  parlay_pack: ['power_20','power_10','parlay_plan','sport_parlays'],
};
function expandBundle(key: string): string[] {
  return BUNDLE_INCLUDES[key] ? BUNDLE_INCLUDES[key] : [key];
}

function todayET(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function americanToUnits(odds: string | null, result: string): number {
  if (result !== 'win' && result !== 'loss') return 0;
  const m = String(odds || '').match(/[+-]?\d{2,4}/);
  if (!m) return result === 'win' ? 1 : -1;
  const n = Number(m[0]);
  if (!isFinite(n) || n === 0) return result === 'win' ? 1 : -1;
  if (result === 'loss') return -1;
  return n > 0 ? n / 100 : 100 / Math.abs(n);
}

export interface DigestResult {
  ok: boolean;
  picksIncluded: number;
  recipientsBySegment: Record<string, number>;
  emailsSent: number;
  totalUnits: number;
  skipped: boolean;
  reason?: string;
}

interface SettledPick {
  id: string;
  category: string;
  selection: string;
  odds: string | null;
  result: string;
  event_name: string;
  final_home: number | null;
  final_away: number | null;
}

async function fetchTodaysSettled(date: string): Promise<SettledPick[]> {
  return prisma.$queryRawUnsafe<SettledPick[]>(
    `SELECT id, category, selection, odds, result, event_name,
            (research_payload->>'finalHome')::int AS final_home,
            (research_payload->>'finalAway')::int AS final_away
       FROM himothy_pick_registry
      WHERE board_date = $1::date
        AND status IN ('graded', 'archived')
        AND result IN ('win','loss','push')
      ORDER BY result, category, created_at`,
    date,
  );
}

async function fetchSubscribersForCategories(categories: Set<string>): Promise<Map<string, Set<string>>> {
  // Returns map: email → set of product keys they're subscribed to
  const out = new Map<string, Set<string>>();
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ email: string; productKey: string }>>(
      `SELECT DISTINCT u.email, s."productKey"
         FROM "User" u
         JOIN "Subscription" s ON s."userId" = u.id
        WHERE u.email IS NOT NULL AND u.email <> ''
          AND s."accessUntil" > NOW()`,
    );
    for (const r of rows) {
      const keys = expandBundle(r.productKey);
      const set = out.get(r.email) || new Set<string>();
      for (const k of keys) set.add(k);
      out.set(r.email, set);
    }
  } catch { /* no subscriptions yet */ }
  return out;
}

function alreadyDigested(date: string): Promise<boolean> {
  if (!hasDatabase()) return Promise.resolve(false);
  return prisma.$queryRawUnsafe<Array<{ pick_id: string }>>(
    `SELECT pick_id FROM settlement_email_log WHERE pick_id = $1 LIMIT 1`,
    `digest|${date}`,
  ).then(rows => rows.length > 0).catch(() => false);
}

async function logDigested(date: string): Promise<void> {
  if (!hasDatabase()) return;
  await prisma.$executeRawUnsafe(
    `INSERT INTO settlement_email_log (pick_id) VALUES ($1) ON CONFLICT (pick_id) DO NOTHING`,
    `digest|${date}`,
  ).catch(() => {});
}

function digestHtml(picks: SettledPick[], totalUnits: number, date: string, productFilter?: Set<string>): string {
  const visible = productFilter
    ? picks.filter(p => productFilter.has(CATEGORY_TO_PRODUCT_KEY[p.category] || ''))
    : picks;
  const wins = visible.filter(p => p.result === 'win');
  const losses = visible.filter(p => p.result === 'loss');
  const pushes = visible.filter(p => p.result === 'push');

  const row = (p: SettledPick) => {
    const units = americanToUnits(p.odds, p.result);
    const symbol = p.result === 'win' ? '✅' : p.result === 'loss' ? '❌' : '➖';
    const unitsStr = p.result === 'push' ? '0.00u' : (units > 0 ? `+${units.toFixed(2)}u` : `${units.toFixed(2)}u`);
    const score = p.final_home != null && p.final_away != null ? `${p.final_away}–${p.final_home}` : '';
    return `
      <tr style="border-top:1px solid #1f2937">
        <td style="padding:8px;vertical-align:top;font-size:12px;color:#e5e7eb">${symbol}</td>
        <td style="padding:8px;vertical-align:top;font-size:12px">
          <div style="font-weight:700;color:#f1f5f9">${p.selection}${p.odds ? ` <span style="color:#94a3b8;font-weight:400">(${p.odds})</span>` : ''}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">${p.event_name}${score ? ' · ' + score : ''}</div>
        </td>
        <td style="padding:8px;vertical-align:top;font-size:11px;color:#64748b">${(p.category || '').replace(/_/g, ' ')}</td>
        <td style="padding:8px;vertical-align:top;font-size:12px;font-weight:700;text-align:right;color:${units > 0 ? '#10b981' : units < 0 ? '#ef4444' : '#9ca3af'}">${unitsStr}</td>
      </tr>`;
  };

  const visibleUnits = visible.reduce((sum, p) => sum + americanToUnits(p.odds, p.result), 0);

  return `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:0 auto;background:#0a0a0a;color:#e5e7eb;padding:24px;border-radius:16px">
  <h2 style="margin:0 0 6px;color:#10b981">Tonight's Results — ${date}</h2>
  <p style="margin:0 0 18px;color:#9ca3af;font-size:13px">
    ${wins.length}W · ${losses.length}L${pushes.length ? ' · ' + pushes.length + ' Push' : ''} ·
    <b style="color:${visibleUnits > 0 ? '#10b981' : visibleUnits < 0 ? '#ef4444' : '#9ca3af'}">${visibleUnits > 0 ? '+' : ''}${visibleUnits.toFixed(2)}u</b>
  </p>
  <table style="width:100%;border-collapse:collapse;background:#0f172a;border-radius:8px;overflow:hidden">
    <thead><tr style="background:#1e293b">
      <th style="padding:8px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;width:30px"></th>
      <th style="padding:8px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.08em">Pick</th>
      <th style="padding:8px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.08em">Tier</th>
      <th style="padding:8px;text-align:right;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.08em">Units</th>
    </tr></thead>
    <tbody>${visible.map(row).join('')}</tbody>
  </table>
  <p style="margin:18px 0 0;color:#64748b;font-size:11px;line-height:1.5">
    Full graded history: <a href="${SITE_URL}/track-record" style="color:#10b981">${SITE_URL}/track-record</a><br>
    21+ only. 1-800-GAMBLER. Reply with questions.
  </p>
</div>`.trim();
}

export async function sendNightlyDigest(): Promise<DigestResult> {
  const result: DigestResult = { ok: true, picksIncluded: 0, recipientsBySegment: {}, emailsSent: 0, totalUnits: 0, skipped: false };
  if (!hasDatabase()) { result.ok = false; result.reason = 'no database'; return result; }

  const date = todayET();
  if (await alreadyDigested(date)) { result.skipped = true; result.reason = 'already digested'; return result; }

  const picks = await fetchTodaysSettled(date);
  if (picks.length === 0) { result.skipped = true; result.reason = 'no settled picks'; return result; }
  result.picksIncluded = picks.length;
  result.totalUnits = picks.reduce((sum, p) => sum + americanToUnits(p.odds, p.result), 0);

  // Owner always gets the full digest.
  await sendEmail({
    to: OWNER_EMAIL,
    subject: `[HIMOTHY] Tonight's results — ${date}`,
    html: digestHtml(picks, result.totalUnits, date),
    replyTo: OWNER_EMAIL,
  });
  result.emailsSent++;

  // Subscriber-segmented digest. Each subscriber gets ONE email filtered to
  // products their subscription covers.
  const categories = new Set(picks.map(p => p.category));
  const subscribers = await fetchSubscribersForCategories(categories);
  for (const [email, productKeys] of Array.from(subscribers.entries())) {
    if (email === OWNER_EMAIL) continue; // owner already got the full one
    const visiblePicks = picks.filter(p => productKeys.has(CATEGORY_TO_PRODUCT_KEY[p.category] || ''));
    if (visiblePicks.length === 0) continue;
    await sendEmail({
      to: email,
      subject: `[HIMOTHY] Tonight's results — ${date}`,
      html: digestHtml(picks, result.totalUnits, date, productKeys),
      replyTo: OWNER_EMAIL,
    });
    result.emailsSent++;
  }

  await logDigested(date);
  return result;
}
