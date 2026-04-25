import { NextResponse } from 'next/server';
import { LEAGUE_URLS } from '@/lib/validation';
import { buildGamePropsResearch } from '@/services/playerPropsService';

const propCache = new Map<string, { data: any; generatedAt: number }>();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchGameSummary(gameId: string, baseUrl: string) {
  try {
    const res = await fetch(`${baseUrl}/summary?event=${gameId}`, { cache: 'no-store' });
    return res.ok ? res.json() : null;
  } catch { return null; }
}

async function findEvent(gameId: string, league: string) {
  const baseUrl = LEAGUE_URLS[league];
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/scoreboard?dates=${todayDateStr()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const event = (data.events || []).find((e: any) => String(e.id) === String(gameId));
    return event ? { event, baseUrl } : null;
  } catch { return null; }
}

function extractInjuriesOut(summary: any): { home: string[]; away: string[] } {
  const injuries = summary?.injuries;
  if (!Array.isArray(injuries)) return { home: [], away: [] };
  const home: string[] = []; const away: string[] = [];
  for (const team of injuries) {
    const side = team?.homeAway;
    for (const inj of team?.injuries || []) {
      const status = (inj?.status || '').toUpperCase();
      if (status === 'OUT' || status === 'DOUBTFUL') {
        const name = inj?.athlete?.displayName || '';
        if (side === 'home') home.push(name);
        else away.push(name);
      }
    }
  }
  return { home, away };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const gameId = url.searchParams.get('gameId');
    const league = url.searchParams.get('league');

    if (!gameId || !league) {
      return NextResponse.json({ success: false, error: 'gameId and league are required' }, { status: 400 });
    }

    const cacheKey = `${league}:${gameId}`;
    const cached = propCache.get(cacheKey);
    if (cached && Date.now() - cached.generatedAt < CACHE_TTL) {
      return NextResponse.json({ success: true, cached: true, ...cached.data });
    }

    const found = await findEvent(gameId, league);
    if (!found) {
      return NextResponse.json({ success: false, error: 'Game not found in today\'s slate' }, { status: 404 });
    }

    const { event, baseUrl } = found;
    const summary = await fetchGameSummary(gameId, baseUrl);
    const comp = event.competitions?.[0];
    const injuredOut = extractInjuriesOut(summary);

    const eventName = event.name || `${event.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'away')?.team?.displayName} @ ${event.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.displayName}`;

    const result = await buildGamePropsResearch(gameId, eventName, league, comp, summary, injuredOut);

    propCache.set(cacheKey, { data: result, generatedAt: Date.now() });
    return NextResponse.json({ success: true, cached: false, ...result });
  } catch (error) {
    console.error('Player props research failed', error);
    return NextResponse.json({ success: false, error: 'Props research failed' }, { status: 500 });
  }
}
