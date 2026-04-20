import { NextResponse } from 'next/server';
import {
  RESEARCH_LANE_LEAGUES,
  ResearchLane,
  scanAllResearchLanes,
  scanEdgeBoard,
  scanEdgeLane,
} from '@/services/edgeDetectionEngine';

function parseLane(value: string | null): ResearchLane | 'all' {
  if (!value || value === 'all') return 'all';
  if (value === 'domestic' || value === 'soccer' || value === 'tennis' || value === 'overseas') return value;
  return 'all';
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lane = parseLane(searchParams.get('lane'));
    const allowMixed = searchParams.get('allowMixed') === 'true';
    const leaguesParam = searchParams.get('leagues');

    // Default behavior is lane-separated research. Mixed scanning is opt-in only.
    if (leaguesParam && allowMixed) {
      const leagues = leaguesParam.split(',').map((x) => x.trim()).filter(Boolean);
      const mixed = await scanEdgeBoard(leagues);
      return NextResponse.json({
        success: true,
        source: 'real-edge-scan',
        mode: 'mixed-explicit',
        generatedAt: new Date().toISOString(),
        leagues,
        rejectedLowData: mixed.rejectedLowData,
        count: mixed.candidates.length,
        candidates: mixed.candidates,
      });
    }

    if (lane === 'all') {
      const grouped = await scanAllResearchLanes();
      const totalCount = Object.values(grouped).reduce((sum, bucket) => sum + bucket.candidates.length, 0);
      const totalRejected = Object.values(grouped).reduce((sum, bucket) => sum + bucket.rejectedLowData, 0);

      return NextResponse.json({
        success: true,
        source: 'real-edge-scan',
        mode: 'lane-separated',
        generatedAt: new Date().toISOString(),
        count: totalCount,
        rejectedLowData: totalRejected,
        lanes: grouped,
      });
    }

    const singleLane = await scanEdgeLane(lane);
    return NextResponse.json({
      success: true,
      source: 'real-edge-scan',
      mode: 'single-lane',
      generatedAt: new Date().toISOString(),
      lane,
      leagues: RESEARCH_LANE_LEAGUES[lane],
      count: singleLane.candidates.length,
      rejectedLowData: singleLane.rejectedLowData,
      candidates: singleLane.candidates,
    });
  } catch (error) {
    console.error('Edge scan failed:', error);
    return NextResponse.json({ success: false, error: 'Edge scan failed' }, { status: 500 });
  }
}
