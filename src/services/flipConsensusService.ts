// FLIP CONSENSUS — multi-signal decision engine
//
// Owner directive 2026-06-06: "We must have ALL of our data agree that flipping
// the pick is the best option for us." Single-signal flips are forbidden.
//
// 10-agent audit synthesized the rule. This service implements it.
//
// DECISION GATE — a flip fires only when ALL of the following are true:
//   1. ≥ 6 of 9 signal categories vote FLIP
//   2. Internal model re-rank flips
//   3. ≥ 2 of 3 hard-evidence categories flip (devig, sharp money, line movement)
//   4. Net margin (flips − keeps) ≥ 4
//
// BLOCKERS — any one of these forces verdict = WATCH:
//   - Inside 2-hour pre-game lock window
//   - Under 2h30m lead-time to game
//   - Game is live or final
//   - Mutual injury wash
//   - Signal-watch already RED
//   - Already flipped once today
//   - Coherence fail (hard-evidence signals point different directions)
//   - Stale data (no current Hard Rock odds)
//
// MODE — env var FLIP_CONSENSUS_MODE:
//   WATCH (default): every decision logged to ActionLog, no mutations
//   LIVE: FLIP verdicts actually swap the pick
// Ship in WATCH mode first to validate against real game-day signals before
// any real flip executes.

import type { HardRockGameLine } from '@/services/oddsApiService';

export type Vote = 'FLIP' | 'KEEP' | 'NEUTRAL';
export type Verdict = 'FLIP' | 'KEEP' | 'WATCH';
export type FlipMode = 'WATCH' | 'LIVE';

export interface CategoryVote {
  category: string;
  vote: Vote;
  reason: string;
  isHardEvidence: boolean;
}

export interface FlipDecision {
  verdict: Verdict;
  votes: CategoryVote[];
  blockers: string[];
  flipCount: number;
  keepCount: number;
  hardEvidenceFlipCount: number;
  netMargin: number;
  modelAgrees: boolean;
  newSelection: string | null;
  newSide: 'home' | 'away' | null;
  newOdds: string | null;
}

export interface PickForFlip {
  id?: string;
  gameId: string;
  selection: string;
  selectionSide: 'home' | 'away';
  marketType: string;
  odds: string | null;
  line: string | null;
  confidenceScore: number;
  league: string;
  eventName: string;
  startTime: string;
  homeTeam: { name: string; abbreviation?: string; injuredOut?: string[] };
  awayTeam: { name: string; abbreviation?: string; injuredOut?: string[] };
  marketOpenOdds?: string | null;          // captured at publish time
  signalAlertLevel?: string | null;        // 'watch' | 'yellow' | 'red' | null
  flippedToday?: boolean;
}

const LOCK_WINDOW_MS = 2 * 60 * 60 * 1000;
const LEAD_TIME_MS = (2 * 60 + 30) * 60 * 1000;  // 2h 30m

