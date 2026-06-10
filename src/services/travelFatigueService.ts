// TRAVEL + FATIGUE
//
// Two effects the engine doesn't currently model:
//
//   1. CROSS-TIME-ZONE FATIGUE. An East-coast team playing a 10pm ET tip on
//      the West Coast is playing at 1am body time. Documented performance
//      drop in NBA (~2-3% efficiency), NFL (worse for the EARLY game on the
//      East coast after a West→East trip), MLB (more noise but real for
//      bullpen leverage). The WEST→EAST 1pm-EST start after a West Coast
//      previous-night game is the most punishing combo.
//
//   2. SCHEDULE LOSS LOAD. Teams on the 4th-game-in-6-nights for NBA, or 3rd
//      day-game-after-night-game streak for MLB, see meaningful regressions.
//      We track B2B already via sharpIntelService.rest. This service goes one
//      level deeper.
//
// Inputs come from ESPN scoreboard `recentGames` (already used by sharpIntel)
// plus team-city longitude lookups (static).

const TEAM_CITY_LON: Record<string, number> = {
  // NBA / WNBA / NHL / NFL share cities; one map for all.
  // Longitudes (negative = west). Source: city centroids.
  'BOS': -71.06, 'NYK': -73.99, 'NYY': -73.99, 'NY': -73.99,
  'BKN': -73.99, 'NYM': -73.99, 'NYG': -74.07, 'NYJ': -74.07,
  'NJ': -74.07, 'PHI': -75.16, 'WAS': -77.04, 'WSH': -77.04,
  'BAL': -76.61, 'PIT': -79.99, 'CLE': -81.69, 'CHA': -80.84,
  'ATL': -84.39, 'MIA': -80.19, 'FLA': -80.13, 'ORL': -81.38,
  'TB': -82.46, 'NSH': -86.78, 'IND': -86.16, 'DET': -83.05,
  'CHI': -87.65, 'CHC': -87.65, 'CHW': -87.65, 'MIL': -87.91,
  'STL': -90.20, 'MIN': -93.27, 'KC': -94.58, 'OKC': -97.52,
  'DAL': -96.80, 'HOU': -95.37, 'SAS': -98.49, 'TEX': -97.07,
  'NO': -90.07, 'NOP': -90.07,
  'DEN': -104.99, 'COL': -104.99, 'CGY': -114.07, 'EDM': -113.49,
  'PHX': -112.07, 'PHO': -112.07, 'ARI': -112.07, 'UTAH': -111.89,
  'UTA': -111.89,
  'LAL': -118.25, 'LAC': -118.25, 'LAR': -118.25, 'LA': -118.25,
  'LAD': -118.24, 'LAA': -117.88, 'ANA': -117.88,
  'SF': -122.42, 'GSW': -122.42, 'GS': -122.42, 'SJ': -121.89,
  'SAC': -121.49, 'OAK': -122.27, 'ATH': -121.49, // A's at Sacramento
  'SEA': -122.33, 'POR': -122.68, 'VAN': -123.12,
  'VGK': -115.17, 'LV': -115.17,
  'TOR': -79.38, 'OTT': -75.69, 'MTL': -73.57, 'WPG': -97.14,
  'CAR': -78.72, 'CIN': -84.51, 'BUF': -78.79,
  'CBJ': -82.99, 'JAX': -81.66, 'TEN': -86.78,
  'GB': -88.06, 'NE': -71.26,
  'MEM': -90.05, 'CONN': -72.10, 'NSH_NHL': -86.78,
  'SD': -117.16, // Padres (used for travel only — no MLB team in SD currently betting-active)
};

// Time-zone offset (UTC hours, negative for west). Rough rule: longitude / -15.
function lonToTzOffset(lon: number): number {
  return Math.round(lon / -15);
}

export interface TravelFatigueInput {
  visitingTeamAbbr: string;
  gameStartUtc: string;          // ISO
  league: string;                // for league-specific weights
  lastGameVenueAbbr?: string | null; // optional — where the visitor played last night
  // Most-recent game date/time (for B2B detection beyond sharpIntel's basic flag).
  lastGameStartUtc?: string | null;
  homeTeamAbbr?: string | null;
}

export interface TravelFatigueResult {
  bodyClockLocalHour: number | null;    // visitor body clock at game tip
  bodyClockPenalty: 'severe' | 'moderate' | 'mild' | 'none';
  jetLagDirection: 'west' | 'east' | 'none';
  milesTraveled: number | null;
  scoringNudge: number;           // applied to visitor projected scoring
  reasonsFor: string[];           // append to home reasonsFor
  reasonsAgainst: string[];       // append if visitor is the bet
}

