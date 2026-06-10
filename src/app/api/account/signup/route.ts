import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';
import { ensureSubscriptionSchema } from '@/services/stripeService';
import { ALL_PRODUCT_KEYS } from '@/lib/products';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

// POST /api/account/signup  { email }
//
// Email-only signup. Grants a 7-day full-access free trial covering every product
// in the catalog. No card required. Tracks usage so the trial can't be re-claimed
// from the same email later (idempotent for legit re-signups, refusing fresh trials
// for re-signups).
//
// Returns { userId, accessUntil, productKeys } on success.

const TRIAL_DAYS = 7;

// US states + DC + territories that customers can select. Used for state-level
// marketing rules and state-restriction warnings (some states have specific
// rules around sports-betting tipster content). Stored as the 2-letter code.
const VALID_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY','PR','VI','GU','AS','MP',
]);

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: Request) {
  if (!hasDatabase()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const email = String(body?.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  // 2026-06-05: 21+ age confirmation is REQUIRED for new signups. We don't
  // store DOB or IDs — just a one-bit "the customer attested 21+" plus the
  // timestamp. That satisfies the merchant-side responsible-gambling stance
  // without taking on PII-storage liability.
  const ageConfirmed = body?.ageConfirmed === true || String(body?.ageConfirmed || '').toLowerCase() === 'true';
  if (!ageConfirmed) {
    return NextResponse.json({ error: 'You must confirm you are 21 or older to subscribe.' }, { status: 400 });
  }

  // State is optional but if provided must be a valid 2-letter US code. Used
  // for state-specific marketing and restriction warnings.
  const stateRaw = String(body?.state || '').trim().toUpperCase();
  const state = stateRaw && VALID_STATES.has(stateRaw) ? stateRaw : null;

  try {
    await ensureUserSchema();
    await ensureSubscriptionSchema();
    return await doSignup(email, { ageConfirmed: true, state });
  } catch (e: any) {
    console.error('signup failed', e);
    return NextResponse.json({ error: 'Signup failed', detail: String(e?.message || e) }, { status: 500 });
  }
}

// Bootstraps the User table. The Prisma schema defines it but no migration runs in
// production — every other schema in this app is created via $executeRawUnsafe on
// first use. Mirror that pattern here so signup works on a fresh database.
async function ensureUserSchema() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT PRIMARY KEY,
      "email" TEXT UNIQUE NOT NULL,
      "passwordHash" TEXT,
      "authProviderId" TEXT UNIQUE,
      "role" TEXT NOT NULL DEFAULT 'USER',
      "planType" TEXT NOT NULL DEFAULT 'FREE',
      "stripeCustomerId" TEXT UNIQUE,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User" ("email")`);
  // 2026-06-05 compliance fields. No PII (no DOB, no ID number) — just the
  // attestation boolean + timestamp, plus state code if the user provided it.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "ageConfirmed" BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS "ageConfirmedAt" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "state" TEXT
  `);
}

async function doSignup(email: string, attestation: { ageConfirmed: boolean; state: string | null }) {

  // Find existing user or create one. We don't store a password — auth is by email link.
  let user: { id: string; email: string };
  const existingRows = await prisma.$queryRawUnsafe<Array<{ id: string; email: string }>>(
    `SELECT id, email FROM "User" WHERE LOWER(email) = $1 LIMIT 1`,
    email,
  );
  if (existingRows[0]) {
    user = existingRows[0];
    // 2026-06-05: update attestation + state on every signup attempt so
    // returning customers re-confirm. ageConfirmedAt records when the latest
    // attestation was made (legal-defensible audit trail).
    await prisma.$executeRawUnsafe(
      `UPDATE "User"
         SET "ageConfirmed" = TRUE,
             "ageConfirmedAt" = NOW(),
             "state" = COALESCE($1, "state"),
             "updatedAt" = NOW()
       WHERE id = $2`,
      attestation.state, user.id,
    );
  } else {
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" (id, email, "planType", "createdAt", "updatedAt", "role",
                          "ageConfirmed", "ageConfirmedAt", "state")
       VALUES ($1, $2, 'FREE', NOW(), NOW(), 'USER', TRUE, NOW(), $3)`,
      id, email, attestation.state,
    );
    user = { id, email };
  }

  // Check trial eligibility — refuse fresh trial if the user has ever had one.
  const usedRows = await prisma.$queryRawUnsafe<Array<{ count: string }>>(
    `SELECT COUNT(*)::text AS count FROM "Subscription"
     WHERE "userId" = $1 AND "metadata"->>'kind' = 'signup_trial'`,
    user.id,
  );
  const trialAlreadyUsed = Number(usedRows[0]?.count || 0) > 0;
  if (trialAlreadyUsed) {
    return NextResponse.json({
      userId: user.id, email: user.email,
      trialAlreadyUsed: true,
      message: 'You already had a free trial. Pick a product on /pricing to keep going.',
    }, { status: 409 });
  }

  // Grant 7-day access to EVERY product. One Subscription row per product so the
  // existing access gate (Subscription WHERE accessUntil > NOW()) works unchanged.
  const accessUntil = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  for (const key of ALL_PRODUCT_KEYS) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Subscription"
        (id, "userId", "productKey", "status", "isOneTime", "accessUntil",
         "currentPeriodEnd", "cancelAtPeriodEnd", "metadata", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'trialing', true, $4, $4, false,
               jsonb_build_object('kind', 'signup_trial', 'trialDays', ${TRIAL_DAYS}),
               NOW(), NOW())`,
      randomUUID(), user.id, key, accessUntil,
    );
  }

  // 2026-06-05: fire the day-0 welcome email inline. Subsequent emails
  // (day 2/4/6) come from the welcomeDrip cron.
  try {
    const { sendDay0Welcome } = await import('@/services/welcomeEmailService');
    await sendDay0Welcome(user.id, user.email);
  } catch { /* non-fatal */ }

  return NextResponse.json({
    success: true,
    userId: user.id,
    email: user.email,
    accessUntil: accessUntil.toISOString(),
    productKeys: ALL_PRODUCT_KEYS,
  });
}
