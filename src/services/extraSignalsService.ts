// EXTRA-SIGNALS ENRICHMENT
//
// Single entry-point that pulls every supplementary edge signal we have — refs,
// late scratches, public money, line velocity, advanced stats, player matchup —
// and returns:
//   1. confidenceDelta — apply to pick.confidenceScore
//   2. extraReasonsFor / extraReasonsAgainst — append to the breakdown
//   3. lateScratchAlert — if our pick is broken, force a re-review
//
// All sub-fetches are best-effort; any failure returns dataAvailable: false and
// the engine's existing scoring is unchanged.

import { getRefereeTendency } from './refereeService';
import { detectLateScratches } from './lateScratchService';
import { getPlayerMatchup } from './playerMatchupService';
import { getPublicMoney, evaluatePublicPosture } from './publicMoneyService';
import { getVelocity, type OddsSnapshot } from './lineMovementService';
import { getAdvancedPitcher, nudgeFromAdvancedStats } from './advancedStatsService';
import { getGameProbableGoalies, getGoaltenderProfile } from './goaltenderMatchupService';
import { compareTeamsXG, nhlNameToAbbrev } from './moneyPuckService';
import { getUmpireTendency } from './umpireScorecardService';
import { getParkFactorByHomeTeam, parkRunsNudge } from './parkFactorsService';
import { getVenue, venueScoringNudge, altitudeVisitorPenalty, environmentNudge } from './venueFactorsService';
import { computeTravelFatigue } from './travelFatigueService';
import { getDevigForGame, computeDevigEdge } from './devigService';
import { getMinutesRestrictionsForTeam, flaggedStarsWithRestrictions } from './minutesRestrictionService';
import { getBullpenExhaustion } from './lineupAndBullpenService';
import { getPostedLineup } from './lineupAndBullpenService';
import { getLineupBvp, summarizeLineupBvp, bvpConfidenceNudge } from './batterVsPitcherService';
import { getTeamSeasonRates, getPitcherEnhancedStats } from './mlbStatsService';

// Inline probable-pitcher lookup by gamePk. The existing mlbStatsService only
// exposes a date-wide schedule; for BvP we need a per-game probe.
async function getProbablesByGamePk(gamePk: number): Promise<{
  homePitcherId: number | null; awayPitcherId: number | null;
  homePitcherName: string; awayPitcherName: string;
} | null> {
  try {
    const r = await fetch(`https://statsapi.mlb.com/api/v1/schedule?gamePk=${gamePk}&hydrate=probablePitcher`, { cache: 'no-store' });
    if (!r.ok) return null;
    const data: any = await r.json();
    const game = data?.dates?.[0]?.games?.[0];
    if (!game) return null;
    const home = game?.teams?.home?.probablePitcher;
    const away = game?.teams?.away?.probablePitcher;
    return {
      homePitcherId: home?.id ? Number(home.id) : null,
      awayPitcherId: away?.id ? Number(away.id) : null,
      homePitcherName: home?.fullName || '',
      awayPitcherName: away?.fullName || '',
    };
  } catch { return null; }
}

export interface ExtraSignalsResult {
  confidenceDelta: number;
  reasonsFor: string[];
  reasonsAgainst: string[];
  lateScratchAlert: { affected: boolean; players: string[] } | null;
  // Surface for the admin/back-office view; never displayed to customers raw.
  diagnostics: Record<string, unknown>;
}

const EMPTY: ExtraSignalsResult = {
  confidenceDelta: 0, reasonsFor: [], reasonsAgainst: [], lateScratchAlert: null, diagnostics: {},
};

export interface ExtraSignalsInput {
  gameId: string;
  league: string;
  marketType: string;           // moneyline / runline / spread / total / first 5 / etc.
  pickedSide: 'home' | 'away';
  pickedTeamId?: string;
  oppTeamId?: string;
  pickedTeamName?: string;
  oppTeamName?: string;
  // 2026-06-04: needed for venue + travel-fatigue lookups across all sports.
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamAbbr?: string;
  awayTeamAbbr?: string;
  homeKeyPlayerNames?: string[];
  awayKeyPlayerNames?: string[];
  mlbHomeTeamStatsApiId?: number;
  mlbAwayTeamStatsApiId?: number;
  mlbGamePk?: number;           // MLB Stats API gamePk — enables lineup + BvP
  gameStartUtc?: string;
  modelProjectedWinProb?: number; // 0-1, our model's probability for the picked side
  keyPlayerNames?: string[];    // star players on our side; used by late-scratch
  isTotalsPick?: boolean;       // referee crew adjusts totals only
  isOver?: boolean;             // direction of total pick
  currentOdds?: OddsSnapshot;   // for velocity vs recent snapshot
  pitcherProbableName?: string; // MLB — to fetch advanced stats
  isPickedPitcher?: boolean;    // true when our pick favors the pitcher's team or the under
}

