// SETTLEMENT EMAIL SERVICE
//
// When a pick gets graded (win/loss/push), email the subscribers whose tier
// covers that pick. Filtered by subscription so a Grand-Slam-only customer
// doesn't get a VIP-4-Pack settlement notification.
//
// Idempotent: a small `settlement_email_log` table tracks pick_id → sent so
// we never email the same result twice if the grader re-runs.

import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';
import { sendEmail } from '@/lib/email';

const OWNER_EMAIL = 'rentalsgradea@gmail.com';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://himothypicks.com';

// Same mapping used by pickChangeNotifier — keep in sync.
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

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady || !hasDatabase()) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS settlement_email_log (
        pick_id TEXT PRIMARY KEY,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    _schemaReady = true;
  } catch (err) {
    console.error('[settlementEmail] schema bootstrap failed', err);
  }
}

async function alreadySent(pickId: string): Promise<boolean> {
  if (!hasDatabase()) return false;
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ pick_id: string }>>(
      `SELECT pick_id FROM settlement_email_log WHERE pick_id = $1 LIMIT 1`, pickId,
    );
    return rows.length > 0;
  } catch { return false; }
}

async function logSent(pickId: string): Promise<void> {
  if (!hasDatabase()) return;
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO settlement_email_log (pick_id) VALUES ($1) ON CONFLICT (pick_id) DO NOTHING`,
      pickId,
    );
  } catch { /* non-fatal */ }
}

async function getSubscribersForCategory(category: string): Promise<string[]> {
  const targetKey = CATEGORY_TO_PRODUCT_KEY[category];
  if (!targetKey || !hasDatabase()) return [];
  const emails = new Set<string>();
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ email: string; productKey: string }>>(
      `SELECT DISTINCT u.email, s."productKey"
         FROM "User" u
         JOIN "Subscription" s ON s."userId" = u.id
        WHERE u.email IS NOT NULL AND u.email <> ''
          AND s."accessUntil" > NOW()`,
    );
    for (const r of rows) {
      const expanded = expandBundle(r.productKey);
      if (expanded.includes(targetKey)) emails.add(r.email);
    }
  } catch { /* table may not exist */ }
  return Array.from(emails);
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

function settlementHtml(p: {
  category: string; selection: string; odds: string | null;
  result: string; eventName: string;
  finalScore?: { home: number; away: number } | null;
  units: number;
}): string {
  const won = p.result === 'win';
  const pushed = p.result === 'push';
  const color = won ? '#10b981' : pushed ? '#9ca3af' : '#ef4444';
  const headline = won ? '✅ WIN' : pushed ? '➖ PUSH' : '❌ LOSS';
  const unitsLabel = pushed ? '0.00u' : (p.units > 0 ? `+${p.units.toFixed(2)}u` : `${p.units.toFixed(2)}u`);
  const scoreLine = p.finalScore
    ? `<p style="margin:6px 0 0 0;color:#9ca3af;font-size:12px">Final: ${p.finalScore.away} – ${p.finalScore.home}</p>`
    : '';
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#e5e7eb;padding:24px;border-radius:16px">
  <h2 style="margin:0 0 6px 0;font-size:28px;font-weight:900;color:${color}">${headline}</h2>
  <p style="margin:0 0 12px 0;color:#9ca3af;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;font-weight:700">${p.category.replace(/_/g, ' ')}</p>
  <div style="background:#111827;border-radius:12px;padding:18px;margin-bottom:18px">
    <p style="margin:0 0 4px 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:700">${p.eventName}</p>
    <p style="margin:0 0 6px 0;font-size:17px;font-weight:900">${p.selection}${p.odds ? ` <span style="color:#9ca3af;font-weight:400">(${p.odds})</span>` : ''}</p>
    ${scoreLine}
    <p style="margin:12px 0 0 0;font-size:15px;font-weight:900;color:${color}">${unitsLabel}</p>
  </div>
  <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6">
    Full graded history: <a href="${SITE_URL}/track-record" style="color:#10b981">${SITE_URL}/track-record</a>
  </p>
  <div style="margin-top:18px;padding-top:14px;border-top:1px solid #1f2937;color:#6b7280;font-size:11px">
    Reply or email <a href="mailto:${OWNER_EMAIL}" style="color:#10b981">${OWNER_EMAIL}</a> with questions.<br>
    21+ only. 1-800-GAMBLER.
  </div>
</div>`.trim();
}

interface SettlementInput {
  pickId: string;
  category: string;
  selection: string;
  odds: string | null;
  result: string;
  eventName: string;
  finalHome?: number | null;
  finalAway?: number | null;
}

export async function emailSettlement(input: SettlementInput): Promise<{ sent: number; skipped: boolean }> {
  await ensureSchema();
  if (await alreadySent(input.pickId)) return { sent: 0, skipped: true };

  const subscribers = await getSubscribersForCategory(input.category);
  // Always include owner for visibility.
  const recipients = Array.from(new Set([OWNER_EMAIL, ...subscribers]));
  const units = americanToUnits(input.odds, input.result);

  const html = settlementHtml({
    category: input.category,
    selection: input.selection,
    odds: input.odds,
    result: input.result,
    eventName: input.eventName,
    finalScore: input.finalHome != null && input.finalAway != null
      ? { home: input.finalHome, away: input.finalAway }
      : null,
    units,
  });

  const wonLabel = input.result === 'win' ? '✅ WIN' : input.result === 'push' ? 'PUSH' : '❌ LOSS';
  const subject = `[HIMOTHY] ${wonLabel}: ${input.selection}`;
  try {
    await sendEmail({ to: recipients, subject, html, replyTo: OWNER_EMAIL });
    await logSent(input.pickId);
    return { sent: recipients.length, skipped: false };
  } catch (err) {
    console.error('[settlementEmail] send failed', err);
    return { sent: 0, skipped: false };
  }
}
