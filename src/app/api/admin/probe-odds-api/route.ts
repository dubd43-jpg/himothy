import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Admin diagnostic: probe The Odds API to find out exactly what the current API key has
// access to. Used to answer "do we have player props or not?" without dumping secrets.
//
// Returns:
//   - quota: remaining + used (from response headers)
//   - sports: every sport key the key can see (free tier sees a different set than paid)
//   - propsCapability: for each major league, whether a probe call for player_points-style
//     markets returns 200 + data, 200 + empty, or non-200 (access denied).
//
// Usage: /api/admin/probe-odds-api?key=<ADMIN_SECRET>

const ODDS_API = 'https://api.the-odds-api.com/v4';

async function probeSports(apiKey: string) {
  const r = await fetch(`${ODDS_API}/sports?all=false&apiKey=${apiKey}`);
  return {
    ok: r.ok,
    status: r.status,
    remaining: r.headers.get('x-requests-remaining'),
    used: r.headers.get('x-requests-used'),
    body: r.ok ? await r.json() : await r.text(),
  };
}

async function probePropsForLeague(apiKey: string, sportKey: string, market: string) {
  // /events endpoint is free quota. Find any current event and check if props market works.
  try {
    const evRes = await fetch(`${ODDS_API}/sports/${sportKey}/events?apiKey=${apiKey}`);
    if (!evRes.ok) return { sportKey, error: `events ${evRes.status}` };
    const events: any[] = await evRes.json();
    if (!events?.length) return { sportKey, status: 'no_events', message: 'no events today' };
    const ev = events[0];
    const url = `${ODDS_API}/sports/${sportKey}/events/${ev.id}/odds?apiKey=${apiKey}&regions=us&markets=${market}&oddsFormat=american`;
    const r = await fetch(url);
    if (!r.ok) {
      const errBody = await r.text();
      return { sportKey, market, status: r.status, error: errBody.slice(0, 200) };
    }
    const data = await r.json();
    const bookmakerCount = data?.bookmakers?.length || 0;
    const outcomes = (data?.bookmakers || []).reduce((s: number, b: any) => s + ((b.markets || []).reduce((sm: number, m: any) => sm + (m.outcomes?.length || 0), 0)), 0);
    return {
      sportKey, market,
      status: 'ok',
      sampleEvent: `${ev.away_team} @ ${ev.home_team}`,
      bookmakerCount,
      outcomeCount: outcomes,
    };
  } catch (e: any) {
    return { sportKey, market, error: e?.message || String(e) };
  }
}

export async function GET(req: Request) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'no THE_ODDS_API_KEY set' }, { status: 500 });

  const sportsProbe = await probeSports(apiKey);
  const sports = Array.isArray(sportsProbe.body) ? sportsProbe.body : [];

  const propProbes = await Promise.all([
    probePropsForLeague(apiKey, 'baseball_mlb', 'batter_hits'),
    probePropsForLeague(apiKey, 'basketball_nba', 'player_points'),
    probePropsForLeague(apiKey, 'icehockey_nhl', 'player_points'),
    probePropsForLeague(apiKey, 'americanfootball_nfl', 'player_pass_yds'),
  ]);

  return NextResponse.json({
    quota: { remaining: sportsProbe.remaining, used: sportsProbe.used },
    accessibleSports: sports.map((s: any) => ({ key: s.key, active: s.active, title: s.title })),
    propProbes,
  });
}
