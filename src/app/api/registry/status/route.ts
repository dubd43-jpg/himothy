import { NextResponse } from 'next/server';
import { getRegistryBoardPicks } from '@/services/pickRegistryService';
import { fetchLiveSlate } from '@/lib/liveSlate';
import {
  getOfficialTrackingLabel,
  OFFICIAL_TRACKING_START_DATE,
  OFFICIAL_TRACKING_TIMEZONE,
} from '@/lib/officialTracking';

const DEFAULT_COUNTS: Record<string, number> = {
  GRAND_SLAM: 0,
  PRESSURE_PACK: 0,
  VIP_4_PACK: 0,
  PARLAY_PLAN: 0,
  OVERNIGHT: 0,
  PERSONAL_PLAY: 0,
  HAILMARY: 0,
  OVERSEAS: 0,
};

const CATEGORY_ROTATION = [
  'GRAND_SLAM',
  'PRESSURE_PACK',
  'VIP_4_PACK',
  'PARLAY_PLAN',
  'OVERNIGHT',
  'PERSONAL_PLAY',
  'HAILMARY',
  'OVERSEAS',
];

function provisionalCategoryForLeague(index: number, league: string) {
  if (league.toLowerCase().includes('soccer')) return 'OVERSEAS';
  return CATEGORY_ROTATION[index % CATEGORY_ROTATION.length];
}

export async function GET() {
  try {
    const board = await getRegistryBoardPicks({});

    if (board.length === 0) {
      const games = await fetchLiveSlate({ maxGames: 30 });
      const counts = { ...DEFAULT_COUNTS };
      games
        .filter((game) => !game.isFinal && game.verified)
        .forEach((game, idx) => {
          const category = provisionalCategoryForLeague(idx, game.league);
          if (typeof counts[category] !== 'number') counts[category] = 0;
          counts[category] += 1;
        });

      return NextResponse.json({
        success: true,
        counts,
        audit_stats: {
          total_checked: games.length,
          published: 0,
          locked: 0,
          graded: 0,
          archived: 0,
          last_audit: new Date().toISOString(),
          source: 'live-slate-fallback',
        },
        officialStartDate: OFFICIAL_TRACKING_START_DATE,
        officialTrackingLabel: getOfficialTrackingLabel(),
        timezone: OFFICIAL_TRACKING_TIMEZONE,
        timestamp: new Date().toISOString(),
      });
    }

    const counts = { ...DEFAULT_COUNTS };

    for (const pick of board) {
      if (typeof counts[pick.category] !== 'number') {
        counts[pick.category] = 0;
      }
      counts[pick.category] += 1;
    }

    const stats = {
      total_checked: board.length,
      published: board.filter((p) => p.status === 'published').length,
      locked: board.filter((p) => p.status === 'locked').length,
      graded: board.filter((p) => p.status === 'graded').length,
      archived: board.filter((p) => p.status === 'archived').length,
      last_audit: new Date().toISOString(),
      source: 'db-registry',
    };

    return NextResponse.json({ 
      success: true, 
      counts,
      audit_stats: stats,
      officialStartDate: OFFICIAL_TRACKING_START_DATE,
      officialTrackingLabel: getOfficialTrackingLabel(),
      timezone: OFFICIAL_TRACKING_TIMEZONE,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const games = await fetchLiveSlate({ maxGames: 20 }).catch(() => []);
    const counts = { ...DEFAULT_COUNTS };
    games
      .filter((game) => !game.isFinal && game.verified)
      .forEach((game, idx) => {
        const category = provisionalCategoryForLeague(idx, game.league);
        if (typeof counts[category] !== 'number') counts[category] = 0;
        counts[category] += 1;
      });

    return NextResponse.json({
      success: true,
      counts,
      audit_stats: {
        total_checked: games.length,
        published: 0,
        locked: 0,
        graded: 0,
        archived: 0,
        last_audit: new Date().toISOString(),
        source: 'live-slate-fallback',
      },
      officialStartDate: OFFICIAL_TRACKING_START_DATE,
      officialTrackingLabel: getOfficialTrackingLabel(),
      timezone: OFFICIAL_TRACKING_TIMEZONE,
      timestamp: new Date().toISOString(),
    });
  }
}
