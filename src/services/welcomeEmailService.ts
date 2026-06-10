// WELCOME EMAIL DRIP (TRIAL ONBOARDING)
//
// New trial signups get a 4-email series over their 7-day trial that builds
// trust, teaches the product, and converts to paid before the trial expires.
//
//   Day 0 — Welcome + how to use the site (fires inline at signup)
//   Day 2 — Grand Slam explainer (why it's the premium pick)
//   Day 4 — Track record + transparency (build trust with real graded data)
//   Day 6 — Convert-to-paid CTA (one day before trial expires)
//
// A daily cron scans the User table for trial signups whose ages have crossed
// the day-2/4/6 thresholds and haven't received the corresponding email yet.
// Sent emails are tracked in a small `welcome_email_log` table to keep the
// drip idempotent.

import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';
import { sendEmail } from '@/lib/email';

const OWNER_EMAIL = 'rentalsgradea@gmail.com';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://himothypicks.com';

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady || !hasDatabase()) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS welcome_email_log (
        user_id TEXT NOT NULL,
        step TEXT NOT NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, step)
      )
    `);
    _schemaReady = true;
  } catch (err) {
    console.error('[welcomeEmailService] schema bootstrap failed', err);
  }
}

async function alreadySent(userId: string, step: string): Promise<boolean> {
  if (!hasDatabase()) return false;
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
      `SELECT user_id FROM welcome_email_log WHERE user_id = $1 AND step = $2 LIMIT 1`,
      userId, step,
    );
    return rows.length > 0;
  } catch { return false; }
}

async function logSent(userId: string, step: string): Promise<void> {
  if (!hasDatabase()) return;
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO welcome_email_log (user_id, step) VALUES ($1, $2)
       ON CONFLICT (user_id, step) DO NOTHING`,
      userId, step,
    );
  } catch { /* non-fatal */ }
}

// ─── Email content ────────────────────────────────────────────────────────

const SHARED_FOOTER = `
<div style="margin-top:24px;padding-top:18px;border-top:1px solid #1f2937;color:#6b7280;font-size:11px">
  Questions? Reply or email <a href="mailto:${OWNER_EMAIL}" style="color:#10b981">${OWNER_EMAIL}</a>.<br>
  Manage your subscription anytime at <a href="${SITE_URL}/account" style="color:#10b981">${SITE_URL}/account</a>.<br>
  21+ only. If you or someone you know has a gambling problem, call 1-800-GAMBLER.
</div>`;

