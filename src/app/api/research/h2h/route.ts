import { NextResponse } from 'next/server';
import { getH2HData } from '@/services/h2hService';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const league = url.searchParams.get('league') || '';
  const gameId = url.searchParams.get('gameId') || '';
  const homeTeamId = url.searchParams.get('homeTeamId') || '';
  const awayTeamId = url.searchParams.get('awayTeamId') || '';
  const playerIds = url.searchParams.get('playerIds') || '';

  if (!league || !gameId || !homeTeamId || !awayTeamId) {
    return NextResponse.json({ success: false, error: 'Missing required params' }, { status: 400 });
  }

  try {
    const targetPlayerIds = playerIds ? playerIds.split(',').filter(Boolean) : [];
    const data = await getH2HData({ league, gameId, homeTeamId, awayTeamId, targetPlayerIds });
    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    console.error('H2H route error', err);
    return NextResponse.json({ success: false, error: 'H2H lookup failed' }, { status: 500 });
  }
}
