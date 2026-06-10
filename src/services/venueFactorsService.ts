// VENUE FACTORS — every sport
//
// Where the game is played changes the game. MLB park factors get all the
// attention but the same logic applies to every venue:
//
//   NBA/WNBA: Denver's altitude (~5,280 ft) materially hurts opponents'
//   conditioning and 3PT shooting. Some arenas have shooter-friendly
//   backdrops, others don't.
//
//   NFL: dome vs outdoor changes passing math entirely. Cold-weather games at
//   Lambeau / Highmark / Soldier suppress passing yardage. Lambeau wind / Bills'
//   stadium wind tunnel kill kicking. Altitude at Empower Field.
//
//   NHL: ice quality varies. Warm-climate arenas (Vegas, Tampa, Dallas,
//   Florida) play with softer ice late in games — more turnovers, faster fade
//   from the home team.
//
//   Travel/fatigue: east-coast team going to LA for a 10pm ET tip is dealing
//   with circadian rhythm at midnight body-time. Real and measurable.
//
// Factors are 100-indexed (100 = neutral). >100 means MORE of that effect.
// Engine consumes these as nudges to projected totals, conditioning penalties,
// and shooting-variance bumps.

export interface VenueFactor {
  league: 'NBA' | 'WNBA' | 'NFL' | 'NHL';
  homeAbbr: string;
  venueName: string;

  // Universal scoring index. >100 = more scoring than league avg, <100 = less.
  // NBA/WNBA: pace + 3PT-friendly backdrop
  // NFL: dome boost, cold-weather penalty, wind penalty
  // NHL: ice quality affects shots-on-goal late
  scoring: number;

  // Altitude flag (Denver Nuggets, Jazz, Denver Broncos). Opponent
  // conditioning impact is real — late-quarter shooting/passing drops.
  altitude: 'high' | 'mild' | 'none';

  // Environment penalty/bonus per sport.
  // NFL: 'dome' | 'cold' | 'wind' | 'neutral'
  // NHL: 'warm-ice' | 'cold-ice' | 'neutral'
  // NBA/WNBA: 'home-court-loud' | 'neutral'
  environment: string;

  // Surface (NFL grass vs turf — injury rate higher on turf for non-skill positions)
  surface?: 'grass' | 'turf' | null;
}