export async function enrichWithExtraSignals(input: ExtraSignalsInput): Promise<ExtraSignalsResult> {
  const reasonsFor: string[] = [];
  const reasonsAgainst: string[] = [];
  let confidenceDelta = 0;
  const diagnostics: Record<string, unknown> = {};
  let lateScratchAlert: ExtraSignalsResult['lateScratchAlert'] = null;

  await Promise.allSettled([
    // 1. REFEREE / UMPIRE (only when this pick involves a total)
    (async () => {
      if (!input.isTotalsPick) return;
      const ref = await getRefereeTendency(input.gameId, input.league);
      diagnostics.referees = ref;
      if (!ref.dataAvailable || ref.totalsAdjustment == null) return;
      if (ref.totalsAdjustment >= 1 && input.isOver) {
        reasonsFor.push(`Ref crew tilts to the over — ${ref.reason}`);
        confidenceDelta += 2;
      } else if (ref.totalsAdjustment >= 1 && !input.isOver) {
        reasonsAgainst.push(`Ref crew tilts to the over historically — fighting the crew here.`);
        confidenceDelta -= 2;
      } else if (ref.totalsAdjustment <= -1 && !input.isOver) {
        reasonsFor.push(`Ref crew tilts to the under — ${ref.reason}`);
        confidenceDelta += 2;
      } else if (ref.totalsAdjustment <= -1 && input.isOver) {
        reasonsAgainst.push(`Ref crew tilts to the under historically — fighting the crew here.`);
        confidenceDelta -= 2;
      }
    })(),

    // 2. LATE SCRATCH WATCHER
    (async () => {
      const ls = await detectLateScratches(input.gameId, input.league, input.keyPlayerNames || []);
      diagnostics.lateScratches = ls;
      if (ls.reason) {
        const hitOurSide = (input.keyPlayerNames || []).some((n) =>
          ls.scratches.some((s) => s.status === 'OUT' && s.playerName.toLowerCase() === n.toLowerCase()),
        );
        if (hitOurSide) {
          reasonsAgainst.push(ls.reason);
          confidenceDelta -= 8;
          lateScratchAlert = {
            affected: true,
            players: ls.scratches.filter((s) => s.status === 'OUT').map((s) => s.playerName),
          };
        } else {
          reasonsFor.push(ls.reason);
        }
      }
    })(),

    // 3. PUBLIC MONEY POSTURE
    (async () => {
      const pm = await getPublicMoney(input.gameId, input.league);
      diagnostics.publicMoney = pm;
      const verdict = evaluatePublicPosture(pm, input.pickedSide);
      if (verdict.reasonFor) reasonsFor.push(verdict.reasonFor);
      if (verdict.reasonAgainst) reasonsAgainst.push(verdict.reasonAgainst);
      confidenceDelta += verdict.scoreDelta;
    })(),

    // 4. LINE VELOCITY — steam-move detection
    (async () => {
      if (!input.currentOdds) return;
      const vel = await getVelocity(input.gameId, input.currentOdds, input.pickedSide, 15);
      diagnostics.velocity = vel;
      if (!vel.hasRecent) return;
      if (vel.mlDeltaForSide >= 10) {
        reasonsFor.push(`Line moved ${vel.mlDeltaForSide}¢ TOWARD our side in the last ${vel.sinceMinutes}min — sharp action just hit.`);
        confidenceDelta += 3;
      } else if (vel.mlDeltaForSide <= -10) {
        reasonsAgainst.push(`Line moved ${Math.abs(vel.mlDeltaForSide)}¢ AWAY from our side in the last ${vel.sinceMinutes}min — sharps fading.`);
        confidenceDelta -= 3;
      }
      if (vel.spreadDeltaForSide >= 1) {
        reasonsFor.push(`Spread moved ${vel.spreadDeltaForSide.toFixed(1)} pts toward our side in the last ${vel.sinceMinutes}min — sharp money chasing.`);
        confidenceDelta += 2;
      } else if (vel.spreadDeltaForSide <= -1) {
        reasonsAgainst.push(`Spread moved ${Math.abs(vel.spreadDeltaForSide).toFixed(1)} pts away in the last ${vel.sinceMinutes}min.`);
        confidenceDelta -= 2;
      }
      if (vel.isSteamMove) {
        diagnostics.steamMove = true;
      }
    })(),

    // 5. PLAYER MATCHUP — only fires when keyPlayerNames is provided (NBA/WNBA mainly)
    // FIX 2026-06-05 (audit dead-block #5): the service requires a real athleteId,
    // and the caller passed empty string → every fetch 404'd. Skip block entirely
    // until name-to-id resolution is implemented. Was silently dead, now silently
    // skipped (no fake "no data" effect). Diagnostic marker so we can see it.
    (async () => {
      const names = input.keyPlayerNames || [];
      if (names.length === 0 || !input.oppTeamId || !input.oppTeamName) return;
      diagnostics.playerMatchupStatus = 'skipped:no-id-resolver';
    })(),

    // 6. ADVANCED SABERMETRIC — MLB only, on the pitcher we're betting on
    (async () => {
      if (input.league !== 'MLB' || !input.pitcherProbableName) return;
      const adv = await getAdvancedPitcher(input.pitcherProbableName);
      diagnostics.advanced = adv;
      if (!adv) return;
      const nudge = nudgeFromAdvancedStats(adv);
      if (nudge.reason) {
        if (input.isPickedPitcher) {
          if (nudge.delta > 0) {
            reasonsFor.push(nudge.reason);
            confidenceDelta += nudge.delta;
          } else if (nudge.delta < 0) {
            reasonsAgainst.push(nudge.reason);
            confidenceDelta += nudge.delta;
          }
        } else {
          // If we're betting AGAINST this pitcher, flip the sign.
          if (nudge.delta > 0) {
            reasonsAgainst.push(nudge.reason);
            confidenceDelta -= nudge.delta;
          } else if (nudge.delta < 0) {
            reasonsFor.push(nudge.reason);
            confidenceDelta -= nudge.delta;
          }
        }
      }
    })(),

    // 7. NHL GOALTENDER MATCHUP — owner directive 2026-06-03: wire the dormant
    // goaltenderMatchupService into NHL game scoring. Better goalie on our side
    // = positive nudge; on opponent's side = negative.
    (async () => {
      if (input.league !== 'NHL') return;
      try {
        const probables = await getGameProbableGoalies(input.gameId);
        if (!probables) return;
        const ourSideGoalie = input.pickedSide === 'home' ? probables.homeGoalie : probables.awayGoalie;
        const oppSideGoalie = input.pickedSide === 'home' ? probables.awayGoalie : probables.homeGoalie;
        if (!ourSideGoalie?.id || !oppSideGoalie?.id) return;
        const [ours, opp] = await Promise.all([
          getGoaltenderProfile(ourSideGoalie.id),
          getGoaltenderProfile(oppSideGoalie.id),
        ]);
        diagnostics.goaltenders = { ours, opp };
        if (!ours || !opp) return;
        // Compare season save percentages.
        const ourSv = ours.seasonSavePct ?? ours.l5SavePct;
        const oppSv = opp.seasonSavePct ?? opp.l5SavePct;
        if (ourSv == null || oppSv == null) return;
        const gap = ourSv - oppSv;
        if (gap >= 0.015) {
          confidenceDelta += 3;
          reasonsFor.push(`${ours.name} (${(ourSv * 100).toFixed(1)}% SV) has the goaltending edge over ${opp.name} (${(oppSv * 100).toFixed(1)}% SV).`);
        } else if (gap <= -0.015) {
          confidenceDelta -= 3;
          reasonsAgainst.push(`${opp.name} (${(oppSv * 100).toFixed(1)}% SV) outperforms ${ours.name} (${(ourSv * 100).toFixed(1)}% SV) in net — goalie edge favors the opponent.`);
        }
      } catch { /* best-effort */ }
    })(),

    // 8a. MLB UMPIRE TENDENCY — only for totals picks.
    (async () => {
      if (!input.isTotalsPick) return;
      if (input.league !== 'MLB') return;
      try {
        const ump = await getUmpireTendency(input.gameId);
        if (!ump || ump.sample < 5) return;
        diagnostics.umpire = ump;
        if (ump.totalsLean === 'over' && input.isOver) {
          confidenceDelta += 2;
          reasonsFor.push(`HP ump ${ump.umpName} leans Over historically (+${ump.runsLeanPerGame?.toFixed(2)} R/game).`);
        } else if (ump.totalsLean === 'over' && !input.isOver) {
          confidenceDelta -= 2;
          reasonsAgainst.push(`HP ump ${ump.umpName} historically pumps runs — fighting the zone here.`);
        } else if (ump.totalsLean === 'under' && !input.isOver) {
          confidenceDelta += 2;
          reasonsFor.push(`HP ump ${ump.umpName} leans Under historically (${ump.runsLeanPerGame?.toFixed(2)} R/game).`);
        } else if (ump.totalsLean === 'under' && input.isOver) {
          confidenceDelta -= 2;
          reasonsAgainst.push(`HP ump ${ump.umpName} historically suppresses runs — fighting the zone here.`);
        }
      } catch { /* best-effort */ }
    })(),

    // 8. NHL MONEYPUCK xG / EXPECTED GOALS — owner directive 2026-06-04.
    // 5-on-5 underlying play is the truth; scoreboard outcomes regress to xG.
    // Our pick gets a nudge when our side has the xG-share edge or when the
    // opponent has been riding hot shooting that's due to regress.
    (async () => {
      if (input.league !== 'NHL') return;
      const homeAbbrev = nhlNameToAbbrev(input.pickedSide === 'home' ? input.pickedTeamName : input.oppTeamName);
      const awayAbbrev = nhlNameToAbbrev(input.pickedSide === 'home' ? input.oppTeamName : input.pickedTeamName);
      if (!homeAbbrev || !awayAbbrev) return;
      try {
        const cmp = await compareTeamsXG(homeAbbrev, awayAbbrev);
        if (!cmp) return;
        diagnostics.moneyPuck = cmp;
        const ourXg = input.pickedSide === 'home' ? cmp.homeXgPct : cmp.awayXgPct;
        const oppXg = input.pickedSide === 'home' ? cmp.awayXgPct : cmp.homeXgPct;
        const xgGap = ourXg - oppXg;
        if (xgGap >= 0.04) {
          confidenceDelta += 2;
          reasonsFor.push(`Underlying 5-on-5 xG favors our side ${(ourXg * 100).toFixed(1)}% vs ${(oppXg * 100).toFixed(1)}%.`);
        } else if (xgGap <= -0.04) {
          confidenceDelta -= 2;
          reasonsAgainst.push(`Underlying xG share favors the opponent ${(oppXg * 100).toFixed(1)}% vs ${(ourXg * 100).toFixed(1)}% — fighting the run-of-play.`);
        }
        // Shooting variance flag: opp running hot is a regression tailwind for us.
        const oppHotCold = input.pickedSide === 'home' ? cmp.awayHotCold : cmp.homeHotCold;
        if (oppHotCold === 'hot') {
          confidenceDelta += 1;
          reasonsFor.push(`Opponent has been finishing above expected — shooting regression flag.`);
        } else if (oppHotCold === 'cold') {
          confidenceDelta -= 1;
          reasonsAgainst.push(`Opponent has been finishing below expected — positive variance flag for them.`);
        }
      } catch { /* best-effort */ }
    })(),

    // 9. MLB PARK FACTORS — adjust totals projection by the home park's
    // run scoring index (Coors +30%, Petco -18%).
    (async () => {
      if (input.league !== 'MLB' || !input.isTotalsPick) return;
      const home = input.homeTeamName || (input.pickedSide === 'home' ? input.pickedTeamName : input.oppTeamName);
      if (!home) return;
      const park = getParkFactorByHomeTeam(home);
      if (!park) return;
      diagnostics.park = park;
      const runsNudge = parkRunsNudge(park);
      if (runsNudge >= 0.6) {
        if (input.isOver) {
          confidenceDelta += 3;
          reasonsFor.push(`${park.parkName} plays +${runsNudge.toFixed(1)} runs vs neutral — pumps totals.`);
        } else {
          confidenceDelta -= 3;
          reasonsAgainst.push(`${park.parkName} is a launching pad (+${runsNudge.toFixed(1)} R vs neutral) — fighting the park here.`);
        }
      } else if (runsNudge <= -0.6) {
        if (!input.isOver) {
          confidenceDelta += 3;
          reasonsFor.push(`${park.parkName} suppresses scoring by ${Math.abs(runsNudge).toFixed(1)} R — fits the Under.`);
        } else {
          confidenceDelta -= 3;
          reasonsAgainst.push(`${park.parkName} suppresses scoring by ${Math.abs(runsNudge).toFixed(1)} R — fighting the park here.`);
        }
      }
    })(),

    // 10. NBA / WNBA / NFL / NHL VENUE — altitude + environment + scoring index.
    (async () => {
      const supported = ['NBA','WNBA','NFL','NHL'];
      if (!supported.includes(input.league)) return;
      const home = input.homeTeamName || (input.pickedSide === 'home' ? input.pickedTeamName : input.oppTeamName);
      const homeAbbr = input.homeTeamAbbr || home || '';
      if (!homeAbbr) return;
      const venue = getVenue(input.league as any, homeAbbr);
      if (!venue) return;
      diagnostics.venue = venue;

      // Altitude penalty for the VISITING team.
      // FIX 2026-06-05 (audit #3): added missing branches for under-on-visitor
      // (altitude suppresses scoring → support Under), totals-on-home (Over at
      // hitter-friendly altitude). Previous code only handled visitor-Over and
      // visitor-side / home-side bets; Coors Unders and altitude-Overs were silent.
      const visitorAlt = altitudeVisitorPenalty(venue);
      if (visitorAlt.visitorScoringNudge !== 0 && visitorAlt.reason) {
        const isVisitorBet = input.pickedSide === 'away';
        if (isVisitorBet) {
          if (input.isTotalsPick && input.isOver) { confidenceDelta -= 2; reasonsAgainst.push(visitorAlt.reason); }
          else if (input.isTotalsPick && !input.isOver) { confidenceDelta += 2; reasonsFor.push(`${visitorAlt.reason} — supports Under.`); }
          else if (!input.isTotalsPick) { confidenceDelta -= 1; reasonsAgainst.push(visitorAlt.reason); }
        } else {
          if (input.isTotalsPick && input.isOver) { confidenceDelta += 2; reasonsFor.push(`${visitorAlt.reason} — supports Over (high-altitude park).`); }
          else if (input.isTotalsPick && !input.isOver) { confidenceDelta -= 1; reasonsAgainst.push(`High-altitude park works against Under.`); }
          else if (!input.isTotalsPick) { confidenceDelta += 1; reasonsFor.push(visitorAlt.reason); }
        }
      }

      // Environment (dome / cold / wind / warm-ice)
      const env = environmentNudge(venue, new Date().getUTCMonth());
      if (env.totalNudge !== 0 && env.reason && input.isTotalsPick) {
        if ((input.isOver && env.totalNudge > 0) || (!input.isOver && env.totalNudge < 0)) {
          confidenceDelta += 2;
          reasonsFor.push(env.reason);
        } else if ((input.isOver && env.totalNudge < 0) || (!input.isOver && env.totalNudge > 0)) {
          confidenceDelta -= 2;
          reasonsAgainst.push(env.reason);
        }
      }

      // Generic scoring index nudge (1.5+ points either direction = real)
      const sNudge = venueScoringNudge(venue);
      if (input.isTotalsPick && Math.abs(sNudge) >= 1.5) {
        if (input.isOver && sNudge > 0) { confidenceDelta += 2; reasonsFor.push(`${venue.venueName} runs ${sNudge.toFixed(1)} pts above neutral.`); }
        else if (!input.isOver && sNudge < 0) { confidenceDelta += 2; reasonsFor.push(`${venue.venueName} runs ${Math.abs(sNudge).toFixed(1)} pts below neutral.`); }
        else if (input.isOver && sNudge < 0) { confidenceDelta -= 2; reasonsAgainst.push(`${venue.venueName} runs ${Math.abs(sNudge).toFixed(1)} pts below neutral.`); }
        else if (!input.isOver && sNudge > 0) { confidenceDelta -= 2; reasonsAgainst.push(`${venue.venueName} runs ${sNudge.toFixed(1)} pts above neutral.`); }
      }
    })(),

    // 11. TRAVEL FATIGUE — body-clock + long-haul cross-country penalty.
    (async () => {
      const homeAbbr = input.homeTeamAbbr;
      const awayAbbr = input.awayTeamAbbr;
      if (!homeAbbr || !awayAbbr || !input.gameStartUtc) return;
      const fatigue = computeTravelFatigue({
        visitingTeamAbbr: awayAbbr,
        homeTeamAbbr: homeAbbr,
        gameStartUtc: input.gameStartUtc,
        league: input.league,
      });
      diagnostics.travel = fatigue;
      if (fatigue.scoringNudge === 0) return;
      const isVisitorBet = input.pickedSide === 'away';
      // scoringNudge is NEGATIVE = bad for visitor offense.
      if (isVisitorBet && !input.isTotalsPick) {
        confidenceDelta += Math.round(fatigue.scoringNudge);  // adds negative
        for (const r of fatigue.reasonsAgainst) reasonsAgainst.push(r);
      } else if (!isVisitorBet && !input.isTotalsPick) {
        confidenceDelta += Math.round(-fatigue.scoringNudge / 2);
        for (const r of fatigue.reasonsFor) reasonsFor.push(r);
      } else if (input.isTotalsPick && !input.isOver && fatigue.scoringNudge < -1) {
        confidenceDelta += 1;
        reasonsFor.push(`Visitor's body clock is fighting them — supports the under.`);
      } else if (input.isTotalsPick && input.isOver && fatigue.scoringNudge < -1) {
        // FIX 2026-06-05 (audit #2 travel): Over at a fatigued-visitor venue should fade.
        confidenceDelta -= 1;
        reasonsAgainst.push(`Visitor's body clock is wrecked — suppressed scoring fades the Over.`);
      }
    })(),

    // 12. MULTI-BOOK DEVIG — what does the consensus market think after vig?
    // Compare to our model probability to surface the true value gap.
    (async () => {
      if (!input.homeTeamName || !input.awayTeamName) return;
      try {
        const devig = await getDevigForGame(input.league, input.homeTeamName, input.awayTeamName);
        if (!devig) return;
        diagnostics.devig = devig;
        if (input.modelProjectedWinProb == null || !isFinite(input.modelProjectedWinProb)) return;
        const fairProb = input.pickedSide === 'home' ? devig.homeFair : devig.awayFair;
        const edge = computeDevigEdge(input.modelProjectedWinProb, fairProb);
        if (edge == null) return;
        if (edge >= 4) {
          confidenceDelta += 5;
          reasonsFor.push(`Our model has us at ${(input.modelProjectedWinProb * 100).toFixed(1)}% vs the devigged market at ${(fairProb * 100).toFixed(1)}% — ${edge.toFixed(1)}pt edge.`);
        } else if (edge >= 2) {
          confidenceDelta += 2;
          reasonsFor.push(`Devigged market edge: ${edge.toFixed(1)}pt above fair.`);
        } else if (edge <= -3) {
          confidenceDelta -= 4;
          reasonsAgainst.push(`Devigged market has us ${Math.abs(edge).toFixed(1)}pt below fair — we're paying a premium.`);
        }
      } catch { /* non-blocking */ }
    })(),

    // 13. NBA / WNBA MINUTES RESTRICTION — flagged star on a soft cap.
    (async () => {
      if (input.league !== 'NBA' && input.league !== 'WNBA') return;
      const pickedKeyPlayers = input.pickedSide === 'home' ? input.homeKeyPlayerNames : input.awayKeyPlayerNames;
      const oppKeyPlayers = input.pickedSide === 'home' ? input.awayKeyPlayerNames : input.homeKeyPlayerNames;
      const pickedAbbr = input.pickedSide === 'home' ? input.homeTeamAbbr : input.awayTeamAbbr;
      const oppAbbr = input.pickedSide === 'home' ? input.awayTeamAbbr : input.homeTeamAbbr;
      try {
        const [pickedNews, oppNews] = await Promise.all([
          pickedAbbr ? getMinutesRestrictionsForTeam(input.league as 'NBA'|'WNBA', pickedAbbr) : Promise.resolve([]),
          oppAbbr ? getMinutesRestrictionsForTeam(input.league as 'NBA'|'WNBA', oppAbbr) : Promise.resolve([]),
        ]);
        const pickedFlags = flaggedStarsWithRestrictions(pickedKeyPlayers || [], pickedNews);
        const oppFlags = flaggedStarsWithRestrictions(oppKeyPlayers || [], oppNews);
        diagnostics.minutesRestriction = { picked: pickedFlags, opp: oppFlags };
        for (const f of pickedFlags) {
          if (f.restriction && f.restriction.estimatedMinutesMax <= 25) {
            confidenceDelta -= 5;
            reasonsAgainst.push(`Our star ${f.playerName} is on a soft minutes cap (~${f.restriction.estimatedMinutesMax} min).`);
          }
        }
        for (const f of oppFlags) {
          if (f.restriction && f.restriction.estimatedMinutesMax <= 25) {
            confidenceDelta += 4;
            reasonsFor.push(`Opp star ${f.playerName} is on a minutes restriction (~${f.restriction.estimatedMinutesMax} min) — lost time.`);
          }
        }
      } catch { /* non-blocking */ }
    })(),

    // 15. MLB BATTER-vs-PITCHER HISTORY — career H2H numbers from MLB Stats API.
    // Strong dominant or owned matchups feed into total/team-total/prop picks
    // and surface as admin diagnostics on every MLB game.
    (async () => {
      if (input.league !== 'MLB' || !input.mlbGamePk) return;
      try {
        const probables = await getProbablesByGamePk(input.mlbGamePk);
        if (!probables?.homePitcherId || !probables?.awayPitcherId) return;
        const [homeLineup, awayLineup] = await Promise.all([
          getPostedLineup(input.mlbGamePk, 'home'),
          getPostedLineup(input.mlbGamePk, 'away'),
        ]);
        // home lineup vs away starter; away lineup vs home starter
        const tasks: Array<Promise<any>> = [];
        if (homeLineup?.posted && homeLineup.lineup.length > 0) {
          tasks.push(getLineupBvp(
            { id: probables.awayPitcherId, name: probables.awayPitcherName },
            homeLineup.lineup.map(s => ({ playerId: s.playerId, playerName: s.playerName })),
          ).then(v => ({ side: 'home', bvp: v })));
        }
        if (awayLineup?.posted && awayLineup.lineup.length > 0) {
          tasks.push(getLineupBvp(
            { id: probables.homePitcherId, name: probables.homePitcherName },
            awayLineup.lineup.map(s => ({ playerId: s.playerId, playerName: s.playerName })),
          ).then(v => ({ side: 'away', bvp: v })));
        }
        const results = await Promise.all(tasks);
        const bvpDiag: Record<string, any> = {};
        for (const r of results) {
          bvpDiag[r.side] = { summary: summarizeLineupBvp(r.bvp), data: r.bvp };
        }
        diagnostics.bvp = bvpDiag;

        // Apply confidence nudge based on the pick's offense alignment.
        const pickingOffense = input.isOver === true
          || input.marketType === 'moneyline'
          || (input.marketType || '').toLowerCase().includes('team total')
          || (input.marketType || '').toLowerCase().includes('run line');
        for (const r of results) {
          const ourSidePicked = (r.side === 'home' && input.pickedSide === 'home')
            || (r.side === 'away' && input.pickedSide === 'away');
          // Default: only nudge for the lineup of the team we picked. For a
          // totals/over pick, both lineups inform the nudge (additive).
          const isTotalsOver = input.isTotalsPick && input.isOver;
          if (!ourSidePicked && !isTotalsOver) continue;
          const nudge = bvpConfidenceNudge({ pickFavorsOffense: pickingOffense, lineupBvp: r.bvp });
          if (nudge.delta !== 0) {
            confidenceDelta += nudge.delta;
            if (nudge.delta > 0) reasonsFor.push(...nudge.reasons);
            else reasonsAgainst.push(...nudge.reasons);
          }
        }
      } catch { /* non-blocking */ }
    })(),

    // 16. MLB TEAM SEASON RATES + PITCHER BAA — the "opponent average" floor.
    // Runs scored/game, runs allowed/game, team OPS, staff ERA/BAA. Powers
    // expected-total math (sum of home RA/G + away RS/G with a small park nudge
    // is the rough "fair" total). Pitcher BAA gets surfaced so the chip can
    // show "Skubal .206 BAA" type context.
    (async () => {
      if (input.league !== 'MLB') return;
      try {
        const homeId = input.mlbHomeTeamStatsApiId ? String(input.mlbHomeTeamStatsApiId) : null;
        const awayId = input.mlbAwayTeamStatsApiId ? String(input.mlbAwayTeamStatsApiId) : null;
        const probables = input.mlbGamePk ? await getProbablesByGamePk(input.mlbGamePk) : null;
        const [homeRates, awayRates, homeSp, awaySp] = await Promise.all([
          homeId ? getTeamSeasonRates(homeId) : Promise.resolve(null),
          awayId ? getTeamSeasonRates(awayId) : Promise.resolve(null),
          probables?.homePitcherId ? getPitcherEnhancedStats(String(probables.homePitcherId)) : Promise.resolve(null),
          probables?.awayPitcherId ? getPitcherEnhancedStats(String(probables.awayPitcherId)) : Promise.resolve(null),
        ]);

        // Expected runs = away offense vs home pitching + home offense vs away pitching,
        // roughly averaged with the team's allowed rates as a regression.
        let expectedTotal: number | null = null;
        if (homeRates && awayRates
            && homeRates.runsScoredPerGame != null && homeRates.runsAllowedPerGame != null
            && awayRates.runsScoredPerGame != null && awayRates.runsAllowedPerGame != null) {
          const awayExp = (awayRates.runsScoredPerGame + homeRates.runsAllowedPerGame) / 2;
          const homeExp = (homeRates.runsScoredPerGame + awayRates.runsAllowedPerGame) / 2;
          expectedTotal = Number((awayExp + homeExp).toFixed(2));
        }

        diagnostics.teamRates = {
          home: homeRates, away: awayRates,
          homeStarter: homeSp ? { name: homeSp.name, era: homeSp.seasonERA, baa: homeSp.seasonBAA, whip: homeSp.seasonWHIP } : null,
          awayStarter: awaySp ? { name: awaySp.name, era: awaySp.seasonERA, baa: awaySp.seasonBAA, whip: awaySp.seasonWHIP } : null,
          expectedTotal,
        };

        // FIX 2026-06-05 (audit dead-block #16): this was diagnostic-only and the
        // nudge was never applied. Now compute the gap between the market line and
        // our model's expected total → nudge confidence accordingly.
        if (input.isTotalsPick && expectedTotal != null && input.currentOdds?.total != null) {
          const marketTotal = input.currentOdds.total;
          const gap = expectedTotal - marketTotal; // positive = model says Over
          if (input.isOver) {
            if (gap >= 1.0) { confidenceDelta += 3; reasonsFor.push(`Model expected total ${expectedTotal} > market ${marketTotal} (+${gap.toFixed(1)}) — supports Over.`); }
            else if (gap >= 0.5) { confidenceDelta += 1; reasonsFor.push(`Model expected total ${expectedTotal} slightly above market — leans Over.`); }
            else if (gap <= -1.0) { confidenceDelta -= 3; reasonsAgainst.push(`Model expected total ${expectedTotal} < market ${marketTotal} (${gap.toFixed(1)}) — fades Over.`); }
            else if (gap <= -0.5) { confidenceDelta -= 1; reasonsAgainst.push(`Model expected total ${expectedTotal} slightly below market — fades Over.`); }
          } else {
            if (gap <= -1.0) { confidenceDelta += 3; reasonsFor.push(`Model expected total ${expectedTotal} < market ${marketTotal} (${gap.toFixed(1)}) — supports Under.`); }
            else if (gap <= -0.5) { confidenceDelta += 1; reasonsFor.push(`Model expected total ${expectedTotal} slightly below market — leans Under.`); }
            else if (gap >= 1.0) { confidenceDelta -= 3; reasonsAgainst.push(`Model expected total ${expectedTotal} > market ${marketTotal} (+${gap.toFixed(1)}) — fades Under.`); }
            else if (gap >= 0.5) { confidenceDelta -= 1; reasonsAgainst.push(`Model expected total ${expectedTotal} slightly above market — fades Under.`); }
          }
        }
      } catch { /* non-blocking */ }
    })(),

    // 14. MLB BULLPEN EXHAUSTION — pen gassed = late-game leverage flips.
    (async () => {
      if (input.league !== 'MLB') return;
      const pickedTeamId = input.pickedSide === 'home' ? input.mlbHomeTeamStatsApiId : input.mlbAwayTeamStatsApiId;
      const oppTeamId = input.pickedSide === 'home' ? input.mlbAwayTeamStatsApiId : input.mlbHomeTeamStatsApiId;
      try {
        const [pickedPen, oppPen] = await Promise.all([
          pickedTeamId ? getBullpenExhaustion(pickedTeamId) : Promise.resolve(null),
          oppTeamId ? getBullpenExhaustion(oppTeamId) : Promise.resolve(null),
        ]);
        diagnostics.bullpen = { picked: pickedPen, opp: oppPen };
        if (pickedPen?.exhaustion === 'gassed') {
          confidenceDelta -= 4;
          reasonsAgainst.push(pickedPen.reason || `Our bullpen is gassed.`);
        } else if (pickedPen?.exhaustion === 'tired') {
          confidenceDelta -= 2;
          reasonsAgainst.push(pickedPen.reason || `Our bullpen is showing fatigue.`);
        }
        if (oppPen?.exhaustion === 'gassed') {
          confidenceDelta += 4;
          reasonsFor.push(oppPen.reason || `Opp bullpen is gassed — late-inning leverage tilts to us.`);
        } else if (oppPen?.exhaustion === 'tired') {
          confidenceDelta += 2;
          reasonsFor.push(oppPen.reason || `Opp bullpen is showing fatigue.`);
        }
      } catch { /* non-blocking */ }
    })(),
  ]);

  return { confidenceDelta, reasonsFor, reasonsAgainst, lateScratchAlert, diagnostics };
}
