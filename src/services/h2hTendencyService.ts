// Head-to-head and deep recent-form tendency service.
//
// Pulls three layers per matchup:
//   1. Each team's last 10 games individually (who they are RIGHT NOW)
//   2. Each team's full season (who they really are)
//   3. Every H2H meeting between these two teams — current season first,
//      then back through previous seasons until we have a meaningful sample
//
// All of this feeds scoreGame() as real signals and surfaces in pick explanations
// so the engine can say: "Last 6 times these two met, avg total was 228 vs today's
// 218 line — the history says go over."

import { LEAGUE_URLS } from '@/lib/validation';

const H2H_CACHE = new Map<string, { data: H2HTendencyResult; at: number }>();
const TEAM_FORM_CACHE = new Map<string, { data: TeamSeasonLog; at: number }>();
const TTL_MS = 60 * 60 * 1000; // 1h — same as tendenciesService
const MIN_H2H_SAMPLE = 4;      // go back more seasons until we have this many meetings
const MAX_SEASONS_BACK = 4;    // don't go back more than 4 seasons

// ─── Venue / environment static data ─────────────────────────────────────────
// Which NFL & MLB stadiums are domes or have artificial turf.
// Source: publicly documented stadium specs, updated manually each offseason.

const NFL_DOME_TEAMS = new Set([
  'Las Vegas Raiders', 'Indianapolis Colts', 'Atlanta Falcons', 'New Orleans Saints',
  'Minnesota Vikings', 'Detroit Lions', 'Dallas Cowboys', 'Houston Texans',
  'Arizona Cardinals', 'Los Angeles Rams', 'Los Angeles Chargers',
]);
const NFL_TURF_TEAMS = new Set([
  'Las Vegas Raiders', 'Indianapolis Colts', 'Atlanta Falcons', 'New Orleans Saints',
  'Minnesota Vikings', 'Detroit Lions', 'Dallas Cowboys', 'Houston Texans',
  'Arizona Cardinals', 'Los Angeles Rams', 'Los Angeles Chargers',
  'New England Patriots', 'Philadelphia Eagles', 'Cincinnati Bengals',
  'New York Giants', 'New York Jets',
]);
const MLB_DOME_TEAMS = new Set([
  'Tampa Bay Rays', 'Toronto Blue Jays', 'Miami Marlins', 'Milwaukee Brewers',
  'Houston Astros', 'Seattle Mariners', 'Arizona Diamondbacks', 'Texas Rangers',
]);
const MLB_TURF_TEAMS = new Set([
  'Tampa Bay Rays', 'Toronto Blue Jays', 'Miami Marlins',
]);

export interface VenueProfile {
  isDome: boolean;
  isArtificialTurf: boolean;
  isOutdoor: boolean;
  // Performance splits (populated from game logs)
  homeWinPct: number;
  roadWinPct: number;
  homeAvgScored: number;
  roadAvgScored: number;
  homeAvgTotal: number;
  roadAvgTotal: number;
  // Dome-team-vs-outdoor edge: how does this team do when forced outdoors?
  outdoorRecord?: { wins: number; losses: number; avgScored: number } | null;
  // Turf team on grass or vice versa
  surfaceNote?: string | null;
}

export function getVenueProfile(teamName: string, league: string, form: TeamRecentForm): VenueProfile {
  const isDome = league === 'NFL' ? NFL_DOME_TEAMS.has(teamName)
    : league === 'MLB' ? MLB_DOME_TEAMS.has(teamName) : false;
  const isTurf = league === 'NFL' ? NFL_TURF_TEAMS.has(teamName)
    : league === 'MLB' ? MLB_TURF_TEAMS.has(teamName) : false;

  // Home/road splits already computed in form
  const homeTotal = form.last10.filter((g) => g.isHome).length;
  const roadTotal = form.last10.filter((g) => !g.isHome).length;
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const homeGames = form.last10.filter((g) => g.isHome);
  const roadGames = form.last10.filter((g) => !g.isHome);

  return {
    isDome,
    isArtificialTurf: isTurf,
    isOutdoor: !isDome,
    homeWinPct: homeTotal > 0 ? Math.round((homeGames.filter((g) => g.won).length / homeTotal) * 100) : 50,
    roadWinPct: roadTotal > 0 ? Math.round((roadGames.filter((g) => g.won).length / roadTotal) * 100) : 50,
    homeAvgScored: Math.round(avg(homeGames.map((g) => g.teamScore)) * 10) / 10,
    roadAvgScored: Math.round(avg(roadGames.map((g) => g.teamScore)) * 10) / 10,
    homeAvgTotal: Math.round(avg(homeGames.map((g) => g.total)) * 10) / 10,
    roadAvgTotal: Math.round(avg(roadGames.map((g) => g.total)) * 10) / 10,
    outdoorRecord: null,
    surfaceNote: null,
  };
}

