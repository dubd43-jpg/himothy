import { NextResponse } from 'next/server';
import { PICK_REGISTRY } from '@/lib/picksData';
import { getRegistryBoardPicks } from '@/services/pickRegistryService';
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

function buildCountsFromStaticRegistry() {
  const counts = { ...DEFAULT_COUNTS };
  for (const pick of PICK_REGISTRY) {
    if (typeof counts[pick.category] !== 'number') {
      counts[pick.category] = 0;
    }
    counts[pick.category] += 1;
  }
  return counts;
}

export async function GET() {
  try {
    const board = await getRegistryBoardPicks({});
    const useStaticFallback = board.length === 0;
    const counts = useStaticFallback ? buildCountsFromStaticRegistry() : { ...DEFAULT_COUNTS };

    if (!useStaticFallback) {
      for (const pick of board) {
        if (typeof counts[pick.category] !== 'number') {
          counts[pick.category] = 0;
        }
        counts[pick.category] += 1;
      }
    }

    const stats = {
      total_checked: useStaticFallback ? PICK_REGISTRY.length : board.length,
      published: board.filter((p) => p.status === 'published').length,
      locked: board.filter((p) => p.status === 'locked').length,
      graded: board.filter((p) => p.status === 'graded').length,
      archived: board.filter((p) => p.status === 'archived').length,
      last_audit: new Date().toISOString(),
      source: useStaticFallback ? 'static-fallback' : 'db-registry',
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
    const counts = buildCountsFromStaticRegistry();
    return NextResponse.json({
      success: true,
      counts,
      audit_stats: {
        total_checked: PICK_REGISTRY.length,
        published: 0,
        locked: 0,
        graded: 0,
        archived: 0,
        last_audit: new Date().toISOString(),
        source: 'static-fallback',
      },
      officialStartDate: OFFICIAL_TRACKING_START_DATE,
      officialTrackingLabel: getOfficialTrackingLabel(),
      timezone: OFFICIAL_TRACKING_TIMEZONE,
      timestamp: new Date().toISOString(),
    });
  }
}
