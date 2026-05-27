import { NextResponse } from 'next/server';
import { getAltLinesForGame, hasOddsApi } from '@/services/oddsApiService';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// On-demand alt-spreads / alt-totals / team-totals ladder for a single game. Hits the
// Odds API one event at a time, cached 3h. This is one of Hard Rock's softest-priced
// market families — the goal is to surface the cheapest line at the best book per step.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const league = url.searchParams.get('league') || '';
  const home = url.searchParams.get('home') || '';
  const away = url.searchParams.get('away') || '';
  if (!league || !home || !away) {
    return NextResponse.json({ success: false, error: 'Missing params' }, { status: 400 });
  }
  if (!hasOddsApi()) {
    return NextResponse.json({ success: true, available: false, altLines: null });
  }
  try {
    const altLines = await getAltLinesForGame(league, away, home);
    return NextResponse.json({ success: true, available: true, altLines });
  } catch (err) {
    console.error('alt-lines route error', err);
    return NextResponse.json({ success: false, error: 'Lookup failed' }, { status: 500 });
  }
}