// Build venue mismatch bullets: dome team going outside, turf team on grass, etc.
export function buildVenueBullets(
  teamAName: string, teamBName: string, league: string,
  teamAIsHome: boolean,
  venueA: VenueProfile, venueB: VenueProfile,
  weather?: { tempF?: number; windMph?: number; isRainy?: boolean } | null,
): string[] {
  const bullets: string[] = [];

  // Home/road advantage
  const homeTeam = teamAIsHome ? teamAName : teamBName;
  const roadTeam = teamAIsHome ? teamBName : teamAName;
  const homeVenue = teamAIsHome ? venueA : venueB;
  const roadVenue = teamAIsHome ? venueB : venueA;

  if (homeVenue.homeWinPct >= 65) bullets.push(`${homeTeam} is dominant at home — ${homeVenue.homeWinPct}% win rate at home (last 10).`);
  else if (homeVenue.homeWinPct <= 35) bullets.push(`${homeTeam} struggles at home — only ${homeVenue.homeWinPct}% win rate (last 10).`);

  if (roadVenue.roadWinPct >= 55) bullets.push(`${roadTeam} travels well — ${roadVenue.roadWinPct}% road win rate (last 10).`);
  else if (roadVenue.roadWinPct <= 30) bullets.push(`${roadTeam} is a poor road team — ${roadVenue.roadWinPct}% win rate away (last 10).`);

  // Dome/outdoor mismatch (NFL/MLB)
  if (league === 'NFL' || league === 'MLB') {
    const homeTeamDome = teamAIsHome ? venueA.isDome : venueB.isDome;
    const roadTeamDome = teamAIsHome ? venueB.isDome : venueA.isDome;
    const gameIsDome = homeTeamDome; // game is in home team's stadium

    if (!gameIsDome && roadTeamDome) {
      bullets.push(`${roadTeam} is a dome team playing OUTDOORS — a real disadvantage, especially in elements.`);
    }
    if (gameIsDome && !roadTeamDome) {
      bullets.push(`${roadTeam} is an outdoor team stepping into a dome — faster surface, controlled conditions favor the home side.`);
    }

    // Turf vs grass (NFL/MLB)
    const homeTurf = teamAIsHome ? venueA.isArtificialTurf : venueB.isArtificialTurf;
    const roadTurfTeam = teamAIsHome ? venueB.isArtificialTurf : venueA.isArtificialTurf;
    if (homeTurf && !roadTurfTeam) {
      bullets.push(`${roadTeam} is a grass team coming to a turf stadium — turf favors speed, timing routes, and home-side familiarity.`);
    }
    if (!homeTurf && roadTurfTeam) {
      bullets.push(`${roadTeam} is a turf team coming to a grass stadium — different footing, particularly matters for WRs and pass-rush.`);
    }
  }

  // Weather impact
  if (weather && league === 'NFL' || (weather && league === 'MLB')) {
    if ((weather.windMph ?? 0) >= 15) {
      bullets.push(`Wind ${weather.windMph} mph — suppresses passing game and totals. Lean under in high-wind games.`);
    }
    if ((weather.tempF ?? 72) <= 32) {
      bullets.push(`Temperature ${weather.tempF}°F — extreme cold typically tightens up scoring, favors running game and unders.`);
    }
    if (weather.isRainy) {
      bullets.push(`Rain in the forecast — wet conditions suppress scoring, passing efficiency drops, lean under.`);
    }
  }

  return bullets;
}

export interface TeamGameLog {
  date: string;
  gameId: string;
  opponentId: string;
  opponentName: string;
  teamScore: number;
  oppScore: number;
  total: number;
  won: boolean;
  margin: number;   // positive = won by this much, negative = lost by this much
  isHome: boolean;
}

