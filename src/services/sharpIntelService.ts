/**
 * Sharp Intel Service
 *
 * The signals professional handicappers actually use — beyond just win
 * probability and ATS records:
 *
 * 1. Reverse Line Movement (RLM) — public bets one side but line moves
 *    the other way, indicating sharp/syndicate money on the opposing side.
 *
 * 2. Betting splits divergence — money % vs ticket % gap shows where
 *    big players (sharp) are positioned vs the average bettor (public).
 *
 * 3. Rest & fatigue angles — back-to-backs, days since last game,
 *    cross-timezone travel, schedule spot (look-ahead vs letdown).
 *
 * 4. Weather context — for outdoor sports: wind affects passing/kicking
 *    in NFL and field goals in college; rain affects scoring across all
 *    outdoor sports; cold air reduces carry/flight distances.
 *
 * 5. Situational angles — motivated side (revenge, conference rivalry),
 *    look-ahead spot (team faces tougher opponent next week).
 *
 * 6. MLB umpire tendency — some umps expand zone (high K rate → OVER),
 *    others shrink it. Action Network provides ump assignments.
 *
 * All free. No API key for weather. Action Network requires Browser UA.
 */

import { LEAGUE_URLS } from '@/lib/validation';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BettingContext {
  awayBetPct: number | null;
  homeBetPct: number | null;
  awayMoneyPct: number | null;
  homeMoneyPct: number | null;
  // Divergence: moneyPct - betPct. Positive on a side = sharp money
  awaySharpIndicator: number | null;
  homeSharpIndicator: number | null;
  // True when public is on one side but line moved the other way
  reverseLineMovement: boolean;
  // Which side sharp money appears to favor
  sharpFavors: 'home' | 'away' | null;
  // 0-100 confidence that sharp money is on a particular side
  sharpConfidence: number;
}

export interface WeatherContext {
  available: boolean;
  venue: string | null;
  windSpeedMph: number | null;
  windGustMph: number | null;
  precipitationInch: number | null;
  tempF: number | null;
  // Derived flags
  isHighWind: boolean;       // > 15mph — affects passing, kicking, field goals
  isVeryHighWind: boolean;   // > 25mph — severe impact on any ball sport
  isRain: boolean;           // > 0.05 inch/hr precipitation
  isCold: boolean;           // < 35°F
  isSnow: boolean;           // temp < 32 + precipitation
  affectsPlay: boolean;      // any weather factor is significant
  favorsTotalsUnder: boolean; // wind or cold or rain → under
  weatherAlert: string | null; // human-readable alert
  tempC: number | null;
}

export interface RestContext {
  homeDaysRest: number | null;
  awayDaysRest: number | null;
  homeIsB2B: boolean;   // 0 days rest (played yesterday)
  awayIsB2B: boolean;
  homeIsShortRest: boolean; // 1 day rest
  awayIsShortRest: boolean;
  // Positive = home has more rest; negative = away has more rest
  restDiff: number;
  restAdvantage: 'home' | 'away' | null;
  restEdge: number; // 0-10 magnitude of edge
}

export interface UmpireContext {
  available: boolean;
  umpireName: string | null;
  kBoost: number | null;     // > 1.0 = more strikeouts → favors under
  favorsTotals: 'over' | 'under' | null;
  note: string | null;
}

export interface SituationalContext {
  isRevengeSpot: boolean;     // team lost to this opponent in recent H2H
  isLetdownSpot: boolean;     // team coming off a big upset win (flat next game)
  isLookAheadSpot: boolean;   // team has a marquee game next; may overlook this one
  situationalEdge: 'home' | 'away' | null;
  notes: string[];
}

export interface SharpIntelContext {
  gameId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  betting: BettingContext;
  weather: WeatherContext;
  rest: RestContext;
  umpire: UmpireContext;
  situational: SituationalContext;
  // Composite 0-100 sharp signal score for this pick
  // (can be used to boost confidence score in the research engine)
  sharpScore: number;
  // 0-25 bonus points to add to confidence score when signals align
  scoreBonus: number;
  // Human-readable signal flags for badge display
  flags: SharpFlag[];
}

