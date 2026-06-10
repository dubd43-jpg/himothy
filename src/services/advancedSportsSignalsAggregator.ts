// Advanced sport signals aggregator — routes to the right sport-specific service
// per league, returns { scoreAdj, bullets } that go directly into scoreGame() and
// the pick's reasonsFor array.
//
// This is the "tendencies are priority one" layer that users see in the explanation:
//   "Last 6 times these teams played, the game went over."
//   "Kings are 12-3 ATS as a home underdog."
//   "Coors Field adds 1.5 runs vs neutral — lean over."
//   "Scott Foster calling — highest FTA rate in NBA, strong over lean."
//   "PDO 1.045 for Boston — shooting/goalie luck hot, regression due."
//
// Every service call is parallel (Promise.all) to keep latency minimal.

import { getNHLMatchupSignals } from '@/services/nhlSignalsService';
import { getSituationalProfile, buildSituationalBullets } from '@/services/situationalAtsService';
import { getNFLMatchupSignals } from '@/services/nflSignalsService';
import { getSoccerMatchupSignals } from '@/services/soccerSignalsService';
import { getTennisMatchupSignals } from '@/services/tennisSignalsService';
import { getMMAMatchupSignals } from '@/services/mmaSignalsService';
import { getNBAMatchupSignals, getNBARefereeImpact } from '@/services/nbaAdvancedSignalsService';
import { getParkFactor, getUmpireTendency, parkRunAdjustment, buildMLBContextBullets, getTeamRISP } from '@/services/mlbAdvancedSignalsService';
import { getH2HTendencies } from '@/services/h2hTendencyService';

export interface AdvancedSportsResult {
  scoreAdj: number;          // ±pts to add to scoreGame() result
  bullets: string[];         // all bullets to surface in reasonsFor
  h2hBullets: string[];      // specifically H2H tendency bullets for pick explanation
  venueBullets: string[];    // venue/environment bullets
  sportBullets: string[];    // sport-specific bullets (NHL PP/PK, NBA pace, etc.)
}

// Sport key map: league name → sport group
function sportGroupFor(league: string): 'nhl' | 'nba' | 'wnba' | 'nfl' | 'mlb' | 'ncaa_basketball' | 'ncaa_football' | 'soccer' | 'tennis' | 'mma' | 'other' {
  const l = league.toLowerCase();
  if (l === 'nhl') return 'nhl';
  if (l === 'nba') return 'nba';
  if (l === 'wnba') return 'wnba';
  if (l === 'nfl') return 'nfl';
  if (l === 'mlb') return 'mlb';
  if (l.includes('ncaa basketball') || l.includes('college basketball')) return 'ncaa_basketball';
  if (l.includes('college football') || l.includes('ncaa football') || l.includes('ufl')) return 'ncaa_football';
  if (l.includes('soccer') || l === 'mls') return 'soccer';
  if (l.includes('tennis')) return 'tennis';
  if (l.includes('mma') || l.includes('ufc') || l.includes('boxing')) return 'mma';
  return 'other';
}

// Odds API sport key map
export function oddsApiSportKey(league: string): string {
  const m: Record<string, string> = {
    'NFL': 'americanfootball_nfl',
    'NBA': 'basketball_nba',
    'WNBA': 'basketball_wnba',
    'NHL': 'icehockey_nhl',
    'MLB': 'baseball_mlb',
    'NCAA Basketball': 'basketball_ncaab',
    'College Football': 'americanfootball_ncaaf',
    'Soccer - EPL': 'soccer_epl',
    'Soccer - La Liga': 'soccer_spain_la_liga',
    'Soccer - Bundesliga': 'soccer_germany_bundesliga1',
    'Soccer - Serie A': 'soccer_italy_serie_a',
    'Soccer - Champions League': 'soccer_uefa_champs_league',
    'Soccer - MLS': 'soccer_usa_mls',
    'Tennis - ATP': 'tennis_atp_french_open',
    'Tennis - WTA': 'tennis_wta_french_open',
    'MMA - UFC': 'mma_mixed_martial_arts',
  };
  return m[league] || '';
}