export interface TeamRecentForm {
  teamId: string;
  teamName: string;
  gamesAnalyzed: number;
  wins: number;
  losses: number;
  winPct: number;
  avgScored: number;
  avgAllowed: number;
  avgTotal: number;
  avgMargin: number;          // positive = winning avg, negative = losing avg
  homeWins: number;
  homeLosses: number;
  roadWins: number;
  roadLosses: number;
  avgHomeScored: number;
  avgRoadScored: number;
  last10: TeamGameLog[];      // most recent 10, newest last
}

export interface TeamSeasonLog {
  teamId: string;
  teamName: string;
  season: number;
  all: TeamGameLog[];         // full season game log, newest last
  form: TeamRecentForm;       // last 10 summary
  fullSeason: TeamRecentForm; // whole season summary
}

export interface H2HGameResult {
  date: string;
  gameId: string;
  teamAScore: number;
  teamBScore: number;
  total: number;
  teamAWon: boolean;
  margin: number;    // team A margin: positive = A won, negative = B won
  teamAIsHome: boolean;
}

export interface H2HTendencyResult {
  teamAId: string;
  teamAName: string;
  teamBId: string;
  teamBName: string;
  league: string;

  // Individual recent form (last 10 + full season)
  teamAForm: TeamRecentForm;
  teamAFullSeason: TeamRecentForm;
  teamBForm: TeamRecentForm;
  teamBFullSeason: TeamRecentForm;

  // H2H combined history
  h2h: {
    meetings: H2HGameResult[];  // all found meetings, newest first
    seasonsBack: number;
    teamAWins: number;
    teamBWins: number;
    teamAWinRate: number;        // 0-100
    avgTotal: number;
    highestTotal: number;
    lowestTotal: number;
    avgTeamAScore: number;
    avgTeamBScore: number;
    avgMargin: number;           // avg |margin| — how close are these games?
    gamesAboveAvgTotal: number;  // meetings where total > season avg for either team
    gamesBelowAvgTotal: number;
    // When compared to today's posted line (injected by caller):
    meetingsAboveLine: number;   // how many H2H totals beat today's posted O/U
    meetingsBelowLine: number;
  };

  // Venue / environment profiles (optional — populated when venue data is available)
  venueA?: VenueProfile;
  venueB?: VenueProfile;
  venueBullets?: string[];       // dome mismatch, turf/grass, home/road edge

  // Pre-built explanation bullets (picked team injected by caller)
  h2hBullets: string[];         // e.g. ["Last 6 H2H avg total: 228.3 (today's line: 218)", ...]
}

// ─── ESPN schedule fetch ──────────────────────────────────────────────────────

function leagueToEspnSportLeague(league: string): { sport: string; espnLeague: string } | null {
  const map: Record<string, { sport: string; espnLeague: string }> = {
    NBA: { sport: 'basketball', espnLeague: 'nba' },
    WNBA: { sport: 'basketball', espnLeague: 'wnba' },
    NHL: { sport: 'hockey', espnLeague: 'nhl' },
    MLB: { sport: 'baseball', espnLeague: 'mlb' },
    NFL: { sport: 'football', espnLeague: 'nfl' },
    'College Football': { sport: 'football', espnLeague: 'college-football' },
    'NCAA Football': { sport: 'football', espnLeague: 'college-football' },
    'NCAA Basketball': { sport: 'basketball', espnLeague: 'mens-college-basketball' },
    'NCAA Baseball': { sport: 'baseball', espnLeague: 'college-baseball' },
  };
  return map[league] ?? null;
}

function currentSeason(league: string): number {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12
  // MLB/NCAA Baseball: season = current calendar year
  if (league === 'MLB' || league === 'NCAA Baseball' || league === 'College Baseball') return y;
  // NFL: season starts Sep, rolls into next calendar year — use start year
  if (league === 'NFL' || league === 'NCAA Football' || league === 'College Football') return m >= 8 ? y : y - 1;
  // NBA/WNBA/NHL: season straddles two years, end year = the year Jan-Jun belongs to
  // NBA season typically starts Oct → end year is next calendar year
  if (m >= 10) return y + 1;
  return y;
}