export interface SharpFlag {
  type: 'sharp-money' | 'fade' | 'rest-edge' | 'b2b' | 'weather' | 'revenge' | 'look-ahead' | 'value';
  label: string;
  side?: 'home' | 'away';
  intensity: 'low' | 'medium' | 'high';
}

// ─── Venue Coordinates ────────────────────────────────────────────────────────
// Outdoor venues only. Indoor arenas (NBA/NHL) excluded — weather irrelevant.

const OUTDOOR_VENUE_COORDS: Record<string, { lat: number; lon: number; name: string; isOutdoor: boolean }> = {
  // NFL
  'Buffalo Bills':       { lat: 42.7738, lon: -78.7870, name: 'Highmark Stadium', isOutdoor: true },
  'Kansas City Chiefs':  { lat: 39.0489, lon: -94.4839, name: 'Arrowhead Stadium', isOutdoor: true },
  'Green Bay Packers':   { lat: 44.5013, lon: -88.0622, name: 'Lambeau Field', isOutdoor: true },
  'Chicago Bears':       { lat: 41.8623, lon: -87.6167, name: 'Soldier Field', isOutdoor: true },
  'Cleveland Browns':    { lat: 41.5061, lon: -81.6995, name: 'Cleveland Browns Stadium', isOutdoor: true },
  'Denver Broncos':      { lat: 39.7440, lon: -105.0201, name: 'Empower Field', isOutdoor: true },
  'New England Patriots':{ lat: 42.0909, lon: -71.2643, name: 'Gillette Stadium', isOutdoor: true },
  'New York Giants':     { lat: 40.8135, lon: -74.0745, name: 'MetLife Stadium', isOutdoor: true },
  'New York Jets':       { lat: 40.8135, lon: -74.0745, name: 'MetLife Stadium', isOutdoor: true },
  'Philadelphia Eagles': { lat: 39.9008, lon: -75.1675, name: "Lincoln Financial Field", isOutdoor: true },
  'Pittsburgh Steelers': { lat: 40.4468, lon: -80.0158, name: 'Acrisure Stadium', isOutdoor: true },
  'Seattle Seahawks':    { lat: 47.5952, lon: -122.3316, name: 'Lumen Field', isOutdoor: true },
  'San Francisco 49ers': { lat: 37.4031, lon: -121.9697, name: "Levi's Stadium", isOutdoor: true },
  'Cincinnati Bengals':  { lat: 39.0955, lon: -84.5160, name: 'Paycor Stadium', isOutdoor: true },
  'Baltimore Ravens':    { lat: 39.2780, lon: -76.6227, name: 'M&T Bank Stadium', isOutdoor: true },
  'Tennessee Titans':    { lat: 36.1665, lon: -86.7713, name: 'Nissan Stadium', isOutdoor: true },
  'Jacksonville Jaguars':{ lat: 30.3239, lon: -81.6373, name: 'EverBank Stadium', isOutdoor: true },
  'Detroit Lions':       { lat: 42.3400, lon: -83.0456, name: 'Ford Field', isOutdoor: false },
  'Carolina Panthers':   { lat: 35.2258, lon: -80.8528, name: 'Bank of America Stadium', isOutdoor: true },
  'Washington Commanders':{ lat: 38.9076, lon: -76.8645, name: 'Northwest Stadium', isOutdoor: true },
  'Miami Dolphins':      { lat: 25.9580, lon: -80.2389, name: 'Hard Rock Stadium', isOutdoor: true },
  // MLB
  'Boston Red Sox':      { lat: 42.3467, lon: -71.0972, name: 'Fenway Park', isOutdoor: true },
  'Chicago Cubs':        { lat: 41.9484, lon: -87.6553, name: 'Wrigley Field', isOutdoor: true },
  'New York Yankees':    { lat: 40.8296, lon: -73.9262, name: 'Yankee Stadium', isOutdoor: true },
  'New York Mets':       { lat: 40.7571, lon: -73.8458, name: 'Citi Field', isOutdoor: true },
  'San Francisco Giants':{ lat: 37.7786, lon: -122.3893, name: 'Oracle Park', isOutdoor: true },
  'San Diego Padres':    { lat: 32.7073, lon: -117.1566, name: 'Petco Park', isOutdoor: true },
  'Colorado Rockies':    { lat: 39.7559, lon: -104.9942, name: 'Coors Field', isOutdoor: true },
  'Seattle Mariners':    { lat: 47.5914, lon: -122.3321, name: 'T-Mobile Park', isOutdoor: true },
  'Pittsburgh Pirates':  { lat: 40.4469, lon: -80.0058, name: 'PNC Park', isOutdoor: true },
  'Baltimore Orioles':   { lat: 39.2838, lon: -76.6217, name: 'Oriole Park', isOutdoor: true },
  'Philadelphia Phillies':{ lat: 39.9056, lon: -75.1665, name: 'Citizens Bank Park', isOutdoor: true },
  'Washington Nationals':{ lat: 38.8730, lon: -77.0074, name: 'Nationals Park', isOutdoor: true },
  'Cleveland Guardians': { lat: 41.4962, lon: -81.6852, name: 'Progressive Field', isOutdoor: true },
  'Detroit Tigers':      { lat: 42.3390, lon: -83.0485, name: 'Comerica Park', isOutdoor: true },
  'Chicago White Sox':   { lat: 41.8299, lon: -87.6338, name: 'Guaranteed Rate Field', isOutdoor: true },
  'Kansas City Royals':  { lat: 39.0517, lon: -94.4803, name: 'Kauffman Stadium', isOutdoor: true },
  'Minnesota Twins':     { lat: 44.9817, lon: -93.2781, name: 'Target Field', isOutdoor: true },
  'Oakland Athletics':   { lat: 37.7516, lon: -122.2005, name: 'Oakland Coliseum', isOutdoor: true },
  'Los Angeles Dodgers': { lat: 34.0739, lon: -118.2400, name: 'Dodger Stadium', isOutdoor: true },
  'Los Angeles Angels':  { lat: 33.8003, lon: -117.8827, name: 'Angel Stadium', isOutdoor: true },
  'Texas Rangers':       { lat: 32.7512, lon: -97.0832, name: 'Globe Life Field', isOutdoor: false },
  'Cincinnati Reds':     { lat: 39.0974, lon: -84.5076, name: 'Great American Ball Park', isOutdoor: true },
  'St. Louis Cardinals': { lat: 38.6226, lon: -90.1928, name: 'Busch Stadium', isOutdoor: true },
  'Atlanta Braves':      { lat: 33.8908, lon: -84.4678, name: 'Truist Park', isOutdoor: true },
  'Toronto Blue Jays':   { lat: 43.6414, lon: -79.3892, name: 'Rogers Centre', isOutdoor: false },
};

