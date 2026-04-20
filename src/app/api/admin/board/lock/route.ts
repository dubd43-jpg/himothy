import { NextResponse } from 'next/server';
import { lockRegistryBoard } from '@/services/pickRegistryService';
import { runCoordinatedBoardAction } from '@/services/agentCoordinationService';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const boardDate = typeof body.boardDate === 'string' ? body.boardDate : undefined;
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'lock board';

    const coordinated = await runCoordinatedBoardAction(
      {
        action: 'lock',
        boardDate,
        reason,
        agent: 'api-admin-board-lock',
      },
      async ({ boardDate: coordinatedBoardDate }) => {
        await lockRegistryBoard(coordinatedBoardDate);
        return { ok: true };
      }
    );

    return NextResponse.json({
      success: true,
      boardDate: coordinated.boardDate,
      coordination: {
        before: coordinated.before,
        after: coordinated.after,
      },
      lockedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Board lock failed:', error);
    const message = error instanceof Error ? error.message : 'Board lock failed';
    if (message.includes('COORDINATION_CONFLICT')) {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }
    if (message.includes('COORDINATION_BLOCKED')) {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Board lock failed' }, { status: 500 });
  }
}
