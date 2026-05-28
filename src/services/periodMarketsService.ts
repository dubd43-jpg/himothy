// Period-market plays — first-half / second-half / quarter / period markets across every
// sport that books offer them. Plays from THIS engine sit alongside full-game picks; the
// daily slate ranks all picks by edgeScore so a hot 1H total can show up over a mid-edge
// full-game spread.
//
// User: "It needs to be done just as much as anything else. If the tendency is right, you
// need to look at everything, not just basic stuff."
//
// Markets per league (Odds API keys):
//   NBA / WNBA / NCAAB :  h2h_h1, spreads_h1, totals_h1 + _h2 + _q1..q4
//   NFL / CFB          :  h2h_h1, spreads_h1, totals_h1 + _h2 + _q1..q4
//   NHL                :  totals_p1, totals_p2, totals_p3, h2h_p1..p3
//   Soccer             :  h2h_h1, totals_h1, btts (both teams to score) + _h2
//   MLB                :  F5 (already covered by getF5InsightForGame), F3 totals
//
// Pre-game tendency for periods: ESPN doesn't expose per-period stats in gamelog cleanly,
// so we approximate. Each league has a known full-game-to-period scoring ratio
// (e.g. NBA ~50% of total goes up in 1H; NFL ~48%). We compute the team's avgTotal10
// × league_ratio = expected 1H scoring contribution, compare both teams' contributions
// against the 1H total line. When the gap is meaningful AND backed by recent O/U
// tendency on the full-game total, that's an edge play.

import { LEAGUE_TO_SPORT, normTeam } from './oddsApiService';

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

export interface PeriodMarketLine {
  market: 'h2h' | 'spread' | 'total';
  period: '1H' | '2H' | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'P1' | 'P2' | 'P3';
  line: number | null;              // spread/total line; null for ML
  homePrice: number | null;
  awayPrice: number | null;         // for ML or spread away side
  overPrice?: number | null;        // for totals
  underPrice?: number | null;
  bestBook: string | null;
}

export interface PeriodMarketsForGame {
  league: string;
  awayTeam: string;
  homeTeam: string;
  markets: PeriodMarketLine[];
}

// Default fractions of full-game scoring that happen in each period. Tuned to recent
// league-wide averages. Used to project a team's expected scoring contribution to a 1H
// or quarter total when we don't have raw period-by-period game logs.
const PERIOD_SHARE: Record<string, Partial<Record<'1H' | '2H' | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'P1' | 'P2' | 'P3', number>>> = {
  NBA:               { '1H': 0.50, '2H': 0.50, Q1: 0.25, Q2: 0.25, Q3: 0.25, Q4: 0.25 },
  WNBA:              { '1H': 0.50, '2H': 0.50, Q1: 0.25, Q2: 0.25, Q3: 0.25, Q4: 0.25 },
  'NCAA Basketball': { '1H': 0.50, '2H': 0.50 },
  NFL:               { '1H': 0.46, '2H': 0.54, Q1: 0.21, Q2: 0.25, Q3: 0.25, Q4: 0.29 },
  'College Football':{ '1H': 0.47, '2H': 0.53, Q1: 0.22, Q2: 0.25, Q3: 0.25, Q4: 0.28 },
  NHL:               { P1: 0.31, P2: 0.34, P3: 0.35 },
  // Soccer 1H ≈ slightly fewer goals than 2H (47/53 average). Per-quarter not applicable.
  'Soccer - EPL':    { '1H': 0.47, '2H': 0.53 },
  'Soccer - La Liga':{ '1H': 0.47, '2H': 0.53 },
  'Soccer - Serie A':{ '1H': 0.47, '2H': 0.53 },
  'Soccer - Bundesliga': { '1H': 0.47, '2H': 0.53 },
  'Soccer - Ligue 1':{ '1H': 0.47, '2H': 0.53 },
  'Soccer - Champions League': { '1H': 0.47, '2H': 0.53 },
};

const oddsApiPeriodKeys: Record<string, string[]> = {
  NBA:               ['spreads_h1', 'totals_h1', 'spreads_h2', 'totals_h2', 'totals_q1', 'totals_q2', 'totals_q3', 'totals_q4'],
  WNBA:              ['spreads_h1', 'totals_h1', 'totals_h2'],
  'NCAA Basketball': ['spreads_h1', 'totals_h1', 'spreads_h2', 'totals_h2'],
  NFL:               ['spreads_h1', 'totals_h1', 'spreads_h2', 'totals_h2', 'totals_q1', 'totals_q2', 'totals_q3', 'totals_q4'],
  'College Football':['spreads_h1', 'totals_h1', 'totals_q1', 'totals_q2', 'totals_q3', 'totals_q4'],
  NHL:               ['totals_p1', 'totals_p2', 'totals_p3'],
  'Soccer - EPL':    ['spreads_h1', 'totals_h1'],
  'Soccer - La Liga':['spreads_h1', 'totals_h1'],
  'Soccer - Serie A':['spreads_h1', 'totals_h1'],
  'Soccer - Bundesliga': ['spreads_h1', 'totals_h1'],
  'Soccer - Ligue 1':['spreads_h1', 'totals_h1'],
  'Soccer - Champions League': ['spreads_h1', 'totals_h1'],
};