const EMPTY: TravelFatigueResult = {
  bodyClockLocalHour: null, bodyClockPenalty: 'none', jetLagDirection: 'none',
  milesTraveled: null, scoringNudge: 0, reasonsFor: [], reasonsAgainst: [],
};

// Haversine approximation for great-circle miles between two longitudes (close
// enough since NA cities are at similar latitudes for our purposes).
function approxMiles(lon1: number, lon2: number): number {
  const degDiff = Math.abs(lon1 - lon2);
  return Math.round(degDiff * 53);   // ~53 miles per longitude degree at ~40°N
}

export function computeTravelFatigue(input: TravelFatigueInput): TravelFatigueResult {
  const { visitingTeamAbbr, gameStartUtc, lastGameVenueAbbr, league, homeTeamAbbr } = input;
  if (!visitingTeamAbbr || !gameStartUtc) return EMPTY;

  const visitorHomeLon = TEAM_CITY_LON[visitingTeamAbbr];
  const homeLon = homeTeamAbbr ? TEAM_CITY_LON[homeTeamAbbr] : null;
  if (visitorHomeLon == null || homeLon == null) return EMPTY;

  // Body clock = visitor's home timezone hour at game start.
  let bodyClockLocalHour: number | null = null;
  let bodyClockPenalty: TravelFatigueResult['bodyClockPenalty'] = 'none';
  let jetLagDirection: TravelFatigueResult['jetLagDirection'] = 'none';
  try {
    const gameUtc = new Date(gameStartUtc);
    if (isFinite(gameUtc.getTime())) {
      const visitorOffset = lonToTzOffset(visitorHomeLon);
      const localHour = (gameUtc.getUTCHours() + visitorOffset + 24) % 24;
      bodyClockLocalHour = localHour;
      // 22:00+ or before 06:00 = severe (late-night body time)
      if (localHour >= 22 || localHour < 4) bodyClockPenalty = 'severe';
      else if (localHour >= 20 || localHour < 8) bodyClockPenalty = 'moderate';
      else if (localHour < 10) bodyClockPenalty = 'mild';
      // West vs east — visitor coming from a more-east timezone playing at
      // visitor's body-time PM/late = "going west", their body is well-rested
      // (slight EDGE actually). Going EAST and playing 1pm body-time AM = bad.
      jetLagDirection = visitorHomeLon < homeLon ? 'west' : 'east';
    }
  } catch { /* fall through */ }

  // Miles traveled (approx). If we know lastGameVenue, use that as origin; else
  // assume visitor came from their home city.
  const originLon = lastGameVenueAbbr && TEAM_CITY_LON[lastGameVenueAbbr] != null
    ? TEAM_CITY_LON[lastGameVenueAbbr]
    : visitorHomeLon;
  const milesTraveled = approxMiles(originLon, homeLon);

  // Compute the scoring nudge for the visitor.
  let scoringNudge = 0;
  const reasonsFor: string[] = [];
  const reasonsAgainst: string[] = [];

  const isNba = league === 'NBA' || league === 'WNBA';
  const isNfl = league === 'NFL' || league === 'College Football';
  const isMlb = league === 'MLB';

  if (jetLagDirection === 'east' && bodyClockPenalty !== 'none') {
    // Visitor traveled east + body clock is unfriendly = real penalty.
    if (isNba) scoringNudge -= bodyClockPenalty === 'severe' ? 3.5 : bodyClockPenalty === 'moderate' ? 2.0 : 1.0;
    if (isNfl) scoringNudge -= bodyClockPenalty === 'severe' ? 2.0 : bodyClockPenalty === 'moderate' ? 1.2 : 0.5;
    if (isMlb) scoringNudge -= bodyClockPenalty === 'severe' ? 0.6 : bodyClockPenalty === 'moderate' ? 0.3 : 0.1;
    if (scoringNudge < 0) {
      reasonsFor.push(`Visitor traveled east; body-clock disadvantage at tip.`);
      reasonsAgainst.push(`We're the road team traveling east — body clock is against us.`);
    }
  }

  if (milesTraveled > 1500 && bodyClockPenalty !== 'none') {
    // Long travel compounds the penalty
    const compound = isNba ? -1.0 : isNfl ? -0.5 : isMlb ? -0.1 : 0;
    scoringNudge += compound;
    if (compound < 0) {
      reasonsFor.push(`Cross-country flight (${milesTraveled.toLocaleString()} mi) on the visitor.`);
    }
  }

  return {
    bodyClockLocalHour, bodyClockPenalty, jetLagDirection,
    milesTraveled, scoringNudge: Number(scoringNudge.toFixed(2)),
    reasonsFor, reasonsAgainst,
  };
}
