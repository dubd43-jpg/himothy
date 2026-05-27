import { NextResponse } from 'next/server';
import { getParlayStats } from '@/services/pickRegistryService';
import { hasDatabase } from '@/lib/hasDatabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!hasDatabase()) {
    return NextResponse.json({
      success: true,
      byTicket: [],
      byLegCount: {},
      bySgpTheme: {},
      overall: { tickets: 0, wins: 0, losses: 0, pending: 0, winRate: '0.0%' },
    });
  }
  try {
    const stats = await getParlayStats();
    return NextResponse.json({ success: true, ...stats });
  } catch (error) {
    console.error('parlay-stats failed', error);
    return NextResponse.json({ success: false, error: 'Failed to load parlay stats' }, { status: 500 });
  }
}
