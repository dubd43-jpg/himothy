// MLB PARK FACTORS
//
// Run scoring varies materially by park. Coors plays +30% to runs; Petco -18%.
// We adjust pitcher ERA, projected totals, and team-total projections by the
// home park's run factor so the engine doesn't treat a 2.30 ERA at Tropicana
// the same as a 2.30 ERA at Coors. Values are 100-indexed (100 = league avg,
// 130 = 30% more runs scored there, 82 = 18% fewer).
//
// Source: 3-year Statcast-derived park factors (manually maintained). Updated
// yearly; refresh dates noted per row. Values can also be computed from MLB
// Stats API historical splits, but the static table is faster and equally
// correct for engine purposes.

// 3-year (2023-2025) park factors. Runs index is the all-park-vs-team scoring
// rate normalized to 100. HR / 1B / 2B / 3B indices included for prop work.
export interface ParkFactor {
  abbr: string;             // team abbreviation
  parkName: string;
  runs: number;             // 100 = neutral
  hr: number;
  hits: number;
  obp: number;
  // Special flags useful to the engine.
  isOutdoor: boolean;
  isDome: boolean;          // covered, neutral on weather
  highAltitude: boolean;    // Coors
}

const PARKS: Record<string, ParkFactor> = {
  ARI: { abbr: 'ARI', parkName: 'Chase Field',         runs: 102, hr: 105, hits: 99, obp: 100, isOutdoor: false, isDome: true,  highAltitude: false },
  ATL: { abbr: 'ATL', parkName: 'Truist Park',         runs: 102, hr: 109, hits: 100, obp: 101, isOutdoor: true, isDome: false, highAltitude: false },
  BAL: { abbr: 'BAL', parkName: 'Camden Yards',        runs:  98, hr:  93, hits: 99,  obp: 99,  isOutdoor: true, isDome: false, highAltitude: false },
  BOS: { abbr: 'BOS', parkName: 'Fenway Park',         runs: 108, hr:  98, hits: 105, obp: 102, isOutdoor: true, isDome: false, highAltitude: false },
  CHC: { abbr: 'CHC', parkName: 'Wrigley Field',       runs: 101, hr: 105, hits: 100, obp: 100, isOutdoor: true, isDome: false, highAltitude: false },
  CHW: { abbr: 'CHW', parkName: 'Rate Field',          runs: 100, hr: 108, hits:  99, obp:  98, isOutdoor: true, isDome: false, highAltitude: false },
  CIN: { abbr: 'CIN', parkName: 'Great American',      runs: 110, hr: 121, hits: 102, obp: 100, isOutdoor: true, isDome: false, highAltitude: false },
  CLE: { abbr: 'CLE', parkName: 'Progressive Field',   runs:  96, hr:  94, hits:  98, obp:  99, isOutdoor: true, isDome: false, highAltitude: false },
  COL: { abbr: 'COL', parkName: 'Coors Field',         runs: 130, hr: 119, hits: 117, obp: 108, isOutdoor: true, isDome: false, highAltitude: true  },
  DET: { abbr: 'DET', parkName: 'Comerica Park',       runs:  95, hr:  88, hits:  99, obp:  99, isOutdoor: true, isDome: false, highAltitude: false },
  HOU: { abbr: 'HOU', parkName: 'Daikin Park',         runs:  98, hr: 102, hits:  98, obp:  99, isOutdoor: false, isDome: true, highAltitude: false },
  KC:  { abbr: 'KC',  parkName: 'Kauffman Stadium',    runs:  99, hr:  87, hits: 102, obp: 100, isOutdoor: true, isDome: false, highAltitude: false },
  LAA: { abbr: 'LAA', parkName: 'Angel Stadium',       runs:  97, hr: 100, hits:  98, obp:  98, isOutdoor: true, isDome: false, highAltitude: false },
  LAD: { abbr: 'LAD', parkName: 'Dodger Stadium',      runs:  97, hr: 109, hits:  95, obp:  98, isOutdoor: true, isDome: false, highAltitude: false },
  MIA: { abbr: 'MIA', parkName: 'loanDepot park',      runs:  88, hr:  84, hits:  95, obp:  97, isOutdoor: false, isDome: true, highAltitude: false },
  MIL: { abbr: 'MIL', parkName: 'American Family Field', runs: 99, hr: 104, hits: 98, obp: 99, isOutdoor: false, isDome: true, highAltitude: false },
  MIN: { abbr: 'MIN', parkName: 'Target Field',        runs: 100, hr:  97, hits: 101, obp: 100, isOutdoor: true, isDome: false, highAltitude: false },
  NYM: { abbr: 'NYM', parkName: 'Citi Field',          runs:  95, hr:  95, hits:  97, obp:  98, isOutdoor: true, isDome: false, highAltitude: false },
  NYY: { abbr: 'NYY', parkName: 'Yankee Stadium',      runs: 102, hr: 113, hits:  99, obp:  99, isOutdoor: true, isDome: false, highAltitude: false },
  ATH: { abbr: 'ATH', parkName: 'Sutter Health Park',  runs: 105, hr: 106, hits: 102, obp: 100, isOutdoor: true, isDome: false, highAltitude: false }, // A's Sacramento temp home
  OAK: { abbr: 'OAK', parkName: 'Oakland Coliseum',    runs:  92, hr:  86, hits:  97, obp:  98, isOutdoor: true, isDome: false, highAltitude: false }, // historical
  PHI: { abbr: 'PHI', parkName: 'Citizens Bank Park',  runs: 102, hr: 110, hits: 100, obp:  99, isOutdoor: true, isDome: false, highAltitude: false },
  PIT: { abbr: 'PIT', parkName: 'PNC Park',            runs:  94, hr:  88, hits:  98, obp:  99, isOutdoor: true, isDome: false, highAltitude: false },
  SD:  { abbr: 'SD',  parkName: 'Petco Park',          runs:  82, hr:  80, hits:  93, obp:  96, isOutdoor: true, isDome: false, highAltitude: false },
  SEA: { abbr: 'SEA', parkName: 'T-Mobile Park',       runs:  92, hr:  93, hits:  95, obp:  97, isOutdoor: false, isDome: true, highAltitude: false },
  SF:  { abbr: 'SF',  parkName: 'Oracle Park',         runs:  90, hr:  79, hits:  96, obp:  98, isOutdoor: true, isDome: false, highAltitude: false },
  STL: { abbr: 'STL', parkName: 'Busch Stadium',       runs:  98, hr:  93, hits:  99, obp: 100, isOutdoor: true, isDome: false, highAltitude: false },
  TB:  { abbr: 'TB',  parkName: 'Steinbrenner Field',  runs: 100, hr: 105, hits: 99, obp: 99,   isOutdoor: true, isDome: false, highAltitude: false }, // Rays at George Steinbrenner during Trop repair
  TEX: { abbr: 'TEX', parkName: 'Globe Life Field',    runs:  98, hr:  98, hits:  98, obp:  99, isOutdoor: false, isDome: true, highAltitude: false },
  TOR: { abbr: 'TOR', parkName: 'Rogers Centre',       runs: 102, hr: 109, hits: 100, obp: 100, isOutdoor: false, isDome: true, highAltitude: false },
  WSH: { abbr: 'WSH', parkName: 'Nationals Park',      runs:  99, hr: 100, hits:  99, obp:  99, isOutdoor: true, isDome: false, highAltitude: false },
};

