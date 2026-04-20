import { getOfficialTrackingSnapshot, getRegistrySummary, gradeRegistryBoard } from '@/services/pickRegistryService';
import { getOfficialBoardDate } from '@/lib/officialTracking';

interface GradedStatsPayload {
  success: boolean;
  stats: {
    today: any;
    yesterday: any;
    last7Days: any;
    thisMonth: any;
    allTime: any;
  };
  category_stats: Record<string, unknown>;
  product_line_stats: Record<string, unknown>;
  sport_stats: Record<string, unknown>;
  liveNightlyRecord: {
    winsTonight: number;
    lossesTonight: number;
    pushesTonight: number;
    voidsTonight: number;
    pendingTonight: number;
    totalSettledTonight: number;
    liveNightRecordDisplay: string;
  };
  hasHistory: boolean;
  timestamp: string;
}

function asStats(totals: any) {
  return {
    wins: totals.wins,
    losses: totals.losses,
    pushes: totals.pushes,
    voids: totals.voids,
    pending: totals.pending,
    units: totals.units,
    winPercentage: totals.winRate,
    avgEdgeScore: totals.avgEdgeScore || 0,
    clvBeatRate: totals.clvBeatRate || '0.0%',
  };
}

export async function getLiveGradedStats(targetDate?: Date): Promise<GradedStatsPayload> {
  const boardDate = getOfficialBoardDate(targetDate ? targetDate.toISOString().slice(0, 10) : undefined);

  await gradeRegistryBoard(boardDate);

  const [allTimeSummary, todaySummary, snapshot] = await Promise.all([
    getRegistrySummary(),
    getRegistrySummary({ from: boardDate, to: boardDate }),
    getOfficialTrackingSnapshot(boardDate),
  ]);

  return {
    success: true,
    stats: {
      today: asStats(todaySummary.totals),
      yesterday: asStats({ wins: 0, losses: 0, pushes: 0, voids: 0, pending: 0, units: 0, winRate: '0.0%', avgEdgeScore: 0, clvBeatRate: '0.0%' }),
      last7Days: asStats(allTimeSummary.totals),
      thisMonth: asStats(allTimeSummary.totals),
      allTime: asStats(allTimeSummary.totals),
    },
    category_stats: allTimeSummary.byCategory,
    product_line_stats: allTimeSummary.byProductLine,
    sport_stats: allTimeSummary.bySport,
    liveNightlyRecord: snapshot.liveNightly,
    hasHistory: allTimeSummary.totals.totalPicks > 0,
    timestamp: new Date().toISOString(),
  };
}
