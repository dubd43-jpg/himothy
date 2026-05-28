// Real multi-sportsbook odds via The Odds API — the legit edge real bettors use.
// Two honest uses, no magic:
//   1. LINE SHOPPING — show the best available price across books (same bet, more money).
//   2. VALUE — flag when our side's best price beats the consensus "true" line (the
//      median devigged probability across all books). That gap is real expected value.
//
// Quota-safe: free tier is 500 requests/month. We fetch h2h (moneyline) for the US region
// only (1 credit per league) and cache for 6 hours, so a normal day uses a handful.

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — protects the monthly quota

export const LEAGUE_TO_SPORT: Record<string, string> = {
  MLB: 'baseball_mlb',
  NBA: 'basketball_nba',
  WNBA: 'basketball_wnba',
  NHL: 'icehockey_nhl',
  NFL: 'americanfootball_nfl',
  'College Football': 'americanfootball_ncaaf',
  'NCAA Football': 'americanfootball_ncaaf',
  'NCAA Basketball': 'basketball_ncaab',
  'NCAA Baseball': 'baseball_ncaa',
  'College Baseball': 'baseball_ncaa',
  'MMA - UFC': 'mma_mixed_martial_arts',
  'MMA - PFL': 'mma_mixed_martial_arts',
  MMA: 'mma_mixed_martial_arts',
  Boxing: 'boxing_boxing',
  // Tennis sport keys are tournament-specific. The Odds API has dozens of them
  // (tennis_atp_australian_open, tennis_atp_french_open, tennis_atp_wimbledon,
  // tennis_atp_us_open, tennis_atp_indian_wells, tennis_atp_miami_open, etc.). Hard-coding
  // a single key was a year-round bug — we'd only return data for ~2 weeks at a time.
  // These entries are now FALLBACKS only; the real lookup happens dynamically in
  // resolveActiveTennisSportKeys() via The Odds API's /sports endpoint.
  'Tennis - ATP': 'tennis_atp_french_open',
  'Tennis - WTA': 'tennis_wta_french_open',
  Tennis: 'tennis_atp_french_open',
};

// Cache of currently-active tennis sport keys from The Odds API /sports endpoint.
// Refreshes once an hour so we pick up new tournaments as they start without redeploys.
let _tennisKeysCache: { keys: { atp: string[]; wta: string[] }; at: number } | null = null;
const TENNIS_KEYS_TTL_MS = 60 * 60 * 1000;