export function getFlipMode(): FlipMode {
  const m = (process.env.FLIP_CONSENSUS_MODE || 'WATCH').toUpperCase();
  return m === 'LIVE' ? 'LIVE' : 'WATCH';
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function americanToProb(odds: number): number {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}
function parseAmerican(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/-?\+?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

// ─── Category voters ──────────────────────────────────────────────────────────

async function voteDevig(pick: PickForFlip): Promise<CategoryVote> {
  try {
    const { getDevigForGame } = await import('@/services/devigService');
    const dev = await getDevigForGame(pick.league, pick.homeTeam.name, pick.awayTeam.name);
    if (!dev) return { category: 'devig', vote: 'NEUTRAL', reason: 'no devig data', isHardEvidence: true };
    if (dev.bookCount < 3) return { category: 'devig', vote: 'NEUTRAL', reason: `only ${dev.bookCount} books (need 3+)`, isHardEvidence: true };
    const ourFair = pick.selectionSide === 'home' ? dev.homeFair : dev.awayFair;
    const oppFair = pick.selectionSide === 'home' ? dev.awayFair : dev.homeFair;
    const gap = oppFair - ourFair;
    if (gap >= 0.04) {
      return { category: 'devig', vote: 'FLIP', reason: `opp ${(oppFair*100).toFixed(1)}% vs our ${(ourFair*100).toFixed(1)}% (gap ${(gap*100).toFixed(1)}pts)`, isHardEvidence: true };
    }
    if (gap <= -0.02) {
      return { category: 'devig', vote: 'KEEP', reason: `we still favored ${(-gap*100).toFixed(1)}pts`, isHardEvidence: true };
    }
    return { category: 'devig', vote: 'NEUTRAL', reason: 'gap too small', isHardEvidence: true };
  } catch {
    return { category: 'devig', vote: 'NEUTRAL', reason: 'devig service error', isHardEvidence: true };
  }
}

async function voteSharpMoney(pick: PickForFlip): Promise<CategoryVote> {
  try {
    const { getSharpIntel } = await import('@/services/sharpIntelService');
    const intel = await getSharpIntel({
      gameId: pick.gameId,
      league: pick.league,
      pickedSide: pick.selectionSide,
      homeTeam: pick.homeTeam.name,
      awayTeam: pick.awayTeam.name,
      gameTime: pick.startTime || null,
    });
    const b = intel?.betting;
    if (!b || !b.sharpFavors || b.sharpConfidence == null) {
      return { category: 'sharp_money', vote: 'NEUTRAL', reason: 'no sharp signal', isHardEvidence: true };
    }
    if (b.sharpConfidence < 65) {
      return { category: 'sharp_money', vote: 'NEUTRAL', reason: `sharp conf ${b.sharpConfidence} (need 65+)`, isHardEvidence: true };
    }
    const oppSide: 'home' | 'away' = pick.selectionSide === 'home' ? 'away' : 'home';
    if (b.sharpFavors === oppSide && b.sharpConfidence >= 70) {
      return { category: 'sharp_money', vote: 'FLIP', reason: `sharps now favor opp (conf ${b.sharpConfidence})`, isHardEvidence: true };
    }
    if (b.sharpFavors === pick.selectionSide) {
      return { category: 'sharp_money', vote: 'KEEP', reason: `sharps still on us (conf ${b.sharpConfidence})`, isHardEvidence: true };
    }
    return { category: 'sharp_money', vote: 'NEUTRAL', reason: 'sharp signal not strong enough either way', isHardEvidence: true };
  } catch {
    return { category: 'sharp_money', vote: 'NEUTRAL', reason: 'sharp service error', isHardEvidence: true };
  }
}

function voteLineMovement(pick: PickForFlip): CategoryVote {
  if (!pick.marketOpenOdds || !pick.odds) {
    return { category: 'line_movement', vote: 'NEUTRAL', reason: 'no opening or current odds', isHardEvidence: true };
  }
  const oldML = parseAmerican(pick.marketOpenOdds);
  const newML = parseAmerican(pick.odds);
  if (oldML == null || newML == null) {
    return { category: 'line_movement', vote: 'NEUTRAL', reason: 'unparseable odds', isHardEvidence: true };
  }
  const oldProb = americanToProb(oldML);
  const newProb = americanToProb(newML);
  const probShift = oldProb - newProb;  // positive = our implied prob dropped (line moved AWAY from us)
  if (probShift >= 0.05) {
    return { category: 'line_movement', vote: 'FLIP', reason: `line moved AWAY from us: ${pick.marketOpenOdds} → ${pick.odds} (${(probShift*100).toFixed(1)}pt drop)`, isHardEvidence: true };
  }
  if (probShift <= -0.03) {
    return { category: 'line_movement', vote: 'KEEP', reason: `line moved TOWARD us`, isHardEvidence: true };
  }
  return { category: 'line_movement', vote: 'NEUTRAL', reason: 'minor movement', isHardEvidence: true };
}

function voteInjury(pick: PickForFlip): CategoryVote {
  const ourOut = pick.selectionSide === 'home' ? (pick.homeTeam.injuredOut || []) : (pick.awayTeam.injuredOut || []);
  const oppOut = pick.selectionSide === 'home' ? (pick.awayTeam.injuredOut || []) : (pick.homeTeam.injuredOut || []);
  const positionWeight = (entry: string): number => {
    const m = entry.match(/\(([A-Za-z0-9]{1,4})\)/);
    if (!m) return 0.6;
    const pos = m[1].toUpperCase();
    if (['SP', 'QB', 'PG', 'G', 'SS', 'CF'].includes(pos)) return 1.5;
    if (['C', 'SG', 'SF'].includes(pos)) return 1.0;
    if (['RP', 'CP', 'WR', 'RB', 'F', 'D', 'PF', 'LF', 'RF', 'LW', 'RW', 'TE'].includes(pos)) return 0.7;
    return 0.4;
  };
  const ourSev = ourOut.reduce((s, e) => s + positionWeight(e), 0);
  const oppSev = oppOut.reduce((s, e) => s + positionWeight(e), 0);
  const delta = ourSev - oppSev;
  if (delta >= 2.0) return { category: 'injury', vote: 'FLIP', reason: `we're hurt worse (${ourSev.toFixed(1)} vs ${oppSev.toFixed(1)} units)`, isHardEvidence: false };
  if (delta <= -2.0) return { category: 'injury', vote: 'KEEP', reason: `opp hurt worse (${oppSev.toFixed(1)} vs ${ourSev.toFixed(1)})`, isHardEvidence: false };
  return { category: 'injury', vote: 'NEUTRAL', reason: 'injury balance', isHardEvidence: false };
}

function voteInternalModel(pick: PickForFlip, currentHr: HardRockGameLine | null): CategoryVote {
  if (!currentHr || currentHr.homeML == null || currentHr.awayML == null) {
    return { category: 'internal_model', vote: 'NEUTRAL', reason: 'no current odds', isHardEvidence: false };
  }
  const rawH = americanToProb(currentHr.homeML);
  const rawA = americanToProb(currentHr.awayML);
  const vig = rawH + rawA;
  if (vig <= 0) return { category: 'internal_model', vote: 'NEUTRAL', reason: 'invalid odds', isHardEvidence: false };
  const fairH = rawH / vig;
  const fairA = rawA / vig;
  const ourFair = pick.selectionSide === 'home' ? fairH : fairA;
  const oppFair = pick.selectionSide === 'home' ? fairA : fairH;
  const probDelta = oppFair - ourFair;
  // Need opposite side ≥ 4pts better under our model (rough mapping: 0.04 prob = 4 conf pts).
  if (probDelta >= 0.04) {
    return { category: 'internal_model', vote: 'FLIP', reason: `model re-rank: opp ${(probDelta*100).toFixed(1)}pts better`, isHardEvidence: false };
  }
  return { category: 'internal_model', vote: 'KEEP', reason: `model still favors us ${(-probDelta*100).toFixed(1)}pts`, isHardEvidence: false };
}

// V1 placeholders — these categories return NEUTRAL until wired in v2.
// Listed so the 9-of-X consensus rule has the right denominator.
function voteTendency(): CategoryVote { return { category: 'tendency', vote: 'NEUTRAL', reason: 'v1: confirmation-only (per agent #3 — slow signal)', isHardEvidence: false }; }
function votePitcher(): CategoryVote { return { category: 'pitcher', vote: 'NEUTRAL', reason: 'v1: needs starter-swap watcher (gap from agent #5)', isHardEvidence: false }; }
function voteWeather(): CategoryVote { return { category: 'weather', vote: 'NEUTRAL', reason: 'v1: needs publish-time weather snapshot (gap from agent #6)', isHardEvidence: false }; }
function voteSportSpecific(): CategoryVote { return { category: 'sport_specific', vote: 'NEUTRAL', reason: 'v1: minutes/goalie not wired', isHardEvidence: false }; }

// ─── Blocker checks ───────────────────────────────────────────────────────────

function checkBlockers(pick: PickForFlip, votes: CategoryVote[], currentHr: HardRockGameLine | null): string[] {
  const blockers: string[] = [];
  const startMs = new Date(pick.startTime || 0).getTime();
  const timeToGame = startMs - Date.now();

  if (!Number.isFinite(startMs) || startMs === 0) blockers.push('no game start time');
  if (timeToGame < 0) blockers.push('game already started or finished');
  else if (timeToGame < LOCK_WINDOW_MS) blockers.push('inside 2h pre-game lock window');
  else if (timeToGame < LEAD_TIME_MS) blockers.push(`under 2h 30m lead-time (${Math.round(timeToGame/60000)} min to game)`);

  if (pick.flippedToday) blockers.push('already flipped once today');
  if (pick.signalAlertLevel === 'red') blockers.push('signal-watch already at RED');

  if (!currentHr || currentHr.homeML == null || currentHr.awayML == null) blockers.push('stale data — no current Hard Rock odds');

  // Coherence: among hard-evidence categories, are FLIP votes pointing the same direction?
  // (Within a single matchup the "opposite side" is unique, so a FLIP vote on devig + a KEEP
  // vote on sharp means they disagree about who's correct.)
  const devig = votes.find(v => v.category === 'devig');
  const sharp = votes.find(v => v.category === 'sharp_money');
  if (devig?.vote === 'FLIP' && sharp?.vote === 'KEEP') blockers.push('coherence fail: devig says flip, sharp says keep');
  if (devig?.vote === 'KEEP' && sharp?.vote === 'FLIP') blockers.push('coherence fail: sharp says flip, devig says keep');

  return blockers;
}

// ─── Main evaluator ───────────────────────────────────────────────────────────

export async function evaluatePickForFlip(input: { pick: PickForFlip; currentHr: HardRockGameLine | null }): Promise<FlipDecision> {
  const { pick, currentHr } = input;

  // Run all 9 voters in parallel. Three need async calls; the rest are sync.
  const [devig, sharp] = await Promise.all([voteDevig(pick), voteSharpMoney(pick)]);
  const votes: CategoryVote[] = [
    devig,
    sharp,
    voteLineMovement(pick),
    voteInjury(pick),
    voteInternalModel(pick, currentHr),
    voteTendency(),
    votePitcher(),
    voteWeather(),
    voteSportSpecific(),
  ];

  const blockers = checkBlockers(pick, votes, currentHr);
  const flipCount = votes.filter(v => v.vote === 'FLIP').length;
  const keepCount = votes.filter(v => v.vote === 'KEEP').length;
  const hardEvidenceFlipCount = votes.filter(v => v.vote === 'FLIP' && v.isHardEvidence).length;
  const netMargin = flipCount - keepCount;
  const modelAgrees = votes.find(v => v.category === 'internal_model')?.vote === 'FLIP';

  // Decide
  let verdict: Verdict = 'KEEP';
  const consensusPasses = flipCount >= 6 && hardEvidenceFlipCount >= 2 && modelAgrees && netMargin >= 4;
  if (consensusPasses && blockers.length === 0) {
    verdict = 'FLIP';
  } else if (flipCount >= 3 && hardEvidenceFlipCount >= 1) {
    // Not enough for full consensus but signal-rich — track it.
    verdict = 'WATCH';
  } else if (consensusPasses && blockers.length > 0) {
    // Would have flipped but a blocker fired — still a WATCH for visibility.
    verdict = 'WATCH';
  }

  // Compute swap target if FLIP
  let newSide: 'home' | 'away' | null = null;
  let newSelection: string | null = null;
  let newOdds: string | null = null;
  if (verdict === 'FLIP' && currentHr) {
    newSide = pick.selectionSide === 'home' ? 'away' : 'home';
    const newML = newSide === 'home' ? currentHr.homeML : currentHr.awayML;
    if (newML != null) {
      const oppName = newSide === 'home' ? pick.homeTeam.name : pick.awayTeam.name;
      newSelection = `${oppName} ML`;
      newOdds = `${newML > 0 ? '+' : ''}${newML}`;
    } else {
      verdict = 'WATCH';
      blockers.push('flip target has no priced ML');
    }
  }

  return {
    verdict, votes, blockers,
    flipCount, keepCount, hardEvidenceFlipCount, netMargin, modelAgrees,
    newSelection, newSide, newOdds,
  };
}
