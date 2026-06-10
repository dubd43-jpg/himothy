// Universal situational ATS + over/under rate service.
// Computes the tendencies professional bettors live by:
//   ATS after a loss / after a win / after a blowout
//   ATS off rest / on back-to-back / off a bye
//   ATS as a favorite / as a dog / as a home dog (historically +EV in NFL)
//   ATS in division vs non-division games
//   Team over/under rate — overall, home, road, last 5, last 10
//   Days rest for each team and the rest-differential edge
//   Travel / timezone disadvantage
//
// Data: ESPN team schedule (already used by the rest of the engine).
// No new API keys needed.

import { LEAGUE_URLS } from '@/lib/validation';

const TTL = 60 * 60 * 1000; // 1h
const cache = new Map<string, { data: SituationalProfile; at: number }>();

// Known division memberships for division-game detection
const DIVISIONS: Record<string, string[][]> = {
  NFL: [
    ['Dallas Cowboys', 'Philadelphia Eagles', 'New York Giants', 'Washington Commanders'],
    ['Chicago Bears', 'Detroit Lions', 'Green Bay Packers', 'Minnesota Vikings'],
    ['Atlanta Falcons', 'Carolina Panthers', 'New Orleans Saints', 'Tampa Bay Buccaneers'],
    ['Los Angeles Rams', 'San Francisco 49ers', 'Seattle Seahawks', 'Arizona Cardinals'],
    ['Baltimore Ravens', 'Cincinnati Bengals', 'Cleveland Browns', 'Pittsburgh Steelers'],
    ['Buffalo Bills', 'Miami Dolphins', 'New England Patriots', 'New York Jets'],
    ['Houston Texans', 'Indianapolis Colts', 'Jacksonville Jaguars', 'Tennessee Titans'],
    ['Denver Broncos', 'Kansas City Chiefs', 'Las Vegas Raiders', 'Los Angeles Chargers'],
  ],
  NBA: [
    ['Boston Celtics', 'Brooklyn Nets', 'New York Knicks', 'Philadelphia 76ers', 'Toronto Raptors'],
    ['Chicago Bulls', 'Cleveland Cavaliers', 'Detroit Pistons', 'Indiana Pacers', 'Milwaukee Bucks'],
    ['Atlanta Hawks', 'Charlotte Hornets', 'Miami Heat', 'Orlando Magic', 'Washington Wizards'],
    ['Dallas Mavericks', 'Houston Rockets', 'Memphis Grizzlies', 'New Orleans Pelicans', 'San Antonio Spurs'],
    ['Denver Nuggets', 'Minnesota Timberwolves', 'Oklahoma City Thunder', 'Portland Trail Blazers', 'Utah Jazz'],
    ['Golden State Warriors', 'Los Angeles Clippers', 'Los Angeles Lakers', 'Phoenix Suns', 'Sacramento Kings'],
  ],
  MLB: [
    ['Baltimore Orioles', 'Boston Red Sox', 'New York Yankees', 'Tampa Bay Rays', 'Toronto Blue Jays'],
    ['Chicago White Sox', 'Cleveland Guardians', 'Detroit Tigers', 'Kansas City Royals', 'Minnesota Twins'],
    ['Houston Astros', 'Los Angeles Angels', 'Oakland Athletics', 'Seattle Mariners', 'Texas Rangers'],
    ['Atlanta Braves', 'Miami Marlins', 'New York Mets', 'Philadelphia Phillies', 'Washington Nationals'],
    ['Chicago Cubs', 'Cincinnati Reds', 'Milwaukee Brewers', 'Pittsburgh Pirates', 'St. Louis Cardinals'],
    ['Arizona Diamondbacks', 'Colorado Rockies', 'Los Angeles Dodgers', 'San Diego Padres', 'San Francisco Giants'],
  ],
  NHL: [
    ['Boston Bruins', 'Buffalo Sabres', 'Detroit Red Wings', 'Florida Panthers', 'Montreal Canadiens', 'Ottawa Senators', 'Tampa Bay Lightning', 'Toronto Maple Leafs'],
    ['Carolina Hurricanes', 'Columbus Blue Jackets', 'New Jersey Devils', 'New York Islanders', 'New York Rangers', 'Philadelphia Flyers', 'Pittsburgh Penguins', 'Washington Capitals'],
    ['Arizona Coyotes', 'Chicago Blackhawks', 'Colorado Avalanche', 'Dallas Stars', 'Minnesota Wild', 'Nashville Predators', 'St. Louis Blues', 'Winnipeg Jets', 'Utah Hockey Club'],
    ['Anaheim Ducks', 'Calgary Flames', 'Edmonton Oilers', 'Los Angeles Kings', 'San Jose Sharks', 'Seattle Kraken', 'Vancouver Canucks', 'Vegas Golden Knights'],
  ],
};

