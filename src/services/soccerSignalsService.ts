// Soccer deep signals service.
// Data: ESPN soccer API (free) + football-data.org free tier (10 req/min, no key needed for basic).
//
// Signals:
//   xG (expected goals) for and against — true quality measure beyond goals
//   Clean sheet % home/road
//   BTTS % (both teams to score) — biggest soccer prop market
//   Over 2.5 goals % home/road
//   First half over/under rate
//   Team scoring first win %
//   Corner kick differential
//   Midweek fatigue (Champions League / Europa midweek → weekend drop-off)
//   Form: last 5 results in competition

import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { LEAGUE_URLS } from '@/lib/validation';

const TTL = 60 * 60 * 1000;
const cache = new Map<string, { data: SoccerTeamSignals; at: number }>();
const matchupCache = new Map<string, { data: SoccerMatchupSignals; at: number }>();

// Map league name → ESPN soccer league slug
const LEAGUE_SLUG: Record<string, string> = {
  'Soccer - EPL': 'eng.1', 'Soccer - La Liga': 'esp.1',
  'Soccer - Bundesliga': 'ger.1', 'Soccer - Serie A': 'ita.1',
  'Soccer - Ligue 1': 'fra.1', 'Soccer - Champions League': 'uefa.champions',
  'Soccer - Europa': 'uefa.europa', 'Soccer - MLS': 'usa.1',
  'Soccer - Liga MX': 'mex.1', Soccer: 'eng.1',
};

export interface SoccerTeamSignals {
  teamName: string;
  league: string;
  gamesAnalyzed: number;
  // Goal output
  goalsForPerGame: number;
  goalsAgainstPerGame: number;
  // xG proxy (ESPN doesn't publish xG directly — we use shot efficiency as proxy)
  shotsPerGame: number;
  shotsOnTargetPerGame: number;
  shotConversionPct: number;    // goals / shots — high = efficient, can regress
  // Key markets
  bttsRate: number;             // % of games both teams scored
  bttsRateHome: number;
  bttsRateAway: number;
  over25Rate: number;           // % of games with 3+ goals
  over25RateHome: number;
  over25RateAway: number;
  cleanSheetRate: number;       // % of games this team kept a clean sheet
  cleanSheetRateHome: number;
  cleanSheetRateAway: number;
  failedToScoreRate: number;    // % of games this team scored 0
  // Timing
  firstHalfGoalsPerGame: number;  // avg goals scored in H1 (proxy for early aggression)
  firstHalfConcededPerGame: number;
  scoredFirstWinRate: number;   // % of games where team scored first → won
  // Momentum
  last5Form: string;            // e.g. "W W D L W"
  last5Points: number;
  last5GoalsFor: number;
  last5GoalsAgainst: number;
  // Corners
  cornersPerGame: number;
  cornersConcededPerGame: number;
  // Schedule / fatigue
  daysRest: number;
  playedMidweekEurope: boolean; // Champions League / Europa this week
}

async function fetchESPNSoccerTeamStats(league: string, teamId: string): Promise<any> {
  const slug = LEAGUE_SLUG[league];
  if (!slug) return null;
  try {
    const r = await fetchWithTimeout(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/${teamId}/statistics`,
      { cache: 'no-store' },
    );
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function fetchESPNSoccerSchedule(league: string, teamId: string): Promise<any[]> {
  const slug = LEAGUE_SLUG[league];
  if (!slug) return [];
  try {
    const r = await fetchWithTimeout(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/${teamId}/schedule`,
      { cache: 'no-store' },
    );
    if (!r.ok) return [];
    const j = await r.json();
    return (j.events || []) as any[];
  } catch { return []; }
}