const NBA_ARENAS: Record<string, VenueFactor> = {
  ATL: { league: 'NBA', homeAbbr: 'ATL', venueName: 'State Farm Arena',  scoring: 100, altitude: 'none', environment: 'neutral' },
  BOS: { league: 'NBA', homeAbbr: 'BOS', venueName: 'TD Garden',         scoring: 101, altitude: 'none', environment: 'home-court-loud' },
  BKN: { league: 'NBA', homeAbbr: 'BKN', venueName: 'Barclays Center',   scoring: 100, altitude: 'none', environment: 'neutral' },
  CHA: { league: 'NBA', homeAbbr: 'CHA', venueName: 'Spectrum Center',   scoring: 101, altitude: 'none', environment: 'neutral' },
  CHI: { league: 'NBA', homeAbbr: 'CHI', venueName: 'United Center',     scoring: 99,  altitude: 'none', environment: 'neutral' },
  CLE: { league: 'NBA', homeAbbr: 'CLE', venueName: 'Rocket Mortgage Arena', scoring: 99, altitude: 'none', environment: 'neutral' },
  DAL: { league: 'NBA', homeAbbr: 'DAL', venueName: 'American Airlines Center', scoring: 101, altitude: 'none', environment: 'home-court-loud' },
  DEN: { league: 'NBA', homeAbbr: 'DEN', venueName: 'Ball Arena',        scoring: 104, altitude: 'high', environment: 'neutral' },
  DET: { league: 'NBA', homeAbbr: 'DET', venueName: 'Little Caesars Arena', scoring: 99, altitude: 'none', environment: 'neutral' },
  GSW: { league: 'NBA', homeAbbr: 'GSW', venueName: 'Chase Center',      scoring: 102, altitude: 'none', environment: 'home-court-loud' },
  HOU: { league: 'NBA', homeAbbr: 'HOU', venueName: 'Toyota Center',     scoring: 100, altitude: 'none', environment: 'neutral' },
  IND: { league: 'NBA', homeAbbr: 'IND', venueName: 'Gainbridge Fieldhouse', scoring: 102, altitude: 'none', environment: 'home-court-loud' },
  LAC: { league: 'NBA', homeAbbr: 'LAC', venueName: 'Intuit Dome',       scoring: 100, altitude: 'none', environment: 'neutral' },
  LAL: { league: 'NBA', homeAbbr: 'LAL', venueName: 'Crypto.com Arena',  scoring: 100, altitude: 'none', environment: 'neutral' },
  MEM: { league: 'NBA', homeAbbr: 'MEM', venueName: 'FedExForum',        scoring: 100, altitude: 'none', environment: 'neutral' },
  MIA: { league: 'NBA', homeAbbr: 'MIA', venueName: 'Kaseya Center',     scoring: 100, altitude: 'none', environment: 'home-court-loud' },
  MIL: { league: 'NBA', homeAbbr: 'MIL', venueName: 'Fiserv Forum',      scoring: 99,  altitude: 'none', environment: 'home-court-loud' },
  MIN: { league: 'NBA', homeAbbr: 'MIN', venueName: 'Target Center',     scoring: 100, altitude: 'none', environment: 'neutral' },
  NOP: { league: 'NBA', homeAbbr: 'NOP', venueName: 'Smoothie King Center', scoring: 102, altitude: 'none', environment: 'neutral' },
  NYK: { league: 'NBA', homeAbbr: 'NYK', venueName: 'Madison Square Garden', scoring: 100, altitude: 'none', environment: 'home-court-loud' },
  OKC: { league: 'NBA', homeAbbr: 'OKC', venueName: 'Paycom Center',     scoring: 100, altitude: 'none', environment: 'home-court-loud' },
  ORL: { league: 'NBA', homeAbbr: 'ORL', venueName: 'Kia Center',        scoring: 99,  altitude: 'none', environment: 'neutral' },
  PHI: { league: 'NBA', homeAbbr: 'PHI', venueName: 'Xfinity Mobile Arena', scoring: 100, altitude: 'none', environment: 'home-court-loud' },
  PHX: { league: 'NBA', homeAbbr: 'PHX', venueName: 'PHX Arena',         scoring: 102, altitude: 'mild', environment: 'home-court-loud' },
  POR: { league: 'NBA', homeAbbr: 'POR', venueName: 'Moda Center',       scoring: 101, altitude: 'none', environment: 'home-court-loud' },
  SAC: { league: 'NBA', homeAbbr: 'SAC', venueName: 'Golden 1 Center',   scoring: 102, altitude: 'mild', environment: 'home-court-loud' },
  SAS: { league: 'NBA', homeAbbr: 'SAS', venueName: 'Frost Bank Center', scoring: 99,  altitude: 'none', environment: 'neutral' },
  TOR: { league: 'NBA', homeAbbr: 'TOR', venueName: 'Scotiabank Arena',  scoring: 100, altitude: 'none', environment: 'neutral' },
  UTAH:{ league: 'NBA', homeAbbr: 'UTAH',venueName: 'Delta Center',      scoring: 103, altitude: 'high', environment: 'home-court-loud' },
  WAS: { league: 'NBA', homeAbbr: 'WAS', venueName: 'Capital One Arena', scoring: 99,  altitude: 'none', environment: 'neutral' },
};

