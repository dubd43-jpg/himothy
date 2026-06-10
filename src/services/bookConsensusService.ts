// Book consensus — when Hard Rock's price matches what 3+ other major books
// are showing, it confirms the market settled on this number. That consensus IS
// the signal: smart money moved the line here and the books all agree.
//
// Two signals:
//   consensus: how many books agree within ±10 American odds of HR's price
//   overlay:   Hard Rock's price is BETTER than every other book (HR is slow)
//
// Both fire from the already-fetched multi-book odds (no extra API calls).
// scoreAdj: +6 full consensus / +3 partial; +4 overlay (HR best number)

import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const ODDS_API_KEY = process.env.ODDS_API_KEY || '';
const BASE = 'https://api.the-odds-api.com/v4';
const TTL = 20 * 60 * 1000;

// Books that represent informed / sharp money (not recreational outlier books).
const SHARP_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'caesars', 'pointsbet', 'bovada', 'pinnacle', 'bet365', 'williamhill', 'betonlineag'];

interface BookPrice {
  book: string;
  ml: number | null;
  spread: number | null;
  spreadOdds: number | null;
  total: number | null;
  overOdds: number | null;
  underOdds: number | null;
}

interface ConsensusResult {
  hrPrice: number | null;
  bookPrices: BookPrice[];
  // Spread consensus
  spreadConsensus: { books: string[]; percentage: number } | null;
  // ML consensus
  mlConsensus: { books: string[]; percentage: number } | null;
  // Whether HR has the best (most favorable) ML or spread for the side
  hrBestML: boolean;
  hrBestSpread: boolean;
  scoreAdj: number;
  bullets: string[];
}

const cache = new Map<string, { data: ConsensusResult; at: number }>();

