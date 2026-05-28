import { NextResponse } from 'next/server';
import { type BoardType } from '@/services/deepResearchService';
import { CACHE_TTL_MS, getOrComputeBoard, getCachedBoard, invalidateBoardCache } from '@/services/dailyBoardCache';

// Heavy multi-league research scan + per-pick best-market enrichment (totals/team-totals/
// halves/F5 fetches). Give it room so the first cold compute of the day doesn't get killed.
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const VALID_BOARDS: BoardType[] = ['north-american', 'soccer', 'tennis', 'combat', 'individual', 'racing', 'global', 'overseas'];

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

    const cached = getCachedBoard(board);
    if (!forceRefresh && cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, cached: true, ...cached.data });
    }

    if (forceRefresh) await invalidateBoardCache(board);
    const result = await getOrComputeBoard(board);
    return NextResponse.json({ success: true, cached: false, ...result });
  } catch (error) {
    console.error('Daily picks research failed', error);
    return NextResponse.json({ success: false, error: 'Research scan failed.' }, { status: 500 });
  }
}