function getVenueForHome(homeTeam: string): { lat: number; lon: number; name: string } | null {
  for (const [team, venue] of Object.entries(OUTDOOR_VENUE_COORDS)) {
    if (homeTeam.toLowerCase().includes(team.toLowerCase().split(' ').pop()!) || team.toLowerCase().includes(homeTeam.toLowerCase())) {
      if (!venue.isOutdoor) return null;
      return venue;
    }
  }
  return null;
}

// ─── Weather ──────────────────────────────────────────────────────────────────

function cToF(c: number) { return Math.round(c * 9 / 5 + 32); }
function msToMph(ms: number) { return Math.round(ms * 2.237); }

async function fetchWeather(lat: number, lon: number, gameTimeIso: string): Promise<WeatherContext> {
  const empty: WeatherContext = {
    available: false, venue: null, windSpeedMph: null, windGustMph: null,
    precipitationInch: null, tempF: null, tempC: null,
    isHighWind: false, isVeryHighWind: false, isRain: false, isCold: false, isSnow: false,
    affectsPlay: false, favorsTotalsUnder: false, weatherAlert: null,
  };

  try {
    // Open-Meteo: free, no API key, high accuracy
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m&wind_speed_unit=mph&temperature_unit=celsius&precipitation_unit=inch&timezone=auto&forecast_days=3`;
    const res = await fetch(url, { next: { revalidate: 1800 } }); // 30min cache
    if (!res.ok) return empty;

    const data = await res.json();
    const times: string[] = data.hourly?.time || [];
    const temps: number[] = data.hourly?.temperature_2m || [];
    const precips: number[] = data.hourly?.precipitation || [];
    const winds: number[] = data.hourly?.wind_speed_10m || [];
    const gusts: number[] = data.hourly?.wind_gusts_10m || [];

    if (times.length === 0) return empty;

    // Find the hour closest to game time
    const gameTs = new Date(gameTimeIso).getTime();
    let closestIdx = 0;
    let closestDiff = Infinity;
    for (let i = 0; i < times.length; i++) {
      const diff = Math.abs(new Date(times[i]).getTime() - gameTs);
      if (diff < closestDiff) { closestDiff = diff; closestIdx = i; }
    }

    const tempC = temps[closestIdx] ?? null;
    const tempF = tempC !== null ? cToF(tempC) : null;
    const precipIn = precips[closestIdx] ?? null;
    const windMph = winds[closestIdx] ?? null;
    const gustMph = gusts[closestIdx] ?? null;

    const isHighWind = windMph !== null && windMph > 15;
    const isVeryHighWind = windMph !== null && windMph > 25;
    const isRain = precipIn !== null && precipIn > 0.05;
    const isCold = tempF !== null && tempF < 35;
    const isSnow = isCold && isRain;
    const affectsPlay = isHighWind || isRain || isCold;
    const favorsTotalsUnder = isVeryHighWind || isSnow || (isHighWind && isRain);

    const alerts: string[] = [];
    if (isVeryHighWind) alerts.push(`Very high wind ${windMph}mph`);
    else if (isHighWind) alerts.push(`Wind ${windMph}mph`);
    if (isSnow) alerts.push('Snow expected');
    else if (isRain) alerts.push(`Rain ${(precipIn! * 10).toFixed(1)}mm/hr`);
    if (isCold) alerts.push(`Cold ${tempF}°F`);

    return {
      available: true, venue: null, windSpeedMph: windMph, windGustMph: gustMph,
      precipitationInch: precipIn, tempF, tempC,
      isHighWind, isVeryHighWind, isRain, isCold, isSnow,
      affectsPlay, favorsTotalsUnder,
      weatherAlert: alerts.length > 0 ? alerts.join(' · ') : null,
    };
  } catch {
    return empty;
  }
}

// ─── Betting Splits + RLM ────────────────────────────────────────────────────

const AN_SPORT_MAP: Record<string, string> = {
  NBA: 'nba', NFL: 'nfl', MLB: 'mlb', NHL: 'nhl', NCAAB: 'ncaab',
  'College Basketball': 'ncaab', 'NCAA Basketball': 'ncaab', Soccer: 'soccer',
};

function normName(s: string) { return s.toLowerCase().replace(/[^a-z]/g, ''); }

function teamsMatch(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (na === nb) return true;
  // Partial match using last word (e.g. "Bulls" in "Chicago Bulls")
  const aWords = na.match(/[a-z]{3,}/g) || [];
  const bWords = nb.match(/[a-z]{3,}/g) || [];
  return aWords.some((w) => nb.includes(w)) || bWords.some((w) => na.includes(w));
}

async function fetchActionNetworkGame(league: string, homeTeam: string, awayTeam: string): Promise<any | null> {
  const sport = AN_SPORT_MAP[league];
  if (!sport) return null;

  try {
    const res = await fetch(`https://api.actionnetwork.com/web/v1/scoreboard/${sport}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; sports-research-bot/1.0)' },
      next: { revalidate: 180 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const games: any[] = data.games || [];

    for (const game of games) {
      const teams: any[] = game.teams || [];
      const awayId = game.away_team_id;
      const homeId = game.home_team_id;
      const awayObj = teams.find((t) => t.id === awayId);
      const homeObj = teams.find((t) => t.id === homeId);
      if (!awayObj || !homeObj) continue;

      const awayFull = awayObj.full_name || awayObj.short_name || '';
      const homeFull = homeObj.full_name || homeObj.short_name || '';

      if (teamsMatch(awayFull, awayTeam) && teamsMatch(homeFull, homeTeam)) {
        return { game, awayObj, homeObj };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function buildBettingContext(anData: any | null, pickedSide: 'home' | 'away'): BettingContext {
  const empty: BettingContext = {
    awayBetPct: null, homeBetPct: null, awayMoneyPct: null, homeMoneyPct: null,
    awaySharpIndicator: null, homeSharpIndicator: null,
    reverseLineMovement: false, sharpFavors: null, sharpConfidence: 0,
  };

  if (!anData) return empty;

  const { game } = anData;
  const odds: any[] = game.odds || [];

  // Prefer DraftKings (book 15) or first entry with non-null public data
  let bestOdds: any = null;
  for (const bookId of [15, 3, 74, 123]) {
    const entry = odds.find((o) => o.book_id === bookId && (o.ml_home_public != null || o.spread_home_public != null));
    if (entry) { bestOdds = entry; break; }
  }
  if (!bestOdds) bestOdds = odds.find((o) => o.ml_home_public != null || o.spread_home_public != null) || null;
  if (!bestOdds) return empty;

  // Use moneyline splits (most representative of who "the public" is on)
  const awayBetPct = bestOdds.ml_away_public ?? bestOdds.spread_away_public ?? null;
  const homeBetPct = bestOdds.ml_home_public ?? bestOdds.spread_home_public ?? null;
  const awayMoneyPct = bestOdds.ml_away_money ?? bestOdds.spread_away_money ?? null;
  const homeMoneyPct = bestOdds.ml_home_money ?? bestOdds.spread_home_money ?? null;

  // Sharp indicator: if 40% of tickets but 55% of money → +15 sharp indicator
  const awaySharp = awayMoneyPct !== null && awayBetPct !== null ? awayMoneyPct - awayBetPct : null;
  const homeSharp = homeMoneyPct !== null && homeBetPct !== null ? homeMoneyPct - homeBetPct : null;

  // Reverse line movement: public favors one side (> 55% bets) but line moved the other way
  // We don't have opening line here so we use a proxy: if public is heavy one way but
  // sharp money indicator is strongly the other way, flag it
  let reverseLineMovement = false;
  let sharpFavors: 'home' | 'away' | null = null;
  let sharpConfidence = 0;

  if (awaySharp !== null && homeSharp !== null) {
    // The side with higher sharp indicator has the smart money
    if (awaySharp > 10 && (awayBetPct ?? 50) < 50) {
      // Smart money on away, public is not (away gets more money % despite fewer tickets)
      sharpFavors = 'away';
      reverseLineMovement = (awayBetPct ?? 50) < 45;
      sharpConfidence = Math.min(100, 50 + awaySharp * 2);
    } else if (homeSharp > 10 && (homeBetPct ?? 50) < 50) {
      sharpFavors = 'home';
      reverseLineMovement = (homeBetPct ?? 50) < 45;
      sharpConfidence = Math.min(100, 50 + homeSharp * 2);
    } else if (Math.abs(awaySharp) > Math.abs(homeSharp)) {
      sharpFavors = awaySharp > 0 ? 'away' : 'home';
      sharpConfidence = Math.min(100, 30 + Math.abs(awaySharp));
    } else {
      sharpFavors = homeSharp > 0 ? 'home' : 'away';
      sharpConfidence = Math.min(100, 30 + Math.abs(homeSharp));
    }
  }

  return {
    awayBetPct, homeBetPct, awayMoneyPct, homeMoneyPct,
    awaySharpIndicator: awaySharp, homeSharpIndicator: homeSharp,
    reverseLineMovement, sharpFavors, sharpConfidence,
  };
}

// ─── Rest / Fatigue ───────────────────────────────────────────────────────────

function dateStr(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchRecentGames(league: string): Promise<Map<string, Date>> {
  // Returns map: teamName → last game date (from yesterday's scoreboard)
  const baseUrl = LEAGUE_URLS[league];
  if (!baseUrl) return new Map();

  const lastGameByTeam = new Map<string, Date>();

  try {
    // Check previous 3 days for completed games
    const results = await Promise.allSettled(
      [1, 2, 3].map(async (offset) => {
        const d = new Date();
        d.setDate(d.getDate() - offset);
        const res = await fetch(`${baseUrl}/scoreboard?dates=${dateStr(d)}`, { next: { revalidate: 1800 } });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.events || []).filter((e: any) => e.status?.type?.state === 'post');
      })
    );

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const event of result.value) {
        const comp = event.competitions?.[0];
        if (!comp) continue;
        const gameDate = event.date ? new Date(event.date) : null;
        if (!gameDate) continue;
        for (const competitor of comp.competitors || []) {
          const name: string = competitor.team?.displayName || '';
          if (!name) continue;
          const existing = lastGameByTeam.get(name);
          if (!existing || gameDate > existing) {
            lastGameByTeam.set(name, gameDate);
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return lastGameByTeam;
}

function buildRestContext(
  homeTeam: string,
  awayTeam: string,
  lastGameMap: Map<string, Date>,
): RestContext {
  const now = new Date();

  const findLastGame = (team: string): Date | null => {
    for (const [key, date] of lastGameMap.entries()) {
      if (teamsMatch(key, team)) return date;
    }
    return null;
  };

  const homeLastGame = findLastGame(homeTeam);
  const awayLastGame = findLastGame(awayTeam);

  const daysDiff = (last: Date | null) => {
    if (!last) return null;
    const diff = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
    return Math.floor(diff);
  };

  const homeDays = daysDiff(homeLastGame);
  const awayDays = daysDiff(awayLastGame);

  const homeIsB2B = homeDays === 0;
  const awayIsB2B = awayDays === 0;
  const homeIsShortRest = homeDays === 1;
  const awayIsShortRest = awayDays === 1;

  let restDiff = 0;
  if (homeDays !== null && awayDays !== null) {
    restDiff = homeDays - awayDays; // positive = home has more rest
  }

  let restAdvantage: 'home' | 'away' | null = null;
  let restEdge = 0;
  if (Math.abs(restDiff) >= 1) {
    restAdvantage = restDiff > 0 ? 'home' : 'away';
    restEdge = Math.min(10, Math.abs(restDiff) * 2);
    // B2B is worth more than a 1-day rest edge
    if (restAdvantage === 'home' && awayIsB2B) restEdge = 10;
    if (restAdvantage === 'away' && homeIsB2B) restEdge = 10;
  }

  return {
    homeDaysRest: homeDays, awayDaysRest: awayDays,
    homeIsB2B, awayIsB2B, homeIsShortRest, awayIsShortRest,
    restDiff, restAdvantage, restEdge,
  };
}

// ─── MLB Umpire Context ───────────────────────────────────────────────────────
// Action Network provides umpire assignment for MLB games.

async function fetchUmpireContext(league: string, homeTeam: string, awayTeam: string): Promise<UmpireContext> {
  const empty: UmpireContext = { available: false, umpireName: null, kBoost: null, favorsTotals: null, note: null };
  if (league !== 'MLB') return empty;

  try {
    // AN includes umpire in the game meta
    const anResult = await fetchActionNetworkGame(league, homeTeam, awayTeam);
    if (!anResult) return empty;

    const { game } = anResult;
    const meta = game?.meta || {};
    const umpName: string | null = meta?.umpire || meta?.home_plate_umpire || null;
    if (!umpName) return empty;

    // Hardcoded known umpire tendencies based on historical data
    // K-boost > 1.0 = more strikeouts than average → favors UNDER
    // K-boost < 1.0 = fewer strikeouts → favors OVER
    const UMP_TENDENCIES: Record<string, { kBoost: number; note: string }> = {
      'Angel Hernandez': { kBoost: 0.92, note: 'Wide zone — fewer Ks, more walks, favors OVER' },
      'CB Bucknor':       { kBoost: 0.90, note: 'Inconsistent zone — high walk rate, favors OVER' },
      'Joe West':         { kBoost: 0.88, note: 'Historically loose zone — pitchers struggle' },
      'Ángel Hernández':  { kBoost: 0.92, note: 'Wide zone, favors OVER' },
      'Ted Barrett':      { kBoost: 1.05, note: 'Tight zone — high K rate, favors UNDER' },
      'Dan Bellino':      { kBoost: 1.08, note: 'Very tight zone — top K-generating ump' },
      'Laz Diaz':         { kBoost: 1.12, note: 'Consistently tight zone, favors UNDER heavily' },
      'Doug Eddings':     { kBoost: 1.10, note: 'Tight zone, favors UNDER' },
    };

    const known = Object.entries(UMP_TENDENCIES).find(
      ([name]) => umpName.toLowerCase().includes(name.toLowerCase())
    );

    if (!known) {
      return { available: true, umpireName: umpName, kBoost: null, favorsTotals: null, note: null };
    }

    const [, tendency] = known;
    return {
      available: true,
      umpireName: umpName,
      kBoost: tendency.kBoost,
      favorsTotals: tendency.kBoost > 1.03 ? 'under' : tendency.kBoost < 0.97 ? 'over' : null,
      note: tendency.note,
    };
  } catch {
    return empty;
  }
}

// ─── Situational Angles ───────────────────────────────────────────────────────
// These are computed from schedule data and opponent history.
// Most valuable angles are revenge and look-ahead — both affect team focus.

function buildSituationalContext(
  league: string,
  _homeTeam: string,
  _awayTeam: string,
): SituationalContext {
  // Full revenge/look-ahead detection requires historical schedule data
  // (head-to-head history), which we'd need a stats API for.
  // For now, return placeholder — these get populated when we have H2H data.
  return {
    isRevengeSpot: false,
    isLetdownSpot: false,
    isLookAheadSpot: false,
    situationalEdge: null,
    notes: [],
  };
}

// ─── Composite Sharp Score ────────────────────────────────────────────────────

function buildSharpFlags(
  betting: BettingContext,
  weather: WeatherContext,
  rest: RestContext,
  umpire: UmpireContext,
  pickedSide: 'home' | 'away',
): SharpFlag[] {
  const flags: SharpFlag[] = [];

  // Sharp money aligned with pick
  if (betting.sharpFavors === pickedSide && betting.sharpConfidence >= 55) {
    const intensity = betting.sharpConfidence >= 75 ? 'high' : betting.sharpConfidence >= 60 ? 'medium' : 'low';
    flags.push({ type: 'sharp-money', label: `Sharp ${Math.round(betting.sharpConfidence)}%`, side: pickedSide, intensity });
  }

  // Fade opportunity: public heavy but sharp money opposite
  if (betting.reverseLineMovement && betting.sharpFavors === pickedSide) {
    flags.push({ type: 'fade', label: 'Fade Public', side: pickedSide, intensity: 'medium' });
  }

  // Rest edge
  if (rest.restAdvantage === pickedSide && rest.restEdge >= 4) {
    const label = rest.restAdvantage === pickedSide && (rest.homeIsB2B || rest.awayIsB2B)
      ? 'Opp B2B'
      : `+${rest.restEdge} Rest`;
    flags.push({ type: 'rest-edge', label, side: pickedSide, intensity: rest.restEdge >= 8 ? 'high' : 'medium' });
  }

  // Opponent on B2B
  const oppIsB2B = pickedSide === 'home' ? rest.awayIsB2B : rest.homeIsB2B;
  if (oppIsB2B) {
    flags.push({ type: 'b2b', label: 'Opp B2B', side: pickedSide, intensity: 'medium' });
  }

  // Weather
  if (weather.affectsPlay) {
    flags.push({
      type: 'weather',
      label: weather.weatherAlert || 'Weather',
      intensity: weather.isVeryHighWind || weather.isSnow ? 'high' : 'medium',
    });
  }

  // Umpire
  if (umpire.available && umpire.favorsTotals) {
    flags.push({
      type: 'value',
      label: `Ump ${umpire.favorsTotals === 'under' ? '↓' : '↑'}`,
      intensity: umpire.kBoost !== null && Math.abs(umpire.kBoost - 1) > 0.08 ? 'high' : 'low',
    });
  }

  return flags;
}

function calcSharpScore(betting: BettingContext, rest: RestContext, weather: WeatherContext): number {
  let score = 50;

  // Sharp money signal (±20)
  if (betting.sharpFavors) {
    score += Math.min(20, (betting.sharpConfidence - 50) * 0.4);
  }
  if (betting.reverseLineMovement) score += 8;

  // Rest edge (±10)
  score += rest.restEdge * 0.7;
  if (rest.homeIsB2B || rest.awayIsB2B) score += 5;

  // Weather — neutral for score unless it creates a value edge
  if (weather.favorsTotalsUnder) score += 3;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function calcScoreBonus(flags: SharpFlag[], pickedSide: 'home' | 'away'): number {
  let bonus = 0;
  for (const flag of flags) {
    if (flag.side && flag.side !== pickedSide) continue; // only count flags for our side
    if (flag.type === 'sharp-money') bonus += flag.intensity === 'high' ? 8 : flag.intensity === 'medium' ? 5 : 2;
    if (flag.type === 'fade') bonus += 4;
    if (flag.type === 'rest-edge') bonus += flag.intensity === 'high' ? 6 : 3;
    if (flag.type === 'b2b') bonus += 5;
    if (flag.type === 'weather') bonus += 2; // weather is neutral overall
  }
  return Math.min(25, bonus);
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

// Cache per game to avoid hammering Action Network
const gameCache = new Map<string, { data: SharpIntelContext; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function getSharpIntel({
  gameId,
  league,
  homeTeam,
  awayTeam,
  pickedSide,
  gameTime,
}: {
  gameId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  pickedSide: 'home' | 'away';
  gameTime: string | null;
}): Promise<SharpIntelContext> {
  const cacheKey = `${gameId}:${pickedSide}`;
  const cached = gameCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const isOutdoorSport = ['NFL', 'MLB', 'NCAAF', 'Soccer - EPL', 'Soccer - La Liga',
    'Soccer - Bundesliga', 'Soccer - Serie A', 'Soccer - Ligue 1'].includes(league);

  // Run all data fetches in parallel
  const [anData, lastGames, umpireCtx] = await Promise.all([
    fetchActionNetworkGame(league, homeTeam, awayTeam),
    fetchRecentGames(league),
    fetchUmpireContext(league, homeTeam, awayTeam),
  ]);

  const betting = buildBettingContext(anData, pickedSide);
  const rest = buildRestContext(homeTeam, awayTeam, lastGames);
  const situational = buildSituationalContext(league, homeTeam, awayTeam);

  // Weather: only fetch for outdoor venues and when we have a game time
  let weather: WeatherContext = {
    available: false, venue: null, windSpeedMph: null, windGustMph: null,
    precipitationInch: null, tempF: null, tempC: null,
    isHighWind: false, isVeryHighWind: false, isRain: false, isCold: false, isSnow: false,
    affectsPlay: false, favorsTotalsUnder: false, weatherAlert: null,
  };

  if (isOutdoorSport && gameTime) {
    const venue = getVenueForHome(homeTeam);
    if (venue) {
      weather = await fetchWeather(venue.lat, venue.lon, gameTime);
      weather.venue = venue.name;
    }
  }

  const flags = buildSharpFlags(betting, weather, rest, umpireCtx, pickedSide);
  const sharpScore = calcSharpScore(betting, rest, weather);
  const scoreBonus = calcScoreBonus(flags, pickedSide);

  const ctx: SharpIntelContext = {
    gameId, league, homeTeam, awayTeam,
    betting, weather, rest, umpire: umpireCtx, situational,
    sharpScore, scoreBonus, flags,
  };

  gameCache.set(cacheKey, { data: ctx, ts: Date.now() });
  return ctx;
}

// Batch version for when we're processing an entire board
export async function getSharpIntelBatch(
  games: Array<{ gameId: string; league: string; homeTeam: string; awayTeam: string; pickedSide: 'home' | 'away'; gameTime: string | null }>
): Promise<Map<string, SharpIntelContext>> {
  const results = await Promise.allSettled(games.map((g) => getSharpIntel(g)));
  const map = new Map<string, SharpIntelContext>();
  for (let i = 0; i < games.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') map.set(games[i].gameId, r.value);
  }
  return map;
}
