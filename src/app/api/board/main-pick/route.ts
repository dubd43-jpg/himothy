import { NextResponse } from 'next/server';
import { getBoardMainPick } from '@/services/pickRegistryService';
import { getEtDateKey } from '@/lib/officialTracking';
import { hasDatabase } from '@/lib/hasDatabase';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const boardDate = searchParams.get('boardDate') || undefined;
    // Report the Eastern board date, never the server's UTC date — after 8pm ET the UTC
    // clock has already rolled to tomorrow, which made this endpoint claim the wrong day.
    const reportedDate = boardDate || getEtDateKey();

    if (!hasDatabase()) {
      return NextResponse.json({
        success: true,
        boardDate: reportedDate,
        hasMainPick: false,
        mainPick: null,
      });
    }

    const mainPick = await getBoardMainPick(boardDate);

    return NextResponse.json({
      success: true,
      boardDate: reportedDate,
      hasMainPick: Boolean(mainPick),
      mainPick,
    });
  } catch (error) {
    console.error('Main pick fetch failed:', error);
    return NextResponse.json({ success: false, error: 'Main pick fetch failed' }, { status: 500 });
  }
}
