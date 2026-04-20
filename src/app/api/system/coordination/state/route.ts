import { NextResponse } from 'next/server';
import { getUnifiedSystemState } from '@/services/agentCoordinationService';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const boardDate = searchParams.get('boardDate') || undefined;

    const state = await getUnifiedSystemState(boardDate);

    return NextResponse.json({
      success: true,
      state,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Coordination state failed:', error);
    return NextResponse.json({ success: false, error: 'Coordination state failed' }, { status: 500 });
  }
}