// Normalize various team-name forms to abbreviation.
const NAME_TO_ABBR: Record<string, string> = {
  'arizona diamondbacks': 'ARI', 'd-backs': 'ARI', 'diamondbacks': 'ARI',
  'atlanta braves': 'ATL', 'braves': 'ATL',
  'baltimore orioles': 'BAL', 'orioles': 'BAL', 'o\'s': 'BAL',
  'boston red sox': 'BOS', 'red sox': 'BOS',
  'chicago cubs': 'CHC', 'cubs': 'CHC',
  'chicago white sox': 'CHW', 'white sox': 'CHW',
  'cincinnati reds': 'CIN', 'reds': 'CIN',
  'cleveland guardians': 'CLE', 'guardians': 'CLE',
  'colorado rockies': 'COL', 'rockies': 'COL',
  'detroit tigers': 'DET', 'tigers': 'DET',
  'houston astros': 'HOU', 'astros': 'HOU',
  'kansas city royals': 'KC', 'royals': 'KC',
  'los angeles angels': 'LAA', 'angels': 'LAA', 'la angels': 'LAA',
  'los angeles dodgers': 'LAD', 'dodgers': 'LAD', 'la dodgers': 'LAD',
  'miami marlins': 'MIA', 'marlins': 'MIA',
  'milwaukee brewers': 'MIL', 'brewers': 'MIL',
  'minnesota twins': 'MIN', 'twins': 'MIN',
  'new york mets': 'NYM', 'mets': 'NYM',
  'new york yankees': 'NYY', 'yankees': 'NYY',
  'athletics': 'ATH', 'oakland athletics': 'ATH', 'a\'s': 'ATH', 'sacramento athletics': 'ATH',
  'philadelphia phillies': 'PHI', 'phillies': 'PHI',
  'pittsburgh pirates': 'PIT', 'pirates': 'PIT',
  'san diego padres': 'SD', 'padres': 'SD',
  'seattle mariners': 'SEA', 'mariners': 'SEA',
  'san francisco giants': 'SF', 'giants': 'SF',
  'st. louis cardinals': 'STL', 'st louis cardinals': 'STL', 'cardinals': 'STL',
  'tampa bay rays': 'TB', 'rays': 'TB',
  'texas rangers': 'TEX', 'rangers': 'TEX',
  'toronto blue jays': 'TOR', 'blue jays': 'TOR',
  'washington nationals': 'WSH', 'nationals': 'WSH', 'nats': 'WSH',
};

