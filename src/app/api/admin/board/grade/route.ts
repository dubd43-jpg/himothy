import { NextResponse } from 'next/server';
import { gradeRegistryBoard } from '@/services/pickRegistryService';
import { reviewAndAdaptPolicy } from '@/services/adaptiveIntelligenceService';
import { runCoordinatedBoardAction } from '@/services/agentCoordinationService';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const boardDate = typeof body.boardDate === 'string' ? body.boardDate : undefined;
    const reviewWindowDays = Number.isFinite(Number(body.reviewWindowDays)) ? Number(body.reviewWindowDays) : 7;
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'grade board';

    const coordinated = await runCoordinatedBoardAction(
      {
        action: 'grade',
        boardDate,
        reason,
        agent: 'api-admin-board-grade',
      },
      async ({ boardDate: coordinatedBoardDate }) => {
        const result = await gradeRegistryBoard(coordinatedBoardDate);
        const adaptation = await reviewAndAdaptPolicy(reviewWindowDays);
        return { result, adaptation };
      }
    );

    return NextResponse.json({
      success: true,
      boardDate: coordinated.boardDate,
      graded: coordinated.result.result.gradedCount,
      adaptation: coordinated.result.adaptation,
      coordination: {
        before: coordinated.before,
        after: coordinated.after,
      },
      gradedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Board grade failed:', error);
    const message = error instanceof Error ? error.message : 'Board grade failed';
    if (message.includes('COORDINATION_CONFLICT')) {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }
    if (message.includes('COORDINATION_BLOCKED')) {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Board grade failed' }, { status: 500 });
  }
}