// WNBA shares many venues with NBA; the rest are smaller arenas with similar profiles.
const WNBA_ARENAS: Record<string, VenueFactor> = {
  ATL: { league: 'WNBA', homeAbbr: 'ATL', venueName: 'Gateway Center Arena', scoring: 100, altitude: 'none', environment: 'neutral' },
  CHI: { league: 'WNBA', homeAbbr: 'CHI', venueName: 'Wintrust Arena', scoring: 99, altitude: 'none', environment: 'neutral' },
  CONN:{ league: 'WNBA', homeAbbr: 'CONN', venueName: 'Mohegan Sun Arena', scoring: 99, altitude: 'none', environment: 'neutral' },
  DAL: { league: 'WNBA', homeAbbr: 'DAL', venueName: 'College Park Center', scoring: 100, altitude: 'none', environment: 'neutral' },
  GS:  { league: 'WNBA', homeAbbr: 'GS', venueName: 'Chase Center', scoring: 102, altitude: 'none', environment: 'home-court-loud' },
  IND: { league: 'WNBA', homeAbbr: 'IND', venueName: 'Gainbridge Fieldhouse', scoring: 102, altitude: 'none', environment: 'home-court-loud' },
  LV:  { league: 'WNBA', homeAbbr: 'LV', venueName: 'Michelob ULTRA Arena', scoring: 101, altitude: 'none', environment: 'neutral' },
  LA:  { league: 'WNBA', homeAbbr: 'LA', venueName: 'Crypto.com Arena', scoring: 100, altitude: 'none', environment: 'neutral' },
  MIN: { league: 'WNBA', homeAbbr: 'MIN', venueName: 'Target Center', scoring: 100, altitude: 'none', environment: 'neutral' },
  NY:  { league: 'WNBA', homeAbbr: 'NY', venueName: 'Barclays Center', scoring: 100, altitude: 'none', environment: 'neutral' },
  PHO: { league: 'WNBA', homeAbbr: 'PHO', venueName: 'PHX Arena', scoring: 102, altitude: 'mild', environment: 'home-court-loud' },
  SEA: { league: 'WNBA', homeAbbr: 'SEA', venueName: 'Climate Pledge Arena', scoring: 100, altitude: 'none', environment: 'neutral' },
  WAS: { league: 'WNBA', homeAbbr: 'WAS', venueName: 'CareFirst Arena', scoring: 99, altitude: 'none', environment: 'neutral' },
  POR: { league: 'WNBA', homeAbbr: 'POR', venueName: 'Moda Center', scoring: 101, altitude: 'none', environment: 'home-court-loud' },
  TOR: { league: 'WNBA', homeAbbr: 'TOR', venueName: 'Coca-Cola Coliseum', scoring: 100, altitude: 'none', environment: 'neutral' },
};