function isDivisionGame(teamA: string, teamB: string, league: string): boolean {
  const divs = DIVISIONS[league] || [];
  return divs.some((div) => div.includes(teamA) && div.includes(teamB));
}

// US city → timezone offset from ET (negative = west of ET)
const CITY_TZ_OFFSET: Record<string, number> = {
  'Los Angeles': -3, 'LA': -3, 'San Francisco': -3, 'Oakland': -3, 'Sacramento': -3,
  'Seattle': -3, 'Portland': -3, 'San Diego': -3, 'Las Vegas': -3, 'Phoenix': -3,
  'Denver': -2, 'Salt Lake': -2, 'Utah': -2,
  'Dallas': -1, 'Houston': -1, 'San Antonio': -1, 'Oklahoma City': -1,
  'Chicago': -1, 'Milwaukee': -1, 'Minneapolis': -1, 'Kansas City': -1,
  'Memphis': -1, 'New Orleans': -1, 'Indianapolis': -1,
  'Detroit': 0, 'Cleveland': 0, 'Pittsburgh': 0, 'Charlotte': 0,
  'Atlanta': 0, 'Miami': 0, 'Tampa': 0, 'Orlando': 0,
  'New York': 0, 'Boston': 0, 'Philadelphia': 0, 'Washington': 0,
  'Toronto': 0,
};

function timezoneDisadvantage(travelingTeamCity: string, homeCity: string): number {
  const travelTZ = CITY_TZ_OFFSET[travelingTeamCity] ?? 0;
  const homeTZ = CITY_TZ_OFFSET[homeCity] ?? 0;
  // Positive = traveling east (body clock disadvantage), negative = traveling west
  return homeTZ - travelTZ;
}

export interface SituationalProfile {
  teamName: string;
  league: string;
  gamesAnalyzed: number;

  // After previous game result
  atsAfterWin: { covers: number; total: number; pct: number };
  atsAfterLoss: { covers: number; total: number; pct: number };
  atsAfterBlowoutWin: { covers: number; total: number; pct: number };  // won by 15+/3+ runs
  atsAfterBlowoutLoss: { covers: number; total: number; pct: number }; // lost by 15+/3+ runs

  // Rest / schedule
  atsBackToBack: { covers: number; total: number; pct: number };
  atsOff3PlusDays: { covers: number; total: number; pct: number };
  atsOff7PlusDays: { covers: number; total: number; pct: number }; // bye week / long rest

  // Role
  atsAsFavorite: { covers: number; total: number; pct: number };
  atsAsUnderdog: { covers: number; total: number; pct: number };
  atsAsHomeFavorite: { covers: number; total: number; pct: number };
  atsAsHomeDog: { covers: number; total: number; pct: number };
  atsAsRoadDog: { covers: number; total: number; pct: number };

  // Division
  atsDivision: { covers: number; total: number; pct: number };
  atsNonDivision: { covers: number; total: number; pct: number };

  // Over/under rate — the "total tendency"
  overRate: { overs: number; total: number; pct: number };
  overRateHome: { overs: number; total: number; pct: number };
  overRateRoad: { overs: number; total: number; pct: number };
  overRateL5: { overs: number; total: number; pct: number };
  overRateL10: { overs: number; total: number; pct: number };
  avgTotal: number;
  avgTotalHome: number;
  avgTotalRoad: number;

  // Current game context
  daysRest: number;
  isBackToBack: boolean;
  lastGameMargin: number | null; // positive = won, negative = lost
  lastGameWon: boolean | null;
}

// ─── ESPN schedule fetch (reuses existing pattern) ───────────────────────────