async function fetchTeamSeasonSchedule(
  league: string, teamId: string, season: number,
): Promise<any[]> {
  const base = LEAGUE_URLS[league];
  if (!base) return [];
  try {
    const url = `${base}/teams/${teamId}/schedule?season=${season}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.events || []) as any[];
  } catch {
    return [];
  }
}

function parseGameLog(event: any, myTeamId: string): TeamGameLog | null {
  const comp = (event.competitions || [])[0];
  if (!comp) return null;
  const completed = comp.status?.type?.completed === true;
  if (!completed) return null;

  const competitors: any[] = comp.competitors || [];
  const me = competitors.find((c) => String(c.team?.id || '') === String(myTeamId));
  const opp = competitors.find((c) => String(c.team?.id || '') !== String(myTeamId));
  if (!me || !opp) return null;

  const myScore = Number(me.score ?? me.score?.displayValue ?? 0);
  const oppScore = Number(opp.score ?? opp.score?.displayValue ?? 0);
  if (myScore === 0 && oppScore === 0) return null; // likely postponed / no data

  const won = myScore > oppScore;
  const margin = myScore - oppScore;
  const isHome = me.homeAway === 'home';

  return {
    date: String(event.date || '').slice(0, 10),
    gameId: String(event.id || ''),
    opponentId: String(opp.team?.id || ''),
    opponentName: String(opp.team?.displayName || opp.team?.name || ''),
    teamScore: myScore,
    oppScore,
    total: myScore + oppScore,
    won,
    margin,
    isHome,
  };
}

// Build full season log + last-10 summary for one team, caching by teamId+season
async function getTeamSeasonLog(league: string, teamId: string, season: number): Promise<TeamSeasonLog | null> {
  const cacheKey = `${league}|${teamId}|${season}`;
  const hit = TEAM_FORM_CACHE.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const events = await fetchTeamSeasonSchedule(league, teamId, season);
  const allGames: TeamGameLog[] = [];
  let teamName = '';

  for (const ev of events) {
    const g = parseGameLog(ev, teamId);
    if (!g) continue;
    allGames.push(g);
    if (!teamName) {
      const comp = (ev.competitions || [])[0];
      const me = (comp?.competitors || []).find((c: any) => String(c.team?.id) === String(teamId));
      teamName = me?.team?.displayName || me?.team?.name || '';
    }
  }

  // Sort chronologically (newest last)
  allGames.sort((a, b) => a.date.localeCompare(b.date));

  function buildSummary(games: TeamGameLog[]): TeamRecentForm {
    if (!games.length) {
      return {
        teamId, teamName, gamesAnalyzed: 0, wins: 0, losses: 0, winPct: 0,
        avgScored: 0, avgAllowed: 0, avgTotal: 0, avgMargin: 0,
        homeWins: 0, homeLosses: 0, roadWins: 0, roadLosses: 0,
        avgHomeScored: 0, avgRoadScored: 0, last10: [],
      };
    }
    const wins = games.filter((g) => g.won).length;
    const losses = games.length - wins;
    const homeGames = games.filter((g) => g.isHome);
    const roadGames = games.filter((g) => !g.isHome);
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return {
      teamId, teamName,
      gamesAnalyzed: games.length,
      wins, losses,
      winPct: Math.round((wins / games.length) * 100),
      avgScored: Math.round(avg(games.map((g) => g.teamScore)) * 10) / 10,
      avgAllowed: Math.round(avg(games.map((g) => g.oppScore)) * 10) / 10,
      avgTotal: Math.round(avg(games.map((g) => g.total)) * 10) / 10,
      avgMargin: Math.round(avg(games.map((g) => g.margin)) * 10) / 10,
      homeWins: homeGames.filter((g) => g.won).length,
      homeLosses: homeGames.filter((g) => !g.won).length,
      roadWins: roadGames.filter((g) => g.won).length,
      roadLosses: roadGames.filter((g) => !g.won).length,
      avgHomeScored: Math.round(avg(homeGames.map((g) => g.teamScore)) * 10) / 10,
      avgRoadScored: Math.round(avg(roadGames.map((g) => g.teamScore)) * 10) / 10,
      last10: games.slice(-10),
    };
  }

  const result: TeamSeasonLog = {
    teamId, teamName, season,
    all: allGames,
    form: buildSummary(allGames.slice(-10)),
    fullSeason: buildSummary(allGames),
  };

  TEAM_FORM_CACHE.set(cacheKey, { data: result, at: Date.now() });
  return result;
}

// ─── H2H extraction ───────────────────────────────────────────────────────────

function extractH2HGames(
  teamALog: TeamGameLog[],
  teamBId: string,
  teamAId: string,
): H2HGameResult[] {
  const meetings: H2HGameResult[] = [];
  for (const g of teamALog) {
    if (String(g.opponentId) !== String(teamBId)) continue;
    meetings.push({
      date: g.date,
      gameId: g.gameId,
      teamAScore: g.teamScore,
      teamBScore: g.oppScore,
      total: g.total,
      teamAWon: g.won,
      margin: g.margin,
      teamAIsHome: g.isHome,
    });
  }
  return meetings;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function getH2HTendencies(
  league: string,
  teamAId: string,
  teamAName: string,
  teamBId: string,
  teamBName: string,
  todayTotalLine?: number | null,  // today's posted O/U for comparison
): Promise<H2HTendencyResult | null> {
  if (!teamAId || !teamBId) return null;
  const cacheKey = `h2h:${league}|${teamAId}|${teamBId}`;
  const hit = H2H_CACHE.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) {
    // If the line changed, rebuild bullets but return cached core data
    return hit.data;
  }

  try {
    const season = currentSeason(league);

    // Fetch current season logs for both teams in parallel
    const [logA, logB] = await Promise.all([
      getTeamSeasonLog(league, teamAId, season),
      getTeamSeasonLog(league, teamBId, season),
    ]);

    if (!logA || !logB) return null;

    // Collect H2H meetings — start with current season, go back if not enough
    let allH2H: H2HGameResult[] = [];
    let seasonsBack = 0;

    for (let s = season; s >= season - MAX_SEASONS_BACK; s--) {
      let aLog = s === season ? logA : await getTeamSeasonLog(league, teamAId, s);
      if (!aLog) continue;
      const meetings = extractH2HGames(aLog.all, teamBId, teamAId);
      allH2H = [...meetings, ...allH2H]; // prepend older seasons
      seasonsBack = season - s;
      if (allH2H.length >= MIN_H2H_SAMPLE) break;
    }

    // Sort newest first
    allH2H.sort((a, b) => b.date.localeCompare(a.date));

    const avg = (arr: number[]) => arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : 0;

    const teamAForm = logA.form;
    const teamAFullSeason = logA.fullSeason;
    const teamBForm = logB.form;
    const teamBFullSeason = logB.fullSeason;

    // H2H summary
    const teamAWins = allH2H.filter((g) => g.teamAWon).length;
    const teamBWins = allH2H.length - teamAWins;
    const avgTotal = Math.round(avg(allH2H.map((g) => g.total)) * 10) / 10;
    const avgTeamAScore = Math.round(avg(allH2H.map((g) => g.teamAScore)) * 10) / 10;
    const avgTeamBScore = Math.round(avg(allH2H.map((g) => g.teamBScore)) * 10) / 10;
    const avgMargin = Math.round(avg(allH2H.map((g) => Math.abs(g.margin))) * 10) / 10;
    const highestTotal = allH2H.length ? Math.max(...allH2H.map((g) => g.total)) : 0;
    const lowestTotal = allH2H.length ? Math.min(...allH2H.map((g) => g.total)) : 0;

    // Compare H2H totals to today's line (if provided) or season avg
    const lineRef = todayTotalLine ?? ((teamAFullSeason.avgTotal + teamBFullSeason.avgTotal) / 2);
    const meetingsAboveLine = allH2H.filter((g) => g.total > lineRef).length;
    const meetingsBelowLine = allH2H.filter((g) => g.total < lineRef).length;
    const gamesAboveAvgTotal = allH2H.filter((g) => g.total > avgTotal).length;
    const gamesBelowAvgTotal = allH2H.filter((g) => g.total < avgTotal).length;

    // Build plain-language explanation bullets
    const h2hBullets: string[] = [];
    const n = allH2H.length;

    if (n >= 2) {
      const recentStr = seasonsBack === 0 ? 'this season' : `last ${seasonsBack + 1} seasons`;
      h2hBullets.push(`Last ${n} H2H meetings (${recentStr}): avg combined score ${avgTotal} — ${teamAName} ${teamAWins}-${teamBWins}.`);

      if (todayTotalLine != null && n >= 3) {
        const overStr = meetingsAboveLine >= Math.ceil(n * 0.6)
          ? `${meetingsAboveLine} of ${n} went OVER today's ${todayTotalLine} line — H2H history leans over`
          : meetingsBelowLine >= Math.ceil(n * 0.6)
          ? `${meetingsBelowLine} of ${n} went UNDER today's ${todayTotalLine} line — H2H history leans under`
          : `H2H totals split near today's ${todayTotalLine} line (${meetingsAboveLine}O/${meetingsBelowLine}U)`;
        h2hBullets.push(overStr + '.');
      } else if (n >= 3) {
        h2hBullets.push(`Avg H2H total ${avgTotal} (range ${lowestTotal}–${highestTotal}). ${gamesAboveAvgTotal} of ${n} beat that average.`);
      }

      if (avgMargin < 6) {
        h2hBullets.push(`These teams play close — avg margin only ${avgMargin} pts.`);
      } else if (avgMargin > 15) {
        h2hBullets.push(`H2H games tend to be lopsided — avg winning margin ${avgMargin} pts.`);
      }
    }

    // Recent form bullets
    const last10A = teamAForm;
    const last10B = teamBForm;
    if (last10A.gamesAnalyzed >= 5) {
      const streak = last10A.last10.slice(-4);
      const recentWins = streak.filter((g) => g.won).length;
      if (recentWins >= 3) h2hBullets.push(`${teamAName} has won ${recentWins} of their last 4 games (avg margin +${Math.round(avg(streak.map((g) => g.margin)) * 10) / 10}).`);
      else if (recentWins <= 1) h2hBullets.push(`${teamAName} has lost ${4 - recentWins} of their last 4 — cold streak entering this game.`);
    }
    if (last10B.gamesAnalyzed >= 5) {
      const streak = last10B.last10.slice(-4);
      const recentWins = streak.filter((g) => g.won).length;
      if (recentWins >= 3) h2hBullets.push(`${teamBName} has won ${recentWins} of their last 4 (avg margin +${Math.round(avg(streak.map((g) => g.margin)) * 10) / 10}).`);
      else if (recentWins <= 1) h2hBullets.push(`${teamBName} has lost ${4 - recentWins} of their last 4.`);
    }

    // Scoring trend vs today's line
    if (todayTotalLine != null && teamAFullSeason.avgTotal > 0 && teamBFullSeason.avgTotal > 0) {
      const seasonAvgTotal = Math.round(((teamAFullSeason.avgTotal + teamBFullSeason.avgTotal) / 2) * 10) / 10;
      const diff = Math.round((seasonAvgTotal - todayTotalLine) * 10) / 10;
      if (Math.abs(diff) >= 3) {
        h2hBullets.push(`Season avg combined total for these two teams is ${seasonAvgTotal} — line is ${todayTotalLine} (${diff > 0 ? '+' : ''}${diff} from season avg).`);
      }
    }

    const result: H2HTendencyResult = {
      teamAId, teamAName, teamBId, teamBName, league,
      teamAForm, teamAFullSeason,
      teamBForm, teamBFullSeason,
      h2h: {
        meetings: allH2H,
        seasonsBack,
        teamAWins, teamBWins,
        teamAWinRate: n > 0 ? Math.round((teamAWins / n) * 100) : 50,
        avgTotal, highestTotal, lowestTotal,
        avgTeamAScore, avgTeamBScore, avgMargin,
        gamesAboveAvgTotal, gamesBelowAvgTotal,
        meetingsAboveLine, meetingsBelowLine,
      },
      h2hBullets,
    };

    H2H_CACHE.set(cacheKey, { data: result, at: Date.now() });
    return result;
  } catch (err) {
    console.error('[h2hTendencyService] error', err);
    return null;
  }
}

// Invalidate both teams' form caches (call after a game finishes)
export function invalidateH2HCache(league: string, teamAId: string, teamBId: string) {
  H2H_CACHE.delete(`h2h:${league}|${teamAId}|${teamBId}`);
  H2H_CACHE.delete(`h2h:${league}|${teamBId}|${teamAId}`);
  const season = currentSeason(league);
  TEAM_FORM_CACHE.delete(`${league}|${teamAId}|${season}`);
  TEAM_FORM_CACHE.delete(`${league}|${teamBId}|${season}`);
}
