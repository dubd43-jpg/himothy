import { NextResponse } from 'next/server';
import { fetchLiveSlate } from '@/lib/liveSlate';

// Always fetch fresh — live scores must be accurate to the moment, never cached.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // High cap so every game we have a pick on is present in the feed (the picks UI
    // merges this map by gameId to show live score / clock / result on each card).
    const games = await fetchLiveSlate({ maxGames: 120 });
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
