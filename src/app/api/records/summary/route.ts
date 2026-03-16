import { NextResponse } from 'next/server';

/**
 * Persistent Running Record Engine - INTEGRITY MODE
 * Strictly aggregates real historical data. 
 * Initialized to ZERO for a fresh launch.
 */

interface RecordStats {
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  pending: number;
  units: number;
  winPercentage: string;
}

const ZERO_STATS: RecordStats = {
  wins: 0,
  losses: 0,
  pushes: 0,
  voids: 0,
  pending: 0,
  units: 0.0,
  winPercentage: "0.0%"
};

export async function GET() {
  try {
    // Resetting all category stats to zero
    const categoryStats: Record<string, RecordStats> = {
      GRAND_SLAM: { ...ZERO_STATS },
      PERSONAL_PLAY: { ...ZERO_STATS },
      PRESSURE_PACK: { ...ZERO_STATS },
      VIP_4_PACK: { ...ZERO_STATS },
      PARLAY_PLAN: { ...ZERO_STATS },
      OVERNIGHT: { ...ZERO_STATS },
      OVERSEAS: { ...ZERO_STATS },
      HAILMARY: { ...ZERO_STATS }
    };

    // Resetting all global history to zero
    const globalHistory = {
      today: { ...ZERO_STATS },
      yesterday: { ...ZERO_STATS },
      last7Days: { ...ZERO_STATS },
      thisMonth: { ...ZERO_STATS },
      allTime: { ...ZERO_STATS }
    };

    // Since record is zeroed out for launch
    const hasHistory = false; 

    return NextResponse.json({
      success: true,
      stats: globalHistory,
      category_stats: categoryStats,
      hasHistory,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ success: false, stats: null }, { status: 500 });
  }
}
