import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// Owner auto-login. Visiting /owner sets a 90-day admin cookie for
// rentalsgradea@gmail.com and redirects to /picks.
// Protected by OWNER_PIN env var — if set, ?pin=VALUE must match.
// If OWNER_PIN is not set, the route is open (rely on URL obscurity).

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

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Optional PIN protection — set OWNER_PIN in Vercel env vars if you want it.
  const ownerPin = process.env.OWNER_PIN?.trim();
  if (ownerPin) {
    const provided = url.searchParams.get('pin') || '';
    if (provided !== ownerPin) {
      return new Response('Not found', { status: 404 });
    }
  }

  const email = 'rentalsgradea@gmail.com';
  const redirectTo = url.searchParams.get('to') || '/picks';

  if (!hasDatabase()) {
    return NextResponse.redirect(new URL(redirectTo, url.origin), 303);
  }

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
    res.cookies.set('himothy_uid', userId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 90 * 24 * 60 * 60,
    });
    return res;
  } catch (e) {
    console.error('owner auto-login failed', e);
    // Still redirect — worst case you land on /picks without the cookie.
    return NextResponse.redirect(new URL(redirectTo, url.origin), 303);
  }
}
