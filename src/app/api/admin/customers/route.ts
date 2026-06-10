import { NextResponse } from 'next/server';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface CustomerRow {
  id: string;
  email: string;
  createdAt: Date;
  subscriptions: Array<{
    productKey: string;
    status: string;
    accessUntil: Date | null;
    amountPaidCents: number | null;
    isOneTime: boolean;
    stripeSubscriptionId: string | null;
    createdAt: Date;
  }>;
}

export async function GET(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get('q') || '').trim().toLowerCase();
  const showInactive = searchParams.get('showInactive') === 'true';

  try {
    // FIX 2026-06-06: the state/ageConfirmed columns are added by the signup
    // route's ensureUserSchema() which only runs on first signup. If no one
    // has signed up since the columns were added, this admin route 500s with
    // "column 'state' does not exist". Self-heal by adding them ourselves.
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "User"
           ADD COLUMN IF NOT EXISTS "ageConfirmed" BOOLEAN NOT NULL DEFAULT FALSE,
           ADD COLUMN IF NOT EXISTS "ageConfirmedAt" TIMESTAMP,
           ADD COLUMN IF NOT EXISTS "state" TEXT`,
      );
    } catch { /* table may not exist yet — fall through and let the SELECT throw */ }

    const users = await prisma.$queryRawUnsafe<Array<{
      id: string; email: string; createdAt: Date;
      state: string | null; ageConfirmed: boolean | null; ageConfirmedAt: Date | null;
    }>>(
      `SELECT id, email, "createdAt", state, "ageConfirmed", "ageConfirmedAt"
         FROM "User"
        WHERE email IS NOT NULL AND email <> ''
        ORDER BY "createdAt" DESC NULLS LAST
        LIMIT 1000`,
    );

    const subscriptions = await prisma.$queryRawUnsafe<Array<{
      id: string; userId: string; productKey: string; status: string;
      accessUntil: Date | null; amountPaidCents: number | null;
      isOneTime: boolean; stripeSubscriptionId: string | null;
      createdAt: Date;
    }>>(
      `SELECT id, "userId", "productKey", status, "accessUntil",
              "amountPaidCents", "isOneTime", "stripeSubscriptionId", "createdAt"
         FROM "Subscription"
        ORDER BY "createdAt" DESC`,
    );

    const subsByUser = new Map<string, any[]>();
    for (const s of subscriptions) {
      if (!subsByUser.has(s.userId)) subsByUser.set(s.userId, []);
      subsByUser.get(s.userId)!.push({
        id: s.id,
        productKey: s.productKey,
        status: s.status,
        accessUntil: s.accessUntil,
        amountPaidCents: s.amountPaidCents,
        isOneTime: s.isOneTime,
        stripeSubscriptionId: s.stripeSubscriptionId,
        createdAt: s.createdAt,
      });
    }

    let rows: any[] = users.map((u) => ({
      id: u.id, email: u.email, createdAt: u.createdAt,
      state: u.state, ageConfirmed: u.ageConfirmed, ageConfirmedAt: u.ageConfirmedAt,
      subscriptions: subsByUser.get(u.id) || [],
    }));

    if (search) {
      rows = rows.filter((r) => r.email.toLowerCase().includes(search));
    }
    if (!showInactive) {
      const now = Date.now();
      rows = rows.filter((r) =>
        r.subscriptions.some((s: any) => s.accessUntil && new Date(s.accessUntil).getTime() > now)
      );
    }

    const summary = {
      totalUsers: users.length,
      activeSubscribers: rows.length,
      totalSubscriptionRows: subscriptions.length,
      activeSubscriptionRows: subscriptions.filter((s) => s.accessUntil && new Date(s.accessUntil).getTime() > Date.now()).length,
    };

    return NextResponse.json({ success: true, summary, customers: rows });
  } catch (err: any) {
    console.error('[admin/customers GET] failed', err);
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}

// PATCH: extend or revoke a single subscription row by id.
// Body: { subscriptionId: string, action: 'extend_days' | 'revoke', days?: number }
export async function PATCH(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'bad json' }, { status: 400 }); }
  const subscriptionId = String(body?.subscriptionId || '');
  const action = String(body?.action || '');
  if (!subscriptionId || !action) return NextResponse.json({ success: false, error: 'missing fields' }, { status: 400 });

  try {
    if (action === 'extend_days') {
      const days = Math.max(1, Math.min(365, Number(body?.days || 7)));
      await prisma.$executeRawUnsafe(
        `UPDATE "Subscription"
            SET "accessUntil" = COALESCE("accessUntil", NOW()) + ($1 * INTERVAL '1 day'),
                "updatedAt" = NOW()
          WHERE id = $2`,
        days, subscriptionId,
      );
      return NextResponse.json({ success: true, action: 'extend_days', days });
    }
    if (action === 'revoke') {
      await prisma.$executeRawUnsafe(
        `UPDATE "Subscription"
            SET "accessUntil" = NULL, status = 'revoked', "updatedAt" = NOW()
          WHERE id = $1`,
        subscriptionId,
      );
      return NextResponse.json({ success: true, action: 'revoke' });
    }
    return NextResponse.json({ success: false, error: 'unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('[admin/customers PATCH] failed', err);
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}
