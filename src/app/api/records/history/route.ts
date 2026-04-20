import { NextRequest, NextResponse } from 'next/server';
import { getRegistryHistoryDay, gradeRegistryBoard } from '@/services/pickRegistryService';
import {
  getOfficialBoardDate,
  getOfficialTrackingLabel,
  OFFICIAL_TRACKING_START_DATE,
  OFFICIAL_TRACKING_TIMEZONE,
} from '@/lib/officialTracking';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateQuery = searchParams.get('date');
    const boardDate = getOfficialBoardDate(dateQuery || undefined);

    await gradeRegistryBoard(boardDate);
    const history = await getRegistryHistoryDay(boardDate);

    return NextResponse.json({
      success: true,
      boardDate: history.boardDate,
      stats: {
        today: {
          wins: history.dailyRecord.wins,
          losses: history.dailyRecord.losses,
          pushes: history.dailyRecord.pushes,
          voids: history.dailyRecord.voids,
          pending: history.dailyRecord.pending,
          units: history.dailyRecord.units,
          winPercentage: history.dailyRecord.winRate,
          avgEdgeScore: history.picks.length
            ? Number((history.picks.reduce((sum, pick) => sum + (pick.edgeScore || 0), 0) / history.picks.length).toFixed(1))
            : 0,
          clvBeatRate: (() => {
            const tracked = history.picks.filter((pick) => pick.clvDelta != null);
            if (tracked.length === 0) return '0.0%';
            const beat = tracked.filter((pick) => (pick.clvDelta || 0) < 0).length;
            return `${((beat / tracked.length) * 100).toFixed(1)}%`;
          })(),
        },
      },
      gradedPicks: history.picks.map((row) => ({
        id: row.id,
        pick: {
          pickId: row.id,
          boardDate: row.boardDate,
          publishedAt: row.publishTime,
          lockedAt: row.lockTime,
          sport: row.sport,
          league: row.league,
          productLine: row.productLine,
          category: row.category,
          eventId: row.eventId,
          eventName: row.eventName,
          marketType: row.marketType,
          selection: row.selection,
          line: row.line || '-',
          odds: row.odds || '-',
          sportsbook: row.sportsbook,
          status: row.status,
          result: row.result,
          settledAt: row.gradedAt,
          gradingSource: 'league-scoreboard-feed',
          notes: row.reasoningSummary || null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          confidence: row.confidenceTier || '',
          reasoning: row.reasoningSummary || '',
          riskSummary: row.riskSummary || '',
          edgeScore: row.edgeScore || 0,
          edgeSignals: row.edgeSignals || {},
          projectedClosingOdds: row.projectedClosingOdds,
          closingOdds: row.closingOdds,
          clvDelta: row.clvDelta,
          isLocked: row.isLocked,
        },
        status: row.result === 'pending' ? 'PENDING' : row.result.toUpperCase(),
      })),
      hasHistory: history.picks.length > 0,
      officialStartDate: OFFICIAL_TRACKING_START_DATE,
      officialTrackingLabel: getOfficialTrackingLabel(),
      timezone: OFFICIAL_TRACKING_TIMEZONE,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("History API Error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch history" }, { status: 500 });
  }
}
