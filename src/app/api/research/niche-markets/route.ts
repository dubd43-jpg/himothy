import { NextResponse } from 'next/server';
import { getF5InsightForGame, getAnytimeScorers, hasOddsApi } from '@/services/oddsApiService';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const league = url.searchParams.get('league') || '';
  const home = url.searchParams.get('home') || '';
  const away = url.searchParams.get('away') || '';

  if (!league || !home || !away) {
    return NextResponse.json({ success: false, error: 'Missing league/home/away' }, { status: 400 });
  }
  if (!hasOddsApi()) {
    return NextResponse.json({ success: true, available: false, f5: null, scorers: [] });
  }

  try {
    const [f5, scorers] = await Promise.all([
      league === 'MLB' ? getF5InsightForGame(away, home) : Promise.resolve(null),
      (league === 'NFL' || league === 'College Football' || league === 'NHL')
        ? getAnytimeScorers(league, away, home)
        : Promise.resolve([]),
    ]);
    return NextResponse.json({ success: true, available: true, f5, scorers });
  } catch (err) {
    console.error('niche-markets route error', err);
    return NextResponse.json({ success: false, error: 'Lookup failed' }, { status: 500 });
  }
}
