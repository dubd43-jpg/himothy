import { NextResponse } from 'next/server';
import { getBoardMainPick } from '@/services/pickRegistryService';
import { hasDatabase } from '@/lib/hasDatabase';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const boardDate = searchParams.get('boardDate') || undefined;

    if (!hasDatabase()) {
      return NextResponse.json({
        success: true,
        boardDate: boardDate || new Date().toISOString().slice(0, 10),
        hasMainPick: false,
        mainPick: null,
      });
    }

    const mainPick = await getBoardMainPick(boardDate);

    return NextResponse.json({
      success: true,
      boardDate: boardDate || new Date().toISOString().slice(0, 10),
      hasMainPick: Boolean(mainPick),
      mainPick,
    });
  } catch (error) {
    console.error('Main pick fetch failed:', error);
    return NextResponse.json({ success: false, error: 'Main pick fetch failed' }, { status: 500 });
  }
}
