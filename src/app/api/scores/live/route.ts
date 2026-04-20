import { NextResponse } from 'next/server';
import { fetchLiveSlate } from '@/lib/liveSlate';

export async function GET() {
  try {
    const games = await fetchLiveSlate({ maxGames: 30 });
    const verifiedGames = games.filter((game) => game.verified);

    return NextResponse.json({
      success: true,
      games: verifiedGames,
      timestamp: new Date().toISOString()
    });
  } catch {
    return NextResponse.json({ success: false, games: [] }, { status: 500 });
  }
}
