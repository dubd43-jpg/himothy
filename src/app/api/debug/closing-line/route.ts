import { NextResponse } from 'next/server';
import { LEAGUE_URLS } from '@/lib/validation';

// Debug-only: directly tests the closing-line lookup against ESPN's /summary endpoint so we
// can see whether the data is present and how our parser interprets it. Safe to leave
// behind — it only reads ESPN public data.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const gameId = url.searchParams.get('gameId') || '';
  const league = url.searchParams.get('league') || 'MLB';
  const baseUrl = LEAGUE_URLS[league];
  if (!gameId || !baseUrl) {
    return NextResponse.json({ error: 'missing gameId or league' }, { status: 400 });
  }
  const t0 = Date.now();
  let status = 0;
  let pickcenter: any = null;
  let parsed: any = null;
  try {
    const res = await fetch(`${baseUrl}/summary?event=${gameId}`, { cache: 'no-store' });
    status = res.status;
    if (res.ok) {
      const data = await res.json();
      pickcenter = Array.isArray(data?.pickcenter) ? data.pickcenter[0] : null;
      if (pickcenter) {
        const spread = typeof pickcenter.spread === 'number' ? pickcenter.spread : Number.parseFloat(pickcenter.spread ?? '');
        const ou = typeof pickcenter.overUnder === 'number' ? pickcenter.overUnder : Number.parseFloat(pickcenter.overUnder ?? '');
        const det = String(pickcenter.details ?? '').trim().toUpperCase();
        const m = det.match(/^([A-Z]{2,4})\s*[-]/);
        parsed = {
          spread: Number.isFinite(spread) ? spread : null,
          overUnder: Number.isFinite(ou) ? ou : null,
          favAbbr: m ? m[1] : null,
        };
      }
    }
  } catch (err) {
    return NextResponse.json({ error: String(err), elapsedMs: Date.now() - t0 }, { status: 500 });
  }
  return NextResponse.json({
    league, gameId, status, elapsedMs: Date.now() - t0,
    rawPickcenter: pickcenter ? { spread: pickcenter.spread, overUnder: pickcenter.overUnder, details: pickcenter.details } : null,
    parsed,
  });
}