export async function getAdvancedSportsSignals(args: {
  league: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  /** 'home' | 'away' — the side the engine chose */
  side: 'home' | 'away';
  /** today's date string YYYY-MM-DD */
  gameDate: string;
  /** posted total line (null if no total) */
  postedTotal?: number | null;
  /** refs — NBA / soccer match officials */
  officials?: string[];
  /** umpire name — MLB */
  umpireName?: string | null;
  /** current tournament name — tennis */
  currentTournament?: string;
}): Promise<AdvancedSportsResult> {
  const {
    league, homeTeamId, homeTeamName, awayTeamId, awayTeamName,
    side, gameDate, postedTotal, officials = [], umpireName, currentTournament,
  } = args;

  const sportGroup = sportGroupFor(league);
  const pickedTeamId = side === 'home' ? homeTeamId : awayTeamId;
  const pickedTeamName = side === 'home' ? homeTeamName : awayTeamName;
  const oppTeamId = side === 'home' ? awayTeamId : homeTeamId;
  const oppTeamName = side === 'home' ? awayTeamName : homeTeamName;

  const allBullets: string[] = [];
  const h2hBullets: string[] = [];
  const venueBullets: string[] = [];
  const sportBullets: string[] = [];
  let scoreAdj = 0;

  // ─── H2H tendencies (all sports) ─────────────────────────────────────────
  try {
    const h2h = await getH2HTendencies(league, homeTeamId, homeTeamName, awayTeamId, awayTeamName, postedTotal ?? null);

    if (h2h) {
      const h2hCount = h2h.h2h.meetings.length;

      // H2H win rate for picked side: teamA = home team
      const h2hWinRate = side === 'home' ? h2h.h2h.teamAWinRate : (100 - h2h.h2h.teamAWinRate);
      if (h2hCount >= 4) {
        if (h2hWinRate >= 70) { scoreAdj += 5; }
        else if (h2hWinRate >= 60) { scoreAdj += 3; }
        else if (h2hWinRate <= 35) { scoreAdj -= 4; }
        else if (h2hWinRate <= 45) { scoreAdj -= 2; }
      }

      // Total tendency vs posted line
      if (h2h.h2h.avgTotal > 0 && postedTotal != null && h2hCount >= 4) {
        const totalEdge = h2h.h2h.avgTotal - postedTotal;
        if (totalEdge >= 3) { scoreAdj += 3; }
        else if (totalEdge <= -3) { scoreAdj += 2; }
      }

      // Surface the H2H bullets
      if (h2h.h2hBullets?.length) {
        h2hBullets.push(...h2h.h2hBullets);
        allBullets.push(...h2h.h2hBullets);
      }

      // Venue bullets: use venueBullets from h2h result if populated
      if (h2h.venueBullets?.length) {
        venueBullets.push(...h2h.venueBullets);
        allBullets.push(...h2h.venueBullets);
      }
    }
  } catch (e) {
    // H2H failures are non-fatal
  }

  // ─── NHL ─────────────────────────────────────────────────────────────────
  if (sportGroup === 'nhl') {
    try {
      const nhl = await getNHLMatchupSignals(homeTeamName, awayTeamName, gameDate);
      if (nhl) {
        const pickedGoalie = side === 'home' ? nhl.homeGoalie : nhl.awayGoalie;
        const oppGoalie = side === 'home' ? nhl.awayGoalie : nhl.homeGoalie;

        // Special teams edge
        if (nhl.specialTeamsEdge >= 3) { scoreAdj += 5; }
        else if (nhl.specialTeamsEdge >= 1) { scoreAdj += 3; }
        else if (nhl.specialTeamsEdge <= -3) { scoreAdj -= 5; }
        else if (nhl.specialTeamsEdge <= -1) { scoreAdj -= 3; }

        // PDO regression
        const oppOverperforming = side === 'home' ? nhl.pdoRegression.awayOverperforming : nhl.pdoRegression.homeOverperforming;
        const pickedUnderperforming = side === 'home' ? nhl.pdoRegression.homeUnderperforming : nhl.pdoRegression.awayUnderperforming;
        if (oppOverperforming) scoreAdj += 3; // opp PDO > 102, regression due = good for us
        if (pickedUnderperforming) scoreAdj += 2; // we're underperforming PDO = bounce-back due

        // Shot differential edge (home = positive)
        const shotEdge = side === 'home' ? nhl.shotEdge : -nhl.shotEdge;
        if (shotEdge >= 4) { scoreAdj += 3; }
        else if (shotEdge <= -4) { scoreAdj -= 3; }

        // B2B goalie penalty
        if (oppGoalie?.startedYesterday) { scoreAdj += 4; }
        if (pickedGoalie?.startedYesterday) { scoreAdj -= 4; }

        // Schedule fatigue — scheduleEdge.restAdvantage
        if (nhl.scheduleEdge.restAdvantage === (side === 'home' ? 'home' : 'away')) scoreAdj += 2;
        else if (nhl.scheduleEdge.restAdvantage !== 'even') scoreAdj -= 2;

        sportBullets.push(...nhl.bullets);
        allBullets.push(...nhl.bullets);
      }
    } catch (e) { /* non-fatal */ }
  }

  // ─── NBA / WNBA ───────────────────────────────────────────────────────────
  if (sportGroup === 'nba' || sportGroup === 'wnba') {
    try {
      const [nba, refImpact] = await Promise.all([
        getNBAMatchupSignals(homeTeamId, homeTeamName, awayTeamId, awayTeamName),
        Promise.resolve(officials.length ? getNBARefereeImpact(officials) : null),
      ]);

      if (nba) {
        const picked = side === 'home' ? nba.home : nba.away;
        const opp = side === 'home' ? nba.away : nba.home;

        // Net rating edge
        const netEdge = side === 'home' ? nba.netRatingEdge : -nba.netRatingEdge;
        if (netEdge >= 8) scoreAdj += 6;
        else if (netEdge >= 4) scoreAdj += 3;
        else if (netEdge <= -8) scoreAdj -= 6;
        else if (netEdge <= -4) scoreAdj -= 3;

        // Q4 clutch
        const clutchEdge = side === 'home' ? nba.clutchEdge : -nba.clutchEdge;
        if (clutchEdge >= 4) scoreAdj += 4;
        else if (clutchEdge <= -4) scoreAdj -= 4;

        // Pace (affects totals confidence mostly, small side adj)
        if (nba.paceScore >= 103 && postedTotal) scoreAdj += 1;

        // Turnover edge
        if (picked.turnoverDiff >= 3) scoreAdj += 2;
        else if (picked.turnoverDiff <= -3) scoreAdj -= 2;

        sportBullets.push(...nba.bullets);
        allBullets.push(...nba.bullets);
      }

      if (refImpact) {
        if (refImpact.overLean) { scoreAdj += 2; }
        else if (refImpact.underLean) { scoreAdj += 1; } // slight edge knowing total direction
        if (refImpact.matchedRefs.length) {
          sportBullets.push(`Ref tendency: ${refImpact.matchedRefs.join('; ')}. FTA boost: ${refImpact.avgFtaBoost > 0 ? '+' : ''}${refImpact.avgFtaBoost}.`);
          allBullets.push(sportBullets[sportBullets.length - 1]);
        }
      }
    } catch (e) { /* non-fatal */ }
  }

  // ─── NFL / NCAA Football ──────────────────────────────────────────────────
  if (sportGroup === 'nfl' || sportGroup === 'ncaa_football') {
    try {
      const nfl = await getNFLMatchupSignals(
        homeTeamId, homeTeamName, awayTeamId, awayTeamName,
      );
      if (nfl) {
        const picked = side === 'home' ? nfl.home : nfl.away;
        const opp = side === 'home' ? nfl.away : nfl.home;

        // Red zone TD rate
        if (picked.redZoneTdPct - opp.redZoneTdPct >= 0.10) scoreAdj += 3;
        else if (opp.redZoneTdPct - picked.redZoneTdPct >= 0.10) scoreAdj -= 3;

        // Turnover differential
        const toEdge = picked.turnoverDiffPerGame - opp.turnoverDiffPerGame;
        if (toEdge >= 0.8) scoreAdj += 4;
        else if (toEdge <= -0.8) scoreAdj -= 4;

        // Bye week rest bonus
        if (picked.comingOffBye) scoreAdj += 4;
        if (opp.comingOffBye) scoreAdj -= 3;

        sportBullets.push(...nfl.bullets);
        allBullets.push(...nfl.bullets);
      }
    } catch (e) { /* non-fatal */ }
  }

  // ─── MLB ─────────────────────────────────────────────────────────────────
  if (sportGroup === 'mlb') {
    try {
      const [homeRISP, awayRISP] = await Promise.all([
        getTeamRISP(homeTeamId, homeTeamName),
        getTeamRISP(awayTeamId, awayTeamName),
      ]);

      const mlbBullets = buildMLBContextBullets(homeTeamName, homeRISP, awayRISP, umpireName, postedTotal);
      if (mlbBullets.length) {
        sportBullets.push(...mlbBullets);
        allBullets.push(...mlbBullets);
      }

      // Park factor confidence adjustment (totals lean)
      const parkAdj = parkRunAdjustment(homeTeamName);
      if (Math.abs(parkAdj) >= 0.3) {
        // Park factor affects totals lean — tiny pick-side boost since we should have picked right side
        scoreAdj += Math.round(parkAdj * 2);
      }

      // Umpire tendency
      const ump = umpireName ? getUmpireTendency(umpireName) : null;
      if (ump) {
        if (Math.abs(ump.runFactor) >= 0.4) scoreAdj += 2; // knowing the ump lean = small edge
      }

      // Clutch hitting for picked side
      const pickedRISP = side === 'home' ? homeRISP : awayRISP;
      if (pickedRISP && pickedRISP.clutchRating >= 0.035) scoreAdj += 3;
      else if (pickedRISP && pickedRISP.clutchRating <= -0.035) scoreAdj -= 3;

      // Opponent chokes with RISP = more runs for us
      const oppRISP = side === 'home' ? awayRISP : homeRISP;
      if (oppRISP && oppRISP.clutchRating <= -0.035) scoreAdj += 2;
    } catch (e) { /* non-fatal */ }
  }

  // ─── Soccer ──────────────────────────────────────────────────────────────
  if (sportGroup === 'soccer') {
    try {
      const soccer = await getSoccerMatchupSignals(
        league, homeTeamId, homeTeamName, awayTeamId, awayTeamName,
      );
      if (soccer) {
        // BTTS signal
        if (soccer.combinedBttsRate >= 65) scoreAdj += 4;
        else if (soccer.combinedBttsRate <= 35) scoreAdj += 3; // clean sheet likely — lean under/spread

        // Over 2.5 signal
        if (soccer.combinedOver25Rate >= 65) scoreAdj += 3;
        else if (soccer.combinedOver25Rate <= 30) scoreAdj += 2;

        // Midweek fatigue
        const picked = side === 'home' ? soccer.home : soccer.away;
        const opp = side === 'home' ? soccer.away : soccer.home;
        if (picked.playedMidweekEurope) scoreAdj -= 4;
        if (opp.playedMidweekEurope) scoreAdj += 3;

        // Form momentum
        if (picked.last5Points >= 12) scoreAdj += 3;
        else if (picked.last5Points <= 4) scoreAdj -= 3;

        sportBullets.push(...soccer.bullets);
        allBullets.push(...soccer.bullets);
      }
    } catch (e) { /* non-fatal */ }
  }

  // ─── Tennis ──────────────────────────────────────────────────────────────
  if (sportGroup === 'tennis') {
    try {
      const tour = league.toLowerCase().includes('wta') ? 'wta' : 'atp';
      const tennis = await getTennisMatchupSignals(
        tour, homeTeamId, homeTeamName, awayTeamId, awayTeamName, currentTournament ?? '',
      );
      if (tennis) {
        // playerA = home team, playerB = away team
        const picked = side === 'home' ? tennis.playerA : tennis.playerB;
        const opp = side === 'home' ? tennis.playerB : tennis.playerA;

        // Surface edge — surfaceEdge.player names the favored player; differential is the gap
        if (tennis.surfaceEdge) {
          const pickedHasEdge = tennis.surfaceEdge.player === pickedTeamName;
          const diff = tennis.surfaceEdge.differential;
          if (pickedHasEdge && diff >= 0.15) scoreAdj += 6;
          else if (pickedHasEdge && diff >= 0.08) scoreAdj += 3;
          else if (!pickedHasEdge && diff >= 0.15) scoreAdj -= 6;
          else if (!pickedHasEdge && diff >= 0.08) scoreAdj -= 3;
        }

        // Fatigue
        if (picked.setsPlayedLast3Days >= 5) scoreAdj -= 3;
        if (opp.setsPlayedLast3Days >= 5) scoreAdj += 2;

        sportBullets.push(...tennis.bullets);
        allBullets.push(...tennis.bullets);
      }
    } catch (e) { /* non-fatal */ }
  }

  // ─── MMA / Boxing ─────────────────────────────────────────────────────────
  if (sportGroup === 'mma') {
    try {
      const mma = await getMMAMatchupSignals(
        homeTeamId, homeTeamName, awayTeamId, awayTeamName,
      );
      if (mma) {
        // fighterA = home fighter, fighterB = away fighter
        const picked = side === 'home' ? mma.fighterA : mma.fighterB;
        const opp = side === 'home' ? mma.fighterB : mma.fighterA;

        // Ring rust
        if (picked.isRusty) scoreAdj -= 4;
        if (opp.isRusty) scoreAdj += 3;

        // Recent KO loss (chin questionable)
        if (picked.recentKoLoss) scoreAdj -= 3;
        if (opp.recentKoLoss) scoreAdj += 2;

        // Finishing rate for picked fighter
        if (picked.koFinishPct >= 55) scoreAdj += 2;

        sportBullets.push(...mma.bullets);
        allBullets.push(...mma.bullets);
      }
    } catch (e) { /* non-fatal */ }
  }

  // ─── Situational ATS (all NA sports) ─────────────────────────────────────
  if (['nhl', 'nba', 'wnba', 'nfl', 'mlb', 'ncaa_basketball', 'ncaa_football'].includes(sportGroup)) {
    try {
      const [pickedSit, oppSit] = await Promise.all([
        getSituationalProfile(league, pickedTeamId, pickedTeamName, oppTeamName),
        getSituationalProfile(league, oppTeamId, oppTeamName, pickedTeamName),
      ]);

      if (pickedSit && oppSit) {
        const pickedIsFav = side === 'home'
          ? pickedSit.atsAsFavorite.total > pickedSit.atsAsUnderdog.total
          : pickedSit.atsAsUnderdog.total >= pickedSit.atsAsFavorite.total;
        const sitBullets = buildSituationalBullets(pickedSit, oppSit, league, side === 'home', pickedIsFav);
        if (sitBullets.length) {
          sportBullets.push(...sitBullets);
          allBullets.push(...sitBullets);
        }

        // B2B penalty — atsBackToBack.pct is win pct after back-to-back rest
        if (pickedSit.isBackToBack) scoreAdj -= 3;
        if (oppSit.isBackToBack) scoreAdj += 3;

        // Bounce-back after loss
        if (pickedSit.lastGameWon === false && pickedSit.atsAfterLoss.pct >= 58 && pickedSit.atsAfterLoss.total >= 5) scoreAdj += 3;
        if (pickedSit.lastGameWon === true && pickedSit.atsAfterWin.pct >= 62 && pickedSit.atsAfterWin.total >= 5) scoreAdj += 2;

        // Bye week / extended rest
        if (pickedSit.daysRest >= 7 && pickedSit.atsOff7PlusDays.pct >= 60 && pickedSit.atsOff7PlusDays.total >= 4) scoreAdj += 3;
        if (oppSit.daysRest >= 7 && oppSit.atsOff7PlusDays.pct >= 60 && oppSit.atsOff7PlusDays.total >= 4) scoreAdj -= 2;

        // Dog / fave role ATS
        if (pickedSit.atsAsUnderdog.pct >= 58 && pickedSit.atsAsUnderdog.total >= 6) scoreAdj += 3;
        if (pickedSit.atsAsFavorite.pct <= 40 && pickedSit.atsAsFavorite.total >= 6) scoreAdj -= 3;
      }
    } catch (e) { /* non-fatal */ }
  }

  // Cap total score adjustment from advanced signals at ±15 to avoid dominating the model.
  scoreAdj = Math.max(-15, Math.min(15, scoreAdj));

  return { scoreAdj, bullets: allBullets, h2hBullets, venueBullets, sportBullets };
}
