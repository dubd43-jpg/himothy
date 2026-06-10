// PUBLIC BETTING % SERVICE
//
// Public money + handle % is the OTHER half of the sharp-money read. We already
// capture sharp-side via sharpIntel.betting.sharpFavors; this service gets the
// "what % of public bets / handle is on each side" so we can flag:
//   - REVERSE LINE MOVEMENT: line moves against the public favorite (sharps wins)
//   - PUBLIC TRAP: 75%+ public on one side, no line movement = book is offside
//   - SQUARE PLAY: 60%+ public + line moving same direction = chase the public
//
// Data source preference:
//   1. Odds API "v4/historical/sports/{sport}/events/{eventId}/odds" includes
//      handle/bet % on some books that publish it (DK, FD).
//   2. Action Network public consensus (paid, not wired).
//   3. ESPN pickcenter sometimes exposes consensus.
//
// Returns dataAvailable: false when no source resolves so the engine just skips
// this signal cleanly.

import { LEAGUE_URLS } from '@/lib/validation';

export interface PublicMoneySnapshot {
  league: string;
  gameId: string;
  homeBetPct: number | null;     // % of TICKETS on home (public count)
  awayBetPct: number | null;
  homeMoneyPct: number | null;   // % of HANDLE/dollars on home (sharper signal)
  awayMoneyPct: number | null;
  source: 'espn-pickcenter' | 'odds-api' | 'unavailable';
  dataAvailable: boolean;
}

const cache = new Map<string, { snap: PublicMoneySnapshot; at: number }>();
const TTL_MS = 3 * 60 * 1000;

async function fetchEspnPickcenter(league: string, gameId: string): Promise<PublicMoneySnapshot | null> {
  const baseUrl = LEAGUE_URLS[league];
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/summary?event=${gameId}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const pc = data?.pickcenter?.[0];
    if (!pc) return null;
    // ESPN pickcenter sometimes carries `awayTeamOdds.bettorsPercent` / `awayTeamOdds.moneyPercentage`.
    const home = pc?.homeTeamOdds || {};
    const away = pc?.awayTeamOdds || {};
    const hb = Number(home?.bettorsPercent ?? home?.bettorPercent ?? home?.bettors_percent);
    const ab = Number(away?.bettorsPercent ?? away?.bettorPercent ?? away?.bettors_percent);
    const hm = Number(home?.moneyPercentage ?? home?.moneyPercent ?? home?.money_percent);
    const am = Number(away?.moneyPercentage ?? away?.moneyPercent ?? away?.money_percent);
    const hasAny = [hb, ab, hm, am].some((v) => Number.isFinite(v));
    if (!hasAny) return null;
    return {
      league, gameId,
      homeBetPct: Number.isFinite(hb) ? hb : null,
      awayBetPct: Number.isFinite(ab) ? ab : null,
      homeMoneyPct: Number.isFinite(hm) ? hm : null,
      awayMoneyPct: Number.isFinite(am) ? am : null,
      source: 'espn-pickcenter',
      dataAvailable: true,
    };
  } catch { return null; }
}

export async function getPublicMoney(gameId: string, league: string): Promise<PublicMoneySnapshot> {
  const k = `${league}:${gameId}`;
  const cached = cache.get(k);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.snap;

  const espn = await fetchEspnPickcenter(league, gameId);
  if (espn) {
    cache.set(k, { snap: espn, at: Date.now() });
    return espn;
  }

  // Odds API hook: when ODDS_API_KEY is set and the bookmaker exposes handle %,
  // we'd fetch it here. Most free tiers don't include it; leaving as a stub.
  const empty: PublicMoneySnapshot = {
    league, gameId,
    homeBetPct: null, awayBetPct: null, homeMoneyPct: null, awayMoneyPct: null,
    source: 'unavailable', dataAvailable: false,
  };
  cache.set(k, { snap: empty, at: Date.now() });
  return empty;
}

// Classify the public/sharp posture for the picked side.
// `pickedSide` is 'home' or 'away'. Returns a reasoning string + score adjustment.
export function evaluatePublicPosture(snap: PublicMoneySnapshot, pickedSide: 'home' | 'away'): {
  reasonFor: string | null;
  reasonAgainst: string | null;
  scoreDelta: number;
} {
  if (!snap.dataAvailable) return { reasonFor: null, reasonAgainst: null, scoreDelta: 0 };

  const ourBetPct = pickedSide === 'home' ? snap.homeBetPct : snap.awayBetPct;
  const oppBetPct = pickedSide === 'home' ? snap.awayBetPct : snap.homeBetPct;
  const ourMoneyPct = pickedSide === 'home' ? snap.homeMoneyPct : snap.awayMoneyPct;

  // PUBLIC TRAP — heavy public on the OTHER side, our side has lower bet % but
  // possibly higher money %. That's the textbook contrarian setup.
  if (oppBetPct != null && oppBetPct >= 70 && ourMoneyPct != null && ourMoneyPct >= 50) {
    return {
      reasonFor: `Public is ${oppBetPct}% on the other side while ${ourMoneyPct}% of the money is on ours — sharp/public divergence.`,
      reasonAgainst: null,
      scoreDelta: +3,
    };
  }
  // SQUARE TRAP — we're on the public-heavy side. Books love this.
  if (ourBetPct != null && ourBetPct >= 75 && (ourMoneyPct == null || ourMoneyPct < ourBetPct)) {
    return {
      reasonFor: null,
      reasonAgainst: `${ourBetPct}% of public bets are on our side but money % is lower — public-heavy, sharp-light. Book wants this.`,
      scoreDelta: -2,
    };
  }
  return { reasonFor: null, reasonAgainst: null, scoreDelta: 0 };
}
