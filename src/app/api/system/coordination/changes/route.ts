import { NextResponse } from 'next/server';
import { getRecentCoordinationChanges } from '@/services/agentCoordinationService';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number.isFinite(Number(searchParams.get('limit'))) ? Number(searchParams.get('limit')) : 50;

    const changes = await getRecentCoordinationChanges(limit);

    return NextResponse.json({
      success: true,
      count: changes.length,
      changes,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Coordination change log failed:', error);
    return NextResponse.json({ success: false, error: 'Coordination change log failed' }, { status: 500 });
  }
}
