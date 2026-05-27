import { NextResponse } from 'next/server';
import { getAltPlayerPropsForGame, hasOddsApi } from '@/services/oddsApiService';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// On-demand alt-prop ladders for a single game. Per-event, quota-heavy call so we only
// fire it when a user actually opens the breakdown page. Cached 3h.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const league = url.searchParams.get('league') || '';
  const home = url.searchParams.get('home') || '';
  const away = url.searchParams.get('away') || '';
  if (!league || !home || !away) {
    return NextResponse.json({ success: false, error: 'Missing params' }, { status: 400 });
  }
  if (!hasOddsApi()) {
    return NextResponse.json({ success: true, available: false, ladders: [] });
  }
  try {
    const ladders = await getAltPlayerPropsForGame(league, away, home);
    return NextResponse.json({ success: true, available: true, ladders });
  } catch (err) {
    console.error('alt-props route error', err);
    return NextResponse.json({ success: false, error: 'Lookup failed' }, { status: 500 });
  }
}