async function fetchSchedule(league: string, teamId: string): Promise<any[]> {
  const base = LEAGUE_URLS[league];
  if (!base) return [];
  try {
    const r = await fetch(`${base}/teams/${teamId}/schedule`, { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.events || []) as any[];
  } catch { return []; }
}

function parseEvent(ev: any, myTeamId: string): {
  date: string; won: boolean; margin: number; isHome: boolean;
  myScore: number; oppScore: number; total: number;
  spread: number | null; isFavorite: boolean | null;
  oppName: string;
} | null {
  const comp = (ev.competitions || [])[0];
  if (!comp?.status?.type?.completed) return null;
  const competitors: any[] = comp.competitors || [];
  const me = competitors.find((c) => String(c.team?.id) === String(myTeamId));
  const opp = competitors.find((c) => String(c.team?.id) !== String(myTeamId));
  if (!me || !opp) return null;

  const myScore = Number(me.score ?? 0);
  const oppScore = Number(opp.score ?? 0);
  if (myScore === 0 && oppScore === 0) return null;

  // Try to get spread from odds (ESPN pickcenter)
  let spread: number | null = null;
  let isFavorite: boolean | null = null;
  const odds = comp.odds?.[0];
  if (odds) {
    const sl = Number(odds.spread ?? odds.spreadLine ?? NaN);
    if (!isNaN(sl)) {
      // Positive spread line = underdog; negative = favorite
      const homeOdds = String(odds.homeTeamOdds?.spreadOdds || '');
      const isHomeTeam = me.homeAway === 'home';
      spread = sl;
      if (isHomeTeam) isFavorite = sl < 0;
      else isFavorite = sl > 0; // away team is fav when home spread is positive
    }
  }

  return {
    date: String(ev.date || '').slice(0, 10),
    won: myScore > oppScore,
    margin: myScore - oppScore,
    isHome: me.homeAway === 'home',
    myScore, oppScore,
    total: myScore + oppScore,
    spread,
    isFavorite,
    oppName: opp.team?.displayName || opp.team?.name || '',
  };
}

// Blowout threshold by league
function isBlowout(margin: number, league: string): boolean {
  const abs = Math.abs(margin);
  if (league === 'MLB') return abs >= 5;
  if (league === 'NHL') return abs >= 3;
  if (league === 'NFL') return abs >= 17;
  return abs >= 20; // NBA / basketball
}

// Did the team cover? We need spread — if unavailable, use margin proxy
function didCover(margin: number, spread: number | null, isHome: boolean): boolean | null {
  if (spread == null) return null;
  // Spread convention: home spread is negative when home is fav (e.g., -7 = home favored by 7)
  // Cover: margin + spread > 0 for home team
  const adjusted = isHome ? margin + spread : margin - spread;
  if (adjusted === 0) return null; // push
  return adjusted > 0;
}

// Accumulator helper
function acc() { return { covers: 0, total: 0, pct: 0 }; }
function accOver() { return { overs: 0, total: 0, pct: 0 }; }
function finalize(a: { covers: number; total: number; pct: number }) {
  a.pct = a.total > 0 ? Math.round((a.covers / a.total) * 100) : 50;
}
function finalizeOver(a: { overs: number; total: number; pct: number }) {
  a.pct = a.total > 0 ? Math.round((a.overs / a.total) * 100) : 50;
}

export async function getSituationalProfile(
  league: string, teamId: string, teamName: string, oppTeamName: string,
): Promise<SituationalProfile | null> {
  const cacheKey = `sit:${league}|${teamId}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  try {
    const events = await fetchSchedule(league, teamId);
    const games: ReturnType<typeof parseEvent>[] = [];
    for (const ev of events) {
      const g = parseEvent(ev, teamId);
      if (g) games.push(g);
    }
    games.sort((a, b) => a!.date.localeCompare(b!.date));

    const p: SituationalProfile = {
      teamName, league,
      gamesAnalyzed: games.length,
      atsAfterWin: acc(), atsAfterLoss: acc(),
      atsAfterBlowoutWin: acc(), atsAfterBlowoutLoss: acc(),
      atsBackToBack: acc(), atsOff3PlusDays: acc(), atsOff7PlusDays: acc(),
      atsAsFavorite: acc(), atsAsUnderdog: acc(),
      atsAsHomeFavorite: acc(), atsAsHomeDog: acc(), atsAsRoadDog: acc(),
      atsDivision: acc(), atsNonDivision: acc(),
      overRate: accOver(), overRateHome: accOver(), overRateRoad: accOver(),
      overRateL5: accOver(), overRateL10: accOver(),
      avgTotal: 0, avgTotalHome: 0, avgTotalRoad: 0,
      daysRest: 1, isBackToBack: false,
      lastGameMargin: null, lastGameWon: null,
    };

    const totals: number[] = [];
    const homeTotals: number[] = [];
    const roadTotals: number[] = [];

    for (let i = 0; i < games.length; i++) {
      const g = games[i]!;
      const prev = i > 0 ? games[i - 1]! : null;

      // Rest / B2B
      let daysFromPrev = 99;
      if (prev) {
        const ms = new Date(g.date).getTime() - new Date(prev.date).getTime();
        daysFromPrev = Math.floor(ms / 86400000);
      }
      const isB2B = daysFromPrev <= 1;
      const isOff3Plus = daysFromPrev >= 3;
      const isOffByeWeek = daysFromPrev >= 7;

      // Cover result
      const covered = didCover(g.margin, g.spread, g.isHome);

      // Record in situational buckets
      function record(bucket: { covers: number; total: number; pct: number }) {
        bucket.total++;
        if (covered === true) bucket.covers++;
      }

      if (prev) {
        if (prev.won) record(p.atsAfterWin);
        else record(p.atsAfterLoss);
        if (prev.won && isBlowout(prev.margin, league)) record(p.atsAfterBlowoutWin);
        if (!prev.won && isBlowout(prev.margin, league)) record(p.atsAfterBlowoutLoss);
      }
      if (isB2B) record(p.atsBackToBack);
      if (isOff3Plus) record(p.atsOff3PlusDays);
      if (isOffByeWeek) record(p.atsOff7PlusDays);

      if (g.isFavorite === true) {
        record(p.atsAsFavorite);
        if (g.isHome) record(p.atsAsHomeFavorite);
      } else if (g.isFavorite === false) {
        record(p.atsAsUnderdog);
        if (g.isHome) record(p.atsAsHomeDog);
        else record(p.atsAsRoadDog);
      }

      const inDiv = isDivisionGame(teamName, g.oppName, league);
      if (inDiv) record(p.atsDivision);
      else record(p.atsNonDivision);

      // Over/under — use actual total vs avg as proxy when we don't have the line
      totals.push(g.total);
      if (g.isHome) homeTotals.push(g.total);
      else roadTotals.push(g.total);

      // We record "over" vs running average as proxy; real O/U line not always available
      const isLast5 = i >= games.length - 5;
      const isLast10 = i >= games.length - 10;
      // Count totals for rate — will compare vs avg after loop
      p.overRate.total++;
      if (g.isHome) p.overRateHome.total++;
      else p.overRateRoad.total++;
      if (isLast5) p.overRateL5.total++;
      if (isLast10) p.overRateL10.total++;
    }

    // Compute avg total and "over" rate as beats-the-average proxy
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    p.avgTotal = Math.round(avg(totals) * 10) / 10;
    p.avgTotalHome = Math.round(avg(homeTotals) * 10) / 10;
    p.avgTotalRoad = Math.round(avg(roadTotals) * 10) / 10;

    // Now count overs vs the overall avg total
    for (let i = 0; i < games.length; i++) {
      const g = games[i]!;
      const isLast5 = i >= games.length - 5;
      const isLast10 = i >= games.length - 10;
      if (g.total > p.avgTotal) {
        p.overRate.overs++;
        if (g.isHome) p.overRateHome.overs++;
        else p.overRateRoad.overs++;
        if (isLast5) p.overRateL5.overs++;
        if (isLast10) p.overRateL10.overs++;
      }
    }

    // Finalize percentages
    [p.atsAfterWin, p.atsAfterLoss, p.atsAfterBlowoutWin, p.atsAfterBlowoutLoss,
     p.atsBackToBack, p.atsOff3PlusDays, p.atsOff7PlusDays,
     p.atsAsFavorite, p.atsAsUnderdog, p.atsAsHomeFavorite, p.atsAsHomeDog, p.atsAsRoadDog,
     p.atsDivision, p.atsNonDivision].forEach(finalize);
    [p.overRate, p.overRateHome, p.overRateRoad, p.overRateL5, p.overRateL10].forEach(finalizeOver);

    // Current game context
    if (games.length > 0) {
      const last = games[games.length - 1]!;
      const prev = games.length > 1 ? games[games.length - 2]! : null;
      p.lastGameMargin = last.margin;
      p.lastGameWon = last.won;
      if (prev) {
        const ms = new Date().getTime() - new Date(last.date).getTime();
        p.daysRest = Math.max(0, Math.floor(ms / 86400000));
        p.isBackToBack = p.daysRest <= 1;
      }
    }

    cache.set(cacheKey, { data: p, at: Date.now() });
    return p;
  } catch (err) {
    console.error('[situationalAtsService] error', err);
    return null;
  }
}

// Build explanation bullets from two teams' situational profiles
export function buildSituationalBullets(
  picked: SituationalProfile,
  opp: SituationalProfile,
  league: string,
  pickedIsHome: boolean,
  pickedIsFavorite: boolean,
): string[] {
  const bullets: string[] = [];
  const t = picked.teamName;
  const o = opp.teamName;

  // After previous result
  if (picked.lastGameWon === false && picked.atsAfterLoss.total >= 5) {
    const pct = picked.atsAfterLoss.pct;
    if (pct >= 60) bullets.push(`${t} covers ${pct}% ATS after a loss — bounce-back tendency is real (${picked.atsAfterLoss.covers}-${picked.atsAfterLoss.total - picked.atsAfterLoss.covers}).`);
    else if (pct <= 35) bullets.push(`${t} covers only ${pct}% ATS after a loss — no bounce-back history here.`);
  }
  if (picked.lastGameWon === true && picked.atsAfterWin.total >= 5) {
    const pct = picked.atsAfterWin.pct;
    if (pct >= 62) bullets.push(`${t} is ${picked.atsAfterWin.covers}-${picked.atsAfterWin.total - picked.atsAfterWin.covers} ATS after a win — keeps rolling after victories.`);
  }

  // Blowout revenge
  if (picked.lastGameMargin !== null && picked.lastGameMargin <= -15 && picked.atsAfterBlowoutLoss.total >= 3) {
    bullets.push(`${t} just got blown out — they cover ${picked.atsAfterBlowoutLoss.pct}% ATS in revenge spots (${picked.atsAfterBlowoutLoss.covers}-${picked.atsAfterBlowoutLoss.total - picked.atsAfterBlowoutLoss.covers}).`);
  }

  // Rest advantage/disadvantage
  if (picked.isBackToBack && picked.atsBackToBack.total >= 5) {
    bullets.push(`${t} on a back-to-back — covers only ${picked.atsBackToBack.pct}% ATS in those spots.`);
  }
  if (opp.isBackToBack && opp.atsBackToBack.total >= 5) {
    bullets.push(`${o} on a back-to-back — a real edge for ${t} (${o} covers only ${opp.atsBackToBack.pct}% on B2B).`);
  }
  if (picked.daysRest >= 3 && picked.atsOff3PlusDays.total >= 5) {
    const pct = picked.atsOff3PlusDays.pct;
    if (pct >= 60) bullets.push(`${t} covers ${pct}% ATS off 3+ days rest — they play better fresh.`);
  }

  // Bye week (NFL / 7+ days)
  if (league === 'NFL' && picked.daysRest >= 7 && picked.atsOff7PlusDays.total >= 3) {
    bullets.push(`${t} coming off a bye — covers ${picked.atsOff7PlusDays.pct}% ATS off extended rest (${picked.atsOff7PlusDays.covers}-${picked.atsOff7PlusDays.total - picked.atsOff7PlusDays.covers}).`);
  }

  // Role-based ATS
  if (!pickedIsFavorite && pickedIsHome && picked.atsAsHomeDog.total >= 5) {
    bullets.push(`${t} as a home dog covers ${picked.atsAsHomeDog.pct}% — home underdog spots are historically +EV.`);
  }
  if (!pickedIsFavorite && !pickedIsHome && picked.atsAsRoadDog.total >= 5) {
    const pct = picked.atsAsRoadDog.pct;
    if (pct >= 55) bullets.push(`${t} covers ${pct}% ATS as a road dog — they fight back on the road.`);
    else if (pct <= 35) bullets.push(`${t} is only ${pct}% ATS as a road dog — avoid laying inflated road prices here.`);
  }

  // Division game
  const inDiv = picked.atsDivision.total >= 5;
  if (inDiv) {
    const pct = picked.atsDivision.pct;
    if (pct >= 60) bullets.push(`${t} covers ${pct}% ATS in division games — they know these opponents.`);
    else if (pct <= 38) bullets.push(`${t} struggles in division games — only ${pct}% ATS.`);
  }

  // Over/under tendency
  if (picked.overRateL10.total >= 8) {
    const pct = picked.overRateL10.pct;
    if (pct >= 70) bullets.push(`${t}'s games have gone over in ${pct}% of their last 10 — high-scoring stretch right now.`);
    else if (pct <= 30) bullets.push(`${t}'s games have gone under in ${100 - pct}% of their last 10 — defensive stretch.`);
  }

  return bullets;
}