const NFL_STADIUMS: Record<string, VenueFactor> = {
  ARI: { league: 'NFL', homeAbbr: 'ARI', venueName: 'State Farm Stadium', scoring: 102, altitude: 'none', environment: 'dome', surface: 'grass' },
  ATL: { league: 'NFL', homeAbbr: 'ATL', venueName: 'Mercedes-Benz Stadium', scoring: 102, altitude: 'none', environment: 'dome', surface: 'turf' },
  BAL: { league: 'NFL', homeAbbr: 'BAL', venueName: 'M&T Bank Stadium', scoring: 100, altitude: 'none', environment: 'neutral', surface: 'grass' },
  BUF: { league: 'NFL', homeAbbr: 'BUF', venueName: 'Highmark Stadium', scoring: 97, altitude: 'none', environment: 'wind', surface: 'turf' },
  CAR: { league: 'NFL', homeAbbr: 'CAR', venueName: 'Bank of America Stadium', scoring: 100, altitude: 'none', environment: 'neutral', surface: 'turf' },
  CHI: { league: 'NFL', homeAbbr: 'CHI', venueName: 'Soldier Field', scoring: 96, altitude: 'none', environment: 'wind', surface: 'grass' },
  CIN: { league: 'NFL', homeAbbr: 'CIN', venueName: 'Paycor Stadium', scoring: 100, altitude: 'none', environment: 'neutral', surface: 'turf' },
  CLE: { league: 'NFL', homeAbbr: 'CLE', venueName: 'Huntington Bank Field', scoring: 97, altitude: 'none', environment: 'wind', surface: 'grass' },
  DAL: { league: 'NFL', homeAbbr: 'DAL', venueName: 'AT&T Stadium', scoring: 103, altitude: 'none', environment: 'dome', surface: 'turf' },
  DEN: { league: 'NFL', homeAbbr: 'DEN', venueName: 'Empower Field at Mile High', scoring: 102, altitude: 'high', environment: 'neutral', surface: 'grass' },
  DET: { league: 'NFL', homeAbbr: 'DET', venueName: 'Ford Field', scoring: 102, altitude: 'none', environment: 'dome', surface: 'turf' },
  GB:  { league: 'NFL', homeAbbr: 'GB',  venueName: 'Lambeau Field', scoring: 96, altitude: 'none', environment: 'cold', surface: 'grass' },
  HOU: { league: 'NFL', homeAbbr: 'HOU', venueName: 'NRG Stadium', scoring: 101, altitude: 'none', environment: 'dome', surface: 'grass' },
  IND: { league: 'NFL', homeAbbr: 'IND', venueName: 'Lucas Oil Stadium', scoring: 102, altitude: 'none', environment: 'dome', surface: 'turf' },
  JAX: { league: 'NFL', homeAbbr: 'JAX', venueName: 'EverBank Stadium', scoring: 99, altitude: 'none', environment: 'neutral', surface: 'grass' },
  KC:  { league: 'NFL', homeAbbr: 'KC',  venueName: 'Arrowhead Stadium', scoring: 100, altitude: 'none', environment: 'home-court-loud', surface: 'grass' },
  LV:  { league: 'NFL', homeAbbr: 'LV',  venueName: 'Allegiant Stadium', scoring: 102, altitude: 'none', environment: 'dome', surface: 'grass' },
  LAC: { league: 'NFL', homeAbbr: 'LAC', venueName: 'SoFi Stadium', scoring: 102, altitude: 'none', environment: 'dome', surface: 'turf' },
  LAR: { league: 'NFL', homeAbbr: 'LAR', venueName: 'SoFi Stadium', scoring: 102, altitude: 'none', environment: 'dome', surface: 'turf' },
  MIA: { league: 'NFL', homeAbbr: 'MIA', venueName: 'Hard Rock Stadium', scoring: 101, altitude: 'none', environment: 'neutral', surface: 'grass' },
  MIN: { league: 'NFL', homeAbbr: 'MIN', venueName: 'U.S. Bank Stadium', scoring: 102, altitude: 'none', environment: 'dome', surface: 'turf' },
  NE:  { league: 'NFL', homeAbbr: 'NE',  venueName: 'Gillette Stadium', scoring: 99, altitude: 'none', environment: 'cold', surface: 'turf' },
  NO:  { league: 'NFL', homeAbbr: 'NO',  venueName: 'Caesars Superdome', scoring: 103, altitude: 'none', environment: 'dome', surface: 'turf' },
  NYG: { league: 'NFL', homeAbbr: 'NYG', venueName: 'MetLife Stadium', scoring: 99, altitude: 'none', environment: 'neutral', surface: 'turf' },
  NYJ: { league: 'NFL', homeAbbr: 'NYJ', venueName: 'MetLife Stadium', scoring: 99, altitude: 'none', environment: 'neutral', surface: 'turf' },
  PHI: { league: 'NFL', homeAbbr: 'PHI', venueName: 'Lincoln Financial Field', scoring: 100, altitude: 'none', environment: 'neutral', surface: 'grass' },
  PIT: { league: 'NFL', homeAbbr: 'PIT', venueName: 'Acrisure Stadium', scoring: 98, altitude: 'none', environment: 'cold', surface: 'grass' },
  SF:  { league: 'NFL', homeAbbr: 'SF',  venueName: "Levi's Stadium", scoring: 100, altitude: 'none', environment: 'neutral', surface: 'grass' },
  SEA: { league: 'NFL', homeAbbr: 'SEA', venueName: 'Lumen Field', scoring: 100, altitude: 'none', environment: 'home-court-loud', surface: 'turf' },
  TB:  { league: 'NFL', homeAbbr: 'TB',  venueName: 'Raymond James Stadium', scoring: 101, altitude: 'none', environment: 'neutral', surface: 'grass' },
  TEN: { league: 'NFL', homeAbbr: 'TEN', venueName: 'Nissan Stadium', scoring: 100, altitude: 'none', environment: 'neutral', surface: 'turf' },
  WAS: { league: 'NFL', homeAbbr: 'WAS', venueName: 'Northwest Stadium', scoring: 100, altitude: 'none', environment: 'neutral', surface: 'grass' },
};

