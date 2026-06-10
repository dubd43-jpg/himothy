import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// Owner login. Hits this with the admin secret (header `x-admin-secret` or
// `?secret=...`) and an `email` query param; the endpoint:
//   1. Bootstraps the User row if it doesn't exist
//   2. Promotes the user to role=ADMIN
//   3. Sets the `himothy_uid` httpOnly cookie tied to that user
//   4. Redirects to / (or wherever ?to= points)
//
// Result: you browse the customer site exactly as a paying customer would, with
// full entitlements via the OWNER_EMAILS / role=ADMIN bypass in entitlements.ts.
// Lets you QA every paywall path post-launch without ever paying.

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
}

function authorized(req: Request): boolean {
  if (isAdminRequest(req)) return true;
  // Query-param fallback so the owner can click a link from their email and land
  // logged in. Header-only auth doesn't work in a browser navigation.
  const url = new URL(req.url);
  const querySecret = url.searchParams.get('secret') || '';
  const expected = process.env.ADMIN_SECRET?.trim() || '';
  return Boolean(expected && querySecret === expected);
}

async function handle(req: Request) {
  if (!authorized(req)) return adminUnauthorized();
  if (!hasDatabase()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const url = new URL(req.url);
  const email = String(url.searchParams.get('email') || 'rentalsgradea@gmail.com').trim().toLowerCase();
  const redirectTo = url.searchParams.get('to') || '/';

  try {
    await ensureUserSchema();
    let userId: string;
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "User" WHERE LOWER(email) = $1 LIMIT 1`, email,
    );
    if (existing[0]?.id) {
      userId = existing[0].id;
      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET role = 'ADMIN', "updatedAt" = NOW() WHERE id = $1`,
        userId,
      );
    } else {
      userId = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "User" (id, email, role, "planType", "createdAt", "updatedAt")
         VALUES ($1, $2, 'ADMIN', 'FREE', NOW(), NOW())`,
        userId, email,
      );
    }

    const res = NextResponse.redirect(new URL(redirectTo, url.origin), 303);
    // 90-day cookie — long enough that the owner doesn't have to re-auth often.
    res.cookies.set('himothy_uid', userId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 90 * 24 * 60 * 60,
    });
    return res;
  } catch (e: any) {
    console.error('become-owner failed', e);
    return NextResponse.json({ error: 'Become-owner failed', detail: String(e?.message || e) }, { status: 500 });
  }
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
