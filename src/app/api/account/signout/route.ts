import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// POST /api/account/signout
// Clears the himothy_uid cookie. The User row + Subscription rows stay intact —
// the customer can sign back in any time with the same email.
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set('himothy_uid', '', {
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 0,
  });
  return res;
}