function marketKeyToPeriod(key: string): { market: 'h2h' | 'spread' | 'total'; period: PeriodMarketLine['period'] } | null {
  const match = key.match(/^(h2h|spreads|totals)_(h1|h2|q1|q2|q3|q4|p1|p2|p3)$/i);
  if (!match) return null;
  const market = match[1] === 'spreads' ? 'spread' : match[1] === 'totals' ? 'total' : 'h2h';
  const periodMap: Record<string, PeriodMarketLine['period']> = {
    h1: '1H', h2: '2H', q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4', p1: 'P1', p2: 'P2', p3: 'P3',
  };
  return { market, period: periodMap[match[2].toLowerCase()] };
}

const periodCache = new Map<string, { data: PeriodMarketsForGame | null; at: number }>();
const PERIOD_TTL_MS = 15 * 60 * 1000;

export async function getPeriodMarketsForGame(
  league: string, awayTeam: string, homeTeam: string,
): Promise<PeriodMarketsForGame | null> {
  if (!process.env.THE_ODDS_API_KEY) return null;
  const sport = LEAGUE_TO_SPORT[league];
  const markets = oddsApiPeriodKeys[league];
  if (!sport || !markets || markets.length === 0) return null;

  const cacheKey = `period:${league}:${normTeam(awayTeam)}@@${normTeam(homeTeam)}`;
  const cached = periodCache.get(cacheKey);
  if (cached && Date.now() - cached.at < PERIOD_TTL_MS) return cached.data;

  try {
    const evRes = await fetch(`${ODDS_API_BASE}/sports/${sport}/events?apiKey=${process.env.THE_ODDS_API_KEY}`, { cache: 'no-store' });
    if (!evRes.ok) { periodCache.set(cacheKey, { data: null, at: Date.now() }); return null; }
    const events: any[] = await evRes.json();
    const ev = events.find((e) => normTeam(e.home_team) === normTeam(homeTeam) && normTeam(e.away_team) === normTeam(awayTeam));
    if (!ev?.id) { periodCache.set(cacheKey, { data: null, at: Date.now() }); return null; }

    const url = `${ODDS_API_BASE}/sports/${sport}/events/${ev.id}/odds?apiKey=${process.env.THE_ODDS_API_KEY}&regions=us&markets=${markets.join(',')}&oddsFormat=american`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) { periodCache.set(cacheKey, { data: null, at: Date.now() }); return null; }
    const data = await res.json();

    // Merge across books: for each (market, period, line) collect best price per side.
    const acc = new Map<string, {
      market: 'h2h' | 'spread' | 'total'; period: PeriodMarketLine['period']; line: number | null;
      homePrice: number | null; awayPrice: number | null;
      overPrice?: number | null; underPrice?: number | null; bestBook: string | null;
    }>();

    for (const bk of data.bookmakers || []) {
      for (const m of bk.markets || []) {
        const parsed = marketKeyToPeriod(m.key);
        if (!parsed) continue;
        for (const o of m.outcomes || []) {
          const side = String(o.name || '').toLowerCase();
          const point = typeof o.point === 'number' ? o.point : null;
          const price = typeof o.price === 'number' ? o.price : null;
          const key = `${parsed.market}|${parsed.period}|${point ?? 'ml'}`;
          let entry = acc.get(key);
          if (!entry) {
            entry = {
              market: parsed.market, period: parsed.period, line: point,
              homePrice: null, awayPrice: null, overPrice: null, underPrice: null, bestBook: null,
            };
            acc.set(key, entry);
          }
          // ML / spread sides identified by name == team. Totals identified by "over"/"under".
          if (side === 'over') {
            if (entry.overPrice == null || (price != null && price > entry.overPrice)) {
              entry.overPrice = price; entry.bestBook = bk.title || bk.key;
            }
          } else if (side === 'under') {
            if (entry.underPrice == null || (price != null && price > entry.underPrice)) {
              entry.underPrice = price;
            }
          } else if (normTeam(o.name) === normTeam(homeTeam)) {
            if (entry.homePrice == null || (price != null && price > entry.homePrice)) {
              entry.homePrice = price; entry.bestBook ||= bk.title || bk.key;
            }
          } else if (normTeam(o.name) === normTeam(awayTeam)) {
            if (entry.awayPrice == null || (price != null && price > entry.awayPrice)) {
              entry.awayPrice = price;
            }
          }
        }
      }
    }

    const result: PeriodMarketsForGame = {
      league, awayTeam, homeTeam,
      markets: Array.from(acc.values()),
    };
    periodCache.set(cacheKey, { data: result, at: Date.now() });
    return result;
  } catch {
    return null;
  }
}