const NHL_ARENAS: Record<string, VenueFactor> = {
  ANA: { league: 'NHL', homeAbbr: 'ANA', venueName: 'Honda Center', scoring: 99, altitude: 'none', environment: 'warm-ice' },
  BOS: { league: 'NHL', homeAbbr: 'BOS', venueName: 'TD Garden', scoring: 100, altitude: 'none', environment: 'neutral' },
  BUF: { league: 'NHL', homeAbbr: 'BUF', venueName: 'KeyBank Center', scoring: 100, altitude: 'none', environment: 'cold-ice' },
  CGY: { league: 'NHL', homeAbbr: 'CGY', venueName: 'Scotiabank Saddledome', scoring: 100, altitude: 'mild', environment: 'cold-ice' },
  CAR: { league: 'NHL', homeAbbr: 'CAR', venueName: 'Lenovo Center', scoring: 99, altitude: 'none', environment: 'warm-ice' },
  CHI: { league: 'NHL', homeAbbr: 'CHI', venueName: 'United Center', scoring: 100, altitude: 'none', environment: 'neutral' },
  COL: { league: 'NHL', homeAbbr: 'COL', venueName: 'Ball Arena', scoring: 102, altitude: 'high', environment: 'neutral' },
  CBJ: { league: 'NHL', homeAbbr: 'CBJ', venueName: 'Nationwide Arena', scoring: 100, altitude: 'none', environment: 'neutral' },
  DAL: { league: 'NHL', homeAbbr: 'DAL', venueName: 'American Airlines Center', scoring: 100, altitude: 'none', environment: 'warm-ice' },
  DET: { league: 'NHL', homeAbbr: 'DET', venueName: 'Little Caesars Arena', scoring: 100, altitude: 'none', environment: 'neutral' },
  EDM: { league: 'NHL', homeAbbr: 'EDM', venueName: 'Rogers Place', scoring: 100, altitude: 'none', environment: 'cold-ice' },
  FLA: { league: 'NHL', homeAbbr: 'FLA', venueName: 'Amerant Bank Arena', scoring: 99, altitude: 'none', environment: 'warm-ice' },
  LA:  { league: 'NHL', homeAbbr: 'LA',  venueName: 'Crypto.com Arena', scoring: 100, altitude: 'none', environment: 'warm-ice' },
  MIN: { league: 'NHL', homeAbbr: 'MIN', venueName: 'Xcel Energy Center', scoring: 100, altitude: 'none', environment: 'cold-ice' },
  MTL: { league: 'NHL', homeAbbr: 'MTL', venueName: 'Bell Centre', scoring: 100, altitude: 'none', environment: 'cold-ice' },
  NSH: { league: 'NHL', homeAbbr: 'NSH', venueName: 'Bridgestone Arena', scoring: 100, altitude: 'none', environment: 'warm-ice' },
  NJ:  { league: 'NHL', homeAbbr: 'NJ',  venueName: 'Prudential Center', scoring: 100, altitude: 'none', environment: 'neutral' },
  NYI: { league: 'NHL', homeAbbr: 'NYI', venueName: 'UBS Arena', scoring: 100, altitude: 'none', environment: 'neutral' },
  NYR: { league: 'NHL', homeAbbr: 'NYR', venueName: 'Madison Square Garden', scoring: 100, altitude: 'none', environment: 'neutral' },
  OTT: { league: 'NHL', homeAbbr: 'OTT', venueName: 'Canadian Tire Centre', scoring: 100, altitude: 'none', environment: 'cold-ice' },
  PHI: { league: 'NHL', homeAbbr: 'PHI', venueName: 'Wells Fargo Center', scoring: 100, altitude: 'none', environment: 'neutral' },
  PIT: { league: 'NHL', homeAbbr: 'PIT', venueName: 'PPG Paints Arena', scoring: 100, altitude: 'none', environment: 'neutral' },
  SJ:  { league: 'NHL', homeAbbr: 'SJ',  venueName: 'SAP Center', scoring: 100, altitude: 'none', environment: 'warm-ice' },
  SEA: { league: 'NHL', homeAbbr: 'SEA', venueName: 'Climate Pledge Arena', scoring: 100, altitude: 'none', environment: 'neutral' },
  STL: { league: 'NHL', homeAbbr: 'STL', venueName: 'Enterprise Center', scoring: 100, altitude: 'none', environment: 'neutral' },
  TB:  { league: 'NHL', homeAbbr: 'TB',  venueName: 'Amalie Arena', scoring: 100, altitude: 'none', environment: 'warm-ice' },
  TOR: { league: 'NHL', homeAbbr: 'TOR', venueName: 'Scotiabank Arena', scoring: 100, altitude: 'none', environment: 'neutral' },
  UTA: { league: 'NHL', homeAbbr: 'UTA', venueName: 'Delta Center', scoring: 101, altitude: 'high', environment: 'neutral' },
  VAN: { league: 'NHL', homeAbbr: 'VAN', venueName: 'Rogers Arena', scoring: 100, altitude: 'none', environment: 'neutral' },
  VGK: { league: 'NHL', homeAbbr: 'VGK', venueName: 'T-Mobile Arena', scoring: 100, altitude: 'none', environment: 'warm-ice' },
  WSH: { league: 'NHL', homeAbbr: 'WSH', venueName: 'Capital One Arena', scoring: 100, altitude: 'none', environment: 'neutral' },
  WPG: { league: 'NHL', homeAbbr: 'WPG', venueName: 'Canada Life Centre', scoring: 100, altitude: 'none', environment: 'cold-ice' },
};

