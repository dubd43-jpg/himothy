import { NextResponse } from 'next/server';
import { runPower20Research } from '@/services/deepResearchService';

let cache: { data: any; generatedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    if (!forceRefresh && cache && Date.now() - cache.generatedAt < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, cached: true, ...cache.data });
    }

    const result = await runPower20Research();
    cache = { data: result, generatedAt: Date.now() };

    return NextResponse.json({ success: true, cached: false, ...result });
  } catch (error) {
    console.error('Power 20 research failed', error);
    return NextResponse.json({ success: false, error: 'Power 20 scan failed.' }, { status: 500 });
  }
}