export interface PeriodPlay {
  gameId: string;
  eventName: string;
  league: string;
  startTime: string | null;
  awayTeam: string;
  homeTeam: string;
  period: PeriodMarketLine['period'];
  market: 'spread' | 'total' | 'moneyline';
  selection: string;          // "Lakers 1H +2.5", "Lakers/Heat 1H Over 113.5"
  line: number | null;
  odds: string | null;
  bestBook: string | null;
  edgeScore: number;          // 0-100
  reason: string;             // human-readable why
}

/**
 * Score every period market for one game using the team profiles + tendency data we
 * already collect for full-game picks. Returns ALL plays whose edge clears the floor
 * — the caller decides how many to surface.
 *
 * @param markets Period markets pulled from the Odds API for this game.
 * @param ctx Game context: team avgTotal10 (used to project per-period scoring),
 *            recent O/U tendency, pace signals, etc.
 */
export function scorePeriodMarkets(
  markets: PeriodMarketLine[],
  ctx: {
    gameId: string;
    eventName: string;
    league: string;
    startTime?: string | null;
    awayTeam: string;
    homeTeam: string;
    avgTotalCombined: number | null;  // both teams' avgTotal10 summed (proxy for total scoring)
    homeOu10: { wins: number; losses: number; sample: number } | null; // home team's full-game O/U tendency
    awayOu10: { wins: number; losses: number; sample: number } | null;
  },
): PeriodPlay[] {
  const plays: PeriodPlay[] = [];
  const periodShare = PERIOD_SHARE[ctx.league];
  if (!periodShare) return plays;

  // Combined O/U tendency = how often have these teams gone OVER the full-game line lately?
  const ouCount = (b: { wins: number; losses: number; sample: number } | null) => b && b.sample >= 5 ? b : null;
  const homeTendency = ouCount(ctx.homeOu10);
  const awayTendency = ouCount(ctx.awayOu10);
  const combinedOverRate = homeTendency && awayTendency
    ? ((homeTendency.wins + awayTendency.wins) / (homeTendency.sample + awayTendency.sample))
    : homeTendency
      ? homeTendency.wins / homeTendency.sample
      : awayTendency
        ? awayTendency.wins / awayTendency.sample
        : null;

  for (const m of markets) {
    if (m.market !== 'total' || m.line == null) continue; // v1: totals only
    const share = periodShare[m.period];
    if (share == null || ctx.avgTotalCombined == null) continue;

    const projected = ctx.avgTotalCombined * share;
    const gap = projected - m.line; // positive = projection above the line → Over
    const absGap = Math.abs(gap);
    if (absGap < 0.5) continue; // negligible edge, skip

    // Tendency confirmation. If combinedOverRate is ≥ 0.60 and we're projecting OVER,
    // that's a real confluence. Opposite for UNDER.
    let tendencyBoost = 0;
    if (combinedOverRate != null) {
      const onOverSide = gap > 0;
      const aligned = onOverSide ? combinedOverRate : 1 - combinedOverRate;
      if (aligned >= 0.70) tendencyBoost = 18;
      else if (aligned >= 0.60) tendencyBoost = 10;
      else if (aligned < 0.40) tendencyBoost = -8; // contradicting tendency = bad
    }

    let score = 40;
    if (absGap >= 4) score += 28;
    else if (absGap >= 2.5) score += 20;
    else if (absGap >= 1.5) score += 12;
    else if (absGap >= 0.75) score += 6;
    score += tendencyBoost;
    score = Math.max(0, Math.min(100, Math.round(score)));

    if (score < 55) continue; // filter floor — only meaningful edges

    const side: 'over' | 'under' = gap > 0 ? 'over' : 'under';
    plays.push({
      gameId: ctx.gameId,
      eventName: ctx.eventName,
      league: ctx.league,
      startTime: ctx.startTime ?? null,
      awayTeam: ctx.awayTeam,
      homeTeam: ctx.homeTeam,
      period: m.period,
      market: 'total',
      selection: `${ctx.awayTeam}/${ctx.homeTeam} ${m.period} ${side === 'over' ? 'Over' : 'Under'} ${m.line}`,
      line: m.line,
      odds: side === 'over'
        ? (m.overPrice != null ? `${m.overPrice > 0 ? '+' : ''}${m.overPrice}` : '-110')
        : (m.underPrice != null ? `${m.underPrice > 0 ? '+' : ''}${m.underPrice}` : '-110'),
      bestBook: m.bestBook,
      edgeScore: score,
      reason: `Projected ${m.period} scoring ${projected.toFixed(1)} vs line ${m.line} (${absGap >= 2 ? 'big' : 'small'} gap)${combinedOverRate != null && Math.abs(combinedOverRate - 0.5) >= 0.10 ? `, ${(combinedOverRate * 100).toFixed(0)}% over rate L10` : ''}.`,
    });
  }
  plays.sort((a, b) => b.edgeScore - a.edgeScore);
  return plays;
}
