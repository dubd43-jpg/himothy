import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

// POST /api/account/signin  { email }
//
// Email-only sign-in. Returning customer enters their email, we look up the
// User row, set the himothy_uid cookie, and they're "logged in" on this browser.
// If their subscription is active they see picks; if expired they see the
// locked / "pick a plan" screen.
//
// Note: this is email-claim auth (no password), same model as the magic-link
// flow we'll add later. Trade-off: a stolen email could grant signin, but the
// resulting session only sees their entitlements (no PII, no payment access).
// The Stripe customer portal still requires a fresh Stripe-hosted login.

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

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; email: string }>>(
      `SELECT id, email FROM "User" WHERE LOWER(email) = $1 LIMIT 1`, email,
    );
    if (!rows[0]) {
      return NextResponse.json({
        error: 'No account found for that email. Use /api/account/signup to start a free trial.',
      }, { status: 404 });
    }
    const user = rows[0];

    const res = NextResponse.json({ success: true, userId: user.id, email: user.email });
    // Long-lived cookie + httpOnly so client JS can't exfiltrate the UUID.
    // SEC fix 2026-06-04: was missing httpOnly. The entitlements check is always
    // server-side via the cookie on the request, so client JS never needs to read it.
    res.cookies.set('himothy_uid', user.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 90 * 24 * 60 * 60,
    });
    return res;
  } catch (e: any) {
    console.error('signin failed', e);
    return NextResponse.json({ error: 'Sign-in failed', detail: String(e?.message || e) }, { status: 500 });
  }
}
