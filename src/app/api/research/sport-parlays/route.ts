import { NextResponse } from 'next/server';
import { buildSportParlays } from '@/services/deepResearchService';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// One 4-leg parlay per major NA sport, single-sport each. Skips any sport that can't
// produce 4 quality legs. Single-game sports (NBA playoffs) fill from player/game props.
// Cached 10 min in-process so repeated loads don't re-scan every sport.
let cache: { data: any; at: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('refresh') === 'true';
    if (!force && cache && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json({ success: true, cached: true, ...cache.data });
    }
    const parlays = await buildSportParlays();
    const data = { parlays, generatedAt: new Date().toISOString() };
    cache = { data, at: Date.now() };
    return NextResponse.json({ success: true, cached: false, ...data });
  } catch (err: any) {
    console.error('[sport-parlays] route error', err);
    return NextResponse.json({ success: false, error: err?.message || 'sport-parlay scan failed' }, { status: 500 });
  }
}