export function getParkFactorByHomeTeam(homeTeamName: string): ParkFactor | null {
  if (!homeTeamName) return null;
  const k = homeTeamName.toLowerCase().trim();
  const abbr = NAME_TO_ABBR[k];
  if (abbr) return PARKS[abbr] || null;
  // Fallback: try last word match
  const last = k.split(/\s+/).pop() || '';
  if (NAME_TO_ABBR[last]) return PARKS[NAME_TO_ABBR[last]] || null;
  return null;
}

// Adjustment factor for pitcher ERA when comparing across parks.
// A pitcher with a 3.00 ERA at Petco is essentially a 3.66 ERA pitcher at
// league-neutral parks (because Petco suppresses runs ~18%). Apply this when
// projecting the pitcher's matchup in a NEW park.
export function adjustEraForPark(eraInOwnPark: number, ownPark: ParkFactor | null): number {
  if (!ownPark || !isFinite(eraInOwnPark) || eraInOwnPark <= 0) return eraInOwnPark;
  const ownFactor = ownPark.runs / 100;
  // De-park-effect the ERA. If their park is 82-runs (Petco), their "true" ERA
  // is higher than the surface number.
  if (ownFactor === 0) return eraInOwnPark;
  return eraInOwnPark / ownFactor;
}

// How much to nudge a totals projection (in runs) given today's park.
// Convert park runs index to runs above/below neutral for an avg game (~8.7 R).
export function parkRunsNudge(park: ParkFactor | null): number {
  if (!park) return 0;
  const leagueAvgGame = 8.7;
  const nudge = ((park.runs - 100) / 100) * leagueAvgGame;
  return Number(nudge.toFixed(2));
}
