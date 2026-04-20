import { NextResponse } from 'next/server';
import { refreshLiveOpsSnapshot } from '@/services/liveOpsService';

function asBool(value: string | null) {
  return value === '1' || value === 'true' || value === 'yes';
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const force = asBool(searchParams.get('force'));
    const maxStaleSeconds = Number.isFinite(Number(searchParams.get('maxStaleSeconds')))
      ? Number(searchParams.get('maxStaleSeconds'))
      : undefined;

    const snapshot = await refreshLiveOpsSnapshot({
      force,
      reason: 'api-live-refresh',
      maxStaleSeconds,
    });

    return NextResponse.json({
      success: true,
      snapshot,
      summary: {
        gamesMonitored: snapshot.games.length,
        upcomingGames: snapshot.upcomingGameCount,
        researchReady: snapshot.researchReadyCount,
        lineChanges: snapshot.lineChangeCount,
        refreshAgeSeconds: snapshot.ageSeconds,
        runCount: snapshot.runCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Live refresh status failed:', error);
    return NextResponse.json({ success: false, error: 'Live refresh failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const snapshot = await refreshLiveOpsSnapshot({
      force: body?.force === true,
      reason: typeof body?.reason === 'string' ? body.reason : 'api-live-refresh-post',
      maxStaleSeconds: Number.isFinite(Number(body?.maxStaleSeconds)) ? Number(body.maxStaleSeconds) : undefined,
    });

    return NextResponse.json({ success: true, snapshot, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Live refresh trigger failed:', error);
    return NextResponse.json({ success: false, error: 'Live refresh trigger failed' }, { status: 500 });
  }
}