async function resolveActiveTennisSportKeys(): Promise<{ atp: string[]; wta: string[] }> {
  if (!hasOddsApi()) return { atp: [], wta: [] };
  if (_tennisKeysCache && Date.now() - _tennisKeysCache.at < TENNIS_KEYS_TTL_MS) return _tennisKeysCache.keys;
  try {
    const url = `${ODDS_API_BASE}/sports?all=false&apiKey=${process.env.THE_ODDS_API_KEY}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { atp: [], wta: [] };
    const sports: any[] = await res.json();
    const atp: string[] = [];
    const wta: string[] = [];
    for (const s of sports || []) {
      const k = String(s?.key || '');
      // Outright winner markets end with `_winner` — skip those, we want match-level odds.
      if (k.endsWith('_winner')) continue;
      if (k.startsWith('tennis_atp_')) atp.push(k);
      else if (k.startsWith('tennis_wta_')) wta.push(k);
    }
    _tennisKeysCache = { keys: { atp, wta }, at: Date.now() };
    return { atp, wta };
  } catch {
    return { atp: [], wta: [] };
  }
}

export interface GameOdds {
  bestHomeOdds: number | null;
  bestAwayOdds: number | null;
  bestHomeBook: string | null;
  bestAwayBook: string | null;
  fairHomeProb: number | null;   // consensus (median, devigged) true probability
  fairAwayProb: number | null;
  bookCount: number;
}

type LeagueOddsMap = Record<string, GameOdds>; // key: `${away}@@${home}` normalized

const cache = new Map<string, { data: LeagueOddsMap; at: number }>();

export function hasOddsApi(): boolean {
  return Boolean(process.env.THE_ODDS_API_KEY && process.env.THE_ODDS_API_KEY.trim());
}

export function normTeam(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function gameKey(away: string, home: string): string {
  return `${normTeam(away)}@@${normTeam(home)}`;
}

function impliedProb(american: number): number {
  return american > 0 ? 100 / (american + 100) : Math.abs(american) / (Math.abs(american) + 100);
}
function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function fetchLeagueOdds(league: string): Promise<LeagueOddsMap> {
  if (!hasOddsApi()) return {};
  const cached = cache.get(league);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  // Tennis: resolve every currently-active ATP/WTA sport key and merge their odds.
  // This is what makes tennis work year-round (Australian Open in Jan, hard-court swing,
  // Indian Wells/Miami, clay swing, French Open, grass swing, US Open, Asian swing).
  let sportKeys: string[] = [];
  if (league === 'Tennis - ATP' || league === 'Tennis - WTA' || league === 'Tennis') {
    const { atp, wta } = await resolveActiveTennisSportKeys();
    if (league === 'Tennis - WTA') sportKeys = wta;
    else if (league === 'Tennis - ATP') sportKeys = atp;
    else sportKeys = [...atp, ...wta];
    if (sportKeys.length === 0) {
      const fallback = LEAGUE_TO_SPORT[league];
      if (fallback) sportKeys = [fallback];
    }
  } else {
    const sport = LEAGUE_TO_SPORT[league];
    if (!sport) return {};
    sportKeys = [sport];
  }

  const map: LeagueOddsMap = {};
  let anyOk = false;
  try {
    for (const sport of sportKeys) {
      const url = `${ODDS_API_BASE}/sports/${sport}/odds/?apiKey=${process.env.THE_ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=american`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      anyOk = true;
      const games: any[] = await res.json();

    for (const g of games || []) {
      const home = g.home_team;
      const away = g.away_team;
      if (!home || !away) continue;
      const homePrices: number[] = [];
      const awayPrices: number[] = [];
      const homeProbs: number[] = [];
      const awayProbs: number[] = [];
      let bestHome: number | null = null, bestAway: number | null = null;
      let bestHomeBook: string | null = null, bestAwayBook: string | null = null;

      for (const bk of g.bookmakers || []) {
        const h2h = (bk.markets || []).find((m: any) => m.key === 'h2h');
        if (!h2h) continue;
        const ho = h2h.outcomes?.find((o: any) => o.name === home);
        const ao = h2h.outcomes?.find((o: any) => o.name === away);
        if (typeof ho?.price === 'number') {
          homePrices.push(ho.price); homeProbs.push(impliedProb(ho.price));
          if (bestHome === null || ho.price > bestHome) { bestHome = ho.price; bestHomeBook = bk.title || bk.key; }
        }
        if (typeof ao?.price === 'number') {
          awayPrices.push(ao.price); awayProbs.push(impliedProb(ao.price));
          if (bestAway === null || ao.price > bestAway) { bestAway = ao.price; bestAwayBook = bk.title || bk.key; }
        }
      }

      // Consensus true probability: median implied prob across books, devigged so the two
      // sides sum to 100%.
      const mh = median(homeProbs);
      const ma = median(awayProbs);
      let fairHome: number | null = null, fairAway: number | null = null;
      if (mh != null && ma != null && mh + ma > 0) {
        fairHome = (mh / (mh + ma)) * 100;
        fairAway = (ma / (mh + ma)) * 100;
      }

      map[gameKey(away, home)] = {
        bestHomeOdds: bestHome, bestAwayOdds: bestAway,
        bestHomeBook, bestAwayBook,
        fairHomeProb: fairHome, fairAwayProb: fairAway,
        bookCount: (g.bookmakers || []).length,
      };
    }
    }

    // Cache the result even if every sport-key call failed — prevents hammering the API.
    cache.set(league, { data: map, at: Date.now() });
    if (!anyOk && Object.keys(map).length === 0) return {};
    return map;
  } catch {
    return {};
  }
}

// ─── Game totals (over/under) line-shopping ───────────────────────────────────
// Multi-book over/under lines so total picks get the best price + a fair-line check.

export interface TotalsLine {
  line: number;
  bestOverPrice: number | null;
  bestUnderPrice: number | null;
  bestOverBook: string | null;
  bestUnderBook: string | null;
  bookCount: number;
}

const totalsCache = new Map<string, { data: Record<string, TotalsLine>; at: number }>();
const TOTALS_TTL_MS = 6 * 60 * 60 * 1000;

export async function getTotalsForLeague(league: string): Promise<Record<string, TotalsLine>> {
  if (!hasOddsApi()) return {};
  const sport = LEAGUE_TO_SPORT[league];
  if (!sport) return {};
  const cached = totalsCache.get(league);
  if (cached && Date.now() - cached.at < TOTALS_TTL_MS) return cached.data;
  const miss = () => { totalsCache.set(league, { data: {}, at: Date.now() }); return {}; };
  try {
    const url = `${ODDS_API_BASE}/sports/${sport}/odds/?apiKey=${process.env.THE_ODDS_API_KEY}&regions=us&markets=totals&oddsFormat=american`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return miss();
    const games: any[] = await res.json();
    const map: Record<string, TotalsLine> = {};
    for (const g of games || []) {
      const lines: number[] = [];
      let bestOver: number | null = null, bestUnder: number | null = null;
      let overBook: string | null = null, underBook: string | null = null;
      for (const bk of g.bookmakers || []) {
        const totals = (bk.markets || []).find((m: any) => m.key === 'totals');
        if (!totals) continue;
        for (const o of totals.outcomes || []) {
          if (typeof o.point !== 'number') continue;
          lines.push(o.point);
          const side = String(o.name || '').toLowerCase();
          if (side === 'over' && typeof o.price === 'number') {
            if (bestOver === null || o.price > bestOver) { bestOver = o.price; overBook = bk.title || bk.key; }
          } else if (side === 'under' && typeof o.price === 'number') {
            if (bestUnder === null || o.price > bestUnder) { bestUnder = o.price; underBook = bk.title || bk.key; }
          }
        }
      }
      const consensusLine = median(lines);
      if (consensusLine == null) continue;
      const key = `${normTeam(g.away_team)}@@${normTeam(g.home_team)}`;
      map[key] = {
        line: consensusLine,
        bestOverPrice: bestOver, bestUnderPrice: bestUnder,
        bestOverBook: overBook, bestUnderBook: underBook,
        bookCount: (g.bookmakers || []).length,
      };
    }
    totalsCache.set(league, { data: map, at: Date.now() });
    return map;
  } catch { return miss(); }
}

export async function getTotalsInsightForPick(league: string, awayTeam: string, homeTeam: string): Promise<TotalsLine | null> {
  if (!hasOddsApi()) return null;
  const map = await getTotalsForLeague(league);
  return map[`${normTeam(awayTeam)}@@${normTeam(homeTeam)}`] ?? null;
}

// ─── Player props (real lines) ────────────────────────────────────────────────
// The softest market, where a real edge is most findable. NOTE: props are quota-heavy
// (each market costs a credit per event), so we cache 3h and only fetch on demand.

// Alt-prop markets (one ladder of lines per player). Quota-heavy — each is 1 credit per
// event so we only fetch these on the per-game breakdown page, never in the broad daily
// scan. Hard Rock's alt-line pricing is noted as soft in our market audit; this is where
// real prop edges live.
const ALT_PROP_MARKETS: Record<string, string[]> = {
  NBA: ['player_points_alternate', 'player_rebounds_alternate', 'player_assists_alternate', 'player_threes_alternate'],
  WNBA: ['player_points_alternate', 'player_rebounds_alternate', 'player_assists_alternate'],
  NHL: ['player_points_alternate', 'player_shots_on_goal_alternate'],
  MLB: ['pitcher_strikeouts_alternate', 'batter_hits_alternate', 'batter_total_bases_alternate', 'batter_home_runs_alternate'],
  NFL: ['player_pass_yds_alternate', 'player_rush_yds_alternate', 'player_reception_yds_alternate'],
  'College Football': ['player_pass_yds_alternate', 'player_rush_yds_alternate'],
};

const PROP_MARKETS: Record<string, string[]> = {
  NBA: ['player_points', 'player_rebounds', 'player_assists', 'player_threes', 'player_steals', 'player_blocks'],
  WNBA: ['player_points', 'player_rebounds', 'player_assists', 'player_steals', 'player_blocks'],
  'NCAA Basketball': ['player_points', 'player_rebounds', 'player_assists', 'player_threes'],
  NHL: ['player_points', 'player_shots_on_goal', 'player_goals', 'player_assists'],
  MLB: ['pitcher_strikeouts', 'batter_hits', 'batter_rbis', 'batter_home_runs', 'batter_total_bases', 'batter_walks'],
  NFL: ['player_pass_yds', 'player_pass_tds', 'player_rush_yds', 'player_reception_yds', 'player_receptions'],
  'College Football': ['player_pass_yds', 'player_pass_tds', 'player_rush_yds', 'player_reception_yds', 'player_receptions'],
};

export interface PropLine {
  line: number;            // consensus (median) line across books
  overPrice: number | null;
  underPrice: number | null;
  bestBook: string | null; // book with the best OVER price
}

// One step on an alt-prop ladder — a specific line + the best (highest) over price found.
export interface AltPropStep {
  side: 'over' | 'under';
  point: number;
  bestPrice: number | null;
  bestBook: string | null;
}
export interface AltPropLadder {
  player: string;
  market: string;          // raw market key like 'player_points_alternate'
  steps: AltPropStep[];    // sorted by point ascending
}

const altPropsCache = new Map<string, { data: AltPropLadder[]; at: number }>();
const ALT_PROPS_TTL_MS = 3 * 60 * 60 * 1000;

// Fetch alt prop LADDERS for a single game. Per-event call (1 credit per market) so the
// caller should be a per-game breakdown page, never the broad scan. Returns one ladder
// per player+market with all alt-line steps + best book per step. Cached 3h.
export async function getAltPlayerPropsForGame(
  league: string, awayTeam: string, homeTeam: string,
): Promise<AltPropLadder[]> {
  if (!hasOddsApi()) return [];
  const sport = LEAGUE_TO_SPORT[league];
  const markets = ALT_PROP_MARKETS[league];
  if (!sport || !markets || markets.length === 0) return [];
  const key = `altprops:${sport}:${normTeam(awayTeam)}@@${normTeam(homeTeam)}`;
  const cached = altPropsCache.get(key);
  if (cached && Date.now() - cached.at < ALT_PROPS_TTL_MS) return cached.data;
  const miss = () => { altPropsCache.set(key, { data: [], at: Date.now() }); return []; };
  try {
    const evRes = await fetch(`${ODDS_API_BASE}/sports/${sport}/events?apiKey=${process.env.THE_ODDS_API_KEY}`, { cache: 'no-store' });
    if (!evRes.ok) return miss();
    const events: any[] = await evRes.json();
    const ev = events.find((e) => normTeam(e.home_team) === normTeam(homeTeam) && normTeam(e.away_team) === normTeam(awayTeam));
    if (!ev?.id) return miss();
    const url = `${ODDS_API_BASE}/sports/${sport}/events/${ev.id}/odds?apiKey=${process.env.THE_ODDS_API_KEY}&regions=us&markets=${markets.join(',')}&oddsFormat=american`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return miss();
    const data = await res.json();

    // Accumulator: {player|market|side|point}: best price + book
    const acc = new Map<string, AltPropStep & { player: string; market: string }>();
    for (const bk of data.bookmakers || []) {
      for (const m of bk.markets || []) {
        if (!markets.includes(m.key)) continue;
        for (const o of m.outcomes || []) {
          const player = o.description;
          const side = String(o.name || '').toLowerCase() as 'over' | 'under';
          const point = typeof o.point === 'number' ? o.point : null;
          const price = typeof o.price === 'number' ? o.price : null;
          if (!player || (side !== 'over' && side !== 'under') || point == null) continue;
          const k = `${player}|${m.key}|${side}|${point}`;
          const cur = acc.get(k);
          if (!cur || cur.bestPrice == null || (price != null && price > cur.bestPrice)) {
            acc.set(k, { player, market: m.key, side, point, bestPrice: price, bestBook: bk.title || bk.key });
          }
        }
      }
    }

    // Group accumulator entries into one ladder per (player, market).
    const byPlayerMarket = new Map<string, AltPropLadder>();
    acc.forEach((v) => {
      const groupKey = `${v.player}|${v.market}`;
      let group = byPlayerMarket.get(groupKey);
      if (!group) {
        group = { player: v.player, market: v.market, steps: [] };
        byPlayerMarket.set(groupKey, group);
      }
      group.steps.push({ side: v.side, point: v.point, bestPrice: v.bestPrice, bestBook: v.bestBook });
    });
    const out: AltPropLadder[] = [];
    byPlayerMarket.forEach((lad) => {
      lad.steps.sort((a, b) => a.point - b.point || a.side.localeCompare(b.side));
      out.push(lad);
    });
    altPropsCache.set(key, { data: out, at: Date.now() });
    return out;
  } catch { return miss(); }
}

const propsCache = new Map<string, { data: Record<string, PropLine>; at: number }>();
const PROPS_TTL_MS = 3 * 60 * 60 * 1000; // 3h — props move slower than sides; protects quota

// Returns a map keyed by `${normTeam(playerName)}|${oddsMarketKey}` -> real consensus line + best prices.
export async function getPlayerPropsForGame(league: string, awayTeam: string, homeTeam: string): Promise<Record<string, PropLine>> {
  if (!hasOddsApi()) return {};
  const sport = LEAGUE_TO_SPORT[league];
  const markets = PROP_MARKETS[league];
  if (!sport || !markets || markets.length === 0) return {};

  const key = `props:${sport}:${normTeam(awayTeam)}@@${normTeam(homeTeam)}`;
  const cached = propsCache.get(key);
  if (cached && Date.now() - cached.at < PROPS_TTL_MS) return cached.data;

  const miss = () => { propsCache.set(key, { data: {}, at: Date.now() }); return {}; };
  try {
    // 1. Find the event id (the /events list is free — no quota cost).
    const evRes = await fetch(`${ODDS_API_BASE}/sports/${sport}/events?apiKey=${process.env.THE_ODDS_API_KEY}`, { cache: 'no-store' });
    if (!evRes.ok) return miss();
    const events: any[] = await evRes.json();
    const ev = events.find((e) => normTeam(e.home_team) === normTeam(homeTeam) && normTeam(e.away_team) === normTeam(awayTeam));
    if (!ev?.id) return miss();

    // 2. Fetch player props for that single event (this is what costs quota).
    const url = `${ODDS_API_BASE}/sports/${sport}/events/${ev.id}/odds?apiKey=${process.env.THE_ODDS_API_KEY}&regions=us&markets=${markets.join(',')}&oddsFormat=american`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return miss();
    const data = await res.json();

    const acc: Record<string, { lines: number[]; over: number | null; under: number | null; overBook: string | null }> = {};
    for (const bk of data.bookmakers || []) {
      for (const m of bk.markets || []) {
        for (const o of m.outcomes || []) {
          const player = o.description;
          const point = o.point;
          const price = o.price;
          const side = String(o.name || '').toLowerCase();
          if (!player || typeof point !== 'number') continue;
          const k = `${normTeam(player)}|${m.key}`;
          acc[k] ||= { lines: [], over: null, under: null, overBook: null };
          acc[k].lines.push(point);
          if (side === 'over') {
            if (acc[k].over === null || (typeof price === 'number' && price > acc[k].over)) { acc[k].over = price; acc[k].overBook = bk.title || bk.key; }
          } else if (side === 'under') {
            if (acc[k].under === null || (typeof price === 'number' && price > acc[k].under)) acc[k].under = price;
          }
        }
      }
    }

    const out: Record<string, PropLine> = {};
    for (const [k, v] of Object.entries(acc)) {
      const line = median(v.lines);
      if (line == null) continue;
      out[k] = { line, overPrice: v.over, underPrice: v.under, bestBook: v.overBook };
    }
    propsCache.set(key, { data: out, at: Date.now() });
    return out;
  } catch {
    return miss();
  }
}

// ─── Tier-4 niche markets — quota-safe, on-demand only ────────────────────────
// These are *event-level* calls (1 credit per event per market) so we only fire them
// when the user actually opens a specific breakdown page. Cached aggressively.

export interface F5Insight {
  totalLine: number | null;        // F5 total (over/under for first 5 innings)
  bestOverPrice: number | null;
  bestUnderPrice: number | null;
  homeF5SpreadLine: number | null; // F5 spread (typically ±0.5)
  awayF5SpreadLine: number | null;
  bestHomeSpreadPrice: number | null;
  bestAwaySpreadPrice: number | null;
  homeF5MLPrice: number | null;
  awayF5MLPrice: number | null;
  bookCount: number;
}

const f5Cache = new Map<string, { data: F5Insight | null; at: number }>();
const F5_TTL_MS = 3 * 60 * 60 * 1000;

export async function getF5InsightForGame(awayTeam: string, homeTeam: string): Promise<F5Insight | null> {
  if (!hasOddsApi()) return null;
  const sport = LEAGUE_TO_SPORT.MLB;
  const key = `f5:${normTeam(awayTeam)}@@${normTeam(homeTeam)}`;
  const cached = f5Cache.get(key);
  if (cached && Date.now() - cached.at < F5_TTL_MS) return cached.data;
  const miss = () => { f5Cache.set(key, { data: null, at: Date.now() }); return null; };
  try {
    const evRes = await fetch(`${ODDS_API_BASE}/sports/${sport}/events?apiKey=${process.env.THE_ODDS_API_KEY}`, { cache: 'no-store' });
    if (!evRes.ok) return miss();
    const events: any[] = await evRes.json();
    const ev = events.find((e) => normTeam(e.home_team) === normTeam(homeTeam) && normTeam(e.away_team) === normTeam(awayTeam));
    if (!ev?.id) return miss();
    const markets = 'totals_1st_5_innings,spreads_1st_5_innings,h2h_1st_5_innings';
    const url = `${ODDS_API_BASE}/sports/${sport}/events/${ev.id}/odds?apiKey=${process.env.THE_ODDS_API_KEY}&regions=us&markets=${markets}&oddsFormat=american`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return miss();
    const data = await res.json();
    const home = data.home_team || homeTeam;
    const away = data.away_team || awayTeam;
    const totalLines: number[] = [];
    const homeSpreadLines: number[] = [];
    const awaySpreadLines: number[] = [];
    let bestOver: number | null = null, bestUnder: number | null = null;
    let bestHomeSpr: number | null = null, bestAwaySpr: number | null = null;
    let bestHomeML: number | null = null, bestAwayML: number | null = null;
    for (const bk of data.bookmakers || []) {
      for (const m of bk.markets || []) {
        for (const o of m.outcomes || []) {
          const name = String(o.name || '');
          if (m.key === 'totals_1st_5_innings') {
            if (typeof o.point === 'number') totalLines.push(o.point);
            if (name.toLowerCase() === 'over' && typeof o.price === 'number' && (bestOver === null || o.price > bestOver)) bestOver = o.price;
            if (name.toLowerCase() === 'under' && typeof o.price === 'number' && (bestUnder === null || o.price > bestUnder)) bestUnder = o.price;
          } else if (m.key === 'spreads_1st_5_innings') {
            if (typeof o.point !== 'number' || typeof o.price !== 'number') continue;
            if (normTeam(name) === normTeam(home)) {
              homeSpreadLines.push(o.point);
              if (bestHomeSpr === null || o.price > bestHomeSpr) bestHomeSpr = o.price;
            } else if (normTeam(name) === normTeam(away)) {
              awaySpreadLines.push(o.point);
              if (bestAwaySpr === null || o.price > bestAwaySpr) bestAwaySpr = o.price;
            }
          } else if (m.key === 'h2h_1st_5_innings') {
            if (typeof o.price !== 'number') continue;
            if (normTeam(name) === normTeam(home) && (bestHomeML === null || o.price > bestHomeML)) bestHomeML = o.price;
            if (normTeam(name) === normTeam(away) && (bestAwayML === null || o.price > bestAwayML)) bestAwayML = o.price;
          }
        }
      }
    }
    const out: F5Insight = {
      totalLine: median(totalLines),
      bestOverPrice: bestOver, bestUnderPrice: bestUnder,
      homeF5SpreadLine: median(homeSpreadLines),
      awayF5SpreadLine: median(awaySpreadLines),
      bestHomeSpreadPrice: bestHomeSpr, bestAwaySpreadPrice: bestAwaySpr,
      homeF5MLPrice: bestHomeML, awayF5MLPrice: bestAwayML,
      bookCount: (data.bookmakers || []).length,
    };
    f5Cache.set(key, { data: out, at: Date.now() });
    return out;
  } catch { return miss(); }
}

// ─── Anytime scorer markets (NHL/NFL) ──────────────────────────────────────────
export interface AnytimeScorerLine {
  player: string;
  bestPrice: number | null;     // best (highest, i.e. most generous) anytime-TD/goal price
  bestBook: string | null;
  consensusProb: number | null; // median implied prob across books — true probability
}

const SCORER_MARKET: Record<string, string> = {
  NFL: 'player_anytime_td',
  'College Football': 'player_anytime_td',
  NHL: 'player_goal_scorer_anytime',
};

const scorerCache = new Map<string, { data: AnytimeScorerLine[]; at: number }>();
const SCORER_TTL_MS = 3 * 60 * 60 * 1000;

export async function getAnytimeScorers(league: string, awayTeam: string, homeTeam: string): Promise<AnytimeScorerLine[]> {
  if (!hasOddsApi()) return [];
  const sport = LEAGUE_TO_SPORT[league];
  const market = SCORER_MARKET[league];
  if (!sport || !market) return [];
  const key = `scorer:${sport}:${normTeam(awayTeam)}@@${normTeam(homeTeam)}`;
  const cached = scorerCache.get(key);
  if (cached && Date.now() - cached.at < SCORER_TTL_MS) return cached.data;
  const miss = () => { scorerCache.set(key, { data: [], at: Date.now() }); return []; };
  try {
    const evRes = await fetch(`${ODDS_API_BASE}/sports/${sport}/events?apiKey=${process.env.THE_ODDS_API_KEY}`, { cache: 'no-store' });
    if (!evRes.ok) return miss();
    const events: any[] = await evRes.json();
    const ev = events.find((e) => normTeam(e.home_team) === normTeam(homeTeam) && normTeam(e.away_team) === normTeam(awayTeam));
    if (!ev?.id) return miss();
    const url = `${ODDS_API_BASE}/sports/${sport}/events/${ev.id}/odds?apiKey=${process.env.THE_ODDS_API_KEY}&regions=us&markets=${market}&oddsFormat=american`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return miss();
    const data = await res.json();
    const acc: Record<string, { prices: number[]; best: number | null; bestBook: string | null }> = {};
    for (const bk of data.bookmakers || []) {
      for (const m of bk.markets || []) {
        if (m.key !== market) continue;
        for (const o of m.outcomes || []) {
          const player = o.description || o.name;
          if (!player || typeof o.price !== 'number') continue;
          acc[player] ||= { prices: [], best: null, bestBook: null };
          acc[player].prices.push(o.price);
          if (acc[player].best === null || o.price > acc[player].best) {
            acc[player].best = o.price;
            acc[player].bestBook = bk.title || bk.key;
          }
        }
      }
    }
    const out: AnytimeScorerLine[] = Object.entries(acc).map(([player, v]) => {
      const probs = v.prices.map(impliedProb);
      const med = median(probs);
      return {
        player,
        bestPrice: v.best,
        bestBook: v.bestBook,
        consensusProb: med != null ? Math.round(med * 1000) / 10 : null, // percentage
      };
    }).sort((a, b) => (b.consensusProb || 0) - (a.consensusProb || 0));
    scorerCache.set(key, { data: out, at: Date.now() });
    return out;
  } catch { return miss(); }
}

// ─── Outright tournament markets (golf, tennis futures, racing championships) ─
// These are "field" markets — 50-200 contenders competing for one prize, listed under
// sport keys like `golf_us_open_winner`, `tennis_atp_french_open` (winner), etc. Different
// shape from H2H markets so they get their own fetch path.

export interface OutrightContender {
  name: string;              // player / driver name
  bestPrice: number | null;  // best (highest, most generous) outright price
  bestBook: string | null;
  consensusProb: number | null; // median implied prob across books, as %
}

export interface OutrightTournament {
  sportKey: string;
  title: string;             // human-readable e.g. "Golf US Open Winner"
  commenceTime: string | null;
  contenders: OutrightContender[]; // sorted by consensus probability descending
  bookCount: number;
}

const outrightCache = new Map<string, { data: OutrightTournament | null; at: number }>();
const OUTRIGHT_TTL_MS = 6 * 60 * 60 * 1000; // outright prices move slowly — 6h cache

export async function getOutrightContenders(sportKey: string, title: string): Promise<OutrightTournament | null> {
  if (!hasOddsApi()) return null;
  const cached = outrightCache.get(sportKey);
  if (cached && Date.now() - cached.at < OUTRIGHT_TTL_MS) return cached.data;
  const miss = () => { outrightCache.set(sportKey, { data: null, at: Date.now() }); return null; };
  try {
    const url = `${ODDS_API_BASE}/sports/${sportKey}/odds?apiKey=${process.env.THE_ODDS_API_KEY}&regions=us&markets=outrights&oddsFormat=american`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return miss();
    const data: any[] = await res.json();
    if (!data || data.length === 0) return miss();
    const ev = data[0];
    const acc: Record<string, { prices: number[]; best: number | null; bestBook: string | null }> = {};
    for (const bk of ev.bookmakers || []) {
      for (const m of bk.markets || []) {
        if (m.key !== 'outrights') continue;
        for (const o of m.outcomes || []) {
          const name = o.name;
          const price = typeof o.price === 'number' ? o.price : null;
          if (!name || price == null) continue;
          acc[name] ||= { prices: [], best: null, bestBook: null };
          acc[name].prices.push(price);
          if (acc[name].best == null || price > acc[name].best) {
            acc[name].best = price;
            acc[name].bestBook = bk.title || bk.key;
          }
        }
      }
    }
    const contenders: OutrightContender[] = Object.entries(acc).map(([name, v]) => {
      const probs = v.prices.map(impliedProb);
      const m = median(probs);
      return {
        name,
        bestPrice: v.best,
        bestBook: v.bestBook,
        consensusProb: m != null ? Math.round(m * 1000) / 10 : null,
      };
    }).sort((a, b) => (b.consensusProb || 0) - (a.consensusProb || 0));

    const out: OutrightTournament = {
      sportKey,
      title,
      commenceTime: ev.commence_time || null,
      contenders,
      bookCount: (ev.bookmakers || []).length,
    };
    outrightCache.set(sportKey, { data: out, at: Date.now() });
    return out;
  } catch { return miss(); }
}

// Discover every currently-active outright sport key (golf majors, tennis slams, F1 etc.)
// and pull the contenders for each. ONE upstream call to /sports + N calls to /odds per
// active tournament (cached 6h).

interface ActiveSportInfo { key: string; title: string }

const sportsCache: { data: ActiveSportInfo[] | null; at: number } = { data: null, at: 0 };
const SPORTS_TTL_MS = 12 * 60 * 60 * 1000;

async function listActiveOutrightSports(prefixes: string[]): Promise<ActiveSportInfo[]> {
  if (!hasOddsApi()) return [];
  if (sportsCache.data && Date.now() - sportsCache.at < SPORTS_TTL_MS) {
    return sportsCache.data.filter((s) => prefixes.some((p) => s.key.startsWith(p)));
  }
  try {
    const res = await fetch(`${ODDS_API_BASE}/sports?apiKey=${process.env.THE_ODDS_API_KEY}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const all: any[] = await res.json();
    const active: ActiveSportInfo[] = (all || [])
      .filter((s) => s.active && (s.has_outrights || /winner|champion/.test(s.key)))
      .map((s) => ({ key: s.key, title: s.title || s.key }));
    sportsCache.data = active;
    sportsCache.at = Date.now();
    return active.filter((s) => prefixes.some((p) => s.key.startsWith(p)));
  } catch { return []; }
}

export async function getActiveTournaments(category: 'golf' | 'racing' | 'tennis' | 'all'): Promise<OutrightTournament[]> {
  const prefixMap: Record<string, string[]> = {
    golf: ['golf_'],
    racing: ['motorsport_', 'racing_'],
    tennis: ['tennis_'],
    all: ['golf_', 'motorsport_', 'racing_', 'tennis_'],
  };
  const sports = await listActiveOutrightSports(prefixMap[category]);
  const results = await Promise.all(sports.map((s) => getOutrightContenders(s.key, s.title)));
  return results.filter((r): r is OutrightTournament => r != null);
}

// ─── Alt lines ladder + team totals (Hard Rock high-edge angles) ──────────────
// On-demand only. Each market is 1 credit/event so we cache aggressively (3h).

export interface AltSpreadStep {
  side: 'home' | 'away';
  point: number;          // e.g., -1.5, +2.5
  bestPrice: number | null;
  bestBook: string | null;
}
export interface AltTotalStep {
  side: 'over' | 'under';
  point: number;
  bestPrice: number | null;
  bestBook: string | null;
}
export interface TeamTotal {
  side: 'home' | 'away';
  line: number;
  bestOverPrice: number | null;
  bestUnderPrice: number | null;
  bestOverBook: string | null;
  bestUnderBook: string | null;
}
export interface AltLinesPackage {
  altSpreads: AltSpreadStep[];        // all unique points × sides, top price each
  altTotals: AltTotalStep[];
  teamTotals: TeamTotal[];            // one per team
  bookCount: number;
}

const altLinesCache = new Map<string, { data: AltLinesPackage | null; at: number }>();
const ALT_LINES_TTL_MS = 3 * 60 * 60 * 1000;

const ALT_MARKETS_BY_LEAGUE: Record<string, string[]> = {
  NBA: ['alternate_spreads', 'alternate_totals', 'team_totals'],
  WNBA: ['alternate_spreads', 'alternate_totals', 'team_totals'],
  NHL: ['alternate_spreads', 'alternate_totals', 'team_totals'],
  MLB: ['alternate_spreads', 'alternate_totals', 'team_totals'],
  NFL: ['alternate_spreads', 'alternate_totals', 'team_totals', 'alternate_team_totals'],
  'College Football': ['alternate_spreads', 'alternate_totals', 'team_totals'],
  'NCAA Basketball': ['alternate_spreads', 'alternate_totals'],
};

export async function getAltLinesForGame(league: string, awayTeam: string, homeTeam: string): Promise<AltLinesPackage | null> {
  if (!hasOddsApi()) return null;
  const sport = LEAGUE_TO_SPORT[league];
  const markets = ALT_MARKETS_BY_LEAGUE[league];
  if (!sport || !markets) return null;
  const key = `alt:${sport}:${normTeam(awayTeam)}@@${normTeam(homeTeam)}`;
  const cached = altLinesCache.get(key);
  if (cached && Date.now() - cached.at < ALT_LINES_TTL_MS) return cached.data;
  const miss = () => { altLinesCache.set(key, { data: null, at: Date.now() }); return null; };
  try {
    // Find the event id (free).
    const evRes = await fetch(`${ODDS_API_BASE}/sports/${sport}/events?apiKey=${process.env.THE_ODDS_API_KEY}`, { cache: 'no-store' });
    if (!evRes.ok) return miss();
    const events: any[] = await evRes.json();
    const ev = events.find((e) => normTeam(e.home_team) === normTeam(homeTeam) && normTeam(e.away_team) === normTeam(awayTeam));
    if (!ev?.id) return miss();
    const url = `${ODDS_API_BASE}/sports/${sport}/events/${ev.id}/odds?apiKey=${process.env.THE_ODDS_API_KEY}&regions=us&markets=${markets.join(',')}&oddsFormat=american`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return miss();
    const data = await res.json();
    const home = data.home_team || homeTeam;
    const away = data.away_team || awayTeam;

    // ALT SPREADS: for each (side, point) keep the BEST (highest = most generous) price.
    const spreadAcc = new Map<string, { side: 'home' | 'away'; point: number; bestPrice: number | null; bestBook: string | null }>();
    const totalsAcc = new Map<string, { side: 'over' | 'under'; point: number; bestPrice: number | null; bestBook: string | null }>();
    // TEAM TOTALS: per team, capture median over+under prices around the median line.
    const teamTotalAcc: Record<'home' | 'away', { lines: number[]; over: number | null; under: number | null; overBook: string | null; underBook: string | null }> = {
      home: { lines: [], over: null, under: null, overBook: null, underBook: null },
      away: { lines: [], over: null, under: null, overBook: null, underBook: null },
    };

    for (const bk of data.bookmakers || []) {
      for (const m of bk.markets || []) {
        for (const o of m.outcomes || []) {
          const name = String(o.name || '');
          const price = typeof o.price === 'number' ? o.price : null;
          const point = typeof o.point === 'number' ? o.point : null;
          if (m.key === 'alternate_spreads') {
            if (point == null || price == null) continue;
            const side = normTeam(name) === normTeam(home) ? 'home' : normTeam(name) === normTeam(away) ? 'away' : null;
            if (!side) continue;
            const k = `${side}|${point}`;
            const cur = spreadAcc.get(k);
            if (!cur || (cur.bestPrice == null) || price > cur.bestPrice) {
              spreadAcc.set(k, { side, point, bestPrice: price, bestBook: bk.title || bk.key });
            }
          } else if (m.key === 'alternate_totals') {
            if (point == null || price == null) continue;
            const side = name.toLowerCase() === 'over' ? 'over' : name.toLowerCase() === 'under' ? 'under' : null;
            if (!side) continue;
            const k = `${side}|${point}`;
            const cur = totalsAcc.get(k);
            if (!cur || (cur.bestPrice == null) || price > cur.bestPrice) {
              totalsAcc.set(k, { side, point, bestPrice: price, bestBook: bk.title || bk.key });
            }
          } else if (m.key === 'team_totals' || m.key === 'alternate_team_totals') {
            if (point == null) continue;
            // outcomes for team totals are described by description (team name) + name (Over/Under)
            const team = String(o.description || '');
            const side = normTeam(team) === normTeam(home) ? 'home' : normTeam(team) === normTeam(away) ? 'away' : null;
            if (!side) continue;
            teamTotalAcc[side].lines.push(point);
            if (name.toLowerCase() === 'over' && price != null) {
              if (teamTotalAcc[side].over == null || price > teamTotalAcc[side].over) {
                teamTotalAcc[side].over = price;
                teamTotalAcc[side].overBook = bk.title || bk.key;
              }
            }
            if (name.toLowerCase() === 'under' && price != null) {
              if (teamTotalAcc[side].under == null || price > teamTotalAcc[side].under) {
                teamTotalAcc[side].under = price;
                teamTotalAcc[side].underBook = bk.title || bk.key;
              }
            }
          }
        }
      }
    }

    const altSpreads = Array.from(spreadAcc.values()).sort((a, b) => a.side.localeCompare(b.side) || a.point - b.point);
    const altTotals = Array.from(totalsAcc.values()).sort((a, b) => a.side.localeCompare(b.side) || a.point - b.point);
    const teamTotals: TeamTotal[] = (['home', 'away'] as const)
      .map((side) => {
        const acc = teamTotalAcc[side];
        const line = median(acc.lines);
        if (line == null) return null;
        return {
          side, line,
          bestOverPrice: acc.over,
          bestUnderPrice: acc.under,
          bestOverBook: acc.overBook,
          bestUnderBook: acc.underBook,
        };
      })
      .filter((x): x is TeamTotal => x != null);

    const out: AltLinesPackage = {
      altSpreads, altTotals, teamTotals,
      bookCount: (data.bookmakers || []).length,
    };
    altLinesCache.set(key, { data: out, at: Date.now() });
    return out;
  } catch { return miss(); }
}

export interface PickOddsInsight {
  bestOdds: number | null;
  bestBook: string | null;
  fairProb: number | null;
  /** value edge in percentage points: our best price's implied prob is this much BELOW the true prob (positive = +EV) */
  valueEdge: number | null;
  isValue: boolean;
}

// For one of our picks, line-shop the best price and measure value vs the consensus line.
export async function getOddsInsightForPick(
  league: string, awayTeam: string, homeTeam: string, pickedSide: 'home' | 'away',
): Promise<PickOddsInsight | null> {
  if (!hasOddsApi()) return null;
  const map = await fetchLeagueOdds(league);
  // Try the forward key first; for individual sports the home/away ordering between
  // ESPN and The Odds API often differs (no real "home court"), so also try the swap.
  let g = map[gameKey(awayTeam, homeTeam)];
  let flipped = false;
  if (!g) {
    g = map[gameKey(homeTeam, awayTeam)];
    flipped = true;
  }
  if (!g) return null;

  // If we matched via flipped order, our caller's pickedSide refers to ESPN's home/away,
  // which is THE OPPOSITE of the cached entry's home/away — invert which best-odds we use.
  const effectiveSide: 'home' | 'away' = flipped ? (pickedSide === 'home' ? 'away' : 'home') : pickedSide;
  const bestOdds = effectiveSide === 'home' ? g.bestHomeOdds : g.bestAwayOdds;
  const bestBook = effectiveSide === 'home' ? g.bestHomeBook : g.bestAwayBook;
  const fairProb = effectiveSide === 'home' ? g.fairHomeProb : g.fairAwayProb;

  let valueEdge: number | null = null;
  if (bestOdds != null && fairProb != null) {
    valueEdge = fairProb - impliedProb(bestOdds) * 100; // true prob minus what we're paying for
  }
  return {
    bestOdds,
    bestBook,
    fairProb,
    valueEdge: valueEdge != null ? Math.round(valueEdge * 10) / 10 : null,
    isValue: valueEdge != null && valueEdge >= 1.5, // ~1.5+ pts of edge = a real value spot
  };
}