// Loose name → abbr normalization across leagues.
const NAME_NORMALIZE: Record<string, string> = {
  // NBA (most teams use the same abbr as ESPN)
  'denver nuggets': 'DEN', 'utah jazz': 'UTAH', 'phoenix suns': 'PHX',
  // NHL
  'colorado avalanche': 'COL', 'utah mammoth': 'UTA', 'utah hockey club': 'UTA',
  'vegas golden knights': 'VGK', 'tampa bay lightning': 'TB', 'florida panthers': 'FLA',
  // NFL
  'denver broncos': 'DEN', 'green bay packers': 'GB', 'buffalo bills': 'BUF',
  'chicago bears': 'CHI', 'pittsburgh steelers': 'PIT', 'new england patriots': 'NE',
  'kansas city chiefs': 'KC',
};

function normalize(name: string): string {
  if (!name) return '';
  const k = name.toLowerCase().trim();
  return NAME_NORMALIZE[k] || k;
}

export function getVenue(league: 'NBA' | 'WNBA' | 'NFL' | 'NHL', homeTeamName: string): VenueFactor | null {
  const norm = normalize(homeTeamName);
  // Direct abbr match (if caller passed an abbr already)
  if (norm.length <= 4 && norm === norm.toUpperCase()) {
    const lookup = norm;
    if (league === 'NBA') return NBA_ARENAS[lookup] || null;
    if (league === 'WNBA') return WNBA_ARENAS[lookup] || null;
    if (league === 'NFL') return NFL_STADIUMS[lookup] || null;
    if (league === 'NHL') return NHL_ARENAS[lookup] || null;
  }
  // Otherwise we got a normalized abbr from NAME_NORMALIZE, or need to keyword-match
  const table = league === 'NBA' ? NBA_ARENAS : league === 'WNBA' ? WNBA_ARENAS : league === 'NFL' ? NFL_STADIUMS : NHL_ARENAS;
  // Try direct lookup (norm is the abbr)
  if (table[norm.toUpperCase()]) return table[norm.toUpperCase()];
  // Fallback: search by team-name keyword in venue name
  const last = (homeTeamName || '').toLowerCase().split(/\s+/).pop() || '';
  for (const v of Object.values(table)) {
    if (last && v.venueName.toLowerCase().includes(last)) return v;
  }
  return null;
}

