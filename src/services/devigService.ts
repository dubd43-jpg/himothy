// MULTI-BOOK DEVIG SERVICE
//
// Books bake a 4-6% margin (the "vig" or "overround") into every line. The
// raw implied probability from a single book's price is therefore inflated.
// To get a HONEST market estimate of true win probability, we:
//   1. Pull the price for each side from multiple sharp books (DK, FD, BetMGM,
//      Caesars, PointsBet, Fanatics).
//   2. Convert to implied probability per book.
//   3. Average across books to reduce single-book noise.
//   4. Devig the two-sided market so home + away = 1.0 exactly.
//
// The devigged probability is the cleanest "the market thinks X" we can get
// for free. Our model's projected probability vs. the devigged market = our
// EDGE. Edge > 2% is a real bet; edge < 1% is noise.
//
// Lives separate from oddsApiService so the existing single-book code paths
// keep working; devig is a NEW signal layered on top.

import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Sharp books in priority order. Includes the soft books only as a sanity
// check — they shouldn't have outsized weight in the devig.
const SHARP_BOOKS = [
  'draftkings', 'fanduel', 'betmgm', 'caesars', 'pointsbetus', 'fanatics',
];

const LEAGUE_TO_SPORT: Record<string, string> = {
  'MLB': 'baseball_mlb',
  'NBA': 'basketball_nba',
  'WNBA': 'basketball_wnba',
  'NHL': 'icehockey_nhl',
  'NFL': 'americanfootball_nfl',
  'NCAA Basketball': 'basketball_ncaab',
  'College Football': 'americanfootball_ncaaf',
};

export interface DevigResult {
  homeImpliedRaw: number;   // 0-1, avg across books, NOT devigged
  awayImpliedRaw: number;
  homeFair: number;         // 0-1, devigged (sums to 1.0 with awayFair)
  awayFair: number;
  homeFairAmerican: string; // converted back to american odds at fair prob
  awayFairAmerican: string;
  bookCount: number;
  marketOverround: number;  // average extra % the books are taking (0.04 = 4%)
  // The single best (sharpest) ML each side: lowest price the public can hit.
  homeBestML: number | null;
  awayBestML: number | null;
  homeBestBook: string | null;
  awayBestBook: string | null;
}

function americanToImplied(american: number): number {
  if (!isFinite(american) || american === 0) return 0;
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

function impliedToAmerican(p: number): string {
  if (p <= 0 || p >= 1) return '';
  if (p >= 0.5) return `-${Math.round(p / (1 - p) * 100)}`;
  return `+${Math.round((1 - p) / p * 100)}`;
}

// Pull every book's H2H price for one event. Caller sees both sides' price per
// book. Returns null if the API key is missing or the event isn't found.
async function fetchH2HQuotes(league: string, homeTeam: string, awayTeam: string): Promise<Array<{
  book: string; homeAmerican: number | null; awayAmerican: number | null;
}> | null> {
  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) return null;
  const sport = LEAGUE_TO_SPORT[league];
  if (!sport) return null;

  const url = `${ODDS_API_BASE}/sports/${sport}/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, { cache: 'no-store' });
  } catch { return null; }
  if (!res.ok) return null;
  const events: any[] = await res.json().catch(() => []);

  const matches = (a: string, b: string) => {
    if (!a || !b) return false;
    const la = a.toLowerCase().trim(), lb = b.toLowerCase().trim();
    return la === lb || la.includes(lb) || lb.includes(la);
  };

  const ev = events.find((e) => matches(e.home_team, homeTeam) && matches(e.away_team, awayTeam));
  if (!ev) return null;

  const out: Array<{ book: string; homeAmerican: number | null; awayAmerican: number | null }> = [];
  for (const bk of ev.bookmakers || []) {
    const h2h = (bk.markets || []).find((m: any) => m.key === 'h2h');
    if (!h2h) continue;
    let homeAmerican: number | null = null;
    let awayAmerican: number | null = null;
    for (const outcome of h2h.outcomes || []) {
      if (matches(outcome.name, homeTeam)) homeAmerican = Number(outcome.price);
      else if (matches(outcome.name, awayTeam)) awayAmerican = Number(outcome.price);
    }
    out.push({ book: String(bk.key || ''), homeAmerican, awayAmerican });
  }
  return out;
}

// Public: returns the devigged ML fair-probability for a game by pulling
// every book and averaging. Used by the engine to compare model probability
// against true market consensus.
export async function getDevigForGame(league: string, homeTeam: string, awayTeam: string): Promise<DevigResult | null> {
  const quotes = await fetchH2HQuotes(league, homeTeam, awayTeam);
  if (!quotes || quotes.length === 0) return null;

  // Prefer sharp books for the average; if none of the sharp books are quoted,
  // fall back to any quote we have so we don't drop the signal entirely.
  const sharp = quotes.filter((q) => SHARP_BOOKS.includes(q.book) && q.homeAmerican != null && q.awayAmerican != null);
  const usable = sharp.length > 0 ? sharp : quotes.filter((q) => q.homeAmerican != null && q.awayAmerican != null);
  if (usable.length === 0) return null;

  // Average implied probabilities across books.
  let homeSum = 0, awaySum = 0;
  let homeBestML: number | null = null, awayBestML: number | null = null;
  let homeBestBook: string | null = null, awayBestBook: string | null = null;
  for (const q of usable) {
    const hp = americanToImplied(q.homeAmerican as number);
    const ap = americanToImplied(q.awayAmerican as number);
    homeSum += hp;
    awaySum += ap;
    // Best for the bettor = lowest implied probability = longest odds = most $ per win.
    if (homeBestML == null || (q.homeAmerican as number) > homeBestML) { homeBestML = q.homeAmerican; homeBestBook = q.book; }
    if (awayBestML == null || (q.awayAmerican as number) > awayBestML) { awayBestML = q.awayAmerican; awayBestBook = q.book; }
  }
  const n = usable.length;
  const homeImpliedRaw = homeSum / n;
  const awayImpliedRaw = awaySum / n;

  // Devig: each book's sum is > 1 by the overround. Divide each side by the sum
  // so they total to 1.0. The averaged raw probabilities are likewise inflated
  // by the avg overround, so the same normalization applies.
  const total = homeImpliedRaw + awayImpliedRaw;
  if (total <= 0) return null;
  const homeFair = homeImpliedRaw / total;
  const awayFair = awayImpliedRaw / total;
  const marketOverround = total - 1;

  return {
    homeImpliedRaw: Number(homeImpliedRaw.toFixed(4)),
    awayImpliedRaw: Number(awayImpliedRaw.toFixed(4)),
    homeFair: Number(homeFair.toFixed(4)),
    awayFair: Number(awayFair.toFixed(4)),
    homeFairAmerican: impliedToAmerican(homeFair),
    awayFairAmerican: impliedToAmerican(awayFair),
    bookCount: n,
    marketOverround: Number(marketOverround.toFixed(4)),
    homeBestML, awayBestML, homeBestBook, awayBestBook,
  };
}

// Compute the bettor's edge: model probability vs devigged market probability.
// Positive edge means we think the side wins more often than the fair price
// implies. Returns null if either input is missing.
export function computeDevigEdge(modelProb: number, devigFair: number): number | null {
  if (!isFinite(modelProb) || !isFinite(devigFair) || modelProb < 0 || modelProb > 1) return null;
  return Number(((modelProb - devigFair) * 100).toFixed(2));
}