export async function getBookConsensus(
  sportKey: string,
  homeTeamName: string,
  awayTeamName: string,
  side: 'home' | 'away',
  marketType: 'spread' | 'moneyline' | 'total',
  hrPrice: number | null,
): Promise<ConsensusResult> {
  if (!ODDS_API_KEY) {
    return { hrPrice, bookPrices: [], spreadConsensus: null, mlConsensus: null, hrBestML: false, hrBestSpread: false, scoreAdj: 0, bullets: [] };
  }

  const cacheKey = `consensus:${sportKey}|${homeTeamName}|${awayTeamName}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  try {
    const url = `${BASE}/sports/${sportKey}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
    const r = await fetchWithTimeout(url, { cache: 'no-store' });
    if (!r.ok) {
      const empty: ConsensusResult = { hrPrice, bookPrices: [], spreadConsensus: null, mlConsensus: null, hrBestML: false, hrBestSpread: false, scoreAdj: 0, bullets: [] };
      cache.set(cacheKey, { data: empty, at: Date.now() });
      return empty;
    }

    const events: any[] = await r.json();
    const game = events.find((e: any) => {
      const h = String(e.home_team || '').toLowerCase();
      const a = String(e.away_team || '').toLowerCase();
      const hn = homeTeamName.toLowerCase();
      const an = awayTeamName.toLowerCase();
      return (h.includes(hn.split(' ').pop() || '') || hn.includes(h.split(' ').pop() || '')) &&
             (a.includes(an.split(' ').pop() || '') || an.includes(a.split(' ').pop() || ''));
    });

    if (!game) {
      const empty: ConsensusResult = { hrPrice, bookPrices: [], spreadConsensus: null, mlConsensus: null, hrBestML: false, hrBestSpread: false, scoreAdj: 0, bullets: [] };
      cache.set(cacheKey, { data: empty, at: Date.now() });
      return empty;
    }

    const bookPrices: BookPrice[] = [];
    for (const bk of (game.bookmakers || [])) {
      const bookId = String(bk.key || bk.title || '').toLowerCase();
      if (!SHARP_BOOKS.some((sb) => bookId.includes(sb)) && !bookId.includes('hardrockbet')) continue;

      const bp: BookPrice = { book: bookId, ml: null, spread: null, spreadOdds: null, total: null, overOdds: null, underOdds: null };
      for (const mkt of (bk.markets || [])) {
        if (mkt.key === 'h2h') {
          for (const o of mkt.outcomes || []) {
            const name = String(o.name || '').toLowerCase();
            if ((side === 'home' && name.includes(homeTeamName.toLowerCase().split(' ').pop()!)) ||
                (side === 'away' && name.includes(awayTeamName.toLowerCase().split(' ').pop()!))) {
              bp.ml = Number(o.price);
            }
          }
        }
        if (mkt.key === 'spreads') {
          for (const o of mkt.outcomes || []) {
            const name = String(o.name || '').toLowerCase();
            if ((side === 'home' && name.includes(homeTeamName.toLowerCase().split(' ').pop()!)) ||
                (side === 'away' && name.includes(awayTeamName.toLowerCase().split(' ').pop()!))) {
              bp.spread = Number(o.point);
              bp.spreadOdds = Number(o.price);
            }
          }
        }
        if (mkt.key === 'totals') {
          for (const o of mkt.outcomes || []) {
            if (String(o.name || '').toLowerCase() === 'over') { bp.total = Number(o.point); bp.overOdds = Number(o.price); }
            if (String(o.name || '').toLowerCase() === 'under') bp.underOdds = Number(o.price);
          }
        }
      }
      bookPrices.push(bp);
    }

    const hrBook = bookPrices.find((b) => b.book.includes('hardrockbet'));
    const otherBooks = bookPrices.filter((b) => !b.book.includes('hardrockbet'));

    // ─── ML consensus ──────────────────────────────────────────────────────
    let mlConsensus: ConsensusResult['mlConsensus'] = null;
    let hrBestML = false;
    const hrML = hrBook?.ml ?? hrPrice;

    if (hrML != null && otherBooks.length >= 2) {
      const agreeing = otherBooks.filter((b) => b.ml != null && Math.abs(b.ml - hrML) <= 10);
      const pct = Math.round((agreeing.length / otherBooks.length) * 100);
      if (pct >= 50) mlConsensus = { books: agreeing.map((b) => b.book), percentage: pct };

      // HR is best ML for bettor when our side is a dog (+price) and HR's ML is highest (most $$),
      // or when our side is a fave (-price) and HR's ML is closest to even (least juice).
      const otherMLs = otherBooks.map((b) => b.ml).filter((m): m is number => m != null);
      if (otherMLs.length >= 2) {
        if (hrML > 0) {
          hrBestML = otherMLs.every((m) => hrML >= m - 3);   // HR most generous on dog side
        } else {
          hrBestML = otherMLs.every((m) => (m < 0 ? hrML >= m - 3 : true)); // HR least juice on fave side
        }
      }
    }

    // ─── Spread consensus ──────────────────────────────────────────────────
    let spreadConsensus: ConsensusResult['spreadConsensus'] = null;
    let hrBestSpread = false;
    const hrSpreadOdds = hrBook?.spreadOdds;
    const hrSpreadPt = hrBook?.spread;

    if (hrSpreadOdds != null && otherBooks.length >= 2) {
      const agreeing = otherBooks.filter((b) =>
        b.spreadOdds != null && hrSpreadPt != null && b.spread != null &&
        Math.abs(b.spread - hrSpreadPt) <= 0.5 && Math.abs(b.spreadOdds - hrSpreadOdds) <= 10
      );
      const pct = Math.round((agreeing.length / otherBooks.length) * 100);
      if (pct >= 50) spreadConsensus = { books: agreeing.map((b) => b.book), percentage: pct };

      // HR best spread = picking the side that gets more points (smaller spread) than other books
      const otherSpreads = otherBooks.map((b) => b.spread).filter((s): s is number => s != null);
      if (otherSpreads.length >= 2 && hrSpreadPt != null) {
        // For the underdog (getting points), bigger spread = better. For the fave, smaller = better.
        if (hrSpreadPt > 0) {
          hrBestSpread = otherSpreads.every((s) => hrSpreadPt >= s - 0.1);
        } else {
          hrBestSpread = otherSpreads.every((s) => (s < 0 ? hrSpreadPt >= s - 0.1 : true));
        }
      }
    }

    // ─── Score adjustment ──────────────────────────────────────────────────
    let scoreAdj = 0;
    const bullets: string[] = [];
    const relevantConsensus = marketType === 'moneyline' ? mlConsensus : (marketType === 'spread' ? spreadConsensus : null);

    if (relevantConsensus) {
      if (relevantConsensus.percentage >= 80) {
        scoreAdj += 6;
        bullets.push(`Full book consensus: ${relevantConsensus.percentage}% of major books (${relevantConsensus.books.length}) showing same price — market settled here, no better number exists.`);
      } else if (relevantConsensus.percentage >= 50) {
        scoreAdj += 3;
        bullets.push(`Partial consensus: ${relevantConsensus.percentage}% of books aligned on this price — line is confirmed.`);
      }
    }

    if ((marketType === 'moneyline' && hrBestML) || (marketType === 'spread' && hrBestSpread)) {
      scoreAdj += 4;
      const priceStr = hrML != null ? `${hrML > 0 ? '+' : ''}${hrML}` : 'HR price';
      bullets.push(`Hard Rock offering best number (${priceStr}) — we have the overlay: same pick, better payout than DraftKings/FanDuel.`);
    }

    const result: ConsensusResult = { hrPrice, bookPrices, spreadConsensus, mlConsensus, hrBestML, hrBestSpread, scoreAdj, bullets };
    cache.set(cacheKey, { data: result, at: Date.now() });
    return result;
  } catch (err) {
    console.error('[bookConsensusService]', err);
    const empty: ConsensusResult = { hrPrice, bookPrices: [], spreadConsensus: null, mlConsensus: null, hrBestML: false, hrBestSpread: false, scoreAdj: 0, bullets: [] };
    cache.set(cacheKey, { data: empty, at: Date.now() });
    return empty;
  }
}
