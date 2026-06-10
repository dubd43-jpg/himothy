import { NextResponse } from 'next/server';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { runBacktest } from '@/services/backtestService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const days = Math.max(7, Math.min(365, Number(searchParams.get('days') || 60)));
  try {
    const result = await runBacktest(days);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[backtest] failed', err);
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}
