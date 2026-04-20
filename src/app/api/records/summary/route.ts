import { NextResponse } from 'next/server';
import {
  archiveClosedBoards,
  getOfficialTrackingSnapshot,
  getRegistrySummary,
  gradeRegistryBoard,
} from '@/services/pickRegistryService';
import { getActiveAdaptivePolicy } from '@/services/adaptiveIntelligenceService';
import {
  clampToOfficialStartDate,
  getEtDateKey,
  getOfficialTrackingLabel,
  OFFICIAL_TRACKING_START_DATE,
  OFFICIAL_TRACKING_TIMEZONE,
} from '@/lib/officialTracking';

function dateKey(date: Date) {
  return getEtDateKey(date);
}

function toStats(totals: any) {
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
    clvTracked: totals.clvTracked || 0,
  };
}

/**
 * Persistent Running Record Engine - AUTOMATION MODE
 * Automatically grades picks against live ESPN API results.
 */

export async function GET() {
  try {
    await archiveClosedBoards();
    await gradeRegistryBoard();
    const now = new Date();
    const today = dateKey(now);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(now.getDate() - 1);

    const [allTimeSummary, todaySummary, yesterdaySummary, last7Summary, monthSummary, adaptivePolicy, snapshot] = await Promise.all([
      getRegistrySummary(),
      getRegistrySummary({ from: today, to: today }),
      getRegistrySummary({ from: dateKey(yesterdayDate), to: dateKey(yesterdayDate) }),
      getRegistrySummary({ from: clampToOfficialStartDate(dateKey(sevenDaysAgo)), to: today }),
      getRegistrySummary({ from: clampToOfficialStartDate(dateKey(monthStart)), to: today }),
      getActiveAdaptivePolicy(),
      getOfficialTrackingSnapshot(today),
    ]);

    const totals = allTimeSummary.totals;

    return NextResponse.json({
      success: true,
      stats: {
        today: toStats(todaySummary.totals),
        yesterday: toStats(yesterdaySummary.totals),
        last7Days: toStats(last7Summary.totals),
        thisMonth: toStats(monthSummary.totals),
        allTime: toStats(allTimeSummary.totals),
      },
      category_stats: Object.fromEntries(
        Object.entries(allTimeSummary.byCategory).map(([key, value]: [string, any]) => [
          key,
          {
            wins: value.wins,
            losses: value.losses,
            pushes: value.pushes,
            voids: value.voids,
            pending: value.pending,
            units: Number((value.units || 0).toFixed(2)),
            winPercentage: value.winRate,
            avgEdgeScore: value.avgEdgeScore || 0,
            clvBeatRate: value.clvBeatRate || '0.0%',
            clvTracked: value.clvTracked || 0,
          },
        ])
      ),
      product_line_stats: allTimeSummary.byProductLine,
      sport_stats: allTimeSummary.bySport,
      market_stats: allTimeSummary.byMarketType,
      adaptive_policy: adaptivePolicy,
      totals,
      hasHistory: totals.totalPicks > 0,
      officialStartDate: OFFICIAL_TRACKING_START_DATE,
      officialTrackingLabel: getOfficialTrackingLabel(),
      timezone: OFFICIAL_TRACKING_TIMEZONE,
      liveNightlyRecord: snapshot.liveNightly,
      dailyRecord: snapshot.dailyRecord,
      lifetimeRecord: snapshot.lifetimeRecord,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Grading Engine Error:", error);
    return NextResponse.json({ 
      success: false, 
      stats: null,
      error: "Engine synchronization failed" 
    }, { status: 500 });
  }
}
