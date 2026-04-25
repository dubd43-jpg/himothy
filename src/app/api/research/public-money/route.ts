import { NextResponse } from 'next/server';

interface PublicMoneyResult {
  success: boolean;
  awayBetPct: number | null;
  homeBetPct: number | null;
  awayMoneyPct: number | null;
  homeMoneyPct: number | null;
  spreadAwayBetPct: number | null;
  spreadHomeBetPct: number | null;
  booksTracked: number;
}

const LEAGUE_TO_SPORT: Record<string, string> = {
  NBA: 'nba',
  NFL: 'nfl',
  MLB: 'mlb',
  NHL: 'nhl',
  NCAAB: 'ncaab',
  NCAAF: 'ncaaf',
  'College Basketball': 'ncaab',
  Soccer: 'soccer',
};

// Book IDs that carry public betting data (Consensus / DraftKings)
const PUBLIC_BOOK_IDS = new Set([15, 3, 74, 123]);

function normName(s: string) {
  return s.toLowerCase().replace(/[^a-z]/g, '');
}

function teamsMatch(anTeam: string, queryTeam: string): boolean {
  const a = normName(anTeam);
  const q = normName(queryTeam);
  return a === q || a.includes(q) || q.includes(a);
}

let cache: Map<string, { data: PublicMoneyResult; ts: number }> = new Map();
const TTL = 3 * 60 * 1000; // 3 min

export async function GET(req: Request) {
  const url = new URL(req.url);
  const awayTeam = url.searchParams.get('awayTeam') || '';
  const homeTeam = url.searchParams.get('homeTeam') || '';
  const league = url.searchParams.get('league') || '';

  if (!awayTeam || !homeTeam || !league) {
    return NextResponse.json({ success: false, error: 'Missing params' }, { status: 400 });
  }

  const cacheKey = `${league}:${normName(awayTeam)}:${normName(homeTeam)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json({ ...cached.data, cached: true });
  }

  const sport = LEAGUE_TO_SPORT[league];
  if (!sport) {
    return NextResponse.json({ success: true, awayBetPct: null, homeBetPct: null, awayMoneyPct: null, homeMoneyPct: null, spreadAwayBetPct: null, spreadHomeBetPct: null, booksTracked: 0 });
  }

  try {
    const res = await fetch(`https://api.actionnetwork.com/web/v1/scoreboard/${sport}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; sports-research-bot/1.0)' },
      next: { revalidate: 180 },
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, awayBetPct: null, homeBetPct: null, awayMoneyPct: null, homeMoneyPct: null, spreadAwayBetPct: null, spreadHomeBetPct: null, booksTracked: 0 });
    }

    const data = await res.json();
    const games: any[] = data.games || [];

    let matchedGame: any = null;
    for (const game of games) {
      const teams: any[] = game.teams || [];
      const awayId = game.away_team_id;
      const homeId = game.home_team_id;

      const awayTeamObj = teams.find((t) => t.id === awayId);
      const homeTeamObj = teams.find((t) => t.id === homeId);

      if (!awayTeamObj || !homeTeamObj) continue;

      const awayMatch = teamsMatch(awayTeamObj.full_name || awayTeamObj.short_name || '', awayTeam) ||
        teamsMatch(awayTeamObj.abbr || '', awayTeam);
      const homeMatch = teamsMatch(homeTeamObj.full_name || homeTeamObj.short_name || '', homeTeam) ||
        teamsMatch(homeTeamObj.abbr || '', homeTeam);

      if (awayMatch && homeMatch) {
        matchedGame = game;
        break;
      }
    }

    if (!matchedGame) {
      const result: PublicMoneyResult = { success: true, awayBetPct: null, homeBetPct: null, awayMoneyPct: null, homeMoneyPct: null, spreadAwayBetPct: null, spreadHomeBetPct: null, booksTracked: 0 };
      cache.set(cacheKey, { data: result, ts: Date.now() });
      return NextResponse.json(result);
    }

    const oddsEntries: any[] = matchedGame.odds || [];

    // Prefer book 15 (DraftKings) or pick first one with non-null public data
    let bestOdds: any = null;
    for (const bookId of [15, 3, 74, 123]) {
      const entry = oddsEntries.find((o) => o.book_id === bookId && (o.ml_home_public != null || o.spread_home_public != null));
      if (entry) { bestOdds = entry; break; }
    }
    if (!bestOdds) {
      bestOdds = oddsEntries.find((o) => o.ml_home_public != null || o.spread_home_public != null) || null;
    }

    const result: PublicMoneyResult = {
      success: true,
      awayBetPct: bestOdds?.ml_away_public ?? null,
      homeBetPct: bestOdds?.ml_home_public ?? null,
      awayMoneyPct: bestOdds?.ml_away_money ?? null,
      homeMoneyPct: bestOdds?.ml_home_money ?? null,
      spreadAwayBetPct: bestOdds?.spread_away_public ?? null,
      spreadHomeBetPct: bestOdds?.spread_home_public ?? null,
      booksTracked: oddsEntries.filter((o) => PUBLIC_BOOK_IDS.has(o.book_id)).length,
    };

    cache.set(cacheKey, { data: result, ts: Date.now() });
    return NextResponse.json(result);
  } catch (err) {
    console.error('public-money fetch failed', err);
    return NextResponse.json({ success: false, awayBetPct: null, homeBetPct: null, awayMoneyPct: null, homeMoneyPct: null, spreadAwayBetPct: null, spreadHomeBetPct: null, booksTracked: 0 });
  }
}