function wrap(inner: string): string {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e5e7eb;padding:28px 24px;border-radius:16px">
${inner}
${SHARED_FOOTER}
</div>`.trim();
}

function day0Html(): string {
  return wrap(`
  <h2 style="margin:0 0 8px 0;font-size:22px;font-weight:900">Welcome to HIMOTHY 🏆</h2>
  <p style="margin:0 0 20px 0;color:#9ca3af;font-size:14px">Your 7-day trial is active right now.</p>

  <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6">You have full access to every product on the board for the next 7 days. No card required. Here's how to get the most out of it:</p>

  <div style="background:#111827;border-radius:12px;padding:18px;margin:18px 0">
    <ol style="margin:0;padding-left:18px;font-size:14px;line-height:1.8">
      <li><strong>Today's board</strong> — <a href="${SITE_URL}/picks" style="color:#10b981">${SITE_URL}/picks</a> — every pick we like for today, graded honestly when games finish.</li>
      <li><strong>Grand Slam</strong> — our single highest-conviction play of the day. Most days have 0 or 1, never forced.</li>
      <li><strong>Pressure Pack & VIP 4-Pack</strong> — multi-pick products for daily action.</li>
      <li><strong>$10 Parlay</strong> — built each night from sub-(-195) legs.</li>
      <li><strong>Power 20 / Power 10</strong> — Hail Mary mega-parlays for the longshot bettors.</li>
    </ol>
  </div>

  <p style="margin:18px 0 8px 0;font-size:15px"><strong>One more thing</strong> — we grade every pick publicly. Check <a href="${SITE_URL}/track-record" style="color:#10b981">our track record</a> any time. Nothing gets deleted, edited, or hidden.</p>

  <p style="margin:18px 0 0 0;font-size:13px;color:#9ca3af">You'll get one email per day for the next few days walking you through each product. Today's slate is already live — go see what we like.</p>
  `);
}

function day2Html(): string {
  return wrap(`
  <h2 style="margin:0 0 8px 0;font-size:22px;font-weight:900">The Grand Slam — explained 🎯</h2>
  <p style="margin:0 0 20px 0;color:#9ca3af;font-size:14px">Day 2 of your trial.</p>

  <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6">The Grand Slam is the single most asked-about pick on the site. It's also the most important one to understand:</p>

  <div style="background:#111827;border-radius:12px;padding:18px;margin:18px 0">
    <p style="margin:0 0 12px 0;font-size:14px;line-height:1.7"><strong style="color:#10b981">It's ONE pick per day, maximum.</strong> Some days, zero.</p>
    <p style="margin:0 0 12px 0;font-size:14px;line-height:1.7"><strong style="color:#10b981">It only ships when the engine clears the highest confidence floor.</strong> We don't slot-fill. If the slate doesn't produce a play that meets the bar, no Grand Slam.</p>
    <p style="margin:0;font-size:14px;line-height:1.7"><strong style="color:#10b981">Sized big.</strong> Most subscribers play this at 2-3 units (vs 1u on other products).</p>
  </div>

  <p style="margin:18px 0 8px 0;font-size:15px">If today has a Grand Slam, you'll see it at the top of <a href="${SITE_URL}/grand-slam" style="color:#10b981">${SITE_URL}/grand-slam</a>. If it's blank, we just didn't have it today.</p>

  <p style="margin:14px 0 0 0;font-size:13px;color:#9ca3af">Tomorrow: track record and how we grade.</p>
  `);
}

function day4Html(): string {
  return wrap(`
  <h2 style="margin:0 0 8px 0;font-size:22px;font-weight:900">Our track record — fully public 📊</h2>
  <p style="margin:0 0 20px 0;color:#9ca3af;font-size:14px">Day 4 of your trial.</p>

  <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6">Most picks sites delete their losing picks or quietly stop tracking. We do the opposite.</p>

  <div style="background:#111827;border-radius:12px;padding:18px;margin:18px 0">
    <p style="margin:0 0 12px 0;font-size:14px;line-height:1.7"><strong style="color:#10b981">Every pick is recorded.</strong> Win, loss, push. To the public ledger. Permanently.</p>
    <p style="margin:0 0 12px 0;font-size:14px;line-height:1.7"><strong style="color:#10b981">Every game is graded against the official result.</strong> We don't grade ourselves.</p>
    <p style="margin:0;font-size:14px;line-height:1.7"><strong style="color:#10b981">No edits, no deletes.</strong> The ledger is append-only.</p>
  </div>

  <p style="margin:18px 0 16px 0;font-size:15px;line-height:1.6">Check it any time: <a href="${SITE_URL}/track-record" style="color:#10b981">${SITE_URL}/track-record</a></p>

  <p style="margin:14px 0 8px 0;font-size:15px"><strong>Why this matters:</strong> when you read other capping services posting "85% win rate!" — ask them where the receipts are. We post ours.</p>

  <p style="margin:14px 0 0 0;font-size:13px;color:#9ca3af">Tomorrow: how to keep your access after the trial.</p>
  `);
}

function day6Html(): string {
  return wrap(`
  <h2 style="margin:0 0 8px 0;font-size:22px;font-weight:900">Your trial ends tomorrow ⏰</h2>
  <p style="margin:0 0 20px 0;color:#9ca3af;font-size:14px">Day 6 of your trial.</p>

  <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6">If you've been getting value out of HIMOTHY, here's how to keep your access:</p>

  <div style="background:#111827;border-radius:12px;padding:18px;margin:18px 0">
    <p style="margin:0 0 8px 0;font-size:14px;color:#9ca3af">Most popular subscriptions:</p>
    <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.9">
      <li><strong style="color:#10b981">Grand Slam</strong> — premium one-pick-per-day product</li>
      <li><strong style="color:#10b981">VIP 4-Pack</strong> — four daily plays for variety</li>
      <li><strong style="color:#10b981">All Access bundle</strong> — every product, every day, lowest per-product cost</li>
    </ul>
  </div>

  <div style="text-align:center;margin:24px 0">
    <a href="${SITE_URL}/pricing" style="display:inline-block;background:#10b981;color:#0a0a0a;padding:14px 28px;border-radius:12px;font-weight:900;text-decoration:none;font-size:14px;letter-spacing:0.05em;text-transform:uppercase">See All Plans</a>
  </div>

  <p style="margin:18px 0 8px 0;font-size:14px;line-height:1.6"><strong>Already a believer?</strong> Annual subscriptions are ~25% cheaper than monthly. Lifetime is the best value if you're sticking with us long-term.</p>

  <p style="margin:18px 0 0 0;font-size:13px;color:#9ca3af">No pressure if you'd rather walk away — but if you've been on the board for the last 6 days, you know what we do.</p>
  `);
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function sendDay0Welcome(userId: string, email: string): Promise<void> {
  await ensureSchema();
  if (await alreadySent(userId, 'day0')) return;
  try {
    await sendEmail({
      to: [email],
      subject: `[HIMOTHY] Welcome — your 7-day trial is active`,
      html: day0Html(),
      replyTo: OWNER_EMAIL,
    });
    await logSent(userId, 'day0');
  } catch (err) { console.error('[welcomeEmailService.day0] failed', err); }
}

// Drip cron: scan all User rows whose trial started day-2/4/6 ago and send
// the corresponding email if not already sent.
export interface DripCycleResult {
  scanned: number;
  sent: Record<string, number>;
  errors: number;
}

export async function runWelcomeDripCycle(): Promise<DripCycleResult> {
  const out: DripCycleResult = { scanned: 0, sent: { day2: 0, day4: 0, day6: 0 }, errors: 0 };
  if (!hasDatabase()) return out;
  await ensureSchema();

  // Pull every active trial — users with a signup_trial Subscription that hasn't expired.
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; email: string; createdAt: Date }>>(
    `SELECT DISTINCT u.id, u.email, u."createdAt"
       FROM "User" u
       JOIN "Subscription" s ON s."userId" = u.id
      WHERE u.email IS NOT NULL AND u.email <> ''
        AND s.metadata->>'kind' = 'signup_trial'
        AND s."accessUntil" > NOW()`,
  ).catch(() => []);

  out.scanned = rows.length;

  for (const u of rows) {
    const ageMs = Date.now() - new Date(u.createdAt).getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);

    try {
      // Day 2 email — fires when user is between days 2 and 3.
      if (ageDays >= 2 && ageDays < 3 && !(await alreadySent(u.id, 'day2'))) {
        await sendEmail({
          to: [u.email],
          subject: `[HIMOTHY] The Grand Slam — explained`,
          html: day2Html(),
          replyTo: OWNER_EMAIL,
        });
        await logSent(u.id, 'day2');
        out.sent.day2++;
      }
      // Day 4 email
      if (ageDays >= 4 && ageDays < 5 && !(await alreadySent(u.id, 'day4'))) {
        await sendEmail({
          to: [u.email],
          subject: `[HIMOTHY] Our track record — fully public`,
          html: day4Html(),
          replyTo: OWNER_EMAIL,
        });
        await logSent(u.id, 'day4');
        out.sent.day4++;
      }
      // Day 6 email
      if (ageDays >= 6 && ageDays < 7 && !(await alreadySent(u.id, 'day6'))) {
        await sendEmail({
          to: [u.email],
          subject: `[HIMOTHY] Your trial ends tomorrow`,
          html: day6Html(),
          replyTo: OWNER_EMAIL,
        });
        await logSent(u.id, 'day6');
        out.sent.day6++;
      }
    } catch (err) {
      console.error('[welcomeDrip] failed for', u.email, err);
      out.errors++;
    }
  }

  return out;
}
