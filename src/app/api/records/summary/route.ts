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
import { hasDatabase } from '@/lib/hasDatabase';
import { recoverMissedRegistryPicks } from '@/services/recordBoardService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function dateKey(date: Date) {
  return getEtDateKey(date);
}

const EMPTY_STAT = {
  wins: 0, losses: 0, pushes: 0, voids: 0, pending: 0, units: 0,
  winPercentage: '0.0%', avgEdgeScore: 0, clvBeatRate: '0.0%', clvTracked: 0,
};

/** Clean zeroed payload used before any history exists or when no DB is configured. */
function emptyRecordPayload() {
  return {
    success: true,
    stats: {
      today: EMPTY_STAT, yesterday: EMPTY_STAT, last7Days: EMPTY_STAT,
      thisMonth: EMPTY_STAT, allTime: EMPTY_STAT,
    },
    category_stats: {},
    product_line_stats: {},
    sport_stats: {},
    market_stats: {},
    adaptive_policy: null,
    totals: { ...EMPTY_STAT, totalPicks: 0, winRate: '0.0%' },
    hasHistory: false,
    officialStartDate: OFFICIAL_TRACKING_START_DATE,
    officialTrackingLabel: getOfficialTrackingLabel(),
    timezone: OFFICIAL_TRACKING_TIMEZONE,
    liveNightlyRecord: { winsTonight: 0, lossesTonight: 0, pushesTonight: 0, pendingTonight: 0, liveNightRecordDisplay: '0-0' },
    dailyRecord: null,
    lifetimeRecord: null,
    timestamp: new Date().toISOString(),
  };
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
  // No real database yet → return a clean 0-0 record instead of a 500 that
  // leaves the dashboard stuck on its loading skeleton.
  if (!hasDatabase()) {
    return NextResponse.json(emptyRecordPayload());
  }
  try {
    // Recover any genuinely-published picks that slipped the live recorder, from the
    // frozen slates (throttled internally so this is a no-op on most requests). This is
    // how the late-night Dodgers Grand Slam gets restored without a cron/secret.
    await recoverMissedRegistryPicks();
    // Grade BEFORE archiving so finished games settle to W/L while still active —
    // otherwise they'd be archived as "pending" and never counted.
    await gradeRegistryBoard();
    await archiveClosedBoards();
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
            streak: value.streak || { type: null, count: 0 },
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
    // Degrade gracefully: show a clean 0-0 record rather than breaking the dashboard.
    return NextResponse.json(emptyRecordPayload());
  }
}
