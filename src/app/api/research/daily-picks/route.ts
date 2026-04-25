import { NextResponse } from 'next/server';
import { runDailyDeepResearch, type BoardType } from '@/services/deepResearchService';

// Per-board cache — each board is cached independently
const boardCache = new Map<string, { data: any; generatedAt: number }>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

const VALID_BOARDS: BoardType[] = ['north-american', 'soccer', 'tennis', 'overseas'];

function parseBoard(raw: string | null): BoardType {
  const lower = (raw || '').toLowerCase();
  if ((VALID_BOARDS as string[]).includes(lower)) return lower as BoardType;
  return 'north-american';
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const board = parseBoard(url.searchParams.get('board'));
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    const cached = boardCache.get(board);
    if (!forceRefresh && cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, cached: true, ...cached.data });
    }

    const result = await runDailyDeepResearch(board);
    boardCache.set(board, { data: result, generatedAt: Date.now() });

    return NextResponse.json({ success: true, cached: false, ...result });
  } catch (error) {
    console.error('Daily picks research failed', error);
    return NextResponse.json({ success: false, error: 'Research scan failed.' }, { status: 500 });
  }
}