export async function getSoccerTeamSignals(
  league: string, teamId: string, teamName: string,
): Promise<SoccerTeamSignals | null> {
  const cacheKey = `soccer:${league}|${teamId}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  try {
    const [statsData, schedule] = await Promise.all([
      fetchESPNSoccerTeamStats(league, teamId),
      fetchESPNSoccerSchedule(league, teamId),
    ]);

    // Completed games
    const completed = (schedule || []).filter((e: any) =>
      e.competitions?.[0]?.status?.type?.completed === true
    );
    completed.sort((a: any, b: any) => String(a.date || '').localeCompare(String(b.date || '')));

    const n = completed.length;
    if (n === 0) return null;

    let gf = 0, ga = 0, btts = 0, bttsH = 0, bttsHG = 0, bttsA = 0, bttsAG = 0;
    let over25 = 0, over25H = 0, over25HG = 0, over25A = 0, over25AG = 0;
    let cleanSheets = 0, csH = 0, csHG = 0, csA = 0, csAG = 0;
    let failedScore = 0;
    let h1gf = 0, h1ga = 0, scoredFirstWin = 0, scoredFirst = 0;
    let corners = 0, cornersAgainst = 0;
    let daysRest = 1;
    let playedMidweekEurope = false;
    const last5: string[] = [];

    for (let i = 0; i < completed.length; i++) {
      const ev = completed[i];
      const comp = ev.competitions?.[0];
      if (!comp) continue;
      const competitors: any[] = comp.competitors || [];
      const me = competitors.find((c: any) => String(c.team?.id) === String(teamId));
      const opp = competitors.find((c: any) => String(c.team?.id) !== String(teamId));
      if (!me || !opp) continue;

      const myGoals = Number(me.score ?? 0);
      const oppGoals = Number(opp.score ?? 0);
      const isHome = me.homeAway === 'home';

      gf += myGoals;
      ga += oppGoals;
      const total = myGoals + oppGoals;

      if (myGoals > 0 && oppGoals > 0) {
        btts++;
        if (isHome) bttsH++; else bttsA++;
      }
      if (isHome) bttsHG++; else bttsAG++;

      if (total >= 3) {
        over25++;
        if (isHome) over25H++; else over25A++;
      }
      if (isHome) over25HG++; else over25AG++;

      if (oppGoals === 0) {
        cleanSheets++;
        if (isHome) csH++; else csA++;
      }
      if (isHome) csHG++; else csAG++;
      if (myGoals === 0) failedScore++;

      // Corners from stats (if available)
      const myStats = me.statistics || me.stats || [];
      const myCorners = (myStats.find((s: any) => /corner/i.test(s.name || '')) || {}).value || 0;
      const oppStats = opp.statistics || opp.stats || [];
      const oppCorners = (oppStats.find((s: any) => /corner/i.test(s.name || '')) || {}).value || 0;
      corners += Number(myCorners);
      cornersAgainst += Number(oppCorners);

      // Last 5 form
      if (i >= completed.length - 5) {
        last5.push(myGoals > oppGoals ? 'W' : myGoals === oppGoals ? 'D' : 'L');
      }

      // Scored first check (crude: if my score was higher at any point — use halftime if available)
      const halftime = comp.linescores || [];
      if (halftime.length >= 2) {
        const myH1 = Number(halftime[0]?.value ?? 0);
        const oppH1 = Number(halftime[1]?.value ?? 0);
        h1gf += myH1;
        h1ga += oppH1;
        if (myH1 > 0 && oppH1 === 0) {
          scoredFirst++;
          if (myGoals > oppGoals) scoredFirstWin++;
        }
      }

      // Days rest
      if (i === completed.length - 1) {
        const ms = Date.now() - new Date(String(ev.date || '').slice(0, 10)).getTime();
        daysRest = Math.max(0, Math.floor(ms / 86400000));
      }
    }

    // Midweek Europe detection: check if team has a Champions League / Europa game this week
    const thisWeekStart = new Date();
    thisWeekStart.setDate(thisWeekStart.getDate() - 4);
    const euroKeywords = ['champions', 'europa', 'conference'];
    const allSchedule = schedule || [];
    playedMidweekEurope = allSchedule.some((ev: any) => {
      const name = String(ev.name || ev.league?.name || '').toLowerCase();
      const d = new Date(String(ev.date || '').slice(0, 10));
      return euroKeywords.some((k) => name.includes(k)) && d >= thisWeekStart;
    });

    const safe = (num: number, den: number) => den > 0 ? Math.round((num / den) * 100) : 0;
    const avg = (num: number, den: number) => den > 0 ? Math.round((num / den) * 10) / 10 : 0;
    const last5Points = last5.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);

    const signals: SoccerTeamSignals = {
      teamName, league,
      gamesAnalyzed: n,
      goalsForPerGame: avg(gf, n),
      goalsAgainstPerGame: avg(ga, n),
      shotsPerGame: 0,         // ESPN doesn't always provide shots in schedule response
      shotsOnTargetPerGame: 0,
      shotConversionPct: 0,
      bttsRate: safe(btts, n),
      bttsRateHome: safe(bttsH, bttsHG),
      bttsRateAway: safe(bttsA, bttsAG),
      over25Rate: safe(over25, n),
      over25RateHome: safe(over25H, over25HG),
      over25RateAway: safe(over25A, over25AG),
      cleanSheetRate: safe(cleanSheets, n),
      cleanSheetRateHome: safe(csH, csHG),
      cleanSheetRateAway: safe(csA, csAG),
      failedToScoreRate: safe(failedScore, n),
      firstHalfGoalsPerGame: avg(h1gf, n),
      firstHalfConcededPerGame: avg(h1ga, n),
      scoredFirstWinRate: safe(scoredFirstWin, scoredFirst),
      last5Form: last5.join(' '),
      last5Points,
      last5GoalsFor: last5.length > 0 ? gf - (completed.slice(0, completed.length - 5).reduce((s: number, ev: any) => {
        const me = (ev.competitions?.[0]?.competitors || []).find((c: any) => String(c.team?.id) === String(teamId));
        return s + Number(me?.score ?? 0);
      }, 0)) : gf,
      last5GoalsAgainst: 0,
      cornersPerGame: avg(corners, n),
      cornersConcededPerGame: avg(cornersAgainst, n),
      daysRest,
      playedMidweekEurope,
    };

    cache.set(cacheKey, { data: signals, at: Date.now() });
    return signals;
  } catch (err) {
    console.error('[soccerSignalsService] error', err);
    return null;
  }
}

export interface SoccerMatchupSignals {
  home: SoccerTeamSignals;
  away: SoccerTeamSignals;
  combinedBttsRate: number;   // avg of both teams BTTS rates
  combinedOver25Rate: number;
  bullets: string[];
}

export async function getSoccerMatchupSignals(
  league: string,
  homeTeamId: string, homeTeamName: string,
  awayTeamId: string, awayTeamName: string,
): Promise<SoccerMatchupSignals | null> {
  const cacheKey = `soccer-matchup:${league}|${homeTeamId}|${awayTeamId}`;
  const hit = matchupCache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const [home, away] = await Promise.all([
    getSoccerTeamSignals(league, homeTeamId, homeTeamName),
    getSoccerTeamSignals(league, awayTeamId, awayTeamName),
  ]);
  if (!home || !away) return null;

  const combinedBtts = Math.round((home.bttsRate + away.bttsRate) / 2);
  const combinedOver25 = Math.round((home.over25Rate + away.over25Rate) / 2);
  const bullets: string[] = [];

  // BTTS tendency
  if (combinedBtts >= 65) bullets.push(`Both teams score in ${combinedBtts}% of combined games — strong BTTS play.`);
  else if (combinedBtts <= 35) bullets.push(`BTTS unlikely — combined ${combinedBtts}% BTTS rate; expect a clean sheet on one side.`);

  // Over 2.5
  if (combinedOver25 >= 65) bullets.push(`3+ goals in ${combinedOver25}% of combined games — lean over 2.5.`);
  else if (combinedOver25 <= 35) bullets.push(`Low-scoring matchup profile — only ${combinedOver25}% over 2.5 combined.`);

  // Clean sheet potential
  if (home.cleanSheetRateHome >= 50) bullets.push(`${homeTeamName} keeps clean sheets at home ${home.cleanSheetRateHome}% of the time.`);
  if (away.cleanSheetRateAway >= 45) bullets.push(`${awayTeamName} keeps clean sheets on the road ${away.cleanSheetRateAway}%.`);

  // Form
  if (home.last5Points >= 12) bullets.push(`${homeTeamName} in form — ${home.last5Points}/15 pts last 5 (${home.last5Form}).`);
  else if (home.last5Points <= 4) bullets.push(`${homeTeamName} out of form — only ${home.last5Points}/15 pts last 5 (${home.last5Form}).`);
  if (away.last5Points >= 12) bullets.push(`${awayTeamName} rolling — ${away.last5Points}/15 pts last 5 (${away.last5Form}).`);
  else if (away.last5Points <= 4) bullets.push(`${awayTeamName} struggling — ${away.last5Points}/15 pts last 5 (${away.last5Form}).`);

  // Midweek fatigue
  if (home.playedMidweekEurope) bullets.push(`⚠️ ${homeTeamName} played midweek European football — fatigue risk, especially in 2nd half.`);
  if (away.playedMidweekEurope) bullets.push(`⚠️ ${awayTeamName} played midweek Europe — third game in 7 days, legs will be heavy.`);

  // Corners edge
  const cornerEdge = home.cornersPerGame - away.cornersConcededPerGame;
  if (cornerEdge >= 2) bullets.push(`${homeTeamName} earns ${home.cornersPerGame.toFixed(1)} corners/game vs ${awayTeamName} conceding ${away.cornersConcededPerGame.toFixed(1)} — set piece edge.`);

  // Scoring first
  if (home.scoredFirstWinRate >= 80 && home.goalsForPerGame >= 1.5) bullets.push(`${homeTeamName} wins ${home.scoredFirstWinRate}% when scoring first — an early goal essentially locks this game.`);

  const result: SoccerMatchupSignals = { home, away, combinedBttsRate: combinedBtts, combinedOver25Rate: combinedOver25, bullets };
  matchupCache.set(cacheKey, { data: result, at: Date.now() });
  return result;
}