// Nudge for projected game total: convert scoring index to absolute points.
// Pre-set league average totals are baked in for each sport.
const LEAGUE_AVG_TOTAL: Record<string, number> = {
  NBA: 226, WNBA: 162, NFL: 44, NHL: 6.0,
};

export function venueScoringNudge(v: VenueFactor | null): number {
  if (!v) return 0;
  const baseline = LEAGUE_AVG_TOTAL[v.league] || 0;
  return Number((((v.scoring - 100) / 100) * baseline).toFixed(2));
}

// Altitude penalty for the visiting team (conditioning over a long game).
// NBA at Denver: opp scoring efficiency drops ~1.5%, 3PT% drops ~1%.
// NFL at Denver: opp passing yardage roughly -3% over the back half of games.
// NHL at high-altitude: minimal but real shot-quality drop late.
// Returns a sign-flipped nudge: NEGATIVE = bad for visiting offense.
export function altitudeVisitorPenalty(v: VenueFactor | null): { visitorScoringNudge: number; reason: string | null } {
  if (!v || v.altitude === 'none') return { visitorScoringNudge: 0, reason: null };
  if (v.altitude === 'high') {
    return {
      visitorScoringNudge: v.league === 'NBA' ? -3.2 : v.league === 'NFL' ? -1.5 : v.league === 'NHL' ? -0.15 : 0,
      reason: `Altitude at ${v.venueName} drags visitor conditioning late.`,
    };
  }
  if (v.altitude === 'mild') {
    return { visitorScoringNudge: v.league === 'NBA' ? -1.0 : 0, reason: null };
  }
  return { visitorScoringNudge: 0, reason: null };
}

// Weather-style environment nudge for NFL/NHL.
// Dome NFL: bigger projected total (no wind/cold/rain).
// Cold-weather NFL game in winter: smaller total.
// Warm-climate NHL arena late in a tight game: more chaotic third periods.
export function environmentNudge(v: VenueFactor | null, monthIdx0: number): {
  totalNudge: number; reason: string | null;
} {
  if (!v) return { totalNudge: 0, reason: null };
  if (v.league === 'NFL') {
    if (v.environment === 'dome') return { totalNudge: 1.0, reason: 'Dome game — consistent passing/kicking conditions.' };
    if (v.environment === 'cold' && (monthIdx0 >= 10 || monthIdx0 <= 1)) {
      return { totalNudge: -1.5, reason: 'Cold-weather venue in winter month — passing/kicking suppressed.' };
    }
    if (v.environment === 'wind') return { totalNudge: -1.0, reason: 'Wind tunnel venue — kicking + deep passing affected.' };
  }
  if (v.league === 'NHL' && v.environment === 'warm-ice') {
    return { totalNudge: 0.1, reason: 'Warm-climate arena — softer ice late, more turnovers.' };
  }
  return { totalNudge: 0, reason: null };
}
