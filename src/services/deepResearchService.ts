/**
 * Deep Research Service — Board-Aware Edition
 *
 * Each board (north-american, soccer, tennis, overseas) runs its own
 * independent scan and produces its own tier stack. Picks from different
 * boards never mix.
 *
 * Research improvements in this version:
 *   • Board-isolated league sets — no cross-contamination
 *   • Signal consensus gate — pick must have 4+ independent confirming
 *     signals before it qualifies; Grand Slam requires 6+
 *   • Home/Away ATS extracted separately for precise situational scoring
 *   • Line value gap: compares market spread to implied spread from win %
 *   • Recent form: last 5 game schedule results (win streak / cold streak)
 *   • Sport-specific pick selection:
 *       ◦ Soccer  → 1X2 moneyline or total goals, no spread
 *       ◦ Tennis  → moneyline only
 *       ◦ Overseas → moneyline / total goals
 *       ◦ NA      → spread first, then total, then ML
 *   • Signal conflict detection: if ATS and win-probability disagree on
 *     direction, confidence is penalised
 *
 * Tier thresholds (raised for higher win rate):
 *   GRAND_SLAM    ≥ 88  + 6 confirming signals — rare elite drop
 *   PRESSURE_PACK ≥ 79  + 5 confirming signals
 *   VIP_4_PACK    ≥ 67  + 4 confirming signals
 *   PARLAY_PLAN   ≥ 54  + 3 confirming signals
 *   PASS          anything below
 */

import { LEAGUE_URLS } from '@/lib/validation';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { getEtDateKey } from '@/lib/officialTracking';
import { generateDeepExplanation } from '@/services/aiGenerator';
import { getSharpIntel, type SharpIntelContext, type SharpFlag } from '@/services/sharpIntelService';
import { getTeamTendencies, type TeamTendencies } from '@/services/tendenciesService';
import { getGameProbables, type GameProbables, enrichPitcherWithMlbStats, getTeamHandednessProfile, computeMatchupEdge as computePitcherMatchupEdge, type TeamHandednessProfile } from '@/services/pitcherMatchupService';
import { getStadiumForecast, windTotalsNudge, type WeatherForecast } from '@/services/weatherService';
import { captureOpeningOdds, getOpeningOdds, computeMovement, type LineMovement, type OddsSnapshot } from '@/services/lineMovementService';
import { oddsBucket } from '@/lib/oddsBucket';

// Module-level cache for odds-bucket stats — refreshed every 5 minutes during a slate
// run. Pulled from the registry, so it's our OWN verified hit rate per price band.
let _bucketStatsCache: { data: Record<string, { wins: number; losses: number; pushes: number; total: number; winRate: string }>; at: number } | null = null;
async function getCachedBucketStats() {
  if (_bucketStatsCache && Date.now() - _bucketStatsCache.at < 5 * 60 * 1000) return _bucketStatsCache.data;
  try {
    const { getOddsBucketStats } = await import('@/services/pickRegistryService');
    const data = await getOddsBucketStats();
    _bucketStatsCache = { data, at: Date.now() };
    return data;
  } catch {
    return {};
  }
}

// ─── Board ──────────────────────────────────────────────────────────────────

// Boards are how the site groups picks. The user's goal: hit EVERY league Hard Rock
// offers, with quieter / less-watched markets (NCAA baseball, KBO, AFL, tennis,
// minor-league soccer) getting equal billing — that's where the "asleep picks" live.
export type BoardType =
  | 'north-american'  // big-4 pro + their college equivalents (MLB/NBA/NFL/NHL/WNBA/CFB/CBB/NCAA Baseball)
  | 'soccer'          // top European leagues + UCL/Europa
  | 'tennis'          // ATP / WTA tours + slams
  | 'combat'          // UFC, PFL, boxing — single-fighter ML/method markets
  | 'individual'      // golf (PGA/LIV/LPGA) — head-to-head matchups + outrights
  | 'racing'          // F1 / NASCAR / IndyCar — outright + H2H matchups
  | 'global'          // overseas team sports: cricket, AFL, rugby, Liga MX, MLS
  | 'overseas';       // legacy alias for global — kept for back-compat

// The main HIMOTHY board — the US major leagues (NFL, NHL, NBA, WNBA, MLB,
// college football & basketball). Soccer / tennis / overseas are intentionally
// kept as their OWN separate categories with their own picks and parlays.
// Out-of-season leagues simply return no games and are skipped automatically.
const BOARD_LEAGUES: Record<BoardType, string[]> = {
  // North American board now includes NCAA Baseball — CWS regionals are ON right now and
  // they're exactly the kind of "asleep" games people don't watch but the sharps do.
  'north-american': ['NFL', 'NHL', 'NBA', 'WNBA', 'MLB', 'College Football', 'NCAA Basketball', 'NCAA Baseball', 'UFL'],
  'soccer': [
    'Soccer - EPL', 'Soccer - La Liga', 'Soccer - Bundesliga', 'Soccer - Serie A',
    'Soccer - Ligue 1', 'Soccer - Champions League', 'Soccer - Europa', 'Soccer - Conference',
    'Soccer - MLS', 'Soccer - Liga MX',
  ],
  'tennis': ['Tennis - ATP', 'Tennis - WTA'],
  // Combat: UFC + PFL + boxing. Single-fighter ML is the core market.
  'combat': ['MMA - UFC', 'MMA - PFL', 'Boxing'],
  // Individual / golf: outright winners + H2H matchups. Tour stops always running.
  'individual': ['Golf - PGA', 'Golf - LIV', 'Golf - LPGA', 'Golf - European'],
  // Racing: F1/NASCAR/IndyCar — outright wins, H2H matchups, top-N finishes.
  'racing': ['F1', 'NASCAR', 'IndyCar'],
  // Global team sports — soccer outside the major Euro leagues. Owner directive
  // 2026-06-03: removed AFL, Cricket, and Rugby (not products we want to cover).
  'global': [
    'Soccer - Brazil Serie A', 'Soccer - Argentina', 'Denmark Superliga',
    'Romania Liga 1', 'Netherlands Eredivisie',
  ],
  // Legacy alias — back-compat with bookmarked URLs / API calls referencing 'overseas'
  'overseas': ['Denmark Superliga', 'Romania Liga 1', 'Netherlands Eredivisie'],
};

function sportStyleForBoard(board: BoardType): 'na' | 'soccer' | 'tennis' | 'combat' | 'outright' {
  if (board === 'soccer' || board === 'overseas' || board === 'global') return 'soccer';
  if (board === 'tennis') return 'tennis';
  if (board === 'combat') return 'combat';
  if (board === 'individual' || board === 'racing') return 'outright';
  return 'na';
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type ProductTier = 'GRAND_SLAM' | 'PRESSURE_PACK' | 'VIP_4_PACK' | 'PARLAY_PLAN' | 'PASS';

export interface AtsRecord {
  wins: number; losses: number; pushes: number; display: string; coverPct: number;
}

export interface TeamProfile {
  id: string;
  name: string;
  abbreviation: string;
  homeAway: 'home' | 'away';
  overallRecord: string | null;
  homeAwayRecord: string | null;       // home record for home team, road record for away
  ats: AtsRecord | null;               // overall ATS
  atsHomeAway: AtsRecord | null;       // home-specific ATS (home team) or road-specific (away team)
  winProbability: number | null;
  moneyline: number | null;
  keyPlayers: string[];
  injuredOut: string[];
  injuredDoubtful: string[];
  injuredQuestionable: string[];
  recentForm: string | null;           // e.g. "W W L W W (4-1 last 5)"
  recentFormRecord: { wins: number; losses: number } | null;
  // Deep historical trends from the team's full season schedule (3+ months of completed
  // games for in-season sports). Powers explicit "8-2 last 10 / trending up" plays.
  trends?: {
    last5: { wins: number; losses: number };
    last10: { wins: number; losses: number };
    last20: { wins: number; losses: number };
    season: { wins: number; losses: number };
    home: { wins: number; losses: number };
    away: { wins: number; losses: number };
    avgMargin10: number | null;
    trendDirection: 'up' | 'down' | 'flat';
    streak: number;
    // ATS = picks against the spread. OU = total runs/points went over.
    ats5?: { wins: number; losses: number; pushes: number; sample: number };
    ats10?: { wins: number; losses: number; pushes: number; sample: number };
    ats20?: { wins: number; losses: number; pushes: number; sample: number };
    atsSeason?: { wins: number; losses: number; pushes: number; sample: number };
    atsHome?: { wins: number; losses: number; pushes: number; sample: number };
    atsAway?: { wins: number; losses: number; pushes: number; sample: number };
    ou5?: { wins: number; losses: number; pushes: number; sample: number };
    ou10?: { wins: number; losses: number; pushes: number; sample: number };
    ou20?: { wins: number; losses: number; pushes: number; sample: number };
    ouSeason?: { wins: number; losses: number; pushes: number; sample: number };
    ouHome?: { wins: number; losses: number; pushes: number; sample: number };
    ouAway?: { wins: number; losses: number; pushes: number; sample: number };
    avgTotal10?: number | null;
  } | null;
}

export interface GameSignals {
  oddsAvailable: boolean;
  winProbabilityGap: number;
  atsCoverPct: number | null;
  atsCoverPctOpp: number | null;
  atsHomeAwayCoverPct: number | null;  // situational (home/road) ATS for picked side
  lineValueGap: number;                // |implied spread - market spread|
  signalConflict: boolean;             // ATS and win-prob pointing opposite directions
  recentFormStreak: number;            // positive = win streak, negative = loss streak
  keyInjuryOnPickSide: boolean;
  keyInjuryOnOppSide: boolean;
  spreadFavorable: boolean;
  noKeyInjuries: boolean;
  sharpLineDetected: boolean;
  neutralSite: boolean;
  dataQuality: number;
  pickedOddsAmerican: number | null;   // real American odds on the side we picked (for value/payout scoring)
  confirmingSignals: number;           // filled after scoring
  // Sharp intel signals
  sharpMoneyAligned: boolean;         // sharp/syndicate money on same side as pick
  sharpMoneyAgainst: boolean;         // sharps on the OPPOSITE side (audit fix 2026-06-05)
  reverseLineMovement: boolean;       // public bets X% but line moved against them
  restAdvantage: boolean;             // picked side has meaningful rest edge
  restDisadvantage: boolean;          // OPP has the rest edge — penalty (audit fix 2026-06-05)
  oppOnB2B: boolean;                  // opponent played yesterday
  pickedOnB2B: boolean;               // WE played yesterday (audit fix 2026-06-05)
  weatherAlert: boolean;              // significant weather affecting outdoor game
  sharpScoreBonus: number;            // -25..+25 pts (now signed; audit fix 2026-06-05)
  // Position-weighted injury severity (audit fix 2026-06-05). Replaces flat
  // boolean keyInjuryOn*Side for scoring. SP=1.0, RP=0.3, star=1.5, etc.
  pickedInjurySeverity: number;
  oppInjurySeverity: number;
  // Odds-bucket tendency ("eyes") — actual hit rate of this price band from our own
  // verified record vs the implied break-even at this price. Positive = bucket beating
  // break-even (real edge), negative = bucket failing break-even (we keep overpaying).
  // bucketSample is the # of settled bets in the bucket; 0 = no data, ignored.
  oddsBucketEdgePct: number;          // (actualHitRate% - impliedBreakEven%); 0 if no sample
  oddsBucketSample: number;           // # of settled single bets in this bucket since 5/27
  // Deep tendencies from per-game linescores (MLB 1st-inning, F5; NBA/WNBA Q1, H1)
  tendencyFirstFrameScored: number;   // % of last-10 games team scored in first frame
  tendencyFirstFrameAllowed: number;  // % of last-10 games team allowed in first frame
  tendencyOppFirstFrameScored: number;
  tendencyOppFirstFrameAllowed: number;
  tendencyF5TotalAvg: number;         // avg combined runs in F5 (MLB only; 0 otherwise)
  tendencyOppF5TotalAvg: number;
  // F5 scored/allowed splits — audit fix 2026-06-05 (previously dead data).
  pickedAvgF5Scored: number;
  pickedAvgF5Allowed: number;
  oppAvgF5Scored: number;
  oppAvgF5Allowed: number;
  tendencyFirstFrameSample: number;   // games used to compute tendencies (per side; 0 if unavailable)
  // MLB probable pitcher matchup — the single most predictive MLB side-bet factor.
  // Negative ERA = good (lower is better). 0 = no data, ignored in scoreGame.
  pickedPitcherEraL5: number;         // ERA across our side's starter's last 5 starts (0 = no data)
  oppPitcherEraL5: number;            // opposing starter's ERA last 5
  pickedPitcherWhipL5: number;        // our starter's WHIP last 5
  oppPitcherWhipL5: number;
  pickedPitcherStarts: number;        // sample size for our starter (0 = no probable posted)
  oppPitcherStarts: number;
  // Streak-fragility check — owner directive: "how that streak probably can end. Will
  // today be the day?" A +3 streak built on a 4-6 last-10 with negative avg margin is
  // a brittle streak; a +3 streak on top of 8-2 L10 with +2.8 avg margin is real.
  // pickedAvgMargin10 = team's avg game margin last 10 (positive = winning bigger).
  pickedAvgMargin10: number;
  oppAvgMargin10: number;
  // Bullpen proxy (MLB) — avg runs allowed in innings 7-9 over last 10 games. Higher
  // = bullpen leaking late. opp = the bullpen we're hoping to ride against.
  pickedBullpenAllowed: number;
  oppBullpenAllowed: number;
  pickedPctBlewLateLead: number;     // % of games team gave up a post-6th lead
  oppPctBlewLateLead: number;
  // NBA/WNBA 1Q + H1 tendency — owner directive: "Are they better in the first
  // quarter? Are they better in the first half?" Absolute Q1/H1 averages so we can
  // compute scoring DELTAS between teams (e.g., LV Aces avg Q1 23.4 vs GSV avg
  // Q1 18.2 → Aces have a fast-start edge).
  pickedAvgQ1Scored: number;          // avg points scored in Q1 last 10 games (0 = non-basketball or no data)
  pickedAvgQ1Allowed: number;
  oppAvgQ1Scored: number;
  oppAvgQ1Allowed: number;
  pickedAvgH1Scored: number;
  pickedAvgH1Allowed: number;
  oppAvgH1Scored: number;
  oppAvgH1Allowed: number;
  pickedPctLeadAfterQ1: number;       // % of games leading after Q1
  pickedPctLeadAfterH1: number;
  // Line movement — closest free proxy to "where's the money?" Captured by storing
  // opening odds the first time we see a game, then comparing to current odds.
  // Positive = line moved TOWARD picked side (sharps agreeing); negative = AWAY.
  mlMovementForSide: number;           // American-odds points toward our ML (0 = no opening)
  spreadMovementForSide: number;       // line moved by this many points toward our spread side
  totalMovement: number;               // positive = total moved UP (over getting steam)
  hasOpeningLine: boolean;             // false = first time seeing this game (no signal)
  // ── MLB Stats API + NWS enrichment (only populated for MLB) ──
  // OPS delta (lineup OPS vs pitcher hand MINUS pitcher OPS-allowed). Positive
  // means the lineup has had MORE success than this pitcher typically allows —
  // i.e. they're likely to hit him. Used for totals/team-totals projection AND
  // ML side selection (a thin matchup edge can flip a coin-flip game).
  // 0 = no enrichment data available (engine ignores).
  pickedLineupVsPitcherOpsDelta: number;
  oppLineupVsPitcherOpsDelta: number;
  // Wind-driven totals nudge (positive = wind blowing OUT = Over lean,
  // negative = wind blowing IN = Under lean). 0 = dome, calm wind, or non-MLB.
  weatherWindNudge: number;
  weatherLabel: string | null;        // human-readable wind label (admin-only)
}

export interface DeepPickResult {
  gameId: string;
  eventName: string;
  league: string;
  sport: string;
  board: BoardType;
  startTime: string;
  homeTeam: TeamProfile;
  awayTeam: TeamProfile;
  spread: number | null;
  total: number | null;
  selection: string;
  selectionSide: 'home' | 'away';
  marketType: 'spread' | 'moneyline' | 'total';
  odds: string | null;
  line: string | null;
  confidenceScore: number;
  tier: ProductTier;
  signals: GameSignals;
  reasonsFor: string[];
  reasonsAgainst: string[];
  aiExplanation: {
    shortReason: string; fullBreakdown: string; keyAngles: string[];
    injuryNotes: string; marketNotes: string; riskNotes: string; killCase: string;
  } | null;
  sharpFlags: SharpFlag[];
  sharpIntel: Pick<SharpIntelContext, 'betting' | 'weather' | 'rest' | 'sharpScore'> | null;
  bigGameLabel: string | null;   // set only for genuinely big games (playoffs/finals/championship)
  isAsleepPick?: boolean;        // true for lesser-watched leagues where edges are bigger
  asleepBoost?: number;          // raw multiplier applied to confidence (1.0 = none)
  // Honest tendency math: predicted total/margin from each team's last-10 averages
  // compared to tonight's posted line. The "lean" field tells the user whether the math
  // says BET (clear edge), STAY_AWAY (conflict with no edge), or PASS (no signal at all).
  // Surfaces transparently on the UI so customers see WHY we like (or skip) a pick.
  tendencyResolution?: TendencyResolution | null;
  // KEY FACTOR — the single biggest reason we took this pick, surfaced prominently to
  // customers as a highlighted banner. Owner directive: "every game must have a key factor
  // of why we took it." The engine picks whichever signal contributed the most to the
  // confidence score; ties go to the most actionable one (pitcher matchup > line move >
  // bullpen > 1st-inning > injury > ATS > value).
  keyFactor?: {
    category: 'pitcher' | 'bullpen' | 'line_movement' | 'odds_bucket' | 'streak_real' | 'first_frame' | 'q1_h1' | 'injury' | 'ats' | 'value' | 'win_prob';
    headline: string;        // short tag — "PITCHER MATCHUP", "REVERSE LINE MOVEMENT", etc.
    detail: string;          // 1-2 sentence outcome-focused explanation
  };
  // When the key factor is pitcher-driven, both starters' full profiles are attached for
  // customers to see the actual stats — name, hand, L5 ERA, WHIP, K/9, last-start damage.
  pitcherSpotlight?: {
    picked: { name: string; throws: 'L' | 'R' | null; starts: number; eraL5: number | null; whipL5: number | null; kPer9L5: number | null; hitsPerStart: number | null; lastStartER: number | null; lastStartIP: number | null } | null;
    opp:    { name: string; throws: 'L' | 'R' | null; starts: number; eraL5: number | null; whipL5: number | null; kPer9L5: number | null; hitsPerStart: number | null; lastStartER: number | null; lastStartIP: number | null } | null;
  };
  // Signal capture at publish — both sides' signals + scores frozen at pick time.
  // The whole point: when a pick loses, we can read this field and see exactly what
  // the engine knew about both teams when it chose the winner. Lets us answer
  // "should we have flipped?" with real data instead of guessing after the fact.
  evidence?: PickEvidence;
}

// Per-pick evidence file — frozen snapshot of what the engine saw on BOTH sides at
// the moment we made the call. Persisted to research_payload.evidence so loss
// postmortems can compare what we picked vs what the dog showed.
export interface PickEvidence {
  pickedSide: 'home' | 'away';
  homeScore: number;
  awayScore: number;
  scoreGap: number;              // |homeScore - awayScore| — how confident the side decision was
  homeSignals: Omit<GameSignals, 'confirmingSignals'>;
  awaySignals: Omit<GameSignals, 'confirmingSignals'>;
  pickedInjuries: { out: string[]; doubtful: string[]; questionable: string[] };
  oppInjuries:    { out: string[]; doubtful: string[]; questionable: string[] };
  pickedAtsSeason: string | null;
  oppAtsSeason: string | null;
  pickedAtsHomeAway: string | null;
  pickedStreak: number;
  starOutPickSide: string | null;
  starOutOppSide: string | null;
  totalPlayApplied: boolean;     // true if the side decision lost to a totals play
  baseScore: number;             // score before asleep boost / DQ cap
  asleepBoost: number;           // multiplier applied
  dataQuality: number;
}

// Detects a TRULY big game (championship/playoff/finals/Game 7) from ESPN event data —
// NOT just two good teams in a regular-season game. Returns a display label or null.
function detectBigGame(event: any, comp: any): string | null {
  const noteHeadlines: string[] = [
    ...((Array.isArray(comp?.notes) ? comp.notes : []) as any[]),
    ...((Array.isArray(event?.competitions?.[0]?.notes) ? event.competitions[0].notes : []) as any[]),
  ].map((n) => String(n?.headline || '')).filter(Boolean);

  const haystack = `${noteHeadlines.join(' ')} ${event?.name || ''} ${comp?.type?.text || ''}`.toLowerCase();
  const bigKeywords = ['final', 'finals', 'championship', 'champions', 'semifinal', 'conference final', 'elimination', 'game 7', 'game seven', 'cup', 'title'];

  // Postseason flag (ESPN season.type 3 = postseason)
  const seasonType = event?.season?.type ?? event?.competitions?.[0]?.season?.type;
  const isPostseason = seasonType === 3 || String(comp?.type?.abbreviation || '').toUpperCase() === 'PST';

  if (noteHeadlines.length && bigKeywords.some((k) => haystack.includes(k))) {
    return noteHeadlines[0]; // e.g. "Western Conference Finals - Game 5"
  }
  if (isPostseason) {
    // A playoff game without a richer headline — still a big stage.
    if (bigKeywords.some((k) => haystack.includes(k))) return noteHeadlines[0] || 'Playoffs';
    return noteHeadlines[0] || 'Playoffs';
  }
  return null;
}

// Lightweight extra legs for the $10 Parlay Plan. On thin slates the straight products
// consume the few quality games, leaving the parlay short. Rather than pad with heavy
// chalk or repeat a straight, we fill the parlay with real-value PROP and game TOTAL legs
// from games we aren't already using.
export interface ParlayExtraLeg {
  type: 'prop' | 'total';
  league: string;
  gameId: string;
  eventName: string;
  selection: string;
  odds: string | null;
  startTime: string | null;
  detail: string;
}

export interface BoardPicksResult {
  generatedAt: string;
  boardDate: string;
  board: BoardType;
  grandSlam: DeepPickResult | null;
  pressurePack: DeepPickResult[];
  vip4Pack: DeepPickResult[];
  parlayPlan: DeepPickResult[];
  parlayExtraLegs?: ParlayExtraLeg[];   // prop/total legs that top up a thin $10 Parlay
  revealAt?: string | null;             // ISO time the whole slate becomes visible (1h before first game)
  marquee: DeepPickResult[];        // tonight's headline NBA/NHL/NFL games we cover regardless of tier
  asleepPicks: DeepPickResult[];    // lesser-watched-league plays where edges are bigger — surfaced regardless of tier
  outrights?: any[];                // active tournament futures: golf majors, tennis slams, F1 championships
  nrfi: NrfiPlay[];                 // MLB "No Runs First Inning" plays
  allScored: DeepPickResult[];
  totalGamesScanned: number;
  valuePlays?: DeepPickResult[];    // moneyline picks whose best price beats the true line (set in the API route)
  emptyReason?: string;             // explains why a non-NA board returned empty (e.g., "need 4, found 1")
}

// MLB No-Runs-First-Inning play (the NRFI prop the user loves)
export interface NrfiPlay {
  gameId: string;
  eventName: string;
  league: string;
  startTime: string;
  awayTeam: string;
  homeTeam: string;
  awayPitcher: string;
  homePitcher: string;
  awayERA: number | null;
  homeERA: number | null;
  nrfiScore: number;
  reason: string;
  odds: string;
  // Live + result tracking. NRFI settles the moment the 1st inning is complete: zero runs
  // = won, any run in the 1st = lost.
  state: 'pre' | 'live' | 'final';
  statusDetail: string;        // e.g. "Top 2nd", "Final"
  awayScore: number;
  homeScore: number;
  firstInningRuns: number | null;
  result: 'won' | 'lost' | 'pending' | null;
}

// Headline US leagues — playoff/marquee games here always get covered, even if the
// model has no strong edge (a real service talks about the big games).
const MARQUEE_LEAGUES = new Set(['NBA', 'NHL', 'NFL', 'WNBA']);

// "Asleep" leagues — lesser-watched markets where the public bets less so the line
// inefficiencies are bigger. The user's edge-finding strategy explicitly prefers these.
// Number = score multiplier applied to confidence: a 5% edge on NCAA baseball is worth
// the same as 5% × 1.18 = ~5.9% on the regular board, so it rises to the top.
const ASLEEP_LEAGUE_BONUS: Record<string, number> = {
  'NCAA Baseball': 1.20,
  'College Baseball': 1.20,
  'NCAA Softball': 1.20,
  'WNBA': 1.05,                  // popular among bettors but still soft books
  'WNCAA Basketball': 1.18,
  'MMA - UFC': 1.15,
  'MMA - PFL': 1.20,
  'Boxing': 1.15,
  'Tennis - ATP': 1.18,
  'Tennis - WTA': 1.18,
  'Tennis': 1.18,
  'Cricket - IPL': 1.15,
  'Cricket': 1.18,
  'Rugby - NRL': 1.15,
  'Rugby - Top 14': 1.18,
  'Rugby - Premiership': 1.18,
  'AFL': 1.18,
  'Australian Football': 1.18,
  'Soccer - Brazil Serie A': 1.12,
  'Soccer - Argentina': 1.15,
  'Soccer - Liga MX': 1.10,
  'Soccer - MLS': 1.08,
  'Denmark Superliga': 1.15,
  'Romania Liga 1': 1.20,
  'Netherlands Eredivisie': 1.10,
  'Golf - LIV': 1.10,
  'Golf - LPGA': 1.12,
  'F1': 1.05,
  'NASCAR': 1.08,
  'IndyCar': 1.15,
};

function asleepMultiplier(league: string): number {
  return ASLEEP_LEAGUE_BONUS[league] ?? 1.0;
}

// ─── NRFI (No Runs First Inning) — MLB ────────────────────────────────────────

function extractProbablePitcher(competitor: any): { name: string; era: number | null; whip: number | null } {
  const p = competitor?.probables?.[0];
  const name = p?.athlete?.displayName || p?.displayName || 'TBD';
  let era: number | null = null;
  let whip: number | null = null;
  const stats: any[] = Array.isArray(p?.statistics) ? p.statistics : [];
  const eraStat = stats.find((s) => String(s?.abbreviation || s?.name || '').toUpperCase() === 'ERA');
  if (eraStat && eraStat.displayValue != null) {
    const v = parseFloat(String(eraStat.displayValue));
    if (!Number.isNaN(v)) era = v;
  }
  // FIX 2026-06-03: also pull WHIP as a 1st-inning proxy. A pitcher with great
  // ERA but poor WHIP gives up baserunners early — bad for NRFI. Pulling WHIP
  // costs nothing extra (same statistics array).
  const whipStat = stats.find((s) => String(s?.abbreviation || s?.name || '').toUpperCase() === 'WHIP');
  if (whipStat && whipStat.displayValue != null) {
    const v = parseFloat(String(whipStat.displayValue));
    if (!Number.isNaN(v)) whip = v;
  }
  if (era === null && typeof p?.athlete?.statsSummary === 'string') {
    const m = p.athlete.statsSummary.match(/([\d.]+)\s*ERA/i);
    if (m) era = parseFloat(m[1]);
  }
  return { name, era, whip };
}

function buildNrfiPlays(mlbEvents: any[], excludeGameIds: Set<string> = new Set()): NrfiPlay[] {
  const plays: NrfiPlay[] = [];
  for (const event of mlbEvents) {
    // Keep live + finished games so the NRFI shows its result (won/lost), not just pregame.
    if (!event?.status?.type?.state) continue;
    if (excludeGameIds.has(String(event.id))) continue; // no duplicate: game already a pick elsewhere
    const comp = event.competitions?.[0];
    const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
    const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
    if (!home || !away) continue;

    const hp = extractProbablePitcher(home);
    const ap = extractProbablePitcher(away);
    // STRICT FLOOR — owner directive 2026-06-03 after the Detroit-Tampa NRFI loss:
    // "Only ship NRFI when BOTH starters have a sub-3.50 first-inning ERA." We use
    // overall ERA as the proxy until we wire in pitch-by-pitch first-frame data
    // (Baseball Savant). BOTH pitchers must be known (no TBD) and BOTH must be
    // <= 3.50 ERA. Anything else = no NRFI.
    if (hp.era == null || ap.era == null) continue;
    if (hp.era > 3.50 || ap.era > 3.50) continue;
    const eraH = hp.era;
    const eraA = ap.era;
    const worst = Math.max(eraH, eraA);
    const combined = (eraH + eraA) / 2;
    const haveBoth = true; // both required to pass the floor above

    let score = worst <= 3.0 ? 88 : worst <= 3.75 ? 80 : 72;
    if (combined <= 3.0) score += 5;
    // WHIP adjustment — high WHIP = traffic = 1st-inning risk
    const whipH = hp.whip;
    const whipA = ap.whip;
    if (whipH != null && whipA != null) {
      const avgWhip = (whipH + whipA) / 2;
      if (avgWhip <= 1.10) score += 3;       // elite control = first-inning clean
      else if (avgWhip <= 1.20) score += 1;
      else if (avgWhip >= 1.40) score -= 4;  // traffic both ways = risky
      else if (avgWhip >= 1.30) score -= 2;
    }
    if (!haveBoth) score = Math.min(score, 75); // cap when we're guessing one arm

    // 2026-06-05 park-factor gate on NRFI. A Coors NRFI is a sucker bet even
    // with two aces — altitude makes early-inning runs more likely. Petco
    // NRFI is a slight bonus. Apply ±5 conf based on park run index.
    try {
      // Lazy import to avoid the circular-deps trap during module init.
      const { getParkFactorByHomeTeam } = require('@/services/parkFactorsService');
      const homeName = home.team?.displayName || home.team?.name || '';
      const park = homeName ? getParkFactorByHomeTeam(homeName) : null;
      if (park) {
        if (park.runs >= 108) score -= 6;       // hitter-friendly park = lean YRFI
        else if (park.runs >= 104) score -= 3;
        else if (park.runs <= 92) score += 4;   // pitcher-friendly park = stronger NRFI
        if (park.highAltitude) score -= 4;       // Coors compound penalty
      }
    } catch { /* non-fatal */ }

    score = Math.min(95, Math.max(60, score));

    const awayAbbr = away.team?.abbreviation || 'AWAY';
    const homeAbbr = home.team?.abbreviation || 'HOME';
    const a = ap.era != null ? `${ap.name} (${ap.era.toFixed(2)} ERA)` : `${ap.name} (TBD)`;
    const h = hp.era != null ? `${hp.name} (${hp.era.toFixed(2)} ERA)` : `${hp.name} (TBD)`;
    const elite = combined <= 3.0;

    // Vary the wording per game so the board doesn't read like a template.
    const openers = [
      `${a} for ${awayAbbr} and ${h} for ${homeAbbr} both take the mound sharp.`,
      `Pitching matchup we love for a quiet first: ${awayAbbr}'s ${a} vs ${homeAbbr}'s ${h}.`,
      `${awayAbbr} sends ${a}; ${homeAbbr} counters with ${h} — two arms that limit early damage.`,
      `Strong starters on both sides — ${a} (${awayAbbr}) opposite ${h} (${homeAbbr}).`,
      `${homeAbbr}'s ${h} and ${awayAbbr}'s ${a} are exactly the type that work clean early.`,
    ];
    const closers = elite
      ? [
          `Elite early — we like NO runs in the 1st.`,
          `Both are stingy out of the gate; NRFI for us.`,
          `A scoreless opening frame is the expectation here.`,
        ]
      : [
          `Both reliably work a clean first — NRFI lean.`,
          `Early runs are unlikely; we're on the NRFI.`,
          `The first frame should stay quiet.`,
        ];
    const hsh = String(event.id).split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
    const reason = `${openers[hsh % openers.length]} ${closers[(hsh >> 2) % closers.length]}`;

    // Live state + NRFI grade. NRFI settles the instant the 1st inning is complete.
    const rawState = event.status?.type?.state;
    const isFinal = rawState === 'post' || Boolean(event.status?.type?.completed);
    const state: NrfiPlay['state'] = rawState === 'in' ? 'live' : isFinal ? 'final' : 'pre';
    const inning = Number(event.status?.period) || 0;
    const awayScore = Number.parseInt(away.score, 10) || 0;
    const homeScore = Number.parseInt(home.score, 10) || 0;
    const firstAway = Number(away.linescores?.[0]?.value);
    const firstHome = Number(home.linescores?.[0]?.value);
    const haveFirst = Number.isFinite(firstAway) || Number.isFinite(firstHome);
    const firstInningRuns = haveFirst ? (Number.isFinite(firstAway) ? firstAway : 0) + (Number.isFinite(firstHome) ? firstHome : 0) : null;
    let result: NrfiPlay['result'] = null;
    if (state !== 'pre') {
      if (firstInningRuns != null && firstInningRuns > 0) result = 'lost';      // a run crossed in the 1st
      else if (isFinal || inning >= 2) result = 'won';                          // 1st inning done, clean
      else result = 'pending';                                                  // still in the 1st, 0 so far
    }

    plays.push({
      gameId: String(event.id),
      eventName: `${away.team?.displayName || 'Away'} @ ${home.team?.displayName || 'Home'}`,
      league: 'MLB',
      startTime: event.date || '',
      awayTeam: away.team?.displayName || 'Away',
      homeTeam: home.team?.displayName || 'Home',
      awayPitcher: ap.name,
      homePitcher: hp.name,
      awayERA: ap.era,
      homeERA: hp.era,
      nrfiScore: Math.round(score),
      reason,
      odds: '-115',
      state,
      statusDetail: event.status?.type?.shortDetail || event.status?.type?.description || '',
      awayScore,
      homeScore,
      firstInningRuns,
      result,
    });
  }
  return plays.sort((a, b) => b.nrfiScore - a.nrfiScore).slice(0, 6);
}

// Shape an NRFI play as a board pick so it can COMPETE for every product (Pressure / VIP /
// $10 Parlay / — and Grand Slam if it ever cleared 96, though its honest cap is 95). Owner:
// "nothing is off-limits — NRFI can be a parlay leg or a Grand Slam." marketType stays 'total'
// for typing, but the "NRFI" selection text routes it to the NRFI grader (1st-inning runs).
function nrfiToPick(n: NrfiPlay, board: BoardType): DeepPickResult {
  const sig = n.nrfiScore >= 88 ? 6 : n.nrfiScore >= 83 ? 5 : 4;
  return {
    gameId: n.gameId, eventName: n.eventName, league: 'MLB', sport: 'MLB', board,
    startTime: n.startTime,
    homeTeam: { name: n.homeTeam, abbreviation: '' } as any,
    awayTeam: { name: n.awayTeam, abbreviation: '' } as any,
    spread: null, total: null,
    // Name the matchup so two NRFI plays are never indistinguishable in a list/parlay. The
    // "NRFI" text still routes it to the 1st-inning grader.
    selection: `NRFI — ${n.awayTeam} @ ${n.homeTeam}`, selectionSide: 'home', marketType: 'total',
    odds: n.odds || '-115', line: null,
    confidenceScore: n.nrfiScore, tier: assignTier(n.nrfiScore, sig),
    signals: { confirmingSignals: sig, keyInjuryOnPickSide: false, signalConflict: false } as any,
    reasonsFor: [n.reason], reasonsAgainst: [],
    aiExplanation: null, sharpFlags: [], sharpIntel: null, bigGameLabel: null,
  } as DeepPickResult;
}

// ─── Power 20 Types ──────────────────────────────────────────────────────────

export interface Power20Pick {
  gameId: string;
  eventName: string;
  league: string;
  startTime: string;
  favoriteName: string;
  favoriteAbbr: string;
  underdogName: string;
  winProbability: number;
  moneyline: number | null;
  marketType: 'moneyline' | 'runline' | 'spread';
  selection: string;
  selectionSide: 'home' | 'away';   // which physical side our pick is — needed to grade live
  odds: string;
  isInjuryClear: boolean;
  injuryNote: string | null;
}

export interface Power20Group {
  group: number;
  label: string;
  legs: Power20Pick[];
  estimatedOdds: string;
  estimatedDecimal: number;
}

// One full parlay (10 or 20 legs). User wants two distinct parlays — different size,
// different vibe, both ALL heavy chalk and both disjoint from regular-card picks.
export interface Power20Parlay {
  label: string;
  legCount: number;
  legs: Power20Pick[];
  estimatedOdds: string;       // American odds like "+15400"
  estimatedDecimal: number;    // decimal payout multiplier
  payoutOnDollar: string;      // human-readable like "$1 → $155"
  avgWinProbability: number;
}

export interface Power20Result {
  generatedAt: string;
  boardDate: string;
  totalScanned: number;
  picks: Power20Pick[];
  parlayGroups: Power20Group[]; // kept for back-compat
  parlay20: Power20Parlay | null;
  parlay10: Power20Parlay | null;
  excludedFromRegularCards: number; // how many candidates we dropped because they matched a regular pick
  avgWinProbability: number;
  thinSlate?: boolean;      // true when slate < 30 NA games → Power 20 collapsed into Power 10
  thinSlateMessage?: string;
}

// ─── ESPN Fetch Helpers ──────────────────────────────────────────────────────

const summaryCache = new Map<string, { fetchedAt: number; data: any }>();
const formCache = new Map<string, { fetchedAt: number; data: any }>();
// Per-game closing-line cache (completed games are immutable — cache 24h).
const closingLineCache = new Map<string, { fetchedAt: number; spread: number | null; overUnder: number | null; favAbbr: string | null }>();
const SUMMARY_TTL = 150_000;
const FORM_TTL = 300_000;
const CLOSING_LINE_TTL = 24 * 60 * 60 * 1000;

// Pull a completed game's closing spread + over/under from /summary's pickcenter block.
// Returns nulls if the game wasn't priced or summary fetch fails. Cached 24h.
// Prewarms `closingLineCache` for every team in tonight's slate by fetching the last 20
// completed games per team in parallel. Called by the warmer cron BEFORE live research
// runs — once these are cached (24h TTL), the live engine can use a full L20 ATS window
// without paying the latency. Returns counts so the cron can report progress.
export async function prewarmClosingLines(
  leagues: string[], maxGamesPerTeam = 20,
): Promise<{ leaguesScanned: number; teams: number; cachedGames: number; tookMs: number }> {
  const t0 = Date.now();
  const teamIds = new Map<string, { league: string; baseUrl: string; teamId: string }>();
  for (const league of leagues) {
    const result = await fetchLeagueScoreboard(league);
    if (!result) continue;
    for (const event of result.events) {
      const comp = event?.competitions?.[0];
      const comps: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
      for (const c of comps) {
        const teamId = String(c?.team?.id || c?.id || '');
        if (!teamId) continue;
        const key = `${league}:${teamId}`;
        if (!teamIds.has(key)) teamIds.set(key, { league, baseUrl: result.baseUrl, teamId });
      }
    }
  }

  // For each unique team, fetch its schedule and prime closingLineCache for the most
  // recent N completed games. All teams in parallel; per-team summaries also in parallel.
  let cachedGames = 0;
  await Promise.all(Array.from(teamIds.values()).map(async ({ league, baseUrl, teamId }) => {
    try {
      const year = new Date().getFullYear();
      const res = await fetchWithTimeout(`${baseUrl}/teams/${teamId}/schedule?season=${year}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const events: any[] = data.events || [];
      const completed = events
        .filter((e) => {
          const c = e?.competitions?.[0];
          return c?.status?.type?.completed || e?.status?.type?.completed;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(-maxGamesPerTeam);
      await Promise.all(completed.map((e) => fetchClosingLine(String(e.id), baseUrl)));
      cachedGames += completed.length;
    } catch { /* per-team failures are non-fatal */ }
  }));

  return { leaguesScanned: leagues.length, teams: teamIds.size, cachedGames, tookMs: Date.now() - t0 };
}

async function fetchClosingLine(gameId: string, baseUrl: string): Promise<{ spread: number | null; overUnder: number | null; favAbbr: string | null }> {
  const key = `${baseUrl}:${gameId}`;
  const cached = closingLineCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CLOSING_LINE_TTL) {
    return { spread: cached.spread, overUnder: cached.overUnder, favAbbr: cached.favAbbr };
  }
  try {
    const res = await fetchWithTimeout(`${baseUrl}/summary?event=${gameId}`, { cache: 'no-store' });
    if (!res.ok) {
      closingLineCache.set(key, { fetchedAt: Date.now(), spread: null, overUnder: null, favAbbr: null });
      return { spread: null, overUnder: null, favAbbr: null };
    }
    const data = await res.json();
    const pc = Array.isArray(data?.pickcenter) && data.pickcenter[0] ? data.pickcenter[0] : null;
    let spread: number | null = null, overUnder: number | null = null, favAbbr: string | null = null;
    if (pc) {
      const s = typeof pc.spread === 'number' ? pc.spread : Number.parseFloat(pc.spread ?? '');
      if (Number.isFinite(s)) spread = s;
      const ou = typeof pc.overUnder === 'number' ? pc.overUnder : Number.parseFloat(pc.overUnder ?? '');
      if (Number.isFinite(ou)) overUnder = ou;
      const det = String(pc.details ?? '').trim().toUpperCase();
      // "LAD -286" → favorite abbr is "LAD"; covers spread side too in spread layouts like "MIA -5.5"
      const m = det.match(/^([A-Z]{2,4})\s*[-]/);
      if (m) favAbbr = m[1];
    }
    closingLineCache.set(key, { fetchedAt: Date.now(), spread, overUnder, favAbbr });
    return { spread, overUnder, favAbbr };
  } catch {
    return { spread: null, overUnder: null, favAbbr: null };
  }
}

function dateStr(offsetDays = 0) {
  // Anchor the sports "day" to US Eastern time so the board rolls over at midnight ET —
  // not at the server's UTC midnight (which is ~8 PM ET, right in the middle of games).
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  const base = new Date(Date.UTC(y, m - 1, day));
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return `${base.getUTCFullYear()}${String(base.getUTCMonth() + 1).padStart(2, '0')}${String(base.getUTCDate()).padStart(2, '0')}`;
}

async function fetchGameSummary(gameId: string, baseUrl: string): Promise<any> {
  const key = `${baseUrl}:${gameId}`;
  const cached = summaryCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < SUMMARY_TTL) return cached.data;
  try {
    const res = await fetchWithTimeout(`${baseUrl}/summary?event=${gameId}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    summaryCache.set(key, { fetchedAt: Date.now(), data });
    return data;
  } catch { return null; }
}

// Tendency resolver — closes the gap between "Team A trends Over, Team B trends Under"
// and "what should I actually bet?" by computing the predicted true total/margin from
// each team's last-10 averages, then comparing to tonight's posted line.
export interface TendencyResolution {
  market: 'spread' | 'total' | 'moneyline';
  // Numbers (null if we don't have the data to compute them):
  predictedHomeAvgTotal?: number | null;   // home team's avg game total over last 10
  predictedAwayAvgTotal?: number | null;   // away team's avg game total over last 10
  predictedTotal?: number | null;          // average of the two — our estimate of tonight's total
  predictedHomeMargin?: number | null;     // home avg margin in their last 10
  predictedAwayMargin?: number | null;     // away avg margin in their last 10
  predictedMargin?: number | null;         // model's estimated home-side margin tonight (positive = home favored)
  // The posted line we're comparing against:
  postedLine: number | null;
  // Signed edge from the picked side's perspective. Positive = our pick covers; the
  // bigger the number, the bigger the edge.
  edge: number | null;
  lean: 'BET' | 'STAY_AWAY' | 'PASS';
  // Plain-English explanation for the UI. Two lines max.
  reasoning: string;
}

// League-specific home-court bumps used by the spread/ML resolver. Conservative — the
// real numbers fluctuate but these are within ~0.5 points of league averages.
const HOME_ADVANTAGE: Record<string, number> = {
  NBA: 2.5, WNBA: 2.0, NHL: 0.3, MLB: 0.2,
  NFL: 2.0, 'College Football': 3.0, 'NCAA Basketball': 3.5, 'NCAA Baseball': 0.4,
};

// Decide whether to BET, STAY_AWAY, or PASS based on edge size + signal strength.
// - BET if the math edge is clearly outside the line (>= 0.7 for totals, >= 1.5 for spreads/ML)
// - STAY_AWAY if we have signal on both sides but they cancel (small edge with conflict)
// - PASS if there's no signal at all (one or both teams missing avgTotal/avgMargin data)
function classifyLean(
  market: 'spread' | 'total' | 'moneyline',
  edge: number | null,
  haveBothSides: boolean,
): { lean: TendencyResolution['lean']; reason: string } {
  if (edge == null || !haveBothSides) {
    return { lean: 'PASS', reason: 'Not enough recent-line data to call this one.' };
  }
  const threshold = market === 'total' ? 0.7 : 1.5;
  const absEdge = Math.abs(edge);
  if (absEdge >= threshold) {
    return { lean: 'BET', reason: edge > 0
      ? `Tendency math agrees with the pick — projected ${absEdge.toFixed(1)} ${market === 'total' ? 'pts' : 'pt'} edge on our side.`
      : `Tendency math leans the other way by ${absEdge.toFixed(1)} ${market === 'total' ? 'pts' : 'pt'} — line is sharp here.` };
  }
  // Small or zero edge → book has it priced right.
  return {
    lean: 'STAY_AWAY',
    reason: `Both teams' recent tendencies cancel out (edge ${edge > 0 ? '+' : ''}${edge.toFixed(1)}). Book set this line correctly — skip rather than guess.`,
  };
}

export function resolveTendency(args: {
  market: 'spread' | 'total' | 'moneyline';
  league: string;
  postedLine: number | null;       // for total: total line; for spread: picked-side spread (signed for picked side); for ML: null
  selectionSide: 'home' | 'away';
  homeAvgTotal: number | null;
  awayAvgTotal: number | null;
  homeAvgMargin: number | null;
  awayAvgMargin: number | null;
}): TendencyResolution {
  const { market, league, postedLine, selectionSide } = args;

  if (market === 'total') {
    // Predict tonight's total = average of both teams' avgTotal10. Each team's avg is
    // already a balance of their offense + the opponents' defense they played, so
    // averaging the two gives a reasonable midpoint.
    if (args.homeAvgTotal == null || args.awayAvgTotal == null) {
      return { market, postedLine, edge: null, lean: 'PASS',
        reasoning: 'Not enough last-10 total data to project tonight\'s number.',
        predictedHomeAvgTotal: args.homeAvgTotal, predictedAwayAvgTotal: args.awayAvgTotal };
    }
    const predictedTotal = (args.homeAvgTotal + args.awayAvgTotal) / 2;
    // Picked side: figure out from the selection which way our pick leaned (we don't
    // pass it directly, so use postedLine convention: positive edge if picked Over and
    // predicted > line, negative if picked Under and predicted < line). Caller passes
    // selectionSide as the picked TEAM's home/away, but for total markets we use
    // selectionSide to encode 'home' = Over, 'away' = Under as a hack.
    // Cleaner: caller passes pickedTotalSide via `selectionSide`. We treat 'home' = Over.
    const pickedOver = selectionSide === 'home';
    const rawEdge = pickedOver ? (predictedTotal - (postedLine ?? predictedTotal)) : ((postedLine ?? predictedTotal) - predictedTotal);
    const edge = Math.round(rawEdge * 10) / 10;
    const { lean, reason } = classifyLean(market, edge, true);
    return {
      market, postedLine, edge, lean, reasoning: reason,
      predictedHomeAvgTotal: args.homeAvgTotal,
      predictedAwayAvgTotal: args.awayAvgTotal,
      predictedTotal: Math.round(predictedTotal * 10) / 10,
    };
  }

  if (market === 'spread') {
    if (args.homeAvgMargin == null || args.awayAvgMargin == null) {
      return { market, postedLine, edge: null, lean: 'PASS',
        reasoning: 'Not enough last-10 margin data to project tonight\'s spread.' };
    }
    // Predicted home-side margin = (home avg + (-away avg)) / 2 + home advantage.
    // (Away team's positive avgMargin means they normally win — flip the sign because
    // we're modeling the home side.)
    const homeAdv = HOME_ADVANTAGE[league] ?? 1.5;
    const predictedHomeMargin = (args.homeAvgMargin - args.awayAvgMargin) / 2 + homeAdv;
    // Convert posted spread to "picked side covers if margin >= postedLine".
    // For a -1.5 picked HOME team, picked side needs HOME to win by 2+ → predictedHomeMargin > 1.5.
    // For a +1.5 picked AWAY team, picked side needs HOME to lose OR win by 1 →
    //   predictedHomeMargin < -1.5 (i.e., away wins by 2+) is a cover with extra cushion.
    let edge: number;
    if (selectionSide === 'home') {
      edge = predictedHomeMargin - (postedLine != null ? -postedLine : 0);
    } else {
      edge = (postedLine != null ? -postedLine : 0) - predictedHomeMargin;
    }
    const edgeRounded = Math.round(edge * 10) / 10;
    const { lean, reason } = classifyLean(market, edgeRounded, true);
    return {
      market, postedLine, edge: edgeRounded, lean, reasoning: reason,
      predictedHomeMargin: Math.round(predictedHomeMargin * 10) / 10,
      predictedHomeAvgTotal: null, predictedAwayAvgTotal: null,
    };
  }

  // moneyline — same margin model, but the "line" is whether the picked side wins outright.
  if (args.homeAvgMargin == null || args.awayAvgMargin == null) {
    return { market, postedLine, edge: null, lean: 'PASS',
      reasoning: 'Not enough last-10 margin data to project this matchup.' };
  }
  const homeAdv = HOME_ADVANTAGE[league] ?? 1.5;
  const predictedHomeMargin = (args.homeAvgMargin - args.awayAvgMargin) / 2 + homeAdv;
  // For ML the "edge" is how many points the picked side is favored by in our model.
  // Anything below 1.5pt = coin flip → STAY_AWAY, anything above = real lean.
  const pickedSideMargin = selectionSide === 'home' ? predictedHomeMargin : -predictedHomeMargin;
  const edge = Math.round(pickedSideMargin * 10) / 10;
  const { lean, reason } = classifyLean(market, edge, true);
  return {
    market, postedLine: null, edge, lean, reasoning: reason,
    predictedHomeMargin: Math.round(predictedHomeMargin * 10) / 10,
  };
}

interface TrendBucket { wins: number; losses: number }
// ATS / O/U over a window. `sample` is the number of games in the window that had a
// known line so the percentage stays honest (e.g., "12-8 ATS over 20 priced games").
interface LineBucket { wins: number; losses: number; pushes: number; sample: number }

// Recency-weighted ATS coverPct. Replaces the old "use season-overall ATS" approach.
// Weight blend: 40% last-5 + 40% last-10 + 20% season. Pushes don't count for/against.
// Each bucket is gated by minimum sample so a 1-0 ATS over 1 game doesn't masquerade as
// 100%. Returns null if no usable bucket exists.
//
// The user's strategy memory is explicit: "tendency-driven, not moneyline-driven, with a
// rolling-window weighting." This function makes that real inside scoreGame().
function weightedAtsCoverPct(
  ats5?: LineBucket,
  ats10?: LineBucket,
  atsSeason?: LineBucket,
): number | null {
  const pctFromBucket = (b?: LineBucket, minSample = 3): number | null => {
    if (!b || b.sample < minSample) return null;
    const decisive = b.wins + b.losses;
    if (decisive === 0) return null;
    return (b.wins / decisive) * 100;
  };
  // Sample gates raised: a 2-1 ATS over 3 games is NOT a "hot 67%" read. Require enough
  // decisive games before a window contributes, so thin samples can't inflate confidence.
  const p5 = pctFromBucket(ats5, 4);
  const p10 = pctFromBucket(ats10, 8);
  const pSeason = pctFromBucket(atsSeason, 10);
  const parts: Array<[number, number]> = [];
  if (p5 != null) parts.push([0.4, p5]);
  if (p10 != null) parts.push([0.4, p10]);
  if (pSeason != null) parts.push([0.2, pSeason]);
  if (parts.length === 0) return null;
  const totalWeight = parts.reduce((s, [w]) => s + w, 0);
  const weightedSum = parts.reduce((s, [w, v]) => s + w * v, 0);
  return weightedSum / totalWeight;
}
interface TeamForm {
  streak: number;
  record: { wins: number; losses: number };       // last 5 — kept for back-compat
  form: string;                                    // "W W L W W (4-1 last 5)" — kept
  // Deep trend lookback — every completed game in the team's season schedule (typically
  // 3+ months for in-season sports). This is what powers "Heat 8-2 last 10" style trends.
  last5: TrendBucket;
  last10: TrendBucket;
  last20: TrendBucket;
  season: TrendBucket;
  home: TrendBucket;
  away: TrendBucket;
  avgMargin10: number | null;     // average score margin over last 10 (positive = winning blowouts)
  trendDirection: 'up' | 'down' | 'flat';  // last 10 win% vs season win%
  // Real ATS and O/U tendencies from completed games — the bedrock of capping non-ML markets.
  ats5: LineBucket; ats10: LineBucket; ats20: LineBucket; atsSeason: LineBucket;
  atsHome: LineBucket; atsAway: LineBucket;
  // ATS-against — what opponents cover when laying spreads vs this team.
  // Audit fix 2026-06-05 (#1 tendency): replaces the prior buggy approximation
  // where the OPP's atsSeason was used as if it were ATS-against.
  atsAgainst10: LineBucket; atsAgainstSeason: LineBucket;
  ou5: LineBucket; ou10: LineBucket; ou20: LineBucket; ouSeason: LineBucket;
  ouHome: LineBucket; ouAway: LineBucket;
  avgTotal10: number | null;       // avg total runs/points scored in last 10 (vs the line)
}

/**
 * Real recent-form + deep trend lookback from the team's own ESPN season schedule
 * (free, cached 5 min). Computes last 5 / 10 / 20 / season / home / away records, current
 * streak, average margin, and a trend-direction flag — so we can answer "Heat 8-2 last 10,
 * trending up" instead of just a single recent-form chip.
 */
async function fetchTeamForm(league: string, teamId: string): Promise<TeamForm | null> {
  if (!teamId) return null;
  const baseUrl = LEAGUE_URLS[league];
  if (!baseUrl) return null;
  // Cache-key version bump invalidates entries from previous algorithm versions so the
  // next call recomputes ATS/OU samples cleanly. Bump after any change to TeamForm's
  // shape or window size. v6 = L10 enrichment (L20 hits Vercel budget on cold path).
  const key = `form:v6:${league}:${teamId}`;
  const cached = formCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < FORM_TTL) return cached.data;
  try {
    const year = new Date().getFullYear();
    const res = await fetchWithTimeout(`${baseUrl}/teams/${teamId}/schedule?season=${year}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const events: any[] = data.events || [];

    // Closing lines aren't in the schedule payload — they're on /summary's pickcenter.
    // For each completed game we'll fetch summary lazily and cache 24h (completed games
    // are immutable). Limit to the last 20 to keep first-load cost reasonable.
    const completedRaw = events
      .map((e) => {
        const comp = e?.competitions?.[0];
        const completedFlag = comp?.status?.type?.completed || e?.status?.type?.completed;
        if (!completedFlag) return null;
        const me = comp?.competitors?.find((c: any) => String(c?.team?.id || c?.id) === String(teamId));
        const opp = comp?.competitors?.find((c: any) => String(c?.team?.id || c?.id) !== String(teamId));
        if (!me) return null;
        // ESPN schedule returns score as `{value: 8.0, displayValue: "8"}` (object),
        // not a plain string. Read .value first, then fall back to the raw scalar.
        const scoreOf = (c: any): number => {
          const s = c?.score;
          if (s == null) return NaN;
          if (typeof s === 'object') return Number(s.value ?? s.displayValue ?? NaN);
          return Number.parseFloat(String(s));
        };
        const meScore = scoreOf(me);
        const oppScore = scoreOf(opp);
        const margin = Number.isFinite(meScore) && Number.isFinite(oppScore) ? meScore - oppScore : null;
        const total = Number.isFinite(meScore) && Number.isFinite(oppScore) ? meScore + oppScore : null;
        const meAbbr = String(me?.team?.abbreviation || '').toUpperCase();
        return {
          gameId: e.id as string,
          date: e.date as string,
          won: me?.winner === true,
          homeAway: (me?.homeAway as 'home' | 'away' | undefined) ?? null,
          margin, total,
          meAbbr,
          teamSpread: null as number | null,
          overUnder: null as number | null,
        };
      })
      .filter((g): g is { gameId: string; date: string; won: boolean; homeAway: 'home' | 'away' | null; margin: number | null; total: number | null; meAbbr: string; teamSpread: number | null; overUnder: number | null } => Boolean(g && g.date && g.gameId))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Closing-line enrichment is meaningless for individual / combat sports (no spreads,
    // no team totals). Skip the fetches entirely for those leagues so the budget stays
    // tight for the team sports that actually need ATS/OU data.
    const isIndividualSport =
      league.startsWith('Tennis') || league.startsWith('MMA') || league === 'Boxing' ||
      league.startsWith('Golf') || league === 'F1' || league === 'Formula 1' ||
      league === 'NASCAR' || league === 'IndyCar';

    // Enrich the most recent 10 games with closing-line data. L20 was tried but even with
    // the cron prewarm priming closingLineCache, the cold first board-compute still hit
    // Vercel's 60s budget (other per-game fetches dominate). L10 fits comfortably and
    // gives plenty of signal. Bumping to L20 needs a separate background scan that walks
    // teams in batches rather than blocking a single request.
    const recentSlice = isIndividualSport ? [] : completedRaw.slice(-10);
    const lines = await Promise.all(recentSlice.map((g) => fetchClosingLine(g.gameId, baseUrl)));
    recentSlice.forEach((g, i) => {
      const cl = lines[i];
      if (cl.spread != null) {
        // ESPN pickcenter.spread has an inconsistent sign convention across leagues, but
        // the absolute value is always the line. Use favAbbr + |spread| to derive our
        // team's signed spread: favorite gets the negative number, dog gets the positive.
        const absSpread = Math.abs(cl.spread);
        // Normalize casing/whitespace so "Lad"/"LAD" don't mismatch and silently flip a
        // favorite into a dog (which inverts the ATS cover and corrupts confidence).
        const normAbbr = (s: string | null | undefined) => String(s || '').toUpperCase().trim();
        const meWasFav = !!cl.favAbbr && normAbbr(cl.favAbbr) === normAbbr(g.meAbbr);
        g.teamSpread = meWasFav ? -absSpread : absSpread;
      }
      g.overUnder = cl.overUnder;
    });

    const completed = completedRaw;

    if (completed.length === 0) return null;

    const tally = (slice: typeof completed): TrendBucket => {
      let wins = 0, losses = 0;
      for (const g of slice) { if (g.won) wins++; else losses++; }
      return { wins, losses };
    };

    // ATS: covered if (our margin + our spread) > 0. Push if exactly 0. Only games with a known line.
    const tallyAts = (slice: typeof completed): LineBucket => {
      let wins = 0, losses = 0, pushes = 0, sample = 0;
      for (const g of slice) {
        if (g.margin == null || g.teamSpread == null) continue;
        sample++;
        const v = g.margin + g.teamSpread;
        if (v > 0) wins++; else if (v < 0) losses++; else pushes++;
      }
      return { wins, losses, pushes, sample };
    };
    // ATS-AGAINST: flip the sign — what happens when OPPONENTS lay this spread vs us.
    // FIX 2026-06-05 (audit #1 tendency): previously the engine used the opposing team's
    // OWN ATS (their offense covering) as a proxy for ATS-against, which was the wrong
    // signal entirely. Now compute true "did opponents cover against this team" from the
    // same schedule, just inverted.
    const tallyAtsAgainst = (slice: typeof completed): LineBucket => {
      let wins = 0, losses = 0, pushes = 0, sample = 0;
      for (const g of slice) {
        if (g.margin == null || g.teamSpread == null) continue;
        sample++;
        // Opponent spread = -teamSpread; opponent margin = -margin. Their cover = -(margin+teamSpread).
        const v = -(g.margin + g.teamSpread);
        if (v > 0) wins++; else if (v < 0) losses++; else pushes++;
      }
      return { wins, losses, pushes, sample };
    };
    // O/U: over if total > line, under if <, push if equal. Only games with a known total line.
    const tallyOu = (slice: typeof completed, want: 'over' | 'under'): LineBucket => {
      let wins = 0, losses = 0, pushes = 0, sample = 0;
      for (const g of slice) {
        if (g.total == null || g.overUnder == null) continue;
        sample++;
        if (g.total > g.overUnder) { if (want === 'over') wins++; else losses++; }
        else if (g.total < g.overUnder) { if (want === 'under') wins++; else losses++; }
        else pushes++;
      }
      return { wins, losses, pushes, sample };
    };

    const last5Slice = completed.slice(-5);
    const last5 = tally(last5Slice);
    const last10 = tally(completed.slice(-10));
    const last20 = tally(completed.slice(-20));
    const season = tally(completed);
    const home = tally(completed.filter((g) => g.homeAway === 'home'));
    const away = tally(completed.filter((g) => g.homeAway === 'away'));

    const last10Slice = completed.slice(-10);
    const last20Slice = completed.slice(-20);
    const homeGames = completed.filter((g) => g.homeAway === 'home');
    const awayGames = completed.filter((g) => g.homeAway === 'away');

    const ats5 = tallyAts(last5Slice);
    const ats10 = tallyAts(last10Slice);
    const ats20 = tallyAts(last20Slice);
    const atsSeason = tallyAts(completed);
    const atsHome = tallyAts(homeGames);
    const atsAway = tallyAts(awayGames);
    // FIX 2026-06-05 (audit #1 tendency): ATS-against = opponents covering vs this team.
    const atsAgainst10 = tallyAtsAgainst(last10Slice);
    const atsAgainstSeason = tallyAtsAgainst(completed);

    // O/U bucket reports OVER record (so 7-3 means the team has gone OVER 7 of last 10).
    const ou5 = tallyOu(last5Slice, 'over');
    const ou10 = tallyOu(last10Slice, 'over');
    const ou20 = tallyOu(last20Slice, 'over');
    const ouSeason = tallyOu(completed, 'over');
    const ouHome = tallyOu(homeGames, 'over');
    const ouAway = tallyOu(awayGames, 'over');

    const last10Margins = last10Slice.map((g) => g.margin).filter((m): m is number => m !== null);
    const avgMargin10 = last10Margins.length > 0 ? last10Margins.reduce((a, b) => a + b, 0) / last10Margins.length : null;
    const last10Totals = last10Slice.map((g) => g.total).filter((t): t is number => t !== null);
    const avgTotal10 = last10Totals.length > 0 ? last10Totals.reduce((a, b) => a + b, 0) / last10Totals.length : null;

    const winPct = (b: TrendBucket) => (b.wins + b.losses > 0 ? b.wins / (b.wins + b.losses) : 0);
    const last10Pct = winPct(last10);
    const seasonPct = winPct(season);
    const trendDirection: 'up' | 'down' | 'flat' = last10Pct > seasonPct + 0.08 ? 'up' : last10Pct < seasonPct - 0.08 ? 'down' : 'flat';

    // Current signed streak walking back from the most recent result.
    let streak = 0;
    for (let i = completed.length - 1; i >= 0; i--) {
      const won = completed[i].won;
      if (streak === 0) streak = won ? 1 : -1;
      else if (won && streak > 0) streak++;
      else if (!won && streak < 0) streak--;
      else break;
    }

    const formStr = last5Slice.map((g) => (g.won ? 'W' : 'L')).join(' ');
    const result: TeamForm = {
      streak,
      record: last5,
      form: `${formStr} (${last5.wins}-${last5.losses} last 5)`,
      last5, last10, last20, season, home, away,
      avgMargin10: avgMargin10 != null ? Math.round(avgMargin10 * 10) / 10 : null,
      trendDirection,
      ats5, ats10, ats20, atsSeason, atsHome, atsAway,
      atsAgainst10, atsAgainstSeason,
      ou5, ou10, ou20, ouSeason, ouHome, ouAway,
      avgTotal10: avgTotal10 != null ? Math.round(avgTotal10 * 10) / 10 : null,
    };
    formCache.set(key, { fetchedAt: Date.now(), data: result });
    return result;
  } catch {
    return null;
  }
}

async function fetchLeagueScoreboard(league: string): Promise<{ events: any[]; baseUrl: string } | null> {
  const baseUrl = LEAGUE_URLS[league];
  if (!baseUrl) return null;
  try {
    // STRICT TODAY ONLY (ET-anchored). Per the user: "only show today's picks. No other
    // days." We pull yesterday's scoreboard ONLY to catch live carry-overs (West Coast
    // night games still in progress after UTC midnight). Everything else — tomorrow's
    // games, weekend cards, future championship dates — is filtered out unconditionally.
    const todayKey = dateStr(0);
    const etDateKey = (iso?: string | null): string | null => {
      if (!iso) return null;
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(new Date(iso));
        const y = parts.find((p) => p.type === 'year')?.value;
        const m = parts.find((p) => p.type === 'month')?.value;
        const d = parts.find((p) => p.type === 'day')?.value;
        return `${y}${m}${d}`;
      } catch { return null; }
    };
    const isOnTodayET = (e: any): boolean => {
      const startKey = etDateKey(e?.date);
      // Multi-day events (tennis tournaments, golf events) have an endDate that extends
      // past the start. Keep the event if today falls anywhere within that range —
      // individual matches/rounds get filtered to today inside their flatteners.
      const endKey = etDateKey(e?.endDate) || startKey;
      if (!startKey) return false;
      return startKey <= todayKey && todayKey <= (endKey || startKey);
    };
    // STRICT TODAY-ONLY for PICK SELECTION. We do NOT carry over yesterday's still-live games
    // as today's picks anymore. A game that STARTED yesterday (ET) belongs to yesterday's
    // board and record — even if it ran past ET midnight. Treating a live carry-over as a
    // fresh today pick is exactly how a yesterday West-Coast game (e.g. a late WNBA game)
    // ended up frozen onto today's board and then lit up a false "WON" once it finished.
    // (Live carry-overs still appear in the live SCORES feed for display — that's liveSlate —
    // but they are not eligible to become a graded pick on today's products.)
    const response = await fetch(`${baseUrl}/scoreboard?dates=${dateStr(0)}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    const dedupe = new Map<string, any>();
    for (const e of data.events || []) {
      // Keep every event whose ET date is today — INCLUDING finals, so a game that posted in
      // the morning slate stays visible with its result after it finishes (frozen all ET-day).
      if (!isOnTodayET(e)) continue;
      dedupe.set(String(e.id), e);
    }
    const allEvents = Array.from(dedupe.values());
    return allEvents.length > 0 ? { events: allEvents, baseUrl } : null;
  } catch { return null; }
}

// ─── Data Extraction ─────────────────────────────────────────────────────────

function parseAtsFromSpreadRecord(sr: any): AtsRecord | null {
  if (!sr || typeof sr.wins !== 'number' || typeof sr.losses !== 'number') return null;
  const total = sr.wins + sr.losses + (sr.pushes || 0);
  const coverPct = total > 0 ? (sr.wins / total) * 100 : 50;
  return {
    wins: sr.wins, losses: sr.losses, pushes: sr.pushes || 0,
    display: `${sr.wins}-${sr.losses}${sr.pushes ? `-${sr.pushes}` : ''}`,
    coverPct: Math.round(coverPct * 10) / 10,
  };
}

function extractAtsRecords(pickcenter: any[], side: 'home' | 'away'): { overall: AtsRecord | null; homeAway: AtsRecord | null } {
  if (!Array.isArray(pickcenter) || pickcenter.length === 0) return { overall: null, homeAway: null };
  const provider = pickcenter.find((p: any) => p?.homeTeamOdds?.spreadRecord) || pickcenter[0];
  const teamOdds = side === 'home' ? provider?.homeTeamOdds : provider?.awayTeamOdds;
  const overall = parseAtsFromSpreadRecord(teamOdds?.spreadRecord);
  const homeAway = side === 'home'
    ? parseAtsFromSpreadRecord(teamOdds?.homeSpreadRecord || teamOdds?.homeRecord)
    : parseAtsFromSpreadRecord(teamOdds?.awaySpreadRecord || teamOdds?.roadRecord);
  return { overall, homeAway };
}

function extractInjuriesBySide(summary: any, side: 'home' | 'away', homeTeamName?: string, awayTeamName?: string) {
  const injuries = summary?.injuries;
  // ESPN's summary.injuries actually shapes as [{ team: {...}, injuries: [...] }, ...]
  // — homeAway is NOT populated. Match by team.displayName instead. Critical guard
  // for empty-string fields: ''.includes('') === true would otherwise make EVERY
  // block match (caught 2026-06-02 — was attributing Twins injuries to White Sox).
  if (!Array.isArray(injuries)) return { out: [], doubtful: [], questionable: [], dataAvailable: false };
  const targetName = (side === 'home' ? homeTeamName : awayTeamName) || '';
  const lower = targetName.toLowerCase().trim();
  if (!lower) return { out: [], doubtful: [], questionable: [], dataAvailable: false };
  let block: any = injuries.find((t: any) => t.homeAway === side);
  if (!block) {
    const lastWord = lower.split(/\s+/).pop() || '';
    block = injuries.find((t: any) => {
      const dn = String(t?.team?.displayName || '').toLowerCase().trim();
      const sn = String(t?.team?.shortDisplayName || '').toLowerCase().trim();
      const tn = String(t?.team?.name || '').toLowerCase().trim();
      const ln = String(t?.team?.location || '').toLowerCase().trim();
      // Exact-string matches first (safest)
      if (dn === lower || sn === lower || tn === lower || ln === lower) return true;
      // Substring matches — only when BOTH operands are non-empty (avoids ''.includes('')=true)
      if (tn && lower.includes(tn)) return true;
      if (ln && lower.includes(ln)) return true;
      if (lastWord && dn.includes(lastWord)) return true;
      return false;
    });
  }
  const teamInjuries = block?.injuries || [];
  const out: string[] = []; const doubtful: string[] = []; const questionable: string[] = [];
  for (const inj of teamInjuries) {
    const name = inj?.athlete?.displayName || 'Unknown';
    const pos = inj?.athlete?.position?.abbreviation || '';
    const label = pos ? `${name} (${pos})` : name;
    const status = String(inj?.status || '').toUpperCase().replace(/[-_]/g, ' ');
    if (status === 'OUT' || status.includes('IL') || status.includes('INJURED LIST')) out.push(label);
    else if (status === 'DOUBTFUL' || status.includes('DOUBT')) doubtful.push(label);
    else if (status === 'QUESTIONABLE' || status.includes('DAY TO DAY') || status === 'PROBABLE') questionable.push(label);
  }
  return { out, doubtful, questionable, dataAvailable: true };
}

function extractTeamRecord(competitor: any, type: 'total' | 'home' | 'road'): string | null {
  const records = competitor?.records;
  if (!Array.isArray(records)) return null;
  const match = records.find((r: any) =>
    r.type === type || r.name?.toLowerCase() === type || r.name?.toLowerCase() === (type === 'road' ? 'away' : type)
  );
  return match?.summary || match?.displayValue || null;
}

function extractLeaders(competitor: any): string[] {
  const leaders = competitor?.leaders;
  if (!Array.isArray(leaders)) return [];
  return leaders.slice(0, 3).map((l: any) => {
    const athlete = l?.leaders?.[0]?.athlete?.displayName;
    const stat = l?.displayName || l?.name || '';
    const value = l?.leaders?.[0]?.displayValue || '';
    if (!athlete) return null;
    return `${athlete}: ${value} ${stat}`.trim();
  }).filter(Boolean) as string[];
}

/**
 * Returns the name of a STAR (a team leader) who is ruled OUT, or null. This is the
 * "change the pick" signal — if our pick depends on a star who isn't playing, we pull
 * off it. Matches leader names against the injury OUT list.
 */
// Position-weighted injury severity. Reads the "(POS)" suffix on each entry
// (the injury extractors append e.g. "Janson Junk (SP)", "Michael Grove (RP)").
// Returns a sum where each player counts for:
//   1.5  star / franchise (matched against leaders list elsewhere — call via
//        injurySeverityStarBoost when leaders provided)
//   1.0  starting pitcher (SP), QB, key positions (SS / CF / C / PG / LW / RW)
//   0.6  position players / starters (default for unknown)
//   0.3  bench / depth pieces (RP, depth, IR-stash)
// This lets the engine distinguish "2 relievers out" (0.6 total) from "starting
// pitcher + center fielder out" (2.0 total) instead of treating both as 2 OUT.
const POSITION_WEIGHTS: Record<string, number> = {
  // MLB
  SP: 1.0, RP: 0.3, CP: 0.5, P: 0.6,
  C: 0.8, '1B': 0.6, '2B': 0.6, '3B': 0.6, SS: 0.9, LF: 0.6, CF: 0.9, RF: 0.6, DH: 0.6,
  // NBA / WNBA
  PG: 1.0, SG: 0.8, SF: 0.8, PF: 0.7, F: 0.6, G: 0.7,
  // NHL
  LW: 0.7, RW: 0.7, D: 0.7, G_NHL: 1.0,
  // NFL
  QB: 1.0, RB: 0.7, WR: 0.7, TE: 0.6,
};
function extractPositionTag(playerEntry: string): string | null {
  // entries look like "Janson Junk (SP) — admin" or "Player Name (LF)"
  const m = String(playerEntry || '').match(/\(([A-Za-z0-9]{1,4})\)/);
  return m ? m[1].toUpperCase() : null;
}
function injurySeverity(injuries: string[] = []): number {
  let total = 0;
  for (const inj of injuries) {
    const pos = extractPositionTag(inj);
    const w = (pos && POSITION_WEIGHTS[pos]) ? POSITION_WEIGHTS[pos] : 0.6;
    total += w;
  }
  return total;
}

// Detect AI-fallback boilerplate. Customer-facing copy on these picks reads as
// generic ("ATS trend confirmed", "Market pricing favorable") rather than a
// real read — never trust them at GS/VIP. Safe to promote them to Pressure
// (the bar there is "confidence floor + sanity"), but not premium tiers.
export function hasAIFallback(p: any): boolean {
  // If aiExplanation is entirely null/missing the AI was never called (missing API key,
  // network error, catch path). That's an infrastructure issue — don't penalize the pick
  // for it. Only block when AI actually ran but returned boilerplate/empty content.
  if (p?.aiExplanation == null) return false;
  const sr: string | undefined = p?.aiExplanation?.shortReason;
  if (!sr) return true;
  if (sr === 'Research engine identified a qualified edge based on ATS records and win probability data.') return true;
  if (sr === 'Model identified a price inefficiency on this market based on edge signals.') return true;
  // Detect when the AI returned generic angles too — three boilerplate phrases.
  const angles: string[] = p?.aiExplanation?.keyAngles || [];
  const BOILERPLATE = new Set([
    'ATS trend confirmed', 'Win probability edge detected', 'Market pricing favorable',
    'Market price inefficiency detected', 'Edge signals confirmed via model',
  ]);
  const allBoiler = angles.length > 0 && angles.every(a => BOILERPLATE.has(a));
  return allBoiler;
}

// Mutual-injury wash: if WE'RE hurt at least as bad as the opponent on a
// position-weighted basis, opponent injury is NOT an edge. Block from premium.
export function hasMutualInjuryWash(p: any): boolean {
  const sigs = p?.signals || {};
  if (!sigs.keyInjuryOnPickSide || !sigs.keyInjuryOnOppSide) return false;
  // The DeepPickResult carries injured arrays per side; selectionSide tells us which.
  const side = p?.selectionSide || (p as any)?.researchPayload?.selectionSide;
  if (!side) return false;
  // FIX 2026-06-05 (audit finding #1): was reading homeProfile/awayProfile which
  // don't exist on DeepPickResult. The actual fields are homeTeam/awayTeam.
  // Previous code had `ourSev=0, oppSev=0, 0>=0` always true → gate silently never fired.
  const ourOut = side === 'home' ? (p?.homeTeam?.injuredOut || []) : (p?.awayTeam?.injuredOut || []);
  const oppOut = side === 'home' ? (p?.awayTeam?.injuredOut || []) : (p?.homeTeam?.injuredOut || []);
  const ourDb = side === 'home' ? (p?.homeTeam?.injuredDoubtful || []) : (p?.awayTeam?.injuredDoubtful || []);
  const oppDb = side === 'home' ? (p?.awayTeam?.injuredDoubtful || []) : (p?.homeTeam?.injuredDoubtful || []);
  const ourSev = injurySeverity(ourOut) + 0.5 * injurySeverity(ourDb);
  const oppSev = injurySeverity(oppOut) + 0.5 * injurySeverity(oppDb);
  return ourSev >= oppSev;
}

function leaderRuledOut(leaders: string[], outList: string[]): string | null {
  const outNames = outList.map((o) => o.replace(/\(.*?\)/g, '').trim().toLowerCase()).filter(Boolean);
  for (const leader of leaders) {
    const name = leader.split(':')[0].trim();
    const lower = name.toLowerCase();
    if (!lower) continue;
    if (outNames.some((o) => o.includes(lower) || lower.includes(o))) return name;
  }
  return null;
}

function extractPickcenterData(pickcenter: any[]): {
  spread: number | null; total: number | null;
  homeMoneyline: number | null; awayMoneyline: number | null;
  homeWinPct: number | null; awayWinPct: number | null;
  drawPct: number | null;
  favAbbr: string | null;       // favorite's team abbreviation if parseable from `details`
} {
  if (!Array.isArray(pickcenter) || pickcenter.length === 0) {
    return { spread: null, total: null, homeMoneyline: null, awayMoneyline: null, homeWinPct: null, awayWinPct: null, drawPct: null, favAbbr: null };
  }
  const p = pickcenter[0];
  // FIX 2026-06-05 (West Virginia sign-flip audit): ESPN's `spread` field has
  // INCONSISTENT sign convention across leagues (sometimes home-signed,
  // sometimes favorite-signed regardless of side). The only reliable signal
  // for which team is the favorite is the `details` string ("WVU -6.5").
  // Parse it here so downstream code can normalize spread to a known side.
  let favAbbr: string | null = null;
  const det = String(p?.details || '');
  const m = /^([A-Z]{2,4})\s+[-]/.exec(det);
  if (m) favAbbr = m[1];
  return {
    spread: p?.spread != null ? Number(p.spread) : null,
    total: p?.overUnder != null ? Number(p.overUnder) : null,
    homeMoneyline: p?.homeTeamOdds?.moneyLine ?? null,
    awayMoneyline: p?.awayTeamOdds?.moneyLine ?? null,
    homeWinPct: p?.homeTeamOdds?.winPercentage ?? null,
    awayWinPct: p?.awayTeamOdds?.winPercentage ?? null,
    drawPct: p?.drawOdds?.winPercentage ?? null,
    favAbbr,
  };
}

// ─── Signal Counting ─────────────────────────────────────────────────────────

function countConfirmingSignals(
  pickedSide: 'home' | 'away',
  signals: Omit<GameSignals, 'confirmingSignals'>,
): number {
  let count = 0;

  // FIX 2026-06-05 (audit #5): every signal now has + and − paths. Previous
  // version only incremented — a pick with 4 positive + 4 negative read identical
  // to a pick with 4 positive + 0 negative.

  if (signals.winProbabilityGap >= 10) count++;
  else if (signals.winProbabilityGap <= -10) count--;

  if (signals.atsCoverPct !== null) {
    if (signals.atsCoverPct >= 55) count++;
    else if (signals.atsCoverPct <= 42) count--;
  }
  if (signals.atsHomeAwayCoverPct !== null) {
    if (signals.atsHomeAwayCoverPct >= 56) count++;
    else if (signals.atsHomeAwayCoverPct <= 42) count--;
  }
  if (signals.atsCoverPctOpp !== null) {
    if (signals.atsCoverPctOpp <= 44) count++;
    else if (signals.atsCoverPctOpp >= 60) count--;
  }

  // Position-weighted injury delta (see scoreGame).
  const pickedSev = (signals as any).pickedInjurySeverity ?? 0;
  const oppSev = (signals as any).oppInjurySeverity ?? 0;
  const sevDelta = oppSev - pickedSev;
  if (sevDelta >= 0.7) count++;
  else if (sevDelta <= -0.7) count--;

  if (signals.oddsAvailable) count++;

  if (signals.lineValueGap >= 2.5) count++;
  else if (signals.lineValueGap <= -2.5) count--;

  if ((signals.sharpLineDetected && signals.reverseLineMovement) || signals.sharpMoneyAligned) count++;
  else if ((signals as any).sharpMoneyAgainst) count--;

  if (signals.recentFormStreak >= 3) count++;
  else if (signals.recentFormStreak <= -3) count--;

  // RLM only counts if it points toward our side (set upstream in sharpMoneyAligned check).
  if (signals.reverseLineMovement && signals.sharpMoneyAligned) count++;

  if (signals.restAdvantage) count++;
  else if ((signals as any).restDisadvantage) count--;

  if (signals.oppOnB2B) count++;
  else if ((signals as any).pickedOnB2B) count--;

  if (signals.spreadFavorable) count++;
  if (signals.dataQuality >= 70) count++;
  else if (signals.dataQuality < 50) count--;

  if (signals.pickedOddsAmerican !== null && signals.pickedOddsAmerican >= -240 && signals.pickedOddsAmerican <= 175) count++;
  else if (signals.pickedOddsAmerican !== null && signals.pickedOddsAmerican < -300) count--;

  return count;
}

// ─── Confidence Scoring ───────────────────────────────────────────────────────

// American odds → break-even win % required to be profitable. A -135 ML implies the
// team must win 57.4% of the time. A +105 dog must win 48.8%. We compare this to the
// bucket's ACTUAL hit rate from our registry to find where we're overpaying or
// underpaying. Pure math, no opinion.
function impliedBreakEvenPct(americanOdds: number): number {
  if (!Number.isFinite(americanOdds) || americanOdds === 0) return 50;
  if (americanOdds < 0) {
    const a = Math.abs(americanOdds);
    return (a / (a + 100)) * 100;
  }
  return (100 / (americanOdds + 100)) * 100;
}

function scoreGame(signals: Omit<GameSignals, 'confirmingSignals'>): number {
  let score = 50;

  // Win probability gap (±8 pts).
  // FIX 2026-06-05 (audit #6): was add-only — no penalty when gap goes against us.
  // Caller now passes a SIGNED gap (negative = we're on the wrong side).
  const gap = signals.winProbabilityGap;
  if (gap >= 25) score += 8;
  else if (gap >= 18) score += 6;
  else if (gap >= 12) score += 4;
  else if (gap >= 6) score += 2;
  else if (gap <= -25) score -= 8;
  else if (gap <= -18) score -= 6;
  else if (gap <= -12) score -= 4;
  else if (gap <= -6) score -= 2;

  // Value / payout band — BALANCED: reward accurate, fairly-priced favorites and the
  // competitive sweet spot; only fade truly brutal chalk and longshots.
  const odds = signals.pickedOddsAmerican;
  if (odds !== null) {
    if (odds <= -260) score -= 8;           // brutal chalk, tiny payout — avoid
    else if (odds <= -200) score += 2;      // chalky but accurate favorite — acceptable
    else if (odds <= -140) score += 6;      // solid favorite — good
    else if (odds <= 140) score += 9;       // best value band — competitive price
    else if (odds <= 185) score += 4;       // modest plus-money value
    else score -= 4;                        // longshot
  }

  // Overall ATS for picked side (±16 pts) — PRIMARY tendency signal.
  // Owner directive 2026-06-10: tendencies are the priority; teams do what they
  // always do. Bumped from ±13 to ±16 so rolling ATS clearly dominates the score.
  const ats = signals.atsCoverPct;
  if (ats !== null) {
    if (ats >= 65) score += 16;
    else if (ats >= 60) score += 11;
    else if (ats >= 55) score += 6;
    else if (ats >= 50) score += 1;
    else if (ats <= 40) score -= 12;
    else if (ats <= 46) score -= 6;
  }

  // Situational (home/road) ATS — extra precision (±10 pts)
  const atsHA = signals.atsHomeAwayCoverPct;
  if (atsHA !== null) {
    if (atsHA >= 63) score += 10;
    else if (atsHA >= 56) score += 5;
    else if (atsHA <= 38) score -= 10;
    else if (atsHA <= 44) score -= 5;
  }

  // Opponent ATS weakness (±9 pts)
  const atsOpp = signals.atsCoverPctOpp;
  if (atsOpp !== null) {
    if (atsOpp <= 36) score += 9;
    else if (atsOpp <= 42) score += 5;
    else if (atsOpp >= 62) score -= 6;
  }

  // FIX 2026-06-05 (audit #7, Marlins loss): was flat ±3/±4 booleans + a +4
  // "freebie" for noKeyInjuries. Junk(SP)+Conine(LF) dropped only 4 pts —
  // less than what TB's 2 RPs added. Use position-weighted severity DELTA.
  // Caller stuffs pickedInjurySeverity + oppInjurySeverity onto signals.
  const pickedSev = (signals as any).pickedInjurySeverity ?? 0;
  const oppSev = (signals as any).oppInjurySeverity ?? 0;
  const sevDelta = oppSev - pickedSev;  // positive = opp hurt worse
  if (sevDelta >= 1.5) score += 6;
  else if (sevDelta >= 0.7) score += 3;
  else if (sevDelta <= -1.5) score -= 6;
  else if (sevDelta <= -0.7) score -= 3;
  // noKeyInjuries no longer a freebie — gated to true both-clean games and small.
  if (signals.noKeyInjuries && pickedSev === 0 && oppSev === 0) score += 1;

  // Line value gap — market mispriced.
  // FIX 2026-06-05 (audit #7): was add-only; negative gap = market mispriced AGAINST us = penalty.
  if (signals.lineValueGap >= 4) score += 7;
  else if (signals.lineValueGap >= 2) score += 4;
  else if (signals.lineValueGap <= -4) score -= 7;
  else if (signals.lineValueGap <= -2) score -= 4;

  // Recent hot/cold form — but STREAK-FRAGILITY GATED. Owner directive: "how that
  // streak probably can end. Will today be the day?" A streak built on a winning L10
  // with positive avg margin is REAL; a streak built on top of a losing skid with
  // negative avg margin is FRAGILE — give it half (or none) of the bonus.
  //
  // Example: Mets +3 streak on 4-6 L10 with avg margin -1.2 → fragile, muted to +1.
  // Example: Dodgers -1 streak on 8-2 L10 with avg margin +2.8 → no fade, even though
  // streak number is negative, because the underlying form is elite.
  const streakReal = signals.pickedAvgMargin10 > 0;       // they're actually outscoring opponents
  const streakBrittle = signals.pickedAvgMargin10 < -0.5; // they're being outscored despite the streak
  if (signals.recentFormStreak >= 4) {
    score += streakBrittle ? 2 : (streakReal ? 8 : 4);
  } else if (signals.recentFormStreak >= 2) {
    score += streakBrittle ? 0 : (streakReal ? 4 : 2);
  } else if (signals.recentFormStreak <= -3) {
    // Losing streak fade — but if avgMargin is still positive (one bad week), only half fade
    score += streakReal ? -4 : -8;
  } else if (signals.recentFormStreak <= -1) {
    score += streakReal ? 0 : -4;
  }

  // FIX 2026-06-03: inverse streak check — opp form fragility. oppAvgMargin10
  // was being computed but never scored. If the opp is on a streak but their
  // underlying margin is poor, that's a streak ripe for snapping — we get
  // credit. Mirrors the picked-side fragility logic above with smaller weights
  // (we're betting the streak ends, not just exists).
  if (signals.oppAvgMargin10 < -1.0) {
    // Opp is being outscored badly — even if they've won recently, they're brittle
    score += 3;
  } else if (signals.oppAvgMargin10 < -0.5) {
    score += 1;
  } else if (signals.oppAvgMargin10 >= 1.5) {
    // FIX 2026-06-05 (audit #9): opp on a real heater = fade signal for us.
    score -= 4;
  } else if (signals.oppAvgMargin10 >= 1.0) {
    score -= 2;
  }

  // Signal conflict penalty (−8 pts)
  // ATS and win-prob pointing opposite directions = no edge
  if (signals.signalConflict) score -= 8;

  // FIX 2026-06-02: dropped the individual sharp/rest/weather branches (was double-
  // counting with sharpScoreBonus, max stack +30 from one category). The bundled
  // sharpScoreBonus already incorporates all four signals (sharpMoneyAligned,
  // reverseLineMovement, oppOnB2B/restAdvantage, weatherAlert) at calibrated
  // weights inside calcScoreBonus. Single application here, half-weighted.
  // 2026-06-04 fix: sharpLineDetected was firing on ANY game with a clear
  // favorite (winProbGap > 10), not actual sharp action — it was silently
  // adding +4 to every favorite-side pick on the slate. Only credit this
  // signal when reverseLineMovement is ALSO true, i.e. the line moved away
  // from the public side (real sharp money tell). Otherwise it's just
  // "there's a fave" and adds no informational edge.
  // FIX 2026-06-05 (audit #8 sharp): gate RLM credit on sharpFavors === pickedSide.
  // Previous code credited RLM whenever the side-specific intel object said RLM=true —
  // but that flag is set whenever ANY RLM is happening, regardless of which side it
  // points toward. So picking the public side of an RLM still scored +4. Now require
  // sharpMoneyAligned (which is direction-correct) before crediting.
  if (signals.sharpLineDetected && signals.reverseLineMovement && signals.sharpMoneyAligned) score += 4;
  else if (signals.reverseLineMovement && signals.sharpMoneyAgainst) score -= 4;
  score += Math.round(signals.sharpScoreBonus * 0.5); // bundled sharp/rest/weather, half weight

  // Neutral site penalty
  if (signals.neutralSite) score -= 3;

  // Odds available boost
  if (signals.oddsAvailable) score += 4;

  // LINE MOVEMENT — closest free proxy to "where's the money?" If the line moved TOWARD
  // our side since opening, the market is correcting in our favor (sharps agreeing).
  // If it moved AWAY, public is on the other side or sharps are fading us. Only fires
  // when we have an opening line captured (skipped on first-ever view of a game).
  if (signals.hasOpeningLine) {
    // ML movement: 15+ pts of American odds in our favor = clear sharp action
    if (signals.mlMovementForSide >= 20) score += 7;
    else if (signals.mlMovementForSide >= 10) score += 4;
    else if (signals.mlMovementForSide >= 5) score += 2;
    else if (signals.mlMovementForSide <= -20) score -= 7;
    else if (signals.mlMovementForSide <= -10) score -= 4;
    else if (signals.mlMovementForSide <= -5) score -= 2;
    // Spread movement: 1+ point in our favor is meaningful
    if (signals.spreadMovementForSide >= 1.0) score += 3;
    else if (signals.spreadMovementForSide >= 0.5) score += 1;
    else if (signals.spreadMovementForSide <= -1.0) score -= 3;
    else if (signals.spreadMovementForSide <= -0.5) score -= 1;
  }

  // ODDS-BUCKET HIT-RATE ("eyes" tendency) — owner directive: track how each price band
  // is actually performing in OUR record. A -135 bucket that's gone 1-7 since 5/27 is
  // overpaying chalk; dock confidence so we stop slot-filling there. A +105 bucket
  // hitting 55% is real value; reward it. Minimum sample 5 — otherwise we're reacting
  // to noise. Capped at ±10 to avoid overcorrecting on streaky samples.
  if (signals.oddsBucketSample >= 5) {
    const edge = signals.oddsBucketEdgePct; // already (actual - breakeven)
    if (edge >= 15) score += 8;
    else if (edge >= 8) score += 5;
    else if (edge >= 3) score += 2;
    else if (edge <= -15) score -= 10;
    else if (edge <= -8) score -= 6;
    else if (edge <= -3) score -= 3;
  }

  // MLB PROBABLE PITCHER MATCHUP — the single most predictive MLB side-bet factor.
  // Compare our starter's L5 ERA vs the opposing starter's L5 ERA. Big delta in our
  // favor (lower ERA) = real edge; big delta against = fade. Only fires with sample.
  if (signals.pickedPitcherStarts >= 3 && signals.oppPitcherStarts >= 3) {
    const ourEra = signals.pickedPitcherEraL5;
    const oppEra = signals.oppPitcherEraL5;
    if (ourEra > 0 && oppEra > 0) {
      const eraDelta = oppEra - ourEra; // positive = our SP better
      if (eraDelta >= 3.0) score += 10;      // commanding starter edge
      else if (eraDelta >= 2.0) score += 7;  // strong edge
      else if (eraDelta >= 1.0) score += 4;  // moderate edge
      else if (eraDelta <= -3.0) score -= 10;
      else if (eraDelta <= -2.0) score -= 7;
      else if (eraDelta <= -1.0) score -= 4;
    }
    // Absolute starter quality boost — an elite starter (sub-3 ERA L5) is a major
    // confidence anchor even if the opposing SP is also good. Inversely, a starter
    // with an ERA above 6 in their last 5 is bleeding runs; dock confidence.
    if (signals.pickedPitcherEraL5 > 0) {
      if (signals.pickedPitcherEraL5 <= 2.5) score += 5;
      else if (signals.pickedPitcherEraL5 <= 3.5) score += 2;
      else if (signals.pickedPitcherEraL5 >= 6.0) score -= 6;
      else if (signals.pickedPitcherEraL5 >= 5.0) score -= 3;
    }
    // Opponent's starter is awful → ride it. ALSO penalize elite opp SP.
    // FIX 2026-06-05 (audit #11): was add-only; an elite opp ace at sub-3 ERA never docked us.
    if (signals.oppPitcherEraL5 >= 6.0) score += 4;
    else if (signals.oppPitcherEraL5 >= 5.0) score += 2;
    else if (signals.oppPitcherEraL5 > 0 && signals.oppPitcherEraL5 <= 2.5) score -= 5;
    else if (signals.oppPitcherEraL5 > 0 && signals.oppPitcherEraL5 <= 3.5) score -= 2;
    // FIX 2026-06-02: WHIP delta was being computed but never scored. WHIP catches
    // pitchers who give up traffic even with okay ERA — the "stranded runners"
    // effect that masks future regression. Modest weight (±3) so it doesn't
    // dominate the ERA branch above.
    if (signals.pickedPitcherWhipL5 > 0 && signals.oppPitcherWhipL5 > 0) {
      const whipDelta = signals.oppPitcherWhipL5 - signals.pickedPitcherWhipL5;
      if (whipDelta >= 0.4) score += 3;
      else if (whipDelta >= 0.2) score += 1;
      else if (whipDelta <= -0.4) score -= 3;
      else if (whipDelta <= -0.2) score -= 1;
    }
  }

  // OPS LINEUP-vs-PITCHER MATCHUP — added 2026-06-02 with MLB Stats API enrichment.
  // ERA tells you the pitcher's overall results; OPS tells you whether THIS specific
  // lineup has the bat profile to hit THIS pitcher. The Tampa-TT-Under loss happened
  // because we trusted Madden's ERA L3 without knowing Tampa's lineup OPS vs RHP.
  // Positive ourLineupEdge = our hitters likely to do damage vs opp pitcher → ML lean us
  // Positive theirLineupEdge = their hitters likely to do damage vs our pitcher → fade us
  const ourLineupEdge = signals.pickedLineupVsPitcherOpsDelta || 0;
  const theirLineupEdge = signals.oppLineupVsPitcherOpsDelta || 0;
  if (ourLineupEdge >= 0.080) score += 4;       // strong hitting matchup our way
  else if (ourLineupEdge >= 0.040) score += 2;
  else if (ourLineupEdge <= -0.080) score -= 4; // we're in a tough matchup
  else if (ourLineupEdge <= -0.040) score -= 2;
  if (theirLineupEdge >= 0.080) score -= 4;     // they're going to hit our SP
  else if (theirLineupEdge >= 0.040) score -= 2;
  else if (theirLineupEdge <= -0.080) score += 4;
  else if (theirLineupEdge <= -0.040) score += 2;

  // FIRST-FRAME TENDENCY — owner directive: "Are they better in the first quarter? Are
  // they better in the first half?" MLB-ONLY logic: 1st-inning scoring % (a team
  // scoring in the 1st 70%+ of games doesn't wait around). Gated on isBaseball
  // because basketball teams ALWAYS score in Q1 — for basketball, this signal is
  // useless and the proper Q1 logic lives below.
  const isBaseballByData = signals.tendencyF5TotalAvg > 0; // MLB picks have F5 data populated
  if (signals.tendencyFirstFrameSample >= 5 && isBaseballByData) {
    if (signals.tendencyFirstFrameScored >= 70) score += 4;
    else if (signals.tendencyFirstFrameScored >= 60) score += 2;
    if (signals.tendencyFirstFrameAllowed >= 70) score -= 4;
    else if (signals.tendencyFirstFrameAllowed >= 60) score -= 2;
    // Opponent inverse — they bleed in the 1st = boost us
    if (signals.tendencyOppFirstFrameAllowed >= 70) score += 3;
    if (signals.tendencyOppFirstFrameScored <= 30) score += 2;
  }

  // NBA/WNBA 1Q + H1 TENDENCY — basketball equivalent of the 1st-inning signal. Uses
  // absolute scoring averages (not percentages, since teams always score in Q1). The
  // key insight: when one team's avg Q1 scoring meaningfully outpaces the opponent's
  // avg Q1 ALLOWED, they have a fast-start edge that compounds across the game.
  // Fires when we have a basketball sample (pickedAvgQ1Scored > 0 = basketball league).
  if (signals.pickedAvgQ1Scored > 0 && signals.oppAvgQ1Allowed > 0 && signals.tendencyFirstFrameSample >= 5) {
    // Fast-start delta — we score more in Q1 than opp typically gives up
    const q1Edge = signals.pickedAvgQ1Scored - signals.oppAvgQ1Allowed;
    if (q1Edge >= 6) score += 5;       // commanding Q1 edge
    else if (q1Edge >= 3) score += 3;
    else if (q1Edge <= -6) score -= 5;
    else if (q1Edge <= -3) score -= 3;
    // Lead-after-Q1 history — teams that lead Q1 60%+ of games are reliable fast starters
    if (signals.pickedPctLeadAfterQ1 >= 65) score += 3;
    else if (signals.pickedPctLeadAfterQ1 <= 35) score -= 2;
    // H1 scoring edge — broader read; useful for 1H spread/total picks too
    if (signals.pickedAvgH1Scored > 0 && signals.oppAvgH1Allowed > 0) {
      const h1Edge = signals.pickedAvgH1Scored - signals.oppAvgH1Allowed;
      if (h1Edge >= 8) score += 4;
      else if (h1Edge >= 4) score += 2;
      else if (h1Edge <= -8) score -= 4;
      else if (h1Edge <= -4) score -= 2;
    }
    // FIX 2026-06-02: mirrored H1 edge — opp's H1 attack vs our H1 defense was
    // dead. A team that gives up 60 in the first half plays from behind even if
    // their offense projects equal. Same weights as above for symmetry.
    if (signals.oppAvgH1Scored > 0 && signals.pickedAvgH1Allowed > 0) {
      const defH1Edge = signals.pickedAvgH1Allowed - signals.oppAvgH1Scored;
      if (defH1Edge >= 8) score -= 4;       // we give up MORE than opp scores → bad
      else if (defH1Edge >= 4) score -= 2;
      else if (defH1Edge <= -8) score += 4; // we lock them down below their norm → good
      else if (defH1Edge <= -4) score += 2;
    }
    // Lead-after-H1 history — teams that lead H1 65%+ rarely lose those games
    if (signals.pickedPctLeadAfterH1 >= 65) score += 4;
    else if (signals.pickedPctLeadAfterH1 <= 35) score -= 3;
  }

  // F5 DIVERGENCE — was using combined totals which conflated offense + defense.
  // FIX 2026-06-05 (audit #3): use scored-vs-allowed split now that we populate
  // them properly from tendenciesService (avgF5Scored / avgF5Allowed were dead
  // data — computed by tendenciesService but never read by the engine until now).
  const pF5S = (signals as any).pickedAvgF5Scored ?? 0;
  const pF5A = (signals as any).pickedAvgF5Allowed ?? 0;
  const oF5S = (signals as any).oppAvgF5Scored ?? 0;
  const oF5A = (signals as any).oppAvgF5Allowed ?? 0;
  if (signals.tendencyFirstFrameSample >= 5 && pF5S > 0 && oF5A > 0) {
    const ourExpF5 = (pF5S + oF5A) / 2;
    const theirExpF5 = (oF5S + pF5A) / 2;
    const f5OffenseEdge = ourExpF5 - theirExpF5;
    if (f5OffenseEdge >= 1.0) score += 3;
    else if (f5OffenseEdge >= 0.5) score += 1;
    else if (f5OffenseEdge <= -1.0) score -= 3;
    else if (f5OffenseEdge <= -0.5) score -= 1;
  } else if (signals.tendencyFirstFrameSample >= 5 && signals.tendencyF5TotalAvg > 0 && signals.tendencyOppF5TotalAvg > 0) {
    // Fallback to combined totals if split data unavailable.
    const f5Delta = signals.tendencyF5TotalAvg - signals.tendencyOppF5TotalAvg;
    if (f5Delta >= 2.5) score += 3;
    else if (f5Delta <= -2.5) score -= 3;
  }

  // BULLPEN STATE (MLB) — owner asked about bullpen. We don't have paid bullpen ERA,
  // but late-inning (7-9) runs allowed over last 10 games is the cleanest proxy.
  // High allowed = OUR bullpen leaks late (fade us); low opponent bullpen-allowed =
  // they shut games down (fade us). Inverse: opp's leaky bullpen = we ride to win.
  if (signals.tendencyFirstFrameSample >= 5) {
    if (signals.pickedBullpenAllowed >= 2.5) score -= 5;     // our bullpen is bad
    else if (signals.pickedBullpenAllowed <= 0.8) score += 3; // our bullpen is lockdown
    if (signals.oppBullpenAllowed >= 2.5) score += 5;        // their bullpen is bad
    else if (signals.oppBullpenAllowed <= 0.8) score -= 3;   // their bullpen is lockdown
    // Blown-lead trauma — a team that's coughed up a post-6th lead in 30%+ of recent
    // games has a chronic late-game problem
    if (signals.pickedPctBlewLateLead >= 30) score -= 4;
    if (signals.oppPctBlewLateLead >= 30) score += 4;
  }

  // Data quality floor
  const dq = signals.dataQuality;
  if (dq < 30) score = Math.min(score, 52);
  else if (dq < 50) score = Math.min(score, 63);
  else if (dq < 65) score = Math.min(score, 75);

  return Math.max(0, Math.min(100, Math.round(score)));
}

// Owner confidence bands: NOTHING below 80 anywhere (the GLOBAL_FLOOR) — Grand Slam 96+,
// Pressure 83–95, VIP/Parlay 80–82. A play only earns a tier if it clears that tier's floor;
// we never promote a weaker pick up to fill a slot. A game with no market reaching 80 is
// dropped entirely (no lazy 67s, including on Big Games) — quality over quantity.
const GLOBAL_FLOOR = 80;
function assignTier(score: number, _confirmingSignals: number): ProductTier {
  // CONFIDENCE-FIRST TIERING (rewritten 2026-06-02 after owner: "if Under 8 is conf
  // 99, why is it in Parlay? Do you not trust him?"). Confidence already weights every
  // signal — gating again on signal count was double-counting and producing the exact
  // mismatch where a 99-confidence pick got buried in VIP/Parlay. Now: trust the score.
  // Safety checks (injury on picked side, signal conflict, heavy chalk) still apply
  // downstream in isGrandSlamEligible.
  if (score < GLOBAL_FLOOR) return 'PASS';
  if (score >= 94) return 'GRAND_SLAM';
  if (score >= 88) return 'PRESSURE_PACK';
  if (score >= 83) return 'VIP_4_PACK';
  if (score >= GLOBAL_FLOOR) return 'PARLAY_PLAN';
  return 'PASS';
}

// Pressure Pack confidence floor (owner rule: 83–95). Used to gate the thin-slate backfill
// so Pressure never gets a sub-83 play.
const PRESSURE_FLOOR = 83;

// ─── Pick Selection by Sport Style ───────────────────────────────────────────

function pickForNA(
  home: TeamProfile, away: TeamProfile, spread: number | null, total: number | null, pickedSide: 'home' | 'away', league: string,
): { selectionSide: 'home' | 'away'; marketType: 'spread' | 'moneyline' | 'total'; selection: string; odds: string | null; line: string | null } {
  const pickedTeam = pickedSide === 'home' ? home : away;
  const ml = pickedTeam.moneyline;
  const mlStr = ml != null ? `${ml > 0 ? '+' : ''}${ml}` : null;

  const moneyline = () => ({ selectionSide: pickedSide, marketType: 'moneyline' as const, selection: `${pickedTeam.name} ML`, odds: mlStr, line: null });
  const spreadPlay = () => {
    // Spread = 0 is a pickem and has no real meaning as a spread play — fall through to ML.
    // (NCAA Baseball + KBO scoreboard often shows spread: 0.0 with a heavy ML favorite.)
    if (spread === null || spread === 0) return null;
    const spreadVal = pickedSide === 'home' ? spread : -spread;
    const spreadStr = spreadVal > 0 ? `+${spreadVal}` : `${spreadVal}`;
    return { selectionSide: pickedSide, marketType: 'spread' as const, selection: `${pickedTeam.name} ${spreadStr}`, odds: '-110', line: spreadStr };
  };
  const totalPlay = () => {
    if (total === null) return null;
    // Pick the SIDE from our own projection, not a hardcoded Over. Each team's avgTotal10
    // is a full-game total estimate; the projected game total is their average. Predicted
    // above the posted line → Over is the value; below → Under. Without a projection we
    // refuse to publish a coin-flip total (fall through to the moneyline instead).
    const ht = home.trends?.avgTotal10 ?? null;
    const at = away.trends?.avgTotal10 ?? null;
    if (ht == null && at == null) return null;
    const predicted = ht != null && at != null ? (ht + at) / 2 : (ht ?? at) as number;
    const side = predicted >= total ? 'Over' : 'Under';
    return { selectionSide: pickedSide, marketType: 'total' as const, selection: `${side} ${total}`, odds: '-110', line: `${total}` };
  };

  // FULL-BOARD selection — we play every market, picking the best version of the play:
  //  • Value side (pick'em, small favorite, or dog priced ≈ -150 to +160) → the MONEYLINE.
  //  • Chalky favorite → the SPREAD / RUN LINE (MLB -1.5) at -110 — the value version that
  //    actually pays, instead of laying heavy juice. Run lines stay (per owner) — the
  //    Dodgers -1.5 Grand Slam won. Confidence/value scoring decides which spots to feature.
  //  • No spread available → the TOTAL, then fall back to the moneyline.
  if (ml != null && ml >= -150 && ml <= 160) return moneyline();
  return spreadPlay() ?? totalPlay() ?? moneyline();
}

// ─── Best-Market-Per-Game (totals / team totals / halves / quarters / F5) ─────
// Confidence for a totals-family play, on the same 0-100 scale as scoreGame. Driven by
// how far our projection beats the posted line (normalized by the line so MLB runs and
// NBA points are comparable) plus recent over/under tendency confirmation. Capped at 90 —
// a total is a strong lean, never a near-lock.
function scoreTotalsConfidence(projection: number, line: number, ouAlignRate: number | null): number {
  const edge = Math.abs(projection - line);
  const pct = line > 0 ? edge / line : 0;
  let conf = 55;
  if (pct >= 0.14) conf += 26;
  else if (pct >= 0.10) conf += 20;
  else if (pct >= 0.07) conf += 14;
  else if (pct >= 0.05) conf += 9;
  else if (pct >= 0.03) conf += 4;
  else conf -= 6;            // negligible edge — the book has it right
  if (ouAlignRate != null) {
    if (ouAlignRate >= 0.70) conf += 10;
    else if (ouAlignRate >= 0.60) conf += 5;
    else if (ouAlignRate < 0.40) conf -= 8;
  }
  return Math.max(0, Math.min(90, Math.round(conf)));
}

function ouOverRate(b: { wins: number; losses: number } | null | undefined): number | null {
  if (!b) return null;
  const decisive = b.wins + b.losses;
  if (decisive < 5) return null;
  return b.wins / decisive;
}

// Score a REAL-line player prop to the 0-100 board scale (same shape as scoreTotalsConfidence,
// cap 90). Only props measured against a real sportsbook line count — a projected line isn't a
// gradable value play. edgePct is the projection-vs-line edge as a percent; streak is "hit the
// real line in N of last M games"; confidence is the prop engine's own tier.
function scorePropConfidence(rec: any): number {
  if (!rec?.hasRealLine) return 0;
  const e = Math.abs(Number(rec.edgePct) || 0);
  let conf = 55;
  if (e >= 20) conf += 28; else if (e >= 14) conf += 22; else if (e >= 10) conf += 16;
  else if (e >= 7) conf += 10; else if (e >= 4) conf += 5; else conf -= 6;
  const win = Number(rec.streakWindow) || 0;
  if (win > 0) {
    const rate = (Number(rec.streakOver) || 0) / win;
    if (rate >= 0.8) conf += 8; else if (rate >= 0.6) conf += 4; else if (rate <= 0.2) conf -= 6;
  }
  if (rec.confidence === 'ELITE') conf += 4; else if (rec.confidence === 'LOW') conf -= 8;
  return Math.max(0, Math.min(90, Math.round(conf)));
}

export interface BestMarketSwap {
  selection: string;
  marketType: string;            // total | team_total | 1h_total | 2h_total | q1_total..q4_total | p1_total..p3_total | f5_total
  selectionSide: 'home' | 'away';
  odds: string | null;
  line: string | null;
  confidence: number;
  detail: string;
  // FIX 2026-06-06: full bullet list for the customer/admin "Why we like this
  // pick" panel. Was missing — only `detail` (one sentence) was carried, which
  // meant a market-swapped pick (TT / total / F5 / period) shipped with just a
  // single line of reasoning even when buildMarketCandidates built 5-7 bullets.
  reasonsFor?: string[];
}

// Evaluate the totals-family markets for ONE already-selected pick and return the single
// strongest one (or null). Used by the board enrichment to swap a featured pick to a
// total / team total / half / quarter / F5 when it is clearly the better play than the
// side/run line. Fetches alt lines + period markets + F5 in parallel; all best-effort.
// Returns the single strongest market for a pick (used to swap a featured pick's market).
export async function buildBestMarketSwap(pick: any, opts?: { includeProps?: boolean }): Promise<BestMarketSwap | null> {
  const all = await buildMarketCandidates(pick, opts);
  return all[0] ?? null;
}

// UNIFIED TENDENCY BOOST — owner directive: "Everything needs to work together." The deep
// tendency stack (pitcher matchup, bullpen, 1st-inning %, line movement, streak fragility,
// odds-bucket eyes) is wired into scoreGame() for the main side bets. But buildMarketCandidates
// uses scoreTotalsConfidence + propEdge + period scores — which never see the tendency data.
// This function bridges that gap: apply the tendency signals to EVERY market candidate so
// totals, team totals, F5, periods, halves, and props get the same deep-data adjustment that
// side picks get. Result: real 90+ candidates surface where the surface math saw 82.
//
// Signed: positive = boost (more confidence), negative = dock. Capped per-signal to avoid
// any single tendency dominating; stacked signals can legitimately move a candidate +15.
function boostByTendencies(candidate: BestMarketSwap, signals: Omit<import('./deepResearchService').GameSignals, 'confirmingSignals'> | any): number {
  if (!signals) return 0;
  let boost = 0;
  const sel = candidate.selection.toLowerCase();
  const mkt = candidate.marketType.toLowerCase();
  const isOver = /\bover\b/.test(sel);
  const isUnder = /\bunder\b/.test(sel);
  const isF5 = mkt.includes('f5');
  const isHalfOrQuarter = mkt.includes('1h_') || mkt.includes('2h_') || mkt.startsWith('q') || mkt.startsWith('p');
  const isTeamTotal = mkt.includes('team_total');
  const isFullTotal = mkt === 'total';

  // PITCHER MATCHUP — applies to totals, F5, team totals, and prop K-counts
  if (signals.pickedPitcherStarts >= 3 && signals.pickedPitcherEraL5 > 0) {
    // Strong starter (sub-3 ERA L5) → favors UNDER on totals; F5 especially
    if (signals.pickedPitcherEraL5 <= 2.5) {
      if (isFullTotal && isUnder) boost += 5;
      else if (isF5 && isUnder) boost += 7;
      else if (isTeamTotal && isUnder) boost += 3;
      else if ((isFullTotal || isF5) && isOver) boost -= 4;
    } else if (signals.pickedPitcherEraL5 <= 3.5) {
      if (isF5 && isUnder) boost += 3;
    } else if (signals.pickedPitcherEraL5 >= 5.0) {
      // Bad starter → favors OVER, especially F5
      if (isF5 && isOver) boost += 7;
      else if (isFullTotal && isOver) boost += 4;
      else if (isTeamTotal && isOver) boost += 3;
    }
  }

  // OPS MATCHUP — when lineup-vs-pitcher OPS delta is meaningful, nudge totals/team totals
  // and full-game totals consistently. Positive lineup OPS edge = HITTING matchup = Over lean.
  const ourLineupEdge = signals.pickedLineupVsPitcherOpsDelta || 0;
  const theirLineupEdge = signals.oppLineupVsPitcherOpsDelta || 0;
  const combinedLineupEdge = ourLineupEdge + theirLineupEdge;
  if (combinedLineupEdge >= 0.10) {
    if ((isFullTotal || isF5) && isOver) boost += 4;
    else if ((isFullTotal || isF5) && isUnder) boost -= 4;
    if (isTeamTotal && ourLineupEdge >= 0.06 && isOver) boost += 3;
  } else if (combinedLineupEdge <= -0.10) {
    if ((isFullTotal || isF5) && isUnder) boost += 4;
    else if ((isFullTotal || isF5) && isOver) boost -= 4;
    if (isTeamTotal && ourLineupEdge <= -0.06 && isUnder) boost += 3;
  }

  // WEATHER nudge — wind out (positive nudge) favors Overs; wind in favors Unders.
  const wxNudge = signals.weatherWindNudge || 0;
  if (wxNudge >= 0.5 && (isFullTotal || isTeamTotal) && isOver) boost += 3;
  else if (wxNudge <= -0.5 && (isFullTotal || isTeamTotal) && isUnder) boost += 3;
  else if (wxNudge >= 0.5 && isUnder) boost -= 2;
  else if (wxNudge <= -0.5 && isOver) boost -= 2;

  // OPPONENT PITCHER — same logic mirrored; affects opponent's team total (their score)
  if (signals.oppPitcherStarts >= 3 && signals.oppPitcherEraL5 > 0) {
    if (signals.oppPitcherEraL5 >= 5.0 && isFullTotal && isOver) boost += 3;
    if (signals.oppPitcherEraL5 <= 2.5 && isFullTotal && isUnder) boost += 3;
  }

  // BULLPEN — leaky bullpen = full-game over and late-inning over; lockdown = under
  if (signals.tendencyFirstFrameSample >= 5) {
    if (signals.pickedBullpenAllowed >= 2.5 && isFullTotal && isOver) boost += 4;
    if (signals.oppBullpenAllowed >= 2.5 && isFullTotal && isOver) boost += 4;
    if (signals.pickedBullpenAllowed <= 0.8 && isFullTotal && isUnder) boost += 3;
    if (signals.oppBullpenAllowed <= 0.8 && isFullTotal && isUnder) boost += 3;
  }

  // TOTAL LINE MOVEMENT — added 2026-06-02 (was computed but never scored). When
  // the total moved meaningfully since open, that's steam. Positive movement =
  // total went UP since open = Over steam. Negative = Under steam.
  if (signals.hasOpeningLine && Math.abs(signals.totalMovement) >= 0.5 && (isFullTotal || isTeamTotal || isF5)) {
    if (signals.totalMovement >= 1.0 && isOver) boost += 4;
    else if (signals.totalMovement >= 0.5 && isOver) boost += 2;
    else if (signals.totalMovement <= -1.0 && isUnder) boost += 4;
    else if (signals.totalMovement <= -0.5 && isUnder) boost += 2;
    // The market disagrees with our pick direction — small dock.
    else if (signals.totalMovement >= 1.0 && isUnder) boost -= 2;
    else if (signals.totalMovement <= -1.0 && isOver) boost -= 2;
  }

  // 1ST-INNING TENDENCY (baseball-only via F5 data presence)
  if (signals.tendencyFirstFrameSample >= 5 && signals.tendencyF5TotalAvg > 0) {
    // Team scores in 1st 70%+ of games → F5 over boost; opp inverse
    if (signals.tendencyFirstFrameScored >= 70 && isF5 && isOver) boost += 4;
    if (signals.tendencyOppFirstFrameAllowed >= 70 && isF5 && isOver) boost += 4;
    if (signals.tendencyFirstFrameScored <= 30 && isF5 && isUnder) boost += 3;
    if (signals.tendencyOppFirstFrameAllowed <= 30 && isF5 && isUnder) boost += 3;
  }

  // BASKETBALL Q1/H1 TENDENCY — applies to 1Q, 1H markets
  if (signals.pickedAvgQ1Scored > 0 && signals.oppAvgQ1Allowed > 0 && isHalfOrQuarter) {
    const q1Edge = signals.pickedAvgQ1Scored - signals.oppAvgQ1Allowed;
    if (q1Edge >= 4 && isOver) boost += 4;
    else if (q1Edge <= -4 && isUnder) boost += 4;
  }

  // STREAK FRAGILITY — fragile streaks dock the side bet portions; real streaks boost
  if (signals.recentFormStreak >= 3 && signals.pickedAvgMargin10 >= 1.5) {
    // Real streak — boost team-total over and any side bet
    if (isTeamTotal && isOver) boost += 3;
  } else if (signals.recentFormStreak >= 3 && signals.pickedAvgMargin10 <= -0.5) {
    // Fragile streak — dock team-total over and side bets
    if (isTeamTotal && isOver) boost -= 3;
  }

  // LINE MOVEMENT — sharp action signal applies to any market on the side it favors
  if (signals.hasOpeningLine) {
    if (signals.mlMovementForSide >= 20) boost += 3;
    else if (signals.mlMovementForSide >= 10) boost += 2;
    else if (signals.mlMovementForSide <= -20) boost -= 3;
    else if (signals.mlMovementForSide <= -10) boost -= 2;
  }

  // ODDS-BUCKET EYES — applies to whatever bucket this candidate's price falls into
  if (signals.oddsBucketSample >= 5) {
    if (signals.oddsBucketEdgePct >= 10) boost += 3;
    else if (signals.oddsBucketEdgePct >= 5) boost += 1;
    else if (signals.oddsBucketEdgePct <= -10) boost -= 3;
    else if (signals.oddsBucketEdgePct <= -5) boost -= 1;
  }

  // Hard cap each direction so no single boost dominates the base score
  return Math.max(-15, Math.min(15, boost));
}

// Returns ALL evaluated markets for a game (full total, team totals, halves, quarters,
// periods, F5, and — when asked — player props), sorted strongest-first. Used by the Big
// Games expansion to surface MULTIPLE plays per game.
export async function buildMarketCandidates(pick: any, opts?: { includeProps?: boolean }): Promise<BestMarketSwap[]> {
  const league: string = pick?.league || '';
  const home = pick?.homeTeam, away = pick?.awayTeam;
  const homeName: string = home?.name || '', awayName: string = away?.name || '';
  if (!homeName || !awayName) return [];

  const homeTot = home?.trends?.avgTotal10 ?? null;
  const awayTot = away?.trends?.avgTotal10 ?? null;
  const homeMargin = home?.trends?.avgMargin10 ?? null;
  const awayMargin = away?.trends?.avgMargin10 ?? null;
  const combinedOverRate = (() => {
    const ho = ouOverRate(home?.trends?.ou10), ao = ouOverRate(away?.trends?.ou10);
    if (ho != null && ao != null) return (ho + ao) / 2;
    return ho ?? ao;
  })();

  const candidates: BestMarketSwap[] = [];

  // PITCHER-AWARE PROJECTION ADJUSTMENT — when the parent pick carries MLB pitcher data
  // from the deep signal stack, drag the totals projection by the pitcher matchup so
  // every totals scorer agrees with the side-bet thesis. Without this, scoreGame() may
  // pick a side based on pitcher matchup (low-scoring thesis) while scoreTotalsConfidence
  // projects OVER from raw team form averages — same engine, contradicting itself.
  // Owner directive 2026-06-01: no contradictions across the website.
  const parentSig: any = (pick as any)?.signals || null;
  const pitcherAdjustment = (() => {
    if (!parentSig || !parentSig.pickedPitcherStarts || parentSig.pickedPitcherStarts < 3) return 0;
    let adj = 0;
    const ourEra = parentSig.pickedPitcherEraL5 || 0;
    const oppEra = parentSig.oppPitcherEraL5 || 0;
    // SAMPLE-SIZE GATE (added 2026-06-01 after Tampa scored 9 in a "low-scoring" thesis
    // game): when we have <5 starts of data we apply HALF the adjustment. 3-4 starts is
    // a small-sample signal — Madden's 2.38 ERA L3 tonight was a mirage; we treated it
    // like ace-level data and the Tampa team-total UNDER thesis lost (Tampa scored 9).
    // Below 5 starts = half-weight; 5+ starts = full-weight.
    const ourReliable = parentSig.pickedPitcherStarts >= 5;
    const oppReliable = (parentSig.oppPitcherStarts || 0) >= 5;
    const ourWeight = ourReliable ? 1.0 : 0.5;
    const oppWeight = oppReliable ? 1.0 : 0.5;
    // Strong starter → projection drops (opponents score less)
    if (ourEra > 0 && ourEra <= 2.5) adj -= 1.2 * ourWeight;
    else if (ourEra > 0 && ourEra <= 3.5) adj -= 0.6 * ourWeight;
    else if (ourEra >= 5.5) adj += 0.8 * ourWeight;
    // Bad opponent starter → projection rises (our team scores more), but capped because
    // a weak offensive team (low team avgTotal10) limits the upside.
    if (oppEra >= 5.5) adj += 0.8 * oppWeight;
    else if (oppEra >= 4.5) adj += 0.4 * oppWeight;
    else if (oppEra > 0 && oppEra <= 2.5) adj -= 1.0 * oppWeight;
    else if (oppEra > 0 && oppEra <= 3.5) adj -= 0.5 * oppWeight;
    // OPS MATCHUP DELTA — added 2026-06-01. The Tampa-TT-Under loss happened
    // because we only had ERA. Two MLB Stats API signals add direct matchup math:
    //   pickedLineupVsPitcherOpsDelta = OUR lineup vs OPP pitcher (positive = we hit them)
    //   oppLineupVsPitcherOpsDelta    = THEIR lineup vs OUR pitcher (positive = they hit us)
    // Total projection moves UP when either side has a hitter advantage. Capped at
    // ±1.5 runs combined to avoid over-fitting on noisy season splits.
    const ourLineupEdge = parentSig.pickedLineupVsPitcherOpsDelta || 0;
    const theirLineupEdge = parentSig.oppLineupVsPitcherOpsDelta || 0;
    // OPS delta of ~0.080 (e.g. lineup .800 vs pitcher .720 OPS-allowed) is meaningful.
    // Scale: 0.080 delta ≈ 0.6 run; cap at ±0.8 per side.
    const ourLineupRuns = Math.max(-0.8, Math.min(0.8, ourLineupEdge * 7.5));
    const theirLineupRuns = Math.max(-0.8, Math.min(0.8, theirLineupEdge * 7.5));
    adj += ourLineupRuns + theirLineupRuns;
    // WEATHER nudge — wind already computed in signals, ±0.5 run per direction.
    adj += parentSig.weatherWindNudge || 0;
    return adj;
  })();

  // BASKETBALL PROJECTION ADJUSTMENT — owner directive: every sport needs its key
  // defining factors. For basketball, the pitcher equivalent is PACE + REST + the
  // OFF/DEF rating matchup. We have:
  //   - PACE: avgTotal10 per team — when both teams play high-pace, total projects UP
  //   - REST: sharpIntel.rest carries oppOnB2B + restAdvantage (already in scoring as boost)
  //   - OFF/DEF rating: derive from avg margin + avg total (a team scoring 175 with +5
  //     margin has a strong offense; scoring 165 with -3 margin has weak both ends)
  // The basketball signal pickedAvgQ1Scored already tells us start-fast tendency; we
  // use it here to inform totals projection too (fast-starting team typically plays
  // fast all game).
  const basketballAdjustment = (() => {
    if (!parentSig) return 0;
    // Basketball is identified when our Q1 scoring data is populated (engine only
    // computes pickedAvgQ1Scored for NBA/WNBA leagues per tendenciesService).
    // FIX 2026-06-02: require BOTH sides' Q1 data + meaningful sample. Previously
    // missing opp data made oppQ1Scored default to 0, halving combinedQ1 and
    // producing phantom -1.5/-3.0 grind-it-out adjustments.
    if (!parentSig.pickedAvgQ1Scored || parentSig.pickedAvgQ1Scored <= 0) return 0;
    if (!parentSig.oppAvgQ1Scored || parentSig.oppAvgQ1Scored <= 0) return 0;
    if (!parentSig.pickedAvgQ1Allowed || parentSig.pickedAvgQ1Allowed <= 0) return 0;
    if ((parentSig.tendencyFirstFrameSample || 0) < 5) return 0;
    let adj = 0;
    // PACE check — both teams' Q1 scoring avg. High Q1 scoring is a pace proxy.
    const ourQ1 = parentSig.pickedAvgQ1Scored || 0;
    const oppQ1Scored = parentSig.oppAvgQ1Scored || 0;
    const combinedQ1 = (ourQ1 + oppQ1Scored) / 2;
    // Q1 scoring above ~25 is high-pace; below ~21 is slow. ±3 pts on total projection.
    if (combinedQ1 >= 27) adj += 3.5;       // very high pace
    else if (combinedQ1 >= 24) adj += 1.5;
    else if (combinedQ1 <= 20) adj -= 3.0;  // grinding pace
    else if (combinedQ1 <= 22) adj -= 1.5;
    // OFF/DEF MATCHUP — when our team scores a lot in Q1 vs an opp that gives up a
    // lot in Q1, the game shapes up high-scoring. Inverse for grind-it-out.
    const oppQ1Allowed = parentSig.oppAvgQ1Allowed || 0;
    const matchupDelta = (ourQ1 - oppQ1Allowed) + (oppQ1Scored - (parentSig.pickedAvgQ1Allowed || 0));
    if (matchupDelta >= 6) adj += 2.0;       // fireworks predicted
    else if (matchupDelta <= -6) adj -= 2.0; // defensive slugfest predicted
    // REST signal — B2B opponent tends to push totals UP (tired legs = less defense
    // late, more transition baskets) but caps at 2 points
    if (parentSig.oppOnB2B) adj += 1.0;
    return adj;
  })();
  // Combined non-pitcher adjustment — used wherever a totals projection runs for any sport.
  const sportAdjustment = pitcherAdjustment + basketballAdjustment;

  // 1) FULL-GAME TOTAL — line from the scoreboard, projection adjusted by sport-specific
  //    key factors (MLB pitcher matchup, basketball pace/rest/matchup).
  if (pick?.total != null && homeTot != null && awayTot != null) {
    const rawProj = (homeTot + awayTot) / 2;
    const proj = rawProj + sportAdjustment;
    const over = proj >= pick.total;
    const align = combinedOverRate != null ? (over ? combinedOverRate : 1 - combinedOverRate) : null;
    const adjustParts: string[] = [];
    if (pitcherAdjustment !== 0) adjustParts.push(`SP ${pitcherAdjustment > 0 ? '+' : ''}${pitcherAdjustment.toFixed(1)}`);
    if (basketballAdjustment !== 0) adjustParts.push(`pace ${basketballAdjustment > 0 ? '+' : ''}${basketballAdjustment.toFixed(1)}`);
    const adjustNote = adjustParts.length ? ` (${adjustParts.join(', ')})` : '';
    // FIX 2026-06-06: build a real bullet list for full-game total picks.
    const totalReasons: string[] = [];
    const direction = over ? 'OVER' : 'UNDER';
    totalReasons.push(`Projected total: ${proj.toFixed(1)} vs market line ${pick.total} — ${Math.abs(proj - pick.total).toFixed(1)}-point edge on the ${direction}.`);
    if (adjustParts.length > 0) totalReasons.push(`Projection adjusted by: ${adjustParts.join(', ')}.`);
    if (homeTot != null && awayTot != null) totalReasons.push(`Combined recent baseline: ${homeTot.toFixed(1)} (home L10 avg total) + ${awayTot.toFixed(1)} (away L10 avg total).`);
    if (align != null) {
      const alignPct = Math.round(align * 100);
      const matchPhrase = align >= 0.55 ? 'aligns with' : align <= 0.45 ? 'mild contradiction to' : 'is neutral on';
      totalReasons.push(`Combined ${direction.toLowerCase()} rate ${alignPct}% ${matchPhrase} this call.`);
    }
    const totalConf = scoreTotalsConfidence(proj, pick.total, align);
    if (totalConf >= 88) totalReasons.push(`Engine confidence ${totalConf}/100 — strong total signal.`);
    candidates.push({
      selection: `${over ? 'Over' : 'Under'} ${pick.total}`, marketType: 'total',
      selectionSide: over ? 'home' : 'away', odds: '-110', line: `${pick.total}`,
      confidence: totalConf,
      detail: totalReasons[0],
      reasonsFor: totalReasons,
    } as any);
  }

  const lc = league.toLowerCase();
  const isMlb = lc.includes('mlb') || lc.includes('baseball');
  const [alt, periods, f5] = await Promise.all([
    (async () => { try { const m = await import('@/services/oddsApiService'); return await m.getAltLinesForGame(league, awayName, homeName); } catch { return null; } })(),
    (async () => { try { const m = await import('@/services/periodMarketsService'); return await m.getPeriodMarketsForGame(league, awayName, homeName); } catch { return null; } })(),
    isMlb ? (async () => { try { const m = await import('@/services/oddsApiService'); return await m.getF5InsightForGame(awayName, homeName); } catch { return null; } })() : Promise.resolve(null),
  ]);

  // 2) TEAM TOTALS — each team's own projected scoring = (its game-total avg + its margin)/2.
  //    Adjusted by pitcher matchup: the OPPOSING starter affects this team's projected
  //    scoring (good opp pitcher = we score less, bad opp pitcher = we score more).
  if (alt?.teamTotals?.length && homeTot != null && awayTot != null && homeMargin != null && awayMargin != null) {
    // pickedSide = the side our main board pick is on. Opposite pitcher = "their starter
    // facing US". For team total of our side: adjust by opposing starter's quality.
    const pickedSide = (pick as any)?.selectionSide || 'home';
    const teamTotalAdj = (() => {
      if (!parentSig || !parentSig.oppPitcherStarts || parentSig.oppPitcherStarts < 3) return 0;
      const oppEra = parentSig.oppPitcherEraL5 || 0;
      // Sample-size gate: <5 starts gets half-weight (the Tampa TT Under loss lesson).
      const reliable = parentSig.oppPitcherStarts >= 5;
      const w = reliable ? 1.0 : 0.5;
      if (oppEra <= 2.5) return -0.7 * w;
      if (oppEra <= 3.5) return -0.3 * w;
      if (oppEra >= 5.5) return +0.7 * w;
      if (oppEra >= 4.5) return +0.3 * w;
      return 0;
    })();
    const projFor = { home: (homeTot + homeMargin) / 2, away: (awayTot + awayMargin) / 2 } as const;
    for (const tt of alt.teamTotals) {
      if (tt.line == null) continue;
      // Adjust whichever side is OUR side by the opposing pitcher's quality;
      // the other team's total uses the same logic but mirrored (our pitcher vs them).
      const isOurTeam = tt.side === pickedSide;
      const baseProj = projFor[tt.side];
      const adj = isOurTeam ? teamTotalAdj : (() => {
        if (!parentSig || !parentSig.pickedPitcherStarts || parentSig.pickedPitcherStarts < 3) return 0;
        const ourEra = parentSig.pickedPitcherEraL5 || 0;
        const reliable = parentSig.pickedPitcherStarts >= 5;
        const w = reliable ? 1.0 : 0.5;
        if (ourEra <= 2.5) return -0.7 * w;
        if (ourEra <= 3.5) return -0.3 * w;
        if (ourEra >= 5.5) return +0.7 * w;
        if (ourEra >= 4.5) return +0.3 * w;
        return 0;
      })();
      const proj = baseProj + adj;
      const over = proj >= tt.line;
      const ob = tt.side === 'home' ? home?.trends?.ou10 : away?.trends?.ou10;
      const orate = ouOverRate(ob);
      const align = orate != null ? (over ? orate : 1 - orate) : null;
      const teamName = tt.side === 'home' ? homeName : awayName;
      // Team totals at the MAIN line price ~-110/-120 both ways. The alt-lines feed only
      // gives us the best price across ALL alternate lines (which can be +650 for a far
      // alt line) — pairing that with the median line misrepresents the payout, so we quote
      // the standard -115 for the main line instead of a mismatched longshot price.
      // FIX 2026-06-06 (owner directive — admin cards showed only one sentence):
      // Team Total picks used to ship with just `detail` (a single sentence).
      // Build a full bullet list of reasons here so the admin breakdown shows
      // real evidence instead of the lone tendency-math line.
      const ttReasonsFor: string[] = [];
      const direction = over ? 'OVER' : 'UNDER';
      const sideTeamData = tt.side === 'home' ? home : away;
      const oppTeamData = tt.side === 'home' ? away : home;
      const teamAvgTotal = tt.side === 'home' ? homeTot : awayTot;
      const teamAvgMargin = tt.side === 'home' ? homeMargin : awayMargin;

      ttReasonsFor.push(`Projected ${teamName} runs: ${proj.toFixed(1)} vs Team Total line ${tt.line} (${(proj - tt.line).toFixed(1)}-point edge on the ${direction}).`);

      if (teamAvgTotal != null) {
        ttReasonsFor.push(`${teamName} averages ${teamAvgTotal.toFixed(1)} runs/game in their full-game total over the last 10 — split roughly in half gives our team-total baseline.`);
      }
      if (teamAvgMargin != null) {
        const marginDesc = teamAvgMargin > 0 ? `outscoring opponents by ${teamAvgMargin.toFixed(1)} runs` : `being outscored by ${Math.abs(teamAvgMargin).toFixed(1)} runs`;
        ttReasonsFor.push(`${teamName} is ${marginDesc} on average over their last 10 — supports our offensive projection.`);
      }
      if (ob && ob.sample >= 5 && orate != null) {
        const overPct = Math.round(orate * 100);
        const alignsWith = over ? 'OVER' : 'UNDER';
        const matchPhrase = (over && orate >= 0.55) || (!over && orate <= 0.45) ? 'aligns with' : 'mild contradiction to';
        ttReasonsFor.push(`${teamName} O/U record L${ob.sample}: ${ob.wins}-${ob.losses} (${overPct}% over rate) — ${matchPhrase} the ${alignsWith} call.`);
      }
      if (adj !== 0) {
        const oppRole = isOurTeam ? 'opposing' : 'our';
        const oppEra = isOurTeam ? parentSig?.oppPitcherEraL5 : parentSig?.pickedPitcherEraL5;
        if (oppEra != null && Number.isFinite(oppEra) && oppEra > 0) {
          const direction2 = adj > 0 ? 'inflated' : 'reduced';
          ttReasonsFor.push(`Projection ${direction2} by ${Math.abs(adj).toFixed(1)} runs to account for the ${oppRole} starter's recent ERA of ${oppEra.toFixed(2)}.`);
        }
      }
      if (oppTeamData?.trends?.avgTotal10 != null) {
        ttReasonsFor.push(`Opponent's full-game total averages ${oppTeamData.trends.avgTotal10.toFixed(1)} runs over their last 10 — a high-scoring opponent typically inflates both team totals.`);
      }
      const confScore = scoreTotalsConfidence(proj, tt.line, align);
      if (confScore >= 90) ttReasonsFor.push(`Engine confidence ${confScore}/100 — strong signal across projection, tendencies, and pitcher adjustment.`);

      candidates.push({
        selection: `${teamName} Team Total ${over ? 'Over' : 'Under'} ${tt.line}`, marketType: 'team_total' as any,
        selectionSide: tt.side, odds: '-115', line: `${tt.line}`,
        confidence: confScore,
        detail: ttReasonsFor[0],
        reasonsFor: ttReasonsFor,
      } as any);
    }
  }

  // 3) PERIOD TOTALS (1H / 2H / quarters / hockey periods) via the period scorer.
  if (periods?.markets?.length) {
    try {
      const m = await import('@/services/periodMarketsService');
      const avgTotalCombined = homeTot != null && awayTot != null ? (homeTot + awayTot) / 2 : (homeTot ?? awayTot);
      const plays = m.scorePeriodMarkets(periods.markets, {
        gameId: String(pick.gameId), eventName: pick.eventName || '', league,
        startTime: pick.startTime || null, awayTeam: awayName, homeTeam: homeName,
        avgTotalCombined,
        homeOu10: home?.trends?.ou10 ?? null, awayOu10: away?.trends?.ou10 ?? null,
      });
      for (const pl of plays) {
        // FIX 2026-06-06: pass through the full reasonsFor bullet array we
        // built in periodMarketsService.scorePeriodMarkets (6-8 bullets per pick).
        candidates.push({
          selection: pl.selection, marketType: `${pl.period.toLowerCase()}_total`,
          selectionSide: /\bover\b/i.test(pl.selection) ? 'home' : 'away',
          odds: pl.odds, line: pl.line != null ? `${pl.line}` : null,
          confidence: pl.edgeScore, detail: pl.reason,
          reasonsFor: (pl as any).reasonsFor || [pl.reason],
        } as any);
      }
    } catch { /* non-blocking */ }
  }

  // 4) F5 TOTAL (MLB first 5 innings) — project ~5/9 of the full-game total. The pitcher
  // matchup matters MORE here than for the full game (starters are guaranteed on the
  // mound through F5, vs. bullpen taking over after), so we use a 1.4x weighted adjustment.
  if (f5?.totalLine != null && homeTot != null && awayTot != null) {
    const projF5 = ((homeTot + awayTot) / 2) * (5 / 9) + (pitcherAdjustment * 1.4);
    const over = projF5 >= f5.totalLine;
    // F5 prices from the feed are best-across-alt-lines (mismatched to the median line),
    // same issue as team totals — quote the standard -115 main-line price instead.
    // FIX 2026-06-06: build a real bullet list for F5 total picks.
    const f5Reasons: string[] = [];
    const f5Direction = over ? 'OVER' : 'UNDER';
    f5Reasons.push(`Projected F5 total: ${projF5.toFixed(1)} runs vs market line ${f5.totalLine} — ${Math.abs(projF5 - f5.totalLine).toFixed(1)}-run edge on the ${f5Direction}.`);
    f5Reasons.push(`First-5 typically accounts for ~55% of a 9-inning total — derived from full-game baseline and applied to today's matchup.`);
    if (parentSig?.pickedPitcherEraL5 && parentSig.pickedPitcherEraL5 > 0) {
      f5Reasons.push(`Our starter L5 ERA: ${parentSig.pickedPitcherEraL5.toFixed(2)} — directly drives early-inning scoring expectations.`);
    }
    if (parentSig?.oppPitcherEraL5 && parentSig.oppPitcherEraL5 > 0) {
      f5Reasons.push(`Opposing starter L5 ERA: ${parentSig.oppPitcherEraL5.toFixed(2)} — contributes to projected runs allowed early.`);
    }
    if (homeTot != null && awayTot != null) {
      f5Reasons.push(`Combined L10 baseline: ${((homeTot + awayTot) / 2).toFixed(1)} runs/game — half-game share projected for the first 5.`);
    }
    const f5Conf = scoreTotalsConfidence(projF5, f5.totalLine, null);
    candidates.push({
      selection: `F5 ${over ? 'Over' : 'Under'} ${f5.totalLine}`, marketType: 'f5_total',
      selectionSide: over ? 'home' : 'away', odds: '-115',
      line: `${f5.totalLine}`, confidence: f5Conf,
      detail: f5Reasons[0],
      reasonsFor: f5Reasons,
    } as any);
  }

  // 5) PLAYER PROPS — only when asked (caller bounds this to marquee / below-floor games to
  // keep the prop fetches off the full slate). Each real-line prop becomes a candidate; the
  // selection text is shaped so the prop grader can settle it from the box score.
  if (opts?.includeProps) {
    try {
      const baseUrl = LEAGUE_URLS[league];
      if (baseUrl) {
        const summary = await fetchGameSummary(String(pick.gameId), baseUrl);
        if (summary) {
          const comp = summary?.header?.competitions?.[0] || {};
          const propsMod = await import('@/services/playerPropsService');
          const res = await propsMod.buildGamePropsResearch(
            String(pick.gameId), pick.eventName || `${awayName} @ ${homeName}`, league, comp, summary, { home: [], away: [] },
          );
          for (const rec of (res.topProps || []) as any[]) {
            const conf = scorePropConfidence(rec);
            if (conf <= 0) continue;
            const playerName: string = rec.playerName || '';
            if (!playerName || rec.estimatedLine == null) continue;
            const over = rec.direction === 'over';
            const price = over ? rec.overPrice : rec.underPrice;
            // FIX 2026-06-06: build a real bullet list for player prop picks.
            const propReasons: string[] = [];
            const direction = over ? 'OVER' : 'UNDER';
            propReasons.push(`${playerName}: model projection vs market line ${rec.estimatedLine} ${rec.displayStat} — ${direction} side.`);
            if (rec.reason) propReasons.push(rec.reason);
            if ((rec as any).recentAvg != null) propReasons.push(`Recent average: ${(rec as any).recentAvg.toFixed(1)} ${rec.displayStat} — supports the ${direction.toLowerCase()}.`);
            if ((rec as any).matchupNote) propReasons.push(`Matchup note: ${(rec as any).matchupNote}`);
            if ((rec as any).usage != null) propReasons.push(`Usage rate: ${((rec as any).usage * 100).toFixed(0)}% — drives volume expectation.`);
            propReasons.push(`Engine confidence ${conf}/100 — passes the prop quality floor.`);
            candidates.push({
              selection: `${playerName} ${over ? 'Over' : 'Under'} ${rec.estimatedLine} ${rec.displayStat}`,
              marketType: 'player_prop',
              selectionSide: 'home',
              odds: price != null ? `${price > 0 ? '+' : ''}${price}` : '-115',
              line: `${rec.estimatedLine}`,
              confidence: conf,
              detail: propReasons[0],
              reasonsFor: propReasons,
            } as any);
          }
        }
      }
    } catch { /* non-blocking — props are an upgrade, never required */ }
  }

  // UNIFIED SCORING: apply the tendency boost to every candidate before returning.
  // This is the single bridge that makes the deep tendency stack (pitcher matchup,
  // bullpen state, 1st-inning %, line movement, streak fragility, odds-bucket eyes)
  // affect EVERY market — totals, team totals, F5, periods, halves, props, alt lines.
  // No caller has to remember to apply the boost; it's baked into the candidate score.
  const parentSignals = (pick as any)?.signals;
  if (parentSignals) {
    for (const c of candidates) {
      const boost = boostByTendencies(c, parentSignals);
      c.confidence = Math.max(0, Math.min(100, c.confidence + boost));
    }
  }

  // NCAA Baseball / College Baseball cap — owner directive: these are not plus-tier
  // picks because we don't have probable pitcher data. Cap every candidate from these
  // leagues at 88 so they can't crown a 100-conf pick through dig-wider either.
  const leagueForCap = (pick as any)?.league || '';
  if (leagueForCap === 'NCAA Baseball' || leagueForCap === 'College Baseball' || leagueForCap === 'NCAA Softball') {
    for (const c of candidates) {
      c.confidence = Math.min(88, c.confidence);
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates;
}

function pickForSoccer(
  home: TeamProfile, away: TeamProfile, total: number | null,
): { selectionSide: 'home' | 'away'; marketType: 'spread' | 'moneyline' | 'total'; selection: string; odds: string | null; line: string | null } {
  const homeWin = home.winProbability ?? 50;
  const awayWin = away.winProbability ?? 50;

  // For soccer, use moneyline when there's a clear edge, else default to home
  let pickedSide: 'home' | 'away' = homeWin >= awayWin ? 'home' : 'away';
  const pickedTeam = pickedSide === 'home' ? home : away;
  const ml = pickedTeam.moneyline;
  const mlStr = ml != null ? `${ml > 0 ? '+' : ''}${ml}` : null;

  return {
    selectionSide: pickedSide,
    marketType: 'moneyline',
    selection: `${pickedTeam.name} ML`,
    odds: mlStr,
    line: null,
  };
}

function pickForTennis(
  home: TeamProfile, away: TeamProfile,
): { selectionSide: 'home' | 'away'; marketType: 'spread' | 'moneyline' | 'total'; selection: string; odds: string | null; line: string | null } {
  const homeWin = home.winProbability ?? 50;
  const awayWin = away.winProbability ?? 50;
  const pickedSide: 'home' | 'away' = homeWin >= awayWin ? 'home' : 'away';
  const pickedTeam = pickedSide === 'home' ? home : away;
  const ml = pickedTeam.moneyline;
  const mlStr = ml != null ? `${ml > 0 ? '+' : ''}${ml}` : null;
  return { selectionSide: pickedSide, marketType: 'moneyline', selection: `${pickedTeam.name} ML`, odds: mlStr, line: null };
}

// ─── Implied Spread from Win Probability ────────────────────────────────────

function impliedSpreadFromWinPct(winPct: number): number {
  // Rough NFL/NBA model: each point of spread ≈ 3% of win probability shift from 50%
  const diff = winPct - 50;
  return -(diff / 2.8);
}

// ─── Per-Game Processing ─────────────────────────────────────────────────────

// Estimate win probability from American moneyline. A single side can't be exactly
// de-vigged without the other side, so we remove a typical two-way hold (~4.8%) by
// normalizing against an assumed 1.048 overround — instead of returning the raw implied
// price (which overstates the favorite by the full vig and inflated confidence).
function winProbFromML(ml: number): number {
  const raw = ml > 0 ? 100 / (100 + ml) : Math.abs(ml) / (Math.abs(ml) + 100);
  const devigged = raw / 1.048;
  return Math.round(devigged * 100 * 10) / 10;
}

async function processGame(
  event: any,
  league: string,
  baseUrl: string,
  board: BoardType,
): Promise<DeepPickResult | null> {
  const comp = event?.competitions?.[0];
  if (!comp) return null;

  const homeRaw = comp.competitors?.find((c: any) => c.homeAway === 'home');
  const awayRaw = comp.competitors?.find((c: any) => c.homeAway === 'away');
  if (!homeRaw || !awayRaw) return null;

  const gameId = String(event.id);
  const eventState = event.status?.type?.state;
  // Keep live + finished games too. ESPN freezes the closing line on in/post games, so
  // re-deriving yields the SAME pick we'd have shown pregame — letting customers watch it
  // live and see the final result, instead of the pick vanishing the moment it tips off.
  if (!eventState) return null;

  const sportStyle = sportStyleForBoard(board);

  // Extract odds directly from the scoreboard event (fast, no extra API call)
  const scoreboardOdds = comp.odds?.[0];
  const sbSpread = scoreboardOdds?.spread != null ? Number(scoreboardOdds.spread) : null;
  const sbTotal = scoreboardOdds?.overUnder != null ? Number(scoreboardOdds.overUnder) : null;
  const sbHomeML: number | null = scoreboardOdds?.homeTeamOdds?.moneyLine ?? null;
  const sbAwayML: number | null = scoreboardOdds?.awayTeamOdds?.moneyLine ?? null;
  const sbHomeWinPct: number | null = scoreboardOdds?.homeTeamOdds?.winPercentage ?? null;
  const sbAwayWinPct: number | null = scoreboardOdds?.awayTeamOdds?.winPercentage ?? null;

  // Estimate win % from ML if pickcenter win % isn't on the scoreboard odds node
  const mlHomeWinPct = sbHomeML != null ? winProbFromML(sbHomeML) : null;
  const mlAwayWinPct = sbAwayML != null ? winProbFromML(sbAwayML) : null;

  // Always pull the summary/pickcenter. The scoreboard odds node only carries
  // spread + over/under — the real moneyline (integer), win %, ATS spread records
  // and injuries live ONLY in /summary. Skipping it (the old behaviour) left win
  // probability, ATS, line-value and injury signals permanently dead, so almost
  // nothing reached the higher tiers. A 150s cache keeps ESPN load reasonable.
  const summary = await fetchGameSummary(gameId, baseUrl);

  const pickcenter: any[] = Array.isArray(summary?.pickcenter) ? summary.pickcenter : [];
  const pc = extractPickcenterData(pickcenter);

  // FIX 2026-06-06 (owner directive — switch to Hard Rock primary):
  // ESPN's NCAA Baseball ML feed was returning home/away MLs in the WRONG slots
  // (WV -375 came through as +260 on the away slot). Hard Rock is what customers
  // actually bet at, so we should display HR's price as the source of truth.
  // Try Hard Rock first; fall back to ESPN if HR doesn't list this game.
  let hrLine: Awaited<ReturnType<typeof import('@/services/oddsApiService').getHardRockLineForGame>> = null;
  try {
    const { getHardRockLineForGame } = await import('@/services/oddsApiService');
    hrLine = await getHardRockLineForGame(league, awayRaw?.team?.displayName || '', homeRaw?.team?.displayName || '');
  } catch { /* HR fetch is best-effort; ESPN takes over on failure */ }

  // Merge: prefer Hard Rock, then pickcenter, then scoreboard odds
  const rawSpread = hrLine?.spread ?? pc.spread ?? sbSpread;
  const mergedTotal = hrLine?.total ?? pc.total ?? sbTotal;
  let rawHomeML = hrLine?.homeML ?? pc.homeMoneyline ?? sbHomeML;
  let rawAwayML = hrLine?.awayML ?? pc.awayMoneyline ?? sbAwayML;

  // FIX 2026-06-06 (WV -375 reported as +260 bug): ESPN's pickcenter for NCAA
  // Baseball / non-major-league feeds sometimes returns home/away moneylines
  // in the WRONG SLOTS. Cross-check against the favorite signal (favAbbr or
  // spread sign). If the spread says the away team is favored but the away ML
  // is positive (dog-priced) while the home ML is negative (fave-priced), the
  // two MLs are swapped — un-swap them.
  if (rawHomeML != null && rawAwayML != null && rawSpread != null && Math.abs(rawSpread) > 0) {
    const homeAbbrShort = String(homeRaw?.team?.abbreviation || '').toUpperCase();
    const awayAbbrShort = String(awayRaw?.team?.abbreviation || '').toUpperCase();
    // Decide which side is the favorite from favAbbr (strongest signal) or spread sign
    let homeIsFav: boolean | null = null;
    if (pc.favAbbr) {
      const favUp = pc.favAbbr.toUpperCase();
      if (homeAbbrShort && favUp === homeAbbrShort) homeIsFav = true;
      else if (awayAbbrShort && favUp === awayAbbrShort) homeIsFav = false;
    }
    if (homeIsFav === null && rawSpread < 0) homeIsFav = true;  // pickcenter convention often: spread<0 = home fave
    if (homeIsFav !== null) {
      const mlSaysHomeFav = rawHomeML < rawAwayML;  // lower (more negative) ML = favorite
      if (homeIsFav !== mlSaysHomeFav) {
        // The MLs are swapped relative to the favorite signal. Un-swap.
        const tmp = rawHomeML;
        rawHomeML = rawAwayML;
        rawAwayML = tmp;
      }
    }
  }
  const mergedHomeML = rawHomeML;
  const mergedAwayML = rawAwayML;

  // FIX 2026-06-05 (West Virginia sign-flip audit): ESPN's `spread` field has
  // INCONSISTENT sign convention across leagues. Normalize to HOME-team-signed
  // here, so all downstream code (pickForNA, scoreGame, etc.) can rely on
  // "spread < 0 means home is favored, spread > 0 means away is favored".
  // Three resolution paths in order of trustworthiness:
  //   1. favAbbr from pickcenter `details` (most reliable — directly says fav)
  //   2. ML comparison (home -150 / away +130 → home is fave → spread <= 0)
  //   3. Trust the raw value as a last resort (pre-fix behavior)
  const normalizeSpreadHomeSigned = (): number | null => {
    if (rawSpread == null) return null;
    const abs = Math.abs(rawSpread);
    if (abs === 0) return 0;
    // Path 1: favorite abbr from details string
    if (pc.favAbbr) {
      const homeAbbrShort = String(homeRaw?.team?.abbreviation || '').toUpperCase();
      const awayAbbrShort = String(awayRaw?.team?.abbreviation || '').toUpperCase();
      const favAbbrUp = pc.favAbbr.toUpperCase();
      if (homeAbbrShort && favAbbrUp === homeAbbrShort) return -abs; // home is fave
      if (awayAbbrShort && favAbbrUp === awayAbbrShort) return abs;  // away is fave
    }
    // Path 2: ML comparison
    if (mergedHomeML != null && mergedAwayML != null) {
      // Lower (more negative or smaller) ML = favorite
      if (mergedHomeML < mergedAwayML) return -abs;
      if (mergedAwayML < mergedHomeML) return abs;
    }
    // Path 3: trust the raw value as a fallback
    return rawSpread;
  };
  const mergedSpread = normalizeSpreadHomeSigned();
  // Win % priority:
  //   1. pickcenter / scoreboard win% if ESPN provides it
  //   2. otherwise derive from the MERGED moneyline (the real ML now comes from
  //      the summary), DE-VIGGED across both sides so the two probabilities sum
  //      to ~100% — an honest favorite/underdog read instead of juiced numbers.
  let mergedHomeWinPct: number | null;
  let mergedAwayWinPct: number | null;
  if (pc.homeWinPct != null || pc.awayWinPct != null) {
    mergedHomeWinPct = pc.homeWinPct ?? (pc.awayWinPct != null ? 100 - pc.awayWinPct : null);
    mergedAwayWinPct = pc.awayWinPct ?? (pc.homeWinPct != null ? 100 - pc.homeWinPct : null);
  } else if (sbHomeWinPct != null || sbAwayWinPct != null) {
    mergedHomeWinPct = sbHomeWinPct ?? (sbAwayWinPct != null ? 100 - sbAwayWinPct : null);
    mergedAwayWinPct = sbAwayWinPct ?? (sbHomeWinPct != null ? 100 - sbHomeWinPct : null);
  } else if (mergedHomeML != null && mergedAwayML != null) {
    const rawH = mergedHomeML > 0 ? 100 / (100 + mergedHomeML) : Math.abs(mergedHomeML) / (Math.abs(mergedHomeML) + 100);
    const rawA = mergedAwayML > 0 ? 100 / (100 + mergedAwayML) : Math.abs(mergedAwayML) / (Math.abs(mergedAwayML) + 100);
    const s = rawH + rawA;
    mergedHomeWinPct = s > 0 ? Math.round((rawH / s) * 1000) / 10 : null;
    mergedAwayWinPct = s > 0 ? Math.round((rawA / s) * 1000) / 10 : null;
  } else {
    mergedHomeWinPct = mergedHomeML != null ? winProbFromML(mergedHomeML) : null;
    mergedAwayWinPct = mergedAwayML != null ? winProbFromML(mergedAwayML) : null;
  }

  // ATS records (from pickcenter only — not in scoreboard odds)
  const homeAtsData = extractAtsRecords(pickcenter, 'home');
  const awayAtsData = extractAtsRecords(pickcenter, 'away');

  // Injuries — ESPN summary is primary, league-specific APIs are the safety net.
  // Owner directive 2026-06-02: "injury data is really important... we need another
  // site that can back up." For MLB we hit statsapi.mlb.com IL when ESPN is silent.
  // Pass team names so we can match ESPN's homeAway-less injuries block by displayName.
  const homeNameForInj = homeRaw?.team?.displayName || '';
  const awayNameForInj = awayRaw?.team?.displayName || '';
  const homeInjEspn = extractInjuriesBySide(summary, 'home', homeNameForInj, awayNameForInj);
  const awayInjEspn = extractInjuriesBySide(summary, 'away', homeNameForInj, awayNameForInj);

  // Records
  const homeOverall = extractTeamRecord(homeRaw, 'total');
  const homeHomeRec = extractTeamRecord(homeRaw, 'home');
  const awayOverall = extractTeamRecord(awayRaw, 'total');
  const awayRoadRec = extractTeamRecord(awayRaw, 'road');

  // Leaders
  const homeLeaders = extractLeaders(homeRaw);
  const awayLeaders = extractLeaders(awayRaw);

  const hasOdds = Boolean(mergedSpread !== null || mergedHomeML !== null || mergedAwayML !== null);

  const homeWinPct = mergedHomeWinPct;
  const awayWinPct = mergedAwayWinPct ?? (homeWinPct !== null ? 100 - homeWinPct : null);

  // Real recent form pulled from each team's schedule (cached) — drives the
  // "hot/cold streak" signal and the recentForm text on the team profile.
  // Skip entirely for individual sports (tennis/MMA/Boxing/Golf/Racing) — the
  // /teams/{id}/schedule endpoint doesn't exist for athletes and would 404 hundreds of
  // times per scan. Form is rebuilt sport-specifically when we add per-sport adapters.
  const isIndividualLeague =
    league.startsWith('Tennis') || league.startsWith('MMA') || league === 'Boxing' ||
    league.startsWith('Golf') || league === 'F1' || league === 'Formula 1' ||
    league === 'NASCAR' || league === 'IndyCar';
  const homeTeamId = String(homeRaw.team?.id || homeRaw.id || '');
  const awayTeamId = String(awayRaw.team?.id || awayRaw.id || '');
  const [homeForm, awayForm] = isIndividualLeague
    ? [null, null]
    : await Promise.all([fetchTeamForm(league, homeTeamId), fetchTeamForm(league, awayTeamId)]);
  const homeStreak = homeForm?.streak ?? 0;
  const awayStreak = awayForm?.streak ?? 0;

  // Data quality
  let dq = 0;
  if (homeOverall) dq += 10;
  if (awayOverall) dq += 10;
  if (hasOdds) dq += 25;
  if (homeWinPct !== null) dq += 20;
  if (homeAtsData.overall) dq += 20;
  if (awayAtsData.overall) dq += 15;
  dq = Math.min(100, dq);

  // SYMMETRIC pieces (don't depend on which side we'd pick) — compute once.
  const winProbGap = homeWinPct !== null && awayWinPct !== null ? Math.abs(homeWinPct - awayWinPct) : 0;
  const lvgLeague = (league || '').toLowerCase();
  const spreadModelValid = lvgLeague.includes('nba') || lvgLeague.includes('nfl') ||
    lvgLeague.includes('college football') || lvgLeague.includes('ncaa basketball') ||
    lvgLeague.includes('wnba');
  const lineValueGap = (() => {
    if (!spreadModelValid || mergedSpread === null || homeWinPct === null) return 0;
    const impliedSpread = impliedSpreadFromWinPct(homeWinPct);
    return Math.abs(impliedSpread - mergedSpread);
  })();
  // Signal conflict — ATS and win-prob pointing opposite directions (intrinsic to the game).
  const signalConflict = (() => {
    if (homeAtsData.overall === null || homeWinPct === null) return false;
    const atsFavorHome = (homeAtsData.overall?.coverPct ?? 50) > (awayAtsData.overall?.coverPct ?? 50);
    const probFavorHome = (homeWinPct ?? 50) > (awayWinPct ?? 50);
    return atsFavorHome !== probFavorHome;
  })();

  // Sharp intel — pulled ONCE; the result has both-side fields so either side can be picked.
  const homeTeamName = homeRaw.team?.displayName || 'Home';
  const awayTeamName = awayRaw.team?.displayName || 'Away';

  // Resolve injury fallbacks now that team names are known. ESPN was already
  // extracted upstream; this layer hits MLB Stats API IL etc. when ESPN is silent.
  const { getInjuriesWithFallback } = await import('@/services/injurySourcesService');
  const [homeInj, awayInj] = await Promise.all([
    getInjuriesWithFallback(homeInjEspn, league, homeTeamName).catch(() => homeInjEspn),
    getInjuriesWithFallback(awayInjEspn, league, awayTeamName).catch(() => awayInjEspn),
  ]);
  const gameTime = event.date || null;
  // FIX 2026-06-02: sharp intel computed per-side. Was hardcoded to 'home', which
  // meant `calcScoreBonus` filtered flags by `flag.side !== 'home'` regardless of
  // which side we were scoring — silently biasing every pick toward home. Now we
  // compute both sides; buildSideSignals picks the matching one downstream.
  let sharpIntelHome: SharpIntelContext | null = null;
  let sharpIntelAway: SharpIntelContext | null = null;
  try {
    [sharpIntelHome, sharpIntelAway] = await Promise.all([
      getSharpIntel({ gameId, league, homeTeam: homeTeamName, awayTeam: awayTeamName, pickedSide: 'home', gameTime }).catch(() => null),
      getSharpIntel({ gameId, league, homeTeam: homeTeamName, awayTeam: awayTeamName, pickedSide: 'away', gameTime }).catch(() => null),
    ]);
  } catch { /* non-blocking */ }
  // Keep the original variable name for back-compat with downstream references that
  // don't care about side (rest data, weather, broadcasts, etc. — all side-agnostic).
  const sharpIntel = sharpIntelHome || sharpIntelAway;

  // Deep tendencies + odds-bucket hit rate + MLB pitcher matchup — all fetched in
  // parallel, all non-blocking. tendencies = 1st-frame scoring + F5 from ESPN linescores.
  // bucketStats = our actual win rate by price band from the registry. pitcher matchup =
  // probable starter's L5 ERA/WHIP/handedness. The engine now factors all into scoreGame.
  const tendencyHomeId = String(homeRaw.team?.id || homeRaw.id || '');
  const tendencyAwayId = String(awayRaw.team?.id || awayRaw.id || '');
  let homeTendencies: TeamTendencies | null = null;
  let awayTendencies: TeamTendencies | null = null;
  let bucketStats: Record<string, { wins: number; losses: number; total: number }> = {};
  let probables: GameProbables = { home: null, away: null, homeConfirmed: false, awayConfirmed: false };
  // MLB Stats API enrichment + NWS weather — only populated for MLB outdoor games.
  let homeBattingVsHand: TeamHandednessProfile | null = null;
  let awayBattingVsHand: TeamHandednessProfile | null = null;
  let weatherForecast: WeatherForecast | null = null;
  // NHL goalie / NBA pace profiles — populated below for the matching league.
  let nhlHomeGoalie: any = null;
  let nhlAwayGoalie: any = null;
  let nbaHomeProfile: any = null;
  let nbaAwayProfile: any = null;
  const isMlb = league === 'MLB';
  try {
    const [ht, at, bs, pp] = await Promise.all([
      tendencyHomeId ? getTeamTendencies(league, tendencyHomeId).catch(() => null) : Promise.resolve(null),
      tendencyAwayId ? getTeamTendencies(league, tendencyAwayId).catch(() => null) : Promise.resolve(null),
      getCachedBucketStats().catch(() => ({})),
      isMlb ? getGameProbables(gameId).catch(() => ({ home: null, away: null, homeConfirmed: false, awayConfirmed: false } as GameProbables)) : Promise.resolve({ home: null, away: null, homeConfirmed: false, awayConfirmed: false } as GameProbables),
    ]);
    homeTendencies = ht;
    awayTendencies = at;
    bucketStats = bs as any;
    probables = pp;

    // MLB enrichment fan-out (non-blocking — engine still scores without these):
    //   1) enrich each pitcher with MLB Stats API per-handedness OPS-allowed
    //   2) pull each team's vs-LHP/vs-RHP batting splits for matchup edge math
    //   3) pull NWS forecast for outdoor stadiums (wind/temp nudge to totals)
    if (isMlb) {
      const enrichTasks: Array<Promise<any>> = [];
      if (probables.home) enrichTasks.push(enrichPitcherWithMlbStats(probables.home).catch(() => probables.home));
      if (probables.away) enrichTasks.push(enrichPitcherWithMlbStats(probables.away).catch(() => probables.away));
      const [hb, ab, wx] = await Promise.all([
        getTeamHandednessProfile(homeTeamName).catch(() => null),
        getTeamHandednessProfile(awayTeamName).catch(() => null),
        getStadiumForecast(homeTeamName, new Date(gameTime || Date.now())).catch(() => null),
      ]);
      await Promise.all(enrichTasks);
      homeBattingVsHand = hb;
      awayBattingVsHand = ab;
      weatherForecast = wx;
    }
    // NHL goalie enrichment — wires goaltenderMatchupService into the engine for the
    // first time (orphaned since 2026-06-01 build). Fetches the probable starting
    // goalie's L5 save % and GAA; populated into signals downstream for NHL picks.
    if (league === 'NHL') {
      try {
        const { getGameProbableGoalies } = await import('@/services/goaltenderMatchupService');
        const goalies = await getGameProbableGoalies(gameId);
        nhlHomeGoalie = goalies.homeGoalie;
        nhlAwayGoalie = goalies.awayGoalie;
      } catch { /* non-blocking */ }
    }
    // NBA/WNBA pace + 3PT% enrichment — wires nbaStatsService into the engine.
    if (league === 'NBA' || league === 'WNBA') {
      try {
        const { getBasketballTeamProfile } = await import('@/services/nbaStatsService');
        const leagueKey = league === 'NBA' ? 'nba' : 'wnba';
        const [hp, ap] = await Promise.all([
          tendencyHomeId ? getBasketballTeamProfile(leagueKey, tendencyHomeId).catch(() => null) : Promise.resolve(null),
          tendencyAwayId ? getBasketballTeamProfile(leagueKey, tendencyAwayId).catch(() => null) : Promise.resolve(null),
        ]);
        nbaHomeProfile = hp;
        nbaAwayProfile = ap;
      } catch { /* non-blocking */ }
    }
  } catch { /* non-blocking */ }

  // Line movement — capture opening odds the first time we see this game (no-op if
  // already captured), then compute movement from opening to current. Non-blocking.
  const currentOddsSnap: OddsSnapshot = {
    homeML: mergedHomeML, awayML: mergedAwayML, spread: mergedSpread, total: mergedTotal,
  };
  let opening: OddsSnapshot | null = null;
  try {
    [opening] = await Promise.all([
      getOpeningOdds(gameId).catch(() => null),
      captureOpeningOdds(gameId, league, currentOddsSnap).catch(() => undefined),
    ]);
  } catch { /* non-blocking */ }

  // OWNER RULE: don't anchor on the favorite. Score BOTH sides' tendencies and pick the side
  // whose signals are actually stronger — an underdog with better ATS, a hot streak, opponent
  // on a B2B, or a key injury on the favorite can be the play (and gets +money on the ML).
  const buildSideSignals = (side: 'home' | 'away') => {
    const pickedAts = side === 'home' ? homeAtsData.overall : awayAtsData.overall;
    const pickedAtsHA = side === 'home' ? homeAtsData.homeAway : awayAtsData.homeAway;
    const oppAts = side === 'home' ? awayAtsData.overall : homeAtsData.overall;
    const pickedFormBuckets = side === 'home' ? homeForm : awayForm;
    const oppFormBuckets = side === 'home' ? awayForm : homeForm;
    const weightedPickedAts = weightedAtsCoverPct(pickedFormBuckets?.ats5, pickedFormBuckets?.ats10, pickedFormBuckets?.atsSeason);
    // FIX 2026-06-05 (audit #1 tendency): use the OPP's true ATS-AGAINST record
    // (opponents covering vs them), not the opp's own ATS-for. Falls back to the
    // old approximation only when ATS-against data isn't populated yet.
    const weightedOppAtsAgainst = (() => {
      const a10 = oppFormBuckets?.atsAgainst10;
      const aSeason = oppFormBuckets?.atsAgainstSeason;
      if (!a10 && !aSeason) return null;
      // simple weighted: prefer L10 sample when ≥6 games, else season.
      if (a10 && a10.sample >= 6) {
        const denom = a10.wins + a10.losses;
        if (denom > 0) return Math.round((a10.wins / denom) * 100);
      }
      if (aSeason && aSeason.sample >= 8) {
        const denom = aSeason.wins + aSeason.losses;
        if (denom > 0) return Math.round((aSeason.wins / denom) * 100);
      }
      return null;
    })();
    const weightedOppAts = weightedAtsCoverPct(oppFormBuckets?.ats5, oppFormBuckets?.ats10, oppFormBuckets?.atsSeason);
    const pickedInj = side === 'home' ? homeInj : awayInj;
    const oppInj = side === 'home' ? awayInj : homeInj;
    const pickedStreak = side === 'home' ? homeStreak : awayStreak;
    const pickedLeadersList = side === 'home' ? homeLeaders : awayLeaders;
    const oppLeadersList = side === 'home' ? awayLeaders : homeLeaders;
    const starOutPickSide = leaderRuledOut(pickedLeadersList, pickedInj.out);
    const starOutOppSide = leaderRuledOut(oppLeadersList, oppInj.out);
    // 2026-06-04 star-confirmation gate. If a flagged star is on the
    // QUESTIONABLE list (not ruled out, but in the air), the engine can't
    // trust the matchup the way it would for a healthy roster. Surface this
    // as a separate signal so the final scorer caps confidence at 85 until
    // lineups post. Mirrors the star-OUT signal but at lighter weight.
    const starQuestionablePickSide = leaderRuledOut(pickedLeadersList, pickedInj.questionable);
    const starQuestionableOppSide = leaderRuledOut(oppLeadersList, oppInj.questionable);
    const hasKeyInjuryPicked = pickedInj.out.length > 0 || pickedInj.doubtful.length > 0;
    const hasKeyInjuryOpp = oppInj.out.length > 0 || oppInj.doubtful.length > 0;
    const signalsPartial: Omit<GameSignals, 'confirmingSignals'> = {
      oddsAvailable: hasOdds,
      winProbabilityGap: winProbGap,
      atsCoverPct: weightedPickedAts ?? pickedAts?.coverPct ?? null,
      // Audit fix #1 tendency: prefer the true ATS-against; fall back to the
      // opp's own ATS only when ATS-against sample is insufficient.
      atsCoverPctOpp: weightedOppAtsAgainst ?? weightedOppAts ?? oppAts?.coverPct ?? null,
      atsHomeAwayCoverPct: pickedAtsHA?.coverPct ?? null,
      lineValueGap,
      signalConflict,
      recentFormStreak: pickedStreak,
      keyInjuryOnPickSide: hasKeyInjuryPicked,
      keyInjuryOnOppSide: hasKeyInjuryOpp,
      spreadFavorable: mergedSpread !== null && Math.abs(mergedSpread) < 8,
      // Only true when ESPN actually returned injury data AND both rosters are clean.
      // When data is unavailable (NCAA Baseball, KBO, AFL, tennis, etc.), this stays
      // false — we don't claim "rosters healthy" without verification.
      noKeyInjuries: (pickedInj as any).dataAvailable === true && (oppInj as any).dataAvailable === true && !hasKeyInjuryPicked && !hasKeyInjuryOpp,
      // FIX 2026-06-05 (audit #7): position-weighted injury severity for scoreGame.
      pickedInjurySeverity: injurySeverity(pickedInj.out) + 0.5 * injurySeverity(pickedInj.doubtful),
      oppInjurySeverity: injurySeverity(oppInj.out) + 0.5 * injurySeverity(oppInj.doubtful),
      // FIX 2026-06-05 (audit #10): symmetric sharp/rest/b2b signals.
      sharpMoneyAgainst: (() => {
        const si = side === 'home' ? sharpIntelHome : sharpIntelAway;
        const oppSide: 'home' | 'away' = side === 'home' ? 'away' : 'home';
        return si?.betting?.sharpFavors === oppSide && (si?.betting?.sharpConfidence ?? 0) >= 55;
      })(),
      restDisadvantage: (() => {
        const si = side === 'home' ? sharpIntelHome : sharpIntelAway;
        const oppSide: 'home' | 'away' = side === 'home' ? 'away' : 'home';
        return si?.rest?.restAdvantage === oppSide && (si?.rest?.restEdge ?? 0) >= 3;
      })(),
      pickedOnB2B: side === 'home' ? (sharpIntel?.rest?.homeIsB2B ?? false) : (sharpIntel?.rest?.awayIsB2B ?? false),
      sharpLineDetected: hasOdds && winProbGap > 10,
      neutralSite: Boolean(comp.neutralSite),
      dataQuality: dq,
      pickedOddsAmerican: (() => {
        const pml = side === 'home' ? mergedHomeML : mergedAwayML;
        if (sportStyle !== 'na') return pml;
        if (pml != null && pml >= -150 && pml <= 160) return pml;
        if (mergedSpread !== null || mergedTotal !== null) return -110;
        return pml;
      })(),
      // FIX 2026-06-02: use the per-side sharp intel for the side being scored. The
      // sharpScoreBonus filters flags by side internally, so home and away need their
      // own computations — previously both sides read the home-computed bonus.
      sharpMoneyAligned: (side === 'home' ? sharpIntelHome : sharpIntelAway)?.betting?.sharpFavors === side
        && ((side === 'home' ? sharpIntelHome : sharpIntelAway)?.betting?.sharpConfidence ?? 0) >= 55,
      reverseLineMovement: (side === 'home' ? sharpIntelHome : sharpIntelAway)?.betting?.reverseLineMovement ?? false,
      restAdvantage: (side === 'home' ? sharpIntelHome : sharpIntelAway)?.rest?.restAdvantage === side
        && ((side === 'home' ? sharpIntelHome : sharpIntelAway)?.rest?.restEdge ?? 0) >= 3,
      oppOnB2B: side === 'home' ? (sharpIntel?.rest?.awayIsB2B ?? false) : (sharpIntel?.rest?.homeIsB2B ?? false),
      weatherAlert: sharpIntel?.weather?.affectsPlay ?? false,
      sharpScoreBonus: (side === 'home' ? sharpIntelHome : sharpIntelAway)?.scoreBonus ?? 0,
      // Odds-bucket "eyes" — compare this price band's actual hit rate to its implied
      // break-even. Positive edge = bucket beating break-even; negative = overpaying.
      oddsBucketEdgePct: (() => {
        const pml = side === 'home' ? mergedHomeML : mergedAwayML;
        const oddsForBucket = sportStyle !== 'na' ? pml : (pml != null && pml >= -150 && pml <= 160 ? pml : (mergedSpread !== null || mergedTotal !== null ? -110 : pml));
        if (oddsForBucket == null) return 0;
        const bucket = oddsBucket(oddsForBucket);
        if (!bucket) return 0;
        const stat = bucketStats[bucket];
        if (!stat || stat.total < 5) return 0;
        const actualPct = (stat.wins / stat.total) * 100;
        const breakEven = impliedBreakEvenPct(oddsForBucket);
        return Number((actualPct - breakEven).toFixed(1));
      })(),
      oddsBucketSample: (() => {
        const pml = side === 'home' ? mergedHomeML : mergedAwayML;
        const oddsForBucket = sportStyle !== 'na' ? pml : (pml != null && pml >= -150 && pml <= 160 ? pml : (mergedSpread !== null || mergedTotal !== null ? -110 : pml));
        if (oddsForBucket == null) return 0;
        const bucket = oddsBucket(oddsForBucket);
        if (!bucket) return 0;
        return bucketStats[bucket]?.total ?? 0;
      })(),
      // First-frame tendency (MLB 1st-inning, NBA/WNBA Q1) — from ESPN linescores.
      tendencyFirstFrameScored: side === 'home' ? (homeTendencies?.pctScoredFirstInning ?? 0) : (awayTendencies?.pctScoredFirstInning ?? 0),
      tendencyFirstFrameAllowed: side === 'home' ? (homeTendencies?.pctAllowedFirstInning ?? 0) : (awayTendencies?.pctAllowedFirstInning ?? 0),
      tendencyOppFirstFrameScored: side === 'home' ? (awayTendencies?.pctScoredFirstInning ?? 0) : (homeTendencies?.pctScoredFirstInning ?? 0),
      tendencyOppFirstFrameAllowed: side === 'home' ? (awayTendencies?.pctAllowedFirstInning ?? 0) : (homeTendencies?.pctAllowedFirstInning ?? 0),
      tendencyF5TotalAvg: side === 'home' ? (homeTendencies?.avgF5Total ?? 0) : (awayTendencies?.avgF5Total ?? 0),
      // FIX 2026-06-05 (audit #3): wire previously-dead F5 scored/allowed splits.
      pickedAvgF5Scored: side === 'home' ? (homeTendencies?.avgF5Scored ?? 0) : (awayTendencies?.avgF5Scored ?? 0),
      pickedAvgF5Allowed: side === 'home' ? (homeTendencies?.avgF5Allowed ?? 0) : (awayTendencies?.avgF5Allowed ?? 0),
      oppAvgF5Scored: side === 'home' ? (awayTendencies?.avgF5Scored ?? 0) : (homeTendencies?.avgF5Scored ?? 0),
      oppAvgF5Allowed: side === 'home' ? (awayTendencies?.avgF5Allowed ?? 0) : (homeTendencies?.avgF5Allowed ?? 0),
      tendencyOppF5TotalAvg: side === 'home' ? (awayTendencies?.avgF5Total ?? 0) : (homeTendencies?.avgF5Total ?? 0),
      tendencyFirstFrameSample: side === 'home' ? (homeTendencies?.sampleGames ?? 0) : (awayTendencies?.sampleGames ?? 0),
      // Probable starter matchup — our side first, opponent second. 0 = no probable posted.
      pickedPitcherEraL5: side === 'home' ? (probables.home?.eraL5 ?? 0) : (probables.away?.eraL5 ?? 0),
      oppPitcherEraL5: side === 'home' ? (probables.away?.eraL5 ?? 0) : (probables.home?.eraL5 ?? 0),
      pickedPitcherWhipL5: side === 'home' ? (probables.home?.whipL5 ?? 0) : (probables.away?.whipL5 ?? 0),
      oppPitcherWhipL5: side === 'home' ? (probables.away?.whipL5 ?? 0) : (probables.home?.whipL5 ?? 0),
      pickedPitcherStarts: side === 'home' ? (probables.home?.startsAnalyzed ?? 0) : (probables.away?.startsAnalyzed ?? 0),
      oppPitcherStarts: side === 'home' ? (probables.away?.startsAnalyzed ?? 0) : (probables.home?.startsAnalyzed ?? 0),
      pickedAvgMargin10: side === 'home' ? (homeForm?.avgMargin10 ?? 0) : (awayForm?.avgMargin10 ?? 0),
      oppAvgMargin10: side === 'home' ? (awayForm?.avgMargin10 ?? 0) : (homeForm?.avgMargin10 ?? 0),
      pickedBullpenAllowed: side === 'home' ? (homeTendencies?.avgBullpenAllowed ?? 0) : (awayTendencies?.avgBullpenAllowed ?? 0),
      oppBullpenAllowed: side === 'home' ? (awayTendencies?.avgBullpenAllowed ?? 0) : (homeTendencies?.avgBullpenAllowed ?? 0),
      pickedPctBlewLateLead: side === 'home' ? (homeTendencies?.pctBlewLateLead ?? 0) : (awayTendencies?.pctBlewLateLead ?? 0),
      oppPctBlewLateLead: side === 'home' ? (awayTendencies?.pctBlewLateLead ?? 0) : (homeTendencies?.pctBlewLateLead ?? 0),
      pickedAvgQ1Scored: side === 'home' ? (homeTendencies?.avgQ1Scored ?? 0) : (awayTendencies?.avgQ1Scored ?? 0),
      pickedAvgQ1Allowed: side === 'home' ? (homeTendencies?.avgQ1Allowed ?? 0) : (awayTendencies?.avgQ1Allowed ?? 0),
      oppAvgQ1Scored: side === 'home' ? (awayTendencies?.avgQ1Scored ?? 0) : (homeTendencies?.avgQ1Scored ?? 0),
      oppAvgQ1Allowed: side === 'home' ? (awayTendencies?.avgQ1Allowed ?? 0) : (homeTendencies?.avgQ1Allowed ?? 0),
      pickedAvgH1Scored: side === 'home' ? (homeTendencies?.avgH1Scored ?? 0) : (awayTendencies?.avgH1Scored ?? 0),
      pickedAvgH1Allowed: side === 'home' ? (homeTendencies?.avgH1Allowed ?? 0) : (awayTendencies?.avgH1Allowed ?? 0),
      oppAvgH1Scored: side === 'home' ? (awayTendencies?.avgH1Scored ?? 0) : (homeTendencies?.avgH1Scored ?? 0),
      oppAvgH1Allowed: side === 'home' ? (awayTendencies?.avgH1Allowed ?? 0) : (homeTendencies?.avgH1Allowed ?? 0),
      pickedPctLeadAfterQ1: side === 'home' ? (homeTendencies?.pctLeadAfterQ1 ?? 0) : (awayTendencies?.pctLeadAfterQ1 ?? 0),
      pickedPctLeadAfterH1: side === 'home' ? (homeTendencies?.pctLeadAfterH1 ?? 0) : (awayTendencies?.pctLeadAfterH1 ?? 0),
      // Line movement — computed per side so each side's "movement toward me" is signed correctly.
      mlMovementForSide: (() => {
        const mv = computeMovement(opening, currentOddsSnap, side);
        return mv.mlMovementForSide;
      })(),
      spreadMovementForSide: (() => {
        const mv = computeMovement(opening, currentOddsSnap, side);
        return mv.spreadMovementForSide;
      })(),
      totalMovement: (() => {
        const mv = computeMovement(opening, currentOddsSnap, side);
        return mv.totalMovement;
      })(),
      hasOpeningLine: opening !== null,
      // MLB Stats API matchup edge: lineup-vs-pitcher OPS delta. Picked side is the
      // ML side; "picked lineup" hits OPP pitcher, "opp lineup" hits OUR pitcher.
      pickedLineupVsPitcherOpsDelta: (() => {
        const oppPitcher = side === 'home' ? probables.away : probables.home;
        const pickedLineupHand = side === 'home' ? homeBattingVsHand : awayBattingVsHand;
        const edge = computePitcherMatchupEdge(oppPitcher, pickedLineupHand);
        return edge?.delta ?? 0;
      })(),
      oppLineupVsPitcherOpsDelta: (() => {
        const ourPitcher = side === 'home' ? probables.home : probables.away;
        const oppLineupHand = side === 'home' ? awayBattingVsHand : homeBattingVsHand;
        const edge = computePitcherMatchupEdge(ourPitcher, oppLineupHand);
        return edge?.delta ?? 0;
      })(),
      weatherWindNudge: (() => {
        const nudge = windTotalsNudge(weatherForecast, homeTeamName);
        return nudge?.nudge ?? 0;
      })(),
      weatherLabel: (() => {
        const nudge = windTotalsNudge(weatherForecast, homeTeamName);
        return nudge?.label ?? null;
      })(),
    };
    return { signalsPartial, pickedInj, oppInj, pickedAts, oppAts, pickedAtsHA, pickedStreak, starOutPickSide, starOutOppSide, starQuestionablePickSide, starQuestionableOppSide, hasKeyInjuryPicked, hasKeyInjuryOpp };
  };

  const homeEval = buildSideSignals('home');
  const awayEval = buildSideSignals('away');
  const homeScoreEval = scoreGame(homeEval.signalsPartial);
  const awayScoreEval = scoreGame(awayEval.signalsPartial);

  // TENDENCY-FIRST SIDE PICKER — owner directive 2026-06-10: "tendencies are the
  // priority. Teams yearly tend to do what they always do. That's how we came up
  // with the dataset." The ATS/form/injury scoreGame already encodes all tendency
  // signals — trust it to pick the side. The June 4 value-based picker (market
  // implied probability vs projected win%) overrode tendencies and caused a losing
  // streak because market probabilities and ESPN win% don't reliably identify edges
  // — our rolling ATS/OU windows do.
  //
  // Value edge now lives as a CONFIDENCE MODIFIER (see below), not a side selector.
  const americanToImplied = (ml: number | null): number | null => {
    if (ml == null) return null;
    if (ml > 0) return 100 / (ml + 100);
    return Math.abs(ml) / (Math.abs(ml) + 100);
  };
  const homeProjected = mergedHomeWinPct != null ? mergedHomeWinPct / 100 : null;
  const awayProjected = mergedAwayWinPct != null ? mergedAwayWinPct / 100 : null;
  const homeImplied = americanToImplied(mergedHomeML);
  const awayImplied = americanToImplied(mergedAwayML);
  // Compute value edge per side (used for confidence modifier, not side selection).
  const homeValueEdge = (homeProjected != null && homeImplied != null) ? homeProjected - homeImplied : 0;
  const awayValueEdge = (awayProjected != null && awayImplied != null) ? awayProjected - awayImplied : 0;
  // Side = whichever has the stronger tendency-based score.
  const pickedSideForSignals: 'home' | 'away' = homeScoreEval >= awayScoreEval ? 'home' : 'away';
  const pickedValueEdge = pickedSideForSignals === 'home' ? homeValueEdge : awayValueEdge;
  // DIAGNOSTIC — logs to Vercel so we can audit picks. Shows the exact values
  // driving the side decision (score eval, value edge for confirmation).
  console.log(`[side-picker] ${league} ${gameId} ${homeTeamName} vs ${awayTeamName} | `
    + `homeWinPct=${mergedHomeWinPct} awayWinPct=${mergedAwayWinPct} | `
    + `homeML=${mergedHomeML} awayML=${mergedAwayML} | `
    + `homeProj=${homeProjected?.toFixed(3)} awayProj=${awayProjected?.toFixed(3)} | `
    + `homeImpl=${homeImplied?.toFixed(3)} awayImpl=${awayImplied?.toFixed(3)} | `
    + `homeValEdge=${homeValueEdge.toFixed(4)} awayValEdge=${awayValueEdge.toFixed(4)} | `
    + `homeScore=${homeScoreEval} awayScore=${awayScoreEval} | `
    + `PICK=${pickedSideForSignals} pickedEdge=${pickedValueEdge.toFixed(4)}`
  );
  const evalForPicked = pickedSideForSignals === 'home' ? homeEval : awayEval;
  const { signalsPartial, pickedInj, oppInj, pickedAts, oppAts, pickedAtsHA, pickedStreak, starOutPickSide, starOutOppSide, starQuestionablePickSide, starQuestionableOppSide, hasKeyInjuryPicked, hasKeyInjuryOpp } = evalForPicked;

  const baseScore = scoreGame(signalsPartial);
  // Asleep bonus — boost confidence for lesser-watched leagues so they out-rank
  // generic mainstream chalk on the headline boards. Strictly multiplicative on the
  // raw signal score; never lifts a no-edge pick into a tier on its own.
  const asleepBoost = asleepMultiplier(league);
  // VALUE EDGE MODIFIER — now that tendencies pick the side, value edge is used
  // only to adjust confidence. When the market also favors our tendency pick, that's
  // confirmation (+points). When the market strongly disagrees, dock confidence.
  // Scale: edge ≥ 5pp → +4, 2-5pp → +2, -5pp or worse → -4, -2 to -5pp → -2.
  // "pp" = percentage-points of win probability edge. Small movements (< 2pp) are noise.
  let valueEdgeAdj = 0;
  if (pickedValueEdge >= 0.05) valueEdgeAdj = 4;
  else if (pickedValueEdge >= 0.02) valueEdgeAdj = 2;
  else if (pickedValueEdge <= -0.05) valueEdgeAdj = -4;
  else if (pickedValueEdge <= -0.02) valueEdgeAdj = -2;
  const rawScore = Math.round(baseScore * asleepBoost) + valueEdgeAdj;
  // CHANGE THE PICK on breaking news: if a star on our side is OUT, cap the score so
  // this play drops out of the headline tiers (the board will surface a different game).
  let confidenceScore = starOutPickSide ? Math.min(rawScore, 42) : rawScore;
  // 2026-06-04 chaos-game guard: when BOTH sides have a star ruled out, the
  // matchup is too unpredictable to claim high conviction — neither side has
  // a clean read on the other. Cap conf at 80 so this game can still ship as
  // a VIP / parlay leg but never as a Grand Slam or Pressure Pack headliner.
  if (starOutPickSide && starOutOppSide) confidenceScore = Math.min(confidenceScore, 80);

  // 2026-06-04 star-confirmation gate. When a flagged star is on the
  // QUESTIONABLE list (not OUT — still might play), the matchup is uncertain.
  // Cap confidence at 85 so this play can ship as VIP / Parlay but won't
  // anchor Grand Slam or Pressure Pack until lineups confirm. Example: Lynx
  // -4.5 with Napheesa Collier listed questionable — would have shipped as
  // PP at 100; now caps at 85 until she's confirmed in for tip.
  if (starQuestionablePickSide) confidenceScore = Math.min(confidenceScore, 85);

  // 2026-06-04 line-movement tripwire. The market is the most expensive,
  // most-informed counterparty we have. When the line moves >100¢ away from
  // our side, that's the market screaming we're on the wrong side — even if
  // every other signal says we're right. Tier caps:
  //   -100¢ to -149¢ against: cap conf at 82 (max VIP/parlay, no Pressure)
  //   -150¢ or worse against: cap conf at 75 (Parlay only)
  // Only fires when we actually captured an opening line (hasOpeningLine true).
  const mlMove = signalsPartial.mlMovementForSide || 0;
  if (signalsPartial.hasOpeningLine) {
    if (mlMove <= -150) confidenceScore = Math.min(confidenceScore, 75);
    else if (mlMove <= -100) confidenceScore = Math.min(confidenceScore, 82);
  }

  // 2026-06-04 MLB late-scratch protection. Late scratches are the #1 cause
  // of MLB ML/runline losses. When the picked-side starter ISN'T confirmed by
  // the team (status not 'Confirmed' in ESPN's probables block) AND game time
  // is within 4 hours, cap conf at 80. Once first pitch is hours away the
  // probable is locked in by the team; before then a manager flip can flip
  // the whole bet. Only applies to side bets (ML, spread); totals and props
  // are less starter-dependent.
  if (league === 'MLB' && (pickedSideForSignals === 'home' ? !probables.homeConfirmed : !probables.awayConfirmed)) {
    const startMs = event.date ? new Date(event.date).getTime() : 0;
    const hoursToFirstPitch = startMs > 0 ? (startMs - Date.now()) / 3_600_000 : 99;
    if (hoursToFirstPitch <= 4) {
      confidenceScore = Math.min(confidenceScore, 80);
    }
  }

  // 2026-06-05: NO-PROBABLE-NAME guard. When neither side has a probable
  // pitcher posted yet (typical for picks generated 12+ hours before first
  // pitch on a morning cron run), the engine has no real pitcher matchup to
  // anchor the read — the ERA signals may be stale or refer to a different
  // arm than the team will actually run out there. Cap conf at 75 so the
  // pick can ride as a parlay leg or VIP backup but never anchors Grand Slam,
  // Pressure Pack, or VIP top slots until probables post.
  if (league === 'MLB') {
    const homeProbableName = probables.home?.name || (homeRaw as any)?.probables?.[0]?.athlete?.displayName;
    const awayProbableName = probables.away?.name || (awayRaw as any)?.probables?.[0]?.athlete?.displayName;
    const noProbablesPosted = !homeProbableName && !awayProbableName;
    const noPickedProbable = pickedSideForSignals === 'home' ? !homeProbableName : !awayProbableName;
    if (noProbablesPosted) {
      confidenceScore = Math.min(confidenceScore, 75);
    } else if (noPickedProbable) {
      // One side posted, ours didn't — still risky for our specific side.
      confidenceScore = Math.min(confidenceScore, 80);
    }
  }
  // RE-APPLY data quality cap AFTER the asleep boost. Without this, a low-DQ tennis or
  // KBO pick (DQ ~45 → capped at 63 inside scoreGame) could be multiplied by a 1.15
  // asleep boost up to 72 — high enough to crack tiers it didn't earn. The user
  // specifically asked: don't let confidence inflate when the underlying data is thin.
  if (dq < 30) confidenceScore = Math.min(confidenceScore, 52);
  else if (dq < 50) confidenceScore = Math.min(confidenceScore, 63);
  else if (dq < 65) confidenceScore = Math.min(confidenceScore, 75);

  // DIG THE WHOLE GAME — don't anchor to the moneyline/run line. Score the full-game TOTAL
  // from each team's last-10 scoring and, if it's a stronger play than the side, make the
  // total the pick. Zero API cost (uses avgTotal10 already fetched). Deeper markets (team
  // totals, halves, quarters, periods, F5, props) get layered on for featured picks in
  // enrichWithBestMarket. Confidence only ever RISES here, so the GS 96 / Pressure 83 floors
  // can't be undercut, and a genuinely strong side (100+) keeps its slot.
  let totalPlay: { over: boolean; line: number } | null = null;
  if (sportStyle === 'na' && mergedTotal != null && !starOutPickSide) {
    const ht = homeForm?.avgTotal10 ?? null;
    const at = awayForm?.avgTotal10 ?? null;
    if (ht != null && at != null) {
      const proj = (ht + at) / 2;
      let tConf = scoreTotalsConfidence(proj, mergedTotal, null);
      if (dq < 30) tConf = Math.min(tConf, 52);
      else if (dq < 50) tConf = Math.min(tConf, 63);
      else if (dq < 65) tConf = Math.min(tConf, 75);
      if (tConf > confidenceScore) {
        totalPlay = { over: proj >= mergedTotal, line: mergedTotal };
        confidenceScore = tConf;
      }
    }
  }
  // NCAA BASEBALL CONFIDENCE CAP — owner directive 2026-06-01: NCAA baseball games
  // are NOT plus-tier picks. We don't have probable pitcher data for college baseball
  // (ESPN doesn't expose it reliably), so the engine is running on bullpen tendency +
  // ATS + form alone — missing the single biggest predictor. These picks cannot reach
  // the same conviction tier as MLB picks where we know who's pitching.
  //
  // Cap at 88 (STRONG tier max, just below SLAM DUNK). Engine still surfaces them when
  // signals genuinely support it, but never crowns them at 100 conf when we're missing
  // the most important variable.
  const isCollegeBaseballOrSimilarThinData =
    league === 'NCAA Baseball' || league === 'College Baseball' || league === 'NCAA Softball';
  if (isCollegeBaseballOrSimilarThinData) {
    confidenceScore = Math.min(88, confidenceScore);
  }

  // CAP AT 100. Confidence is a 0-100 conviction score — it must never read above 100.
  confidenceScore = Math.min(100, Math.round(confidenceScore));
  const isAsleepPick = asleepBoost > 1.05;
  const confirmingSignals = countConfirmingSignals(pickedSideForSignals, signalsPartial);
  const signals: GameSignals = { ...signalsPartial, confirmingSignals };
  const tier = assignTier(confidenceScore, confirmingSignals);

  // Drop low-edge games — EXCEPT marquee-league games (we still want to cover tonight's
  // big NBA/NHL/NFL matchups) AND asleep-league games (NCAA Baseball, UFC, etc.) where
  // the user explicitly wants quieter markets surfaced even when the signal is modest.
  const isStrongAsleepLeague = asleepBoost >= 1.15;
  if (tier === 'PASS' && !MARQUEE_LEAGUES.has(league) && !isStrongAsleepLeague) return null;

  // Build team profiles. 2026-06-05: probablePitcherName now flowed through
  // to the customer-visible pick output. Previously the engine consumed pitcher
  // ERA/WHIP for scoring but never surfaced the name on the card, leaving
  // customers + admin unsure who's actually starting.
  const home: TeamProfile = {
    id: String(homeRaw.team?.id || homeRaw.id || ''),
    name: homeRaw.team?.displayName || 'Home', abbreviation: homeRaw.team?.abbreviation || 'HOME',
    homeAway: 'home', overallRecord: homeOverall, homeAwayRecord: homeHomeRec,
    ats: homeAtsData.overall, atsHomeAway: homeAtsData.homeAway,
    winProbability: homeWinPct, moneyline: mergedHomeML, keyPlayers: homeLeaders,
    injuredOut: homeInj.out, injuredDoubtful: homeInj.doubtful, injuredQuestionable: homeInj.questionable,
    recentForm: homeForm?.form ?? null, recentFormRecord: homeForm?.record ?? null,
    ...(isMlb ? { probablePitcherName: probables.home?.name || (homeRaw as any)?.probables?.[0]?.athlete?.displayName || null, probablePitcherConfirmed: !!probables.homeConfirmed } : {}),
    trends: homeForm ? {
      last5: homeForm.last5, last10: homeForm.last10, last20: homeForm.last20,
      season: homeForm.season, home: homeForm.home, away: homeForm.away,
      avgMargin10: homeForm.avgMargin10, trendDirection: homeForm.trendDirection, streak: homeForm.streak,
      ats5: homeForm.ats5, ats10: homeForm.ats10, ats20: homeForm.ats20,
      atsSeason: homeForm.atsSeason, atsHome: homeForm.atsHome, atsAway: homeForm.atsAway,
      ou5: homeForm.ou5, ou10: homeForm.ou10, ou20: homeForm.ou20,
      ouSeason: homeForm.ouSeason, ouHome: homeForm.ouHome, ouAway: homeForm.ouAway,
      avgTotal10: homeForm.avgTotal10,
    } : null,
  };

  const away: TeamProfile = {
    id: String(awayRaw.team?.id || awayRaw.id || ''),
    name: awayRaw.team?.displayName || 'Away', abbreviation: awayRaw.team?.abbreviation || 'AWAY',
    homeAway: 'away', overallRecord: awayOverall, homeAwayRecord: awayRoadRec,
    ats: awayAtsData.overall, atsHomeAway: awayAtsData.homeAway,
    winProbability: awayWinPct, moneyline: mergedAwayML, keyPlayers: awayLeaders,
    injuredOut: awayInj.out, injuredDoubtful: awayInj.doubtful, injuredQuestionable: awayInj.questionable,
    recentForm: awayForm?.form ?? null, recentFormRecord: awayForm?.record ?? null,
    ...(isMlb ? { probablePitcherName: probables.away?.name || (awayRaw as any)?.probables?.[0]?.athlete?.displayName || null, probablePitcherConfirmed: !!probables.awayConfirmed } : {}),
    trends: awayForm ? {
      last5: awayForm.last5, last10: awayForm.last10, last20: awayForm.last20,
      season: awayForm.season, home: awayForm.home, away: awayForm.away,
      avgMargin10: awayForm.avgMargin10, trendDirection: awayForm.trendDirection, streak: awayForm.streak,
      ats5: awayForm.ats5, ats10: awayForm.ats10, ats20: awayForm.ats20,
      atsSeason: awayForm.atsSeason, atsHome: awayForm.atsHome, atsAway: awayForm.atsAway,
      ou5: awayForm.ou5, ou10: awayForm.ou10, ou20: awayForm.ou20,
      ouSeason: awayForm.ouSeason, ouHome: awayForm.ouHome, ouAway: awayForm.ouAway,
      avgTotal10: awayForm.avgTotal10,
    } : null,
  };

  // Sport-specific pick selection. Combat (UFC/Boxing) and outright (golf/racing)
  // routes through the tennis picker — both are fighter-vs-fighter / individual-vs-field
  // moneyline plays, no spreads/totals, so the head-to-head ML logic fits.
  let pickData: ReturnType<typeof pickForNA>;
  if (sportStyle === 'tennis' || sportStyle === 'combat' || sportStyle === 'outright') {
    pickData = pickForTennis(home, away);
  } else if (sportStyle === 'soccer') {
    pickData = pickForSoccer(home, away, mergedTotal);
  } else {
    pickData = pickForNA(home, away, mergedSpread, mergedTotal, pickedSideForSignals, league);
  }

  // If the full-game total out-scored the side above, publish the TOTAL as the play (the
  // side score already lost the tiering decision, so the displayed market matches it).
  if (totalPlay && sportStyle === 'na') {
    pickData = {
      selectionSide: pickedSideForSignals, marketType: 'total',
      selection: `${totalPlay.over ? 'Over' : 'Under'} ${totalPlay.line}`,
      odds: '-110', line: `${totalPlay.line}`,
    };
  }

  // NCAA BASEBALL SPREAD RESTRICTION (added 2026-06-01 after Georgia Tech -4.5 + Florida -3.5
  // both lost tonight). Without probable pitcher data we can't predict cover margin — laying
  // runs on a college team is a coin flip. Convert any NCAA Baseball spread/runline pick
  // to a moneyline pick on the same side. Tighter risk, same direction.
  if (
    (league === 'NCAA Baseball' || league === 'College Baseball' || league === 'NCAA Softball') &&
    pickData.marketType === 'spread'
  ) {
    const pickedTeam = pickData.selectionSide === 'home' ? home : away;
    const pickedML = pickData.selectionSide === 'home' ? mergedHomeML : mergedAwayML;
    const mlOdds = pickedML != null ? `${pickedML > 0 ? '+' : ''}${pickedML}` : pickData.odds;
    pickData = {
      selectionSide: pickData.selectionSide,
      marketType: 'moneyline',
      selection: `${pickedTeam.name} ML`,
      odds: mlOdds,
      line: null,
    };
  }

  // (Marginal chalk / run-line filter removed 2026-05-27 — user prefers the full slate
  // with guaranteed product counts over the leaner sharp-bettor model.)

  // Build reasons
  const reasonsFor: string[] = [];
  const reasonsAgainst: string[] = [];

  // Note: win-probability framing is added at the END of this section so the deeper
  // case-for-pick reasons (pitcher matchup, bullpen state, line movement) lead the
  // customer card. See the win-prob block lower down.

  if (pickedAts && pickedAts.coverPct >= 52) {
    const t = pickData.selectionSide === 'home' ? home : away;
    reasonsFor.push(`${t.abbreviation} covering at ${pickedAts.coverPct.toFixed(1)}% ATS (${pickedAts.display}).`);
  }

  if (pickedAtsHA && pickedAtsHA.coverPct >= 54) {
    const t = pickData.selectionSide === 'home' ? home : away;
    const context = pickData.selectionSide === 'home' ? 'at home' : 'on road';
    reasonsFor.push(`${t.abbreviation} covering at ${pickedAtsHA.coverPct.toFixed(1)}% ATS ${context} (${pickedAtsHA.display}).`);
  }

  if (oppAts && oppAts.coverPct <= 44) {
    const opp = pickData.selectionSide === 'home' ? away : home;
    // FIX 2026-06-02: this was in reasonsAgainst — a weak opp ATS HELPS our pick.
    // Moved to reasonsFor and reframed pick-centric.
    reasonsFor.push(`We get a cover-friendly opponent — ${opp.abbreviation} is only covering ${oppAts.coverPct.toFixed(1)}% ATS (${oppAts.display}), so the spread math tilts our way.`);
  }

  if (lineValueGap >= 2) reasonsFor.push(`Line value gap of ${lineValueGap.toFixed(1)} points detected vs implied spread.`);

  if (pickedStreak >= 3) {
    const t = pickData.selectionSide === 'home' ? home : away;
    reasonsFor.push(`${t.abbreviation} on a ${pickedStreak}-game winning streak.`);
  } else if (pickedStreak <= -3) {
    const t = pickData.selectionSide === 'home' ? home : away;
    reasonsAgainst.push(`${t.abbreviation} is on a ${Math.abs(pickedStreak)}-game losing streak.`);
  }
  // FIX 2026-06-05 (audit #4 narrative): opp streak was silent. A hot opp is a
  // fade signal worth surfacing.
  const oppStreak = pickData.selectionSide === 'home' ? awayStreak : homeStreak;
  if (oppStreak >= 3) {
    const oppT = pickData.selectionSide === 'home' ? away : home;
    reasonsAgainst.push(`${oppT.abbreviation} is also on a ${oppStreak}-game winning streak — they're not coming in cold.`);
  } else if (oppStreak <= -3) {
    const oppT = pickData.selectionSide === 'home' ? away : home;
    reasonsFor.push(`${oppT.abbreviation} is on a ${Math.abs(oppStreak)}-game losing streak — running cold into this matchup.`);
  }

  if (hasKeyInjuryOpp) {
    const picked = pickData.selectionSide === 'home' ? home : away;
    const opp = pickData.selectionSide === 'home' ? away : home;
    const oppOutList = pickData.selectionSide === 'home' ? awayInj.out : homeInj.out;
    const oppDoubtful = pickData.selectionSide === 'home' ? awayInj.doubtful : homeInj.doubtful;
    const pickedOutList = pickedInj.out;
    const pickedDoubtfulList = pickedInj.doubtful;
    const all = [...oppOutList, ...oppDoubtful];
    // FIX 2026-06-05 (Marlins loss audit): two independent failures shipped a thin
    // pick at VIP tier:
    //   (1) "Depleted opp" framing fired on TB missing 2 RPs while WE were missing
    //       Janson Junk (SP) + Griffin Conine (LF) — far more impactful positions.
    //   (2) Same pick had AI fallback text but still cleared VIP floor.
    // The position-weighted severity below + a mutual-injury wash kills failure #1.
    // Failure #2 is handled in the tier-eligibility checks (see isVipEligible).
    const pickedSev = injurySeverity(pickedOutList) + 0.5 * injurySeverity(pickedDoubtfulList);
    const oppSev = injurySeverity(oppOutList) + 0.5 * injurySeverity(oppDoubtful);
    if (oppSev > pickedSev + 1.0 && (oppOutList.length >= 2 || (oppOutList.length >= 1 && oppDoubtful.length >= 1))) {
      reasonsFor.push(`${picked.abbreviation} catches a depleted ${opp.abbreviation} — ${all.slice(0, 3).join(', ')} out, a downgrade the line hasn't fully priced.`);
    } else if (oppSev > pickedSev + 0.3 && all.length >= 1) {
      // Mild edge — name the player without the grandiose "depleted" framing.
      reasonsFor.push(`${opp.abbreviation} is missing ${all[0]} — modest downgrade vs full health.`);
    } else if (pickedSev >= oppSev) {
      // We're hurt equally or worse — this is NOT an edge for us. Surface it honestly.
      reasonsAgainst.push(`Mutual injury wash: ${picked.abbreviation} is hurt at least as much as ${opp.abbreviation} — opponent injury is not an edge here.`);
    }
  }

  if (hasKeyInjuryPicked) {
    const t = pickData.selectionSide === 'home' ? home : away;
    const all = [...pickedInj.out, ...pickedInj.doubtful];
    reasonsAgainst.push(`${t.abbreviation} missing key player(s): ${all.slice(0, 2).join(', ')} — verify before betting.`);
  }

  if (signalConflict) reasonsAgainst.push('ATS trend and win-probability slightly disagree — monitor late line movement before placing.');

  if (starOutPickSide) reasonsAgainst.push(`⚠️ ${starOutPickSide} (a key player on our side) is OUT — we've pulled off this play. Picks update as news breaks, up to ~15 min before game time.`);
  if (starOutOppSide) {
    const picked = pickData.selectionSide === 'home' ? home : away;
    reasonsFor.push(`${picked.abbreviation} gets a free downgrade — ${starOutOppSide} is OUT for the opponent. That's a meaningful talent gap the line hasn't fully priced.`);
  }

  if (signals.noKeyInjuries) reasonsFor.push('Both rosters appear healthy with no confirmed out/doubtful players.');

  // CUSTOMER-FACING reasoning — rewritten 2026-06-01 per owner: lines must explain
  // WHY THIS BET WINS (predicted game flow + outcome), not just team-quality descriptions.
  // "Detroit's starter has held opp lineups under 2.4 ERA — Tampa will struggle to
  // score" is good. "Detroit on a losing streak" alone is just describing the team.
  // Each pushed reason connects a signal to a predicted game state.
  const pickedTeam = pickData.selectionSide === 'home' ? home : away;
  const oppTeam = pickData.selectionSide === 'home' ? away : home;

  // ===== PITCHER MATCHUP — outcome-focused MLB reasoning =====
  // The pitcher is the single biggest variable in a baseball game. We connect ERA
  // numbers to predicted run-prevention so customers know what the BET wins on.
  const ourPitcherDealing = signals.pickedPitcherStarts >= 3 && signals.pickedPitcherEraL5 > 0 && signals.pickedPitcherEraL5 <= 2.5;
  const ourPitcherGood = signals.pickedPitcherStarts >= 3 && signals.pickedPitcherEraL5 > 0 && signals.pickedPitcherEraL5 <= 3.5;
  const ourPitcherBad = signals.pickedPitcherStarts >= 3 && signals.pickedPitcherEraL5 >= 5.0;
  const oppPitcherHittable = signals.oppPitcherStarts >= 3 && signals.oppPitcherEraL5 >= 5.0;
  const eraGapInOurFavor = (signals.pickedPitcherStarts >= 3 && signals.oppPitcherStarts >= 3 && signals.pickedPitcherEraL5 > 0 && signals.oppPitcherEraL5 > 0)
    ? signals.oppPitcherEraL5 - signals.pickedPitcherEraL5
    : 0;
  if (ourPitcherDealing) {
    reasonsFor.push(`Our starter has held opposing lineups to a ${signals.pickedPitcherEraL5} ERA over his last ${signals.pickedPitcherStarts} outings — expect this game to play in the low scoring range where ${pickedTeam.abbreviation} converts late.`);
  } else if (ourPitcherGood) {
    reasonsFor.push(`${pickedTeam.abbreviation}'s starter is rolling at ${signals.pickedPitcherEraL5} ERA L${signals.pickedPitcherStarts} — gives us a stable 5-6 inning floor that ${oppTeam.abbreviation}'s lineup has to crack.`);
  }
  if (oppPitcherHittable) {
    reasonsFor.push(`Our ${pickedTeam.abbreviation} bats walk into a hittable arm — ${oppTeam.abbreviation}'s starter is at ${signals.oppPitcherEraL5} ERA L${signals.oppPitcherStarts}. That projects to 4-5 runs of offense for us, and that's the bet.`);
  }
  if (eraGapInOurFavor >= 3) {
    reasonsFor.push(`${eraGapInOurFavor.toFixed(1)}-run ERA gap in our pitcher's favor. The man on the mound for us has been the better arm by a wide margin — that's how this bet wins.`);
  }
  if (ourPitcherBad) {
    reasonsAgainst.push(`Our starter (${signals.pickedPitcherEraL5} ERA last ${signals.pickedPitcherStarts}) needs to find it tonight — if he gives up 4+ early, the thesis breaks.`);
  }

  // ===== FIRST-FRAME / EARLY-GAME OUTCOME =====
  // Bug 2026-06-03: was hardcoding "run" + "1st inning" for non-MLB sports.
  // Sport-specific language now: MLB = runs/inning, NBA/WNBA = points/quarter,
  // NHL = goals/period.
  if (signals.tendencyFirstFrameSample >= 5) {
    let frameUnit: string;
    let scoreNoun: string;          // what the team scored ("a run" / "the first points" / "a goal")
    let scoreVerb: string;          // verb phrase for the picked team scoring early
    let oppAllowVerb: string;       // verb phrase for the opponent allowing it
    if (isMlb) {
      frameUnit = '1st inning';
      scoreNoun = 'a run';
      scoreVerb = 'puts a run on the board';
      oppAllowVerb = 'surrenders a 1st-inning run';
    } else if (league === 'NHL') {
      frameUnit = '1st period';
      scoreNoun = 'a goal';
      scoreVerb = 'scores in the 1st period';
      oppAllowVerb = 'gives up a 1st-period goal';
    } else {
      // Basketball-family: NBA, WNBA, NCAA Basketball
      frameUnit = '1st quarter';
      scoreNoun = 'points';
      scoreVerb = 'scores in the 1st quarter';
      oppAllowVerb = 'gives up points in the 1st quarter';
    }
    if (signals.tendencyFirstFrameScored >= 70) {
      reasonsFor.push(`${pickedTeam.abbreviation} ${scoreVerb} in ${Math.round(signals.tendencyFirstFrameScored)}% of recent games — we expect them to take an early lead and force ${oppTeam.abbreviation} to play from behind.`);
    }
    if (signals.tendencyOppFirstFrameAllowed >= 70) {
      reasonsFor.push(`${oppTeam.abbreviation} ${oppAllowVerb} in ${Math.round(signals.tendencyOppFirstFrameAllowed)}% of recent games — ${pickedTeam.abbreviation} should get on top early.`);
    }
  }

  // ===== BULLPEN / LATE-GAME OUTCOME =====
  if (signals.tendencyFirstFrameSample >= 5) {
    if (signals.oppBullpenAllowed >= 2.5) {
      reasonsFor.push(`Our late-inning comeback edge is real — ${oppTeam.abbreviation}'s pen is bleeding ${signals.oppBullpenAllowed.toFixed(1)} R/g in innings 7-9. If this is a 1-2 run game late, ${pickedTeam.abbreviation} gets the at-bats that swing it.`);
    }
    if (signals.pickedBullpenAllowed >= 2.5) {
      reasonsAgainst.push(`Our bullpen has bled ${signals.pickedBullpenAllowed.toFixed(1)} R/g in innings 7-9 — if we don't have the lead by the 7th, late innings get scary.`);
    }
    if (signals.oppPctBlewLateLead >= 30) {
      reasonsFor.push(`We have a late-game comeback edge — ${pickedTeam.abbreviation} stays alive because ${oppTeam.abbreviation} has blown a post-6th lead in ${Math.round(signals.oppPctBlewLateLead)}% of recent losses. Down 2 in the 7th still wins this bet.`);
    }
  }

  // ===== STREAK FRAGILITY =====
  if (signals.recentFormStreak >= 3 && signals.pickedAvgMargin10 < -0.3) {
    reasonsAgainst.push(`${pickedTeam.abbreviation}'s ${signals.recentFormStreak}-game streak is built on top of a 4-6 L10 stretch — recent wins were thin. Riding momentum here, not dominance.`);
  } else if (signals.recentFormStreak >= 3 && signals.pickedAvgMargin10 >= 1.5) {
    reasonsFor.push(`${pickedTeam.abbreviation} is outscoring opponents by ${signals.pickedAvgMargin10.toFixed(1)} runs per game over their last 10 — this team is actually playing dominant, not just lucky.`);
  }

  // ===== LINE MOVEMENT — sharp money read =====
  // Bug fix 2026-06-03: was claiming "public is on the other side" / "sharps agree"
  // without checking sharpIntel data. Now we ONLY mention sharp/public behavior
  // when sharpIntel.betting actually has data — otherwise just report the line
  // move neutrally. Owner directive: no hallucinated reasoning.
  const sharpDataAvailable = !!(sharpIntel?.betting && (
    sharpIntel.betting.homeMoneyPct != null || sharpIntel.betting.awayMoneyPct != null ||
    sharpIntel.betting.homeBetPct != null || sharpIntel.betting.awayBetPct != null
  ));
  if (signals.hasOpeningLine) {
    if (signals.mlMovementForSide >= 15) {
      reasonsFor.push(sharpDataAvailable
        ? `Line moved ${signals.mlMovementForSide}¢ toward ${pickedTeam.abbreviation} since open while public is on the other side — textbook reverse line movement.`
        : `Line moved ${signals.mlMovementForSide}¢ toward ${pickedTeam.abbreviation} since open.`);
    } else if (signals.mlMovementForSide <= -15) {
      reasonsAgainst.push(sharpDataAvailable
        ? `Line moved ${Math.abs(signals.mlMovementForSide)}¢ AWAY from our side since open — market pricing us out.`
        : `Line moved ${Math.abs(signals.mlMovementForSide)}¢ away from our side since open.`);
    } else if (signals.spreadMovementForSide >= 1.0) {
      reasonsFor.push(`Spread moved ${signals.spreadMovementForSide.toFixed(1)} pts toward ${pickedTeam.abbreviation} since open.`);
    } else if (signals.spreadMovementForSide <= -1.0) {
      reasonsAgainst.push(`Spread moved ${Math.abs(signals.spreadMovementForSide).toFixed(1)} pts away from our side since open.`);
    }
  }

  // ===== NBA/WNBA Q1/H1 OUTCOME =====
  if (signals.pickedAvgQ1Scored > 0 && signals.oppAvgQ1Allowed > 0) {
    const q1Edge = signals.pickedAvgQ1Scored - signals.oppAvgQ1Allowed;
    if (q1Edge >= 4 && signals.pickedPctLeadAfterQ1 >= 60) {
      reasonsFor.push(`${pickedTeam.abbreviation} averages ${signals.pickedAvgQ1Scored.toFixed(1)} pts in Q1 vs ${oppTeam.abbreviation}'s ${signals.oppAvgQ1Allowed.toFixed(1)} Q1 allowed. They lead after Q1 in ${Math.round(signals.pickedPctLeadAfterQ1)}% of games — we set the tone early and ${oppTeam.abbreviation} has to play uphill.`);
    } else if (signals.pickedPctLeadAfterH1 >= 65) {
      reasonsFor.push(`${pickedTeam.abbreviation} leads at the half in ${Math.round(signals.pickedPctLeadAfterH1)}% of recent games. They build their margin in the first 24 minutes — this game is decided before the 4th quarter.`);
    }
  }

  // ===== INJURY OUTCOME (already exists higher up — augment with outcome framing) =====
  // The base injury reason is pushed earlier; not re-added here to avoid duplicates.

  // WIN-PROBABILITY framing — added LAST so the deeper case-for-pick reasons lead.
  // Only included when win% actually supports the pick (or as a VALUE frame when we
  // flipped to the underdog — never as a misleading "TB 60% vs DET 40%" contradiction).
  if (homeWinPct !== null && awayWinPct !== null) {
    const pickedWinPct = pickData.selectionSide === 'home' ? homeWinPct : awayWinPct;
    const oppWinPct = pickData.selectionSide === 'home' ? awayWinPct : homeWinPct;
    if (pickedWinPct > oppWinPct) {
      reasonsFor.push(`Win probability edge: ${pickedTeam.abbreviation} ${pickedWinPct.toFixed(1)}% vs ${oppTeam.abbreviation} ${oppWinPct.toFixed(1)}% — ${winProbGap.toFixed(1)}pt gap.`);
    } else if (pickData.marketType === 'moneyline' && oppWinPct - pickedWinPct >= 5) {
      reasonsFor.push(`Value price: ${pickedTeam.abbreviation} is the underdog at ${pickedWinPct.toFixed(0)}% implied — our deeper signals (above) say the line is wrong.`);
    }
  }

  // Tendency resolver — produces a per-pick math read on whether the line is fair.
  // For totals: 'home' is shoehorned to mean Over (matches how we encode total picks
  // upstream — see how Over/Under map to a side in the selection string).
  const totalsPickedSide: 'home' | 'away' = pickData.marketType === 'total'
    ? (/\bover\b/i.test(pickData.selection) ? 'home' : 'away')
    : pickData.selectionSide;
  const tendencyPostedLine = pickData.marketType === 'total'
    ? mergedTotal
    : pickData.marketType === 'spread'
      ? (() => {
        // Convert "Yankees -1.5" → -1.5 from the picked team's perspective.
        const m = (pickData.line || '').match(/[-+]?\d+(\.\d+)?/);
        return m ? Number(m[0]) : null;
      })()
      : null;
  const tendencyResolution = resolveTendency({
    market: pickData.marketType,
    league,
    postedLine: tendencyPostedLine,
    selectionSide: totalsPickedSide,
    homeAvgTotal: homeForm?.avgTotal10 ?? null,
    awayAvgTotal: awayForm?.avgTotal10 ?? null,
    homeAvgMargin: homeForm?.avgMargin10 ?? null,
    awayAvgMargin: awayForm?.avgMargin10 ?? null,
  });

  // Freeze both sides' evaluation into the evidence file. This is the irreplaceable
  // forensic data — once the game starts, we can never reconstruct what the engine
  // knew at publish. Stored on research_payload.evidence by recordBoardService.
  const evidence: PickEvidence = {
    pickedSide: pickedSideForSignals,
    homeScore: Math.round(homeScoreEval),
    awayScore: Math.round(awayScoreEval),
    scoreGap: Math.abs(Math.round(homeScoreEval) - Math.round(awayScoreEval)),
    homeSignals: homeEval.signalsPartial,
    awaySignals: awayEval.signalsPartial,
    pickedInjuries: {
      out: pickedInj.out.slice(0, 5),
      doubtful: pickedInj.doubtful.slice(0, 5),
      questionable: pickedInj.questionable.slice(0, 5),
    },
    oppInjuries: {
      out: oppInj.out.slice(0, 5),
      doubtful: oppInj.doubtful.slice(0, 5),
      questionable: oppInj.questionable.slice(0, 5),
    },
    pickedAtsSeason: pickedAts?.display ?? null,
    oppAtsSeason: oppAts?.display ?? null,
    pickedAtsHomeAway: pickedAtsHA?.display ?? null,
    pickedStreak,
    starOutPickSide: starOutPickSide ?? null,
    starOutOppSide: starOutOppSide ?? null,
    totalPlayApplied: totalPlay !== null,
    baseScore: Math.round(baseScore),
    asleepBoost,
    dataQuality: dq,
  };

  // ===== KEY FACTOR — single biggest reason for this pick =====
  // Owner directive: "every game must have a key factor of why we took it." We pick
  // the signal that contributed the most to confidence; ties go to the most actionable.
  // Priority order matches: most predictive signals first.
  type KeyFactor = NonNullable<DeepPickResult['keyFactor']>;
  let keyFactor: KeyFactor | undefined;

  // 1) Pitcher matchup (MLB only) — biggest single MLB-game predictor
  if (eraGapInOurFavor >= 3 || ourPitcherDealing || oppPitcherHittable) {
    const ourEra = signals.pickedPitcherEraL5;
    const oppEra = signals.oppPitcherEraL5;
    const gap = oppEra - ourEra;
    let detail: string;
    if (gap >= 4 && ourEra > 0 && oppEra > 0) {
      detail = `${gap.toFixed(1)}-run ERA gap in our favor. Our starter has held a ${ourEra} ERA over his last ${signals.pickedPitcherStarts} starts; theirs is at ${oppEra} ERA L${signals.oppPitcherStarts}. The man on the mound is the bet — when our arm goes 6 strong, this game's over.`;
    } else if (ourPitcherDealing) {
      detail = `Our starter has been elite — ${ourEra} ERA over his last ${signals.pickedPitcherStarts} outings. He limits opposing rallies and gives our lineup a low bar to clear.`;
    } else if (oppPitcherHittable) {
      detail = `Our ${pickedTeam.abbreviation} bats get the matchup they want — ${oppTeam.abbreviation}'s starter is at ${oppEra} ERA L${signals.oppPitcherStarts}, a damaged arm we should crack for 4+ runs.`;
    } else {
      detail = `Pitcher matchup tilts in our favor. Both arms break down to give us the edge tonight.`;
    }
    keyFactor = { category: 'pitcher', headline: 'PITCHER MATCHUP', detail };
  }
  // 1b) HITTING MATCHUP — MLB Stats API OPS lineup-vs-pitcher edge. Fires when ERA gap
  // isn't dramatic but the OPS matchup math says our hitters eat this pitcher (or theirs
  // can't touch our SP). Added 2026-06-02 with MLB Stats API integration.
  else if (Math.abs(signals.pickedLineupVsPitcherOpsDelta || 0) >= 0.060 || Math.abs(signals.oppLineupVsPitcherOpsDelta || 0) >= 0.060) {
    const ours = signals.pickedLineupVsPitcherOpsDelta || 0;
    const theirs = signals.oppLineupVsPitcherOpsDelta || 0;
    let detail: string;
    if (ours >= 0.060 && theirs <= -0.040) {
      detail = `Hitting math runs both ways. Our lineup has a ${(ours * 1000).toFixed(0)}-pt OPS edge vs their starter; their bats are ${Math.abs(theirs * 1000).toFixed(0)} OPS points BELOW what they normally hit vs our SP's hand. Pure matchup.`;
    } else if (ours >= 0.060) {
      detail = `Our lineup's OPS vs ${signals.pickedPitcherEraL5 > 0 ? 'this hand' : 'starter'} is ${(ours * 1000).toFixed(0)} OPS points above what their pitcher typically allows. Lineup-pitcher hand matchup tips our way — we hit him.`;
    } else if (theirs <= -0.060) {
      detail = `Our starter's profile shuts down ${oppTeam.abbreviation}'s lineup — they OPS ${Math.abs(theirs * 1000).toFixed(0)} points BELOW season norm vs our SP's hand. Runs we don't give back.`;
    } else {
      detail = `OPS matchup math gives us the edge on this side. Lineup-vs-pitcher splits favor our pick.`;
    }
    keyFactor = { category: 'pitcher', headline: 'HITTING MATCHUP', detail };
  }
  // 2) Reverse line movement / sharp action
  else if (signals.hasOpeningLine && signals.mlMovementForSide >= 20) {
    keyFactor = {
      category: 'line_movement',
      headline: 'SHARP ACTION',
      detail: `Line moved ${signals.mlMovementForSide}¢ toward ${pickedTeam.abbreviation} since open while public is still betting the other side. Reverse line movement — the smart money agrees with our read, books are reacting.`,
    };
  }
  // 3) Odds-bucket eyes — our actual hit rate at this price band
  else if (signals.oddsBucketSample >= 8 && signals.oddsBucketEdgePct >= 10) {
    keyFactor = {
      category: 'odds_bucket',
      headline: 'PRICE BAND HITTING',
      detail: `Our picks at this price band have beaten their break-even by ${signals.oddsBucketEdgePct.toFixed(1)} points over ${signals.oddsBucketSample} settled bets. We've been right at this price consistently.`,
    };
  }
  // 4) Opp bullpen leak — late-game edge
  else if (signals.tendencyFirstFrameSample >= 5 && signals.oppBullpenAllowed >= 2.5) {
    keyFactor = {
      category: 'bullpen',
      headline: 'BULLPEN EDGE',
      detail: `${pickedTeam.abbreviation} owns the late innings — ${oppTeam.abbreviation}'s pen is leaking ${signals.oppBullpenAllowed.toFixed(1)} R/g from the 7th on. Tight game late, the comeback math is ours.`,
    };
  }
  // 5) Real form streak — outscoring opponents by margin
  else if (signals.recentFormStreak >= 3 && signals.pickedAvgMargin10 >= 1.5) {
    keyFactor = {
      category: 'streak_real',
      headline: 'REAL FORM',
      detail: `${pickedTeam.abbreviation} is outscoring opponents by ${signals.pickedAvgMargin10.toFixed(1)} per game over their last 10. They're not just winning — they're dominating. Trend says it continues.`,
    };
  }
  // 6) Q1/H1 — basketball start-fast edge
  else if (signals.pickedAvgQ1Scored > 0 && signals.oppAvgQ1Allowed > 0 && (signals.pickedAvgQ1Scored - signals.oppAvgQ1Allowed) >= 4 && signals.pickedPctLeadAfterQ1 >= 60) {
    keyFactor = {
      category: 'q1_h1',
      headline: 'FAST-START EDGE',
      detail: `${pickedTeam.abbreviation} averages ${signals.pickedAvgQ1Scored.toFixed(1)} pts in Q1 vs ${oppTeam.abbreviation}'s ${signals.oppAvgQ1Allowed.toFixed(1)} Q1 allowed. They lead after Q1 in ${Math.round(signals.pickedPctLeadAfterQ1)}% of games — game decided early.`,
    };
  }
  // 6b) BASKETBALL PACE / MATCHUP edge — when the basketball pace + Off/Def matchup
  // math drives the pick (pace differential, scoring delta, B2B opponent). This is
  // the pitcher-matchup equivalent for basketball.
  else if (signals.pickedAvgQ1Scored > 0 && signals.oppAvgQ1Allowed > 0) {
    const combinedPace = ((signals.pickedAvgQ1Scored + (signals.oppAvgQ1Scored || 0)) / 2);
    const matchupEdge = (signals.pickedAvgQ1Scored - signals.oppAvgQ1Allowed) + ((signals.oppAvgQ1Scored || 0) - (signals.pickedAvgQ1Allowed || 0));
    if (combinedPace >= 26) {
      keyFactor = {
        category: 'q1_h1',
        headline: 'HIGH-PACE GAME',
        detail: `Both teams average ${combinedPace.toFixed(1)} pts in Q1 — this is a track-meet pace. Totals stack up fast; ${pickedTeam.abbreviation} thrives in the up-tempo style.`,
      };
    } else if (combinedPace <= 21) {
      keyFactor = {
        category: 'q1_h1',
        headline: 'GRIND-IT-OUT PACE',
        detail: `Both teams average ${combinedPace.toFixed(1)} pts in Q1 — half-court grinders, low possessions. ${pickedTeam.abbreviation}'s style suits a slower, defensive game.`,
      };
    } else if (matchupEdge >= 5) {
      keyFactor = {
        category: 'q1_h1',
        headline: 'MATCHUP MISMATCH',
        detail: `${pickedTeam.abbreviation}'s offense vs ${oppTeam.abbreviation}'s defense produces a ${matchupEdge.toFixed(1)}-pt scoring edge by the math. We win the matchup on paper.`,
      };
    } else if (signals.oppOnB2B) {
      keyFactor = {
        category: 'q1_h1',
        headline: 'OPPONENT B2B',
        detail: `${pickedTeam.abbreviation} runs into a tired ${oppTeam.abbreviation} on the second night of a back-to-back. We get the transition baskets, the late defensive lapses, and a 4-6pt ATS edge historically.`,
      };
    }
  }
  // 7) Key injury on opponent
  else if (signals.keyInjuryOnOppSide && hasKeyInjuryOpp) {
    const all = [...oppInj.out, ...oppInj.doubtful];
    keyFactor = {
      category: 'injury',
      headline: 'OPPONENT INJURY',
      detail: `${pickedTeam.abbreviation} gets a downgraded matchup — ${oppTeam.abbreviation} is without ${all.slice(0, 2).join(' and ')}. The market hasn't fully repriced; we're buying ${pickedTeam.abbreviation} at yesterday's number.`,
    };
  }
  // 8) ATS trend
  else if (pickedAts && pickedAts.coverPct >= 62 && (!oppAts || oppAts.coverPct <= 44)) {
    keyFactor = {
      category: 'ats',
      headline: 'ATS TREND',
      detail: `${pickedTeam.abbreviation} is covering ${pickedAts.coverPct.toFixed(0)}% of spreads (${pickedAts.display}). The line is consistently wrong on them — we're betting the trend.`,
    };
  }
  // 9) Value price (underdog where we like the signal stack)
  else if (homeWinPct !== null && awayWinPct !== null && pickData.marketType === 'moneyline') {
    const pickedWinPct = pickData.selectionSide === 'home' ? homeWinPct : awayWinPct;
    const oppWinPct = pickData.selectionSide === 'home' ? awayWinPct : homeWinPct;
    if (oppWinPct - pickedWinPct >= 8) {
      keyFactor = {
        category: 'value',
        headline: 'VALUE DOG',
        detail: `${pickedTeam.abbreviation} is priced as the underdog at ${pickedWinPct.toFixed(0)}% implied — but our signals (above) say their real chance to win is meaningfully higher. The price overcompensates.`,
      };
    } else if (pickedWinPct > oppWinPct) {
      keyFactor = {
        category: 'win_prob',
        headline: 'WIN-PROBABILITY EDGE',
        detail: `${pickedTeam.abbreviation} has a ${winProbGap.toFixed(1)}-point win-probability edge based on team form, matchup, and market signals. Straight value.`,
      };
    }
  }
  // 10) Default catch-all — confidence score itself
  if (!keyFactor) {
    keyFactor = {
      category: 'win_prob',
      headline: 'BALANCED EDGE',
      detail: `${confidenceScore}-confidence pick — multiple signals (form, ATS, market) line up in our favor with no single dominant driver. Diversified case.`,
    };
  }

  // ===== PITCHER SPOTLIGHT — attach full starter profiles for MLB picks =====
  // Always attached when we have probables, so customers can see the stat detail
  // backing the KEY FACTOR (when it's pitcher) or as context for any MLB pick.
  let pitcherSpotlight: DeepPickResult['pitcherSpotlight'] | undefined;
  if (isMlb && (probables.home || probables.away)) {
    const pickedProf = pickData.selectionSide === 'home' ? probables.home : probables.away;
    const oppProf = pickData.selectionSide === 'home' ? probables.away : probables.home;
    const flatten = (p: typeof probables.home) => p ? {
      name: p.name, throws: p.throws, starts: p.startsAnalyzed,
      eraL5: p.eraL5, whipL5: p.whipL5, kPer9L5: p.kPer9L5,
      hitsPerStart: p.hitsPerStart, lastStartER: p.lastStartER, lastStartIP: p.lastStartIP,
    } : null;
    pitcherSpotlight = { picked: flatten(pickedProf), opp: flatten(oppProf) };
  }

  // RUNLINE / SPREAD CAP — owner directive 2026-06-03 after the Phillies -1.5 loss.
  // A runline is fundamentally a coin-flip about cover margin: a team can WIN the
  // game but lose the bet on a 1-run margin. Conf 100 on -1.5 was overconfidence.
  // Cap MLB runlines at 92 so we never claim near-certainty on cover margin.
  if (league === 'MLB' && pickData?.marketType === 'spread') {
    confidenceScore = Math.min(92, confidenceScore);
  }

  return {
    gameId, eventName: `${away.name} @ ${home.name}`, league, sport: league, board,
    startTime: event.date || '', homeTeam: home, awayTeam: away,
    spread: mergedSpread, total: mergedTotal,
    selection: pickData.selection, selectionSide: pickData.selectionSide,
    marketType: pickData.marketType, odds: pickData.odds, line: pickData.line,
    confidenceScore, tier, signals, reasonsFor, reasonsAgainst, aiExplanation: null,
    sharpFlags: sharpIntel?.flags ?? [],
    sharpIntel: sharpIntel ? {
      betting: sharpIntel.betting,
      weather: sharpIntel.weather,
      rest: sharpIntel.rest,
      sharpScore: sharpIntel.sharpScore,
    } : null,
    bigGameLabel: detectBigGame(event, comp),
    isAsleepPick,
    asleepBoost,
    tendencyResolution,
    keyFactor,
    pitcherSpotlight,
    evidence,
  };
}

// ─── AI Enrichment ────────────────────────────────────────────────────────────

async function enrichWithAI(pick: DeepPickResult): Promise<DeepPickResult> {
  if (!process.env.ANTHROPIC_API_KEY) return pick;
  try {
    const explanation = await generateDeepExplanation(pick);
    let enriched: DeepPickResult = { ...pick, aiExplanation: explanation };
    // FIX 2026-06-05 (audit #4 AI): when fallback boilerplate fires, the AI
    // wrote no real analysis. Dock confidence 15% so it can't ride at full
    // conviction anywhere (not just GS/VIP — Pressure too). And log it so
    // we can measure fallback rate.
    if (hasAIFallback(enriched)) {
      const penalized = Math.max(0, Math.min(100, Math.round(enriched.confidenceScore * 0.85)));
      console.warn(`[ai-fallback] ${enriched.gameId} ${enriched.selection}: conf ${enriched.confidenceScore} → ${penalized}`);
      enriched = { ...enriched, confidenceScore: penalized };
    }
    return enriched;
  } catch { return pick; }
}

// ─── Main Export ─────────────────────────────────────────────────────────────

// The $10 Parlay aims for this many legs total (game legs + prop/total fill). On a full
// slate the game legs alone get there; on thin nights the fill tops it up.
const PARLAY_TARGET_LEGS = 4;

// Build prop/total fill legs for a short $10 Parlay. Pulls from games NOT already used by
// the straights or the parlay's game legs — never repeats a pick, never uses heavy chalk
// (skips prop prices worse than the parlay floor). Totals come free from already-scored
// games; props are fetched for unused games (the workhorse on thin slates).
async function buildParlayPlanExtraLegs(
  fillEvents: Array<{ gameId: string; league: string; event: any }>,
  scoredByGameId: Map<string, DeepPickResult>,
  usedGames: Set<string>,
  parlayGameIds: Set<string>,
  needed: number,
): Promise<ParlayExtraLeg[]> {
  const out: ParlayExtraLeg[] = [];
  if (needed <= 0) return out;
  const fillGameIds = new Set<string>();   // games already used as a fill leg this pass

  // Projected game total from each team's last-10 scoring average. Works for ANY scored
  // game (the side picks don't carry a total projection, so we derive it here).
  const projTotal = (p: any): number | null => {
    const ht = p?.homeTeam?.trends?.avgTotal10 ?? null;
    const at = p?.awayTeam?.trends?.avgTotal10 ?? null;
    if (ht == null && at == null) return null;
    return ht != null && at != null ? (ht + at) / 2 : (ht ?? at);
  };

  // 1) TOTALS from unused already-scored games (no extra fetch). The game's own projection
  //    decides Over/Under; only include when it clears the line by a real margin.
  for (const [gid, p] of Array.from(scoredByGameId.entries())) {
    if (out.length >= needed) break;
    if (usedGames.has(gid)) continue;
    const total = p.total;
    const predicted = projTotal(p);
    if (total == null || predicted == null || Math.abs(predicted - total) < 0.4) continue;
    const side = predicted >= total ? 'Over' : 'Under';
    out.push({
      type: 'total', league: p.league, gameId: gid, eventName: p.eventName,
      selection: `${side} ${total}`, odds: '-110', startTime: p.startTime || null,
      detail: `Projected ${predicted.toFixed(1)} vs line ${total}`,
    });
    usedGames.add(gid);
    fillGameIds.add(gid);
  }

  // 2) PROPS from unused games — real-value, edge-scored, no heavy chalk.
  if (out.length < needed) {
    try {
      const { buildPreGameProps } = await import('@/services/preGamePropsService');
      for (const fe of fillEvents) {
        if (out.length >= needed) break;
        if (usedGames.has(fe.gameId)) continue;
        const comp = fe.event?.competitions?.[0];
        if (!comp) continue;
        let props: any;
        try { props = await buildPreGameProps(fe.gameId, fe.event?.name || '', fe.league, comp); }
        catch { continue; }
        const best = (props?.propEdges || [])
          .filter((e: any) => e.edgeScore >= 55 && e.recommended)
          .sort((a: any, b: any) => b.edgeScore - a.edgeScore)[0];
        if (!best) continue;
        const sideTxt = best.recommended === 'over' ? 'Over' : 'Under';
        const odds = best.recommended === 'under'
          ? (best.marketUnderPrice != null ? `${best.marketUnderPrice > 0 ? '+' : ''}${best.marketUnderPrice}` : '-110')
          : (best.marketOverPrice != null ? `${best.marketOverPrice > 0 ? '+' : ''}${best.marketOverPrice}` : '-110');
        // No heavy chalk: skip props priced worse than the parlay floor.
        const ml = parseAmericanOdds(odds);
        if (ml != null && ml < 0 && ml < PARLAY_PLAN_ML_FLOOR) continue;
        const marketLabel = String(best.market).replace(/^(player_|batter_|pitcher_)/, '').replace(/_/g, ' ');
        const line = best.marketLine ?? best.projection;
        out.push({
          type: 'prop', league: fe.league, gameId: fe.gameId, eventName: fe.event?.name || '',
          selection: `${best.playerName} ${sideTxt} ${typeof line === 'number' ? line.toFixed(1) : line} ${marketLabel}`.trim(),
          odds, startTime: fe.event?.date || null,
          detail: `proj ${best.projection.toFixed(1)}${best.marketLine != null ? ` vs line ${best.marketLine}` : ''}`,
        });
        usedGames.add(fe.gameId);
        fillGameIds.add(fe.gameId);
      }
    } catch { /* props service unavailable — return whatever totals we found */ }
  }

  // 3) THIN-SLATE TOP-UP (owner opt-in): when there are no separate leftover games, fill
  //    with the game TOTAL of a game we already have a STRAIGHT side on. This is a DIFFERENT
  //    bet (total vs the straight's side) — never the straight pick — and we still never put
  //    two parlay legs on the same game. Guarantees the $10 Parlay reaches its target on
  //    thin nights. (Per owner: "always aim for 4".)
  if (out.length < needed) {
    for (const [gid, p] of Array.from(scoredByGameId.entries())) {
      if (out.length >= needed) break;
      if (parlayGameIds.has(gid) || fillGameIds.has(gid)) continue;  // not a game already in the parlay/fill
      const total = p.total;
      const predicted = projTotal(p);
      if (total == null || predicted == null) continue;
      const side = predicted >= total ? 'Over' : 'Under';
      out.push({
        type: 'total', league: p.league, gameId: gid, eventName: p.eventName,
        selection: `${side} ${total}`, odds: '-110', startTime: p.startTime || null,
        detail: `Projected ${predicted.toFixed(1)} vs line ${total}`,
      });
      fillGameIds.add(gid);
    }
  }

  return out;
}

export async function runDailyDeepResearch(board: BoardType = 'north-american'): Promise<BoardPicksResult> {
  const now = new Date();
  const leagues = BOARD_LEAGUES[board];

  // Fetch all leagues for this board in parallel
  const leagueResults = await Promise.allSettled(
    leagues.map((league) => fetchLeagueScoreboard(league).then((r) => ({ league, result: r })))
  );

  const allGamePromises: Promise<DeepPickResult | null>[] = [];
  let totalScanned = 0;
  const mlbEvents: any[] = [];
  // Standard (non-combat/tennis) events kept around so the $10 Parlay can pull prop/total
  // fill legs from games the straights didn't use — without re-fetching scoreboards.
  const fillEvents: Array<{ gameId: string; league: string; event: any }> = [];

  for (const settled of leagueResults) {
    if (settled.status !== 'fulfilled' || !settled.value.result) continue;
    const { league, result } = settled.value;
    const { events, baseUrl } = result;
    if (league === 'MLB') mlbEvents.push(...events);

    // Combat sports (UFC/PFL/Boxing) AND tennis model one TOURNAMENT/CARD as one event
    // with many matches inside `competitions[]` (combat) or `groupings[].competitions[]`
    // (tennis). Flatten so each match becomes its own "event" the pick engine can score.
    const isCombat = league.startsWith('MMA') || league === 'Boxing';
    const isTennis = league.startsWith('Tennis');
    if (isCombat || isTennis) {
      // Pull MMA/Boxing moneylines from The Odds API (ESPN doesn't carry per-fight odds).
      // fetchLeagueOdds returns a map keyed by `${normFighterA}@@${normFighterB}`.
      let mmaOddsMap: any = {};
      try {
        const { fetchLeagueOdds: _mma } = await import('@/services/oddsApiService') as any;
        // fetchLeagueOdds is internal — use the public moneyline lookup function instead.
      } catch { /* ignore */ }
      const { getOddsInsightForPick } = await import('@/services/oddsApiService');

      const fightEvents: any[] = [];
      for (const card of events) {
        // Tennis events nest matches under `groupings[].competitions[]`; combat events have
        // them directly under `competitions[]`. Walk whichever shape this league uses.
        const allComps: any[] = [];
        if (isTennis && Array.isArray(card?.groupings)) {
          for (const g of card.groupings) {
            const gc = Array.isArray(g?.competitions) ? g.competitions : [];
            for (const c of gc) allComps.push(c);
          }
        } else {
          const comps = Array.isArray(card?.competitions) ? card.competitions : [];
          for (const c of comps) allComps.push(c);
        }
        // Tennis tournaments list every match across 2 weeks of play; combat cards bundle
        // all fights as one event. Filter individual matches to today's ET date only so
        // we never show tomorrow's first-round draw or next week's UFC card on today's
        // board. Per frozen-slate rule, completed matches stay visible — tennis especially,
        // because Roland Garros / Wimbledon matches play overnight Europe time and are all
        // `post` by US evening. Filtering only by date below.
        const todayKeyMatch = dateStr(0);
        for (const compRaw of allComps) {
          // Match's date must resolve to today in ET.
          const matchIso = compRaw?.date;
          if (matchIso) {
            try {
              const parts = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
              }).formatToParts(new Date(matchIso));
              const matchKey = `${parts.find((p) => p.type === 'year')?.value}${parts.find((p) => p.type === 'month')?.value}${parts.find((p) => p.type === 'day')?.value}`;
              if (matchKey !== todayKeyMatch) continue;
            } catch { continue; }
          }
          const comp = compRaw;
          const cs: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
          if (cs.length < 2) continue;
          const f1Name = cs[0]?.athlete?.displayName || 'Fighter 1';
          const f2Name = cs[1]?.athlete?.displayName || 'Fighter 2';
          // Inject moneylines via getOddsInsightForPick (multi-book consensus + best price).
          let homeML: number | null = null;
          let awayML: number | null = null;
          try {
            const homeInsight = await getOddsInsightForPick(league, f2Name, f1Name, 'home');
            const awayInsight = await getOddsInsightForPick(league, f2Name, f1Name, 'away');
            homeML = homeInsight?.bestOdds ?? null;
            awayML = awayInsight?.bestOdds ?? null;
          } catch { /* no odds — fight will fall through with limited data */ }

          const adapted = cs.map((c: any, i: number) => {
            const ath = c.athlete || {};
            return {
              ...c,
              homeAway: i === 0 ? 'home' : 'away',
              team: { id: c.id, displayName: ath.displayName || `Fighter ${i + 1}`, abbreviation: (ath.shortName || `F${i + 1}`).slice(0, 4) },
            };
          });
          fightEvents.push({
            id: String(comp.id || `${card.id}-${comp.id}`),
            name: `${f1Name} vs ${f2Name}`,
            shortName: `${cs[0]?.athlete?.shortName || ''} vs ${cs[1]?.athlete?.shortName || ''}`,
            date: comp.date || card.date,
            status: comp.status || card.status,
            competitions: [{
              ...comp,
              competitors: adapted,
              // Synthesize the odds node processGame expects (homeTeamOdds.moneyLine, etc.)
              odds: [{
                spread: null,
                overUnder: null,
                homeTeamOdds: { moneyLine: homeML },
                awayTeamOdds: { moneyLine: awayML },
              }],
            }],
          });
        }
      }
      totalScanned += fightEvents.length;
      for (const fight of fightEvents) {
        allGamePromises.push(processGame(fight, league, baseUrl, board));
      }
      continue;
    }

    totalScanned += events.length;
    for (const event of events) {
      fillEvents.push({ gameId: String(event.id), league, event });
      allGamePromises.push(processGame(event, league, baseUrl, board));
    }
  }

  const rawResults = await Promise.allSettled(allGamePromises);
  let allScoredRaw: DeepPickResult[] = rawResults
    .filter((r): r is PromiseFulfilledResult<DeepPickResult> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value)
    // Drop picks with no price at all — we don't surface plays we can't actually quote.
    .filter((p) => parseAmericanOdds(p.odds) != null || p.marketType === 'spread' || p.marketType === 'total')
    .sort((a, b) => b.confidenceScore - a.confidenceScore);

  // PLAYER PROPS INTEGRATION — owner directive 2026-06-03: props enter the pool.
  // OWNER UPDATES 2026-06-04:
  //   1) Baseball props are weak and unreliable — DO NOT add MLB props to the main
  //      candidate pool. Only NBA/WNBA/NFL/NHL prop edges qualify. MLB props go
  //      to Power 20 only (separate engine).
  //   2) HARD -300 cap on every pick on every product. No prop with odds steeper
  //      than -300 ever ships.
  //   3) Prop must have a real marketLine (not "TBD") to qualify.
  const PROP_ELIGIBLE_LEAGUES = new Set(['NBA', 'WNBA', 'NFL', 'NHL', 'NCAA Basketball', 'College Football']);
  const GLOBAL_ODDS_FLOOR = -300; // no pick on any main product steeper than -300
  try {
    const { buildPreGameProps } = await import('@/services/preGamePropsService');
    const propCandidates: DeepPickResult[] = [];
    for (const fe of fillEvents.slice(0, 30)) {  // cap to keep latency reasonable
      if (!PROP_ELIGIBLE_LEAGUES.has(fe.league)) continue; // MLB / others excluded
      const comp = fe.event?.competitions?.[0];
      if (!comp) continue;
      const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
      const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
      if (!home || !away) continue;
      let propRes: any;
      try { propRes = await buildPreGameProps(fe.gameId, fe.event?.name || '', fe.league, comp); }
      catch { continue; }
      if (!propRes?.propEdges?.length) continue;
      // Take the top 3 prop edges per game (limit pool explosion).
      const top = (propRes.propEdges as any[])
        .filter((e) => e.edgeScore >= 70)
        .filter((e) => e.marketLine != null) // real line required, not "TBD"
        .sort((a, b) => b.edgeScore - a.edgeScore)
        .slice(0, 3);
      for (const edge of top) {
        const isOver = edge.recommended === 'over';
        const oddsNum = isOver ? edge.marketOverPrice : edge.marketUnderPrice;
        if (oddsNum == null) continue; // no real price → skip
        if (oddsNum < GLOBAL_ODDS_FLOOR) continue; // -300 cap enforced
        const odds = String(oddsNum);
        const lineStr = String(edge.marketLine);
        const marketLabel = String(edge.market).replace(/^(player_|batter_|pitcher_)/, '').replace(/_/g, ' ');
        propCandidates.push({
          gameId: fe.gameId, eventName: fe.event?.name || '', league: fe.league, sport: fe.league, board,
          startTime: fe.event?.date || '',
          homeTeam: { id: '', name: home.team?.displayName || '', abbreviation: home.team?.abbreviation || '', overallRecord: null, homeAwayRecord: null, ats: null, atsHomeAway: null, winProbability: null, moneyline: null, keyPlayers: [], injuredOut: [], injuredDoubtful: [], injuredQuestionable: [], recentForm: null, recentFormRecord: null, homeAway: 'home' } as any,
          awayTeam: { id: '', name: away.team?.displayName || '', abbreviation: away.team?.abbreviation || '', overallRecord: null, homeAwayRecord: null, ats: null, atsHomeAway: null, winProbability: null, moneyline: null, keyPlayers: [], injuredOut: [], injuredDoubtful: [], injuredQuestionable: [], recentForm: null, recentFormRecord: null, homeAway: 'away' } as any,
          spread: null, total: null,
          selection: `${edge.playerName} ${isOver ? 'Over' : 'Under'} ${lineStr} ${marketLabel}`.trim(),
          selectionSide: edge.side === 'home' ? 'home' : 'away',
          marketType: 'player_prop' as any,
          odds, line: lineStr,
          confidenceScore: edge.edgeScore,
          tier: edge.edgeScore >= 85 ? 'GRAND_SLAM' : edge.edgeScore >= 80 ? 'PRESSURE_PACK' : 'VIP_4_PACK',
          reasonsFor: [
            `${edge.playerName} projects ${edge.projection?.toFixed?.(1)} vs line of ${lineStr} — ${isOver ? 'over' : 'under'} edge.`,
            edge.l5Avg != null && edge.l10Avg != null
              ? `Last 5: ${edge.l5Avg} · Last 10: ${edge.l10Avg}${edge.seasonAvg != null ? ` · Season: ${edge.seasonAvg}` : ''}.`
              : null,
            edge.hitRateL10 != null ? `Hit rate over the line in his last 10: ${edge.hitRateL10}%.` : null,
          ].filter(Boolean) as string[],
          reasonsAgainst: [],
          signals: { winProbabilityGap: 0, atsCoverPct: null, atsCoverPctOpp: null, atsHomeAwayCoverPct: null, lineValueGap: 0, signalConflict: false, recentFormStreak: 0, keyInjuryOnPickSide: false, keyInjuryOnOppSide: false, spreadFavorable: false, noKeyInjuries: false, sharpLineDetected: false, neutralSite: false, dataQuality: edge.edgeScore, pickedOddsAmerican: parseAmericanOdds(odds), oddsAvailable: true, tendencyFirstFrameScored: 0, tendencyOppFirstFrameAllowed: 0, tendencyFirstFrameSample: 0, tendencyF5TotalAvg: 0, tendencyOppF5TotalAvg: 0, oppBullpenAllowed: 0, pickedBullpenAllowed: 0, oppPctBlewLateLead: 0, pickedPctLeadAfterQ1: 0, pickedPctLeadAfterH1: 0, pickedAvgQ1Scored: 0, pickedAvgQ1Allowed: 0, oppAvgQ1Scored: 0, oppAvgQ1Allowed: 0, pickedAvgH1Scored: 0, pickedAvgH1Allowed: 0, oppAvgH1Scored: 0, oppAvgH1Allowed: 0, mlMovementForSide: 0, spreadMovementForSide: 0, totalMovement: 0, hasOpeningLine: false, confirmingSignals: 1, pickedAvgMargin10: 0, pickedAvgTotal10: 0 } as any,
          aiExplanation: null,
          sharpFlags: [],
          sharpIntel: null,
          tendencyResolution: null,
          isAsleepPick: false,
          asleepBoost: 1,
          bigGameLabel: null,
          keyFactor: 'prop_edge',
          pitcherSpotlight: null,
          evidence: null,
        } as unknown as DeepPickResult);
      }
    }
    if (propCandidates.length > 0) {
      allScoredRaw = [...allScoredRaw, ...propCandidates].sort((a, b) => b.confidenceScore - a.confidenceScore);
    }
  } catch (err) {
    console.error('[deepResearch] prop integration failed', err);
  }

  // STRAIGHT-PICK POOL: -195 ML floor. Single picks must pay enough to be worth the risk.
  // (Spreads, totals, props price ~-110 regardless and pass through.) Grand Slam / Pressure
  // Pack / VIP 4-Pack all bucket out of this pool.
  const picks: DeepPickResult[] = allScoredRaw.filter((p) => !isHeavyChalkML(p, SINGLE_PICK_ML_FLOOR));

  // EXPANDED CANDIDATES: each game offers its primary pick PLUS its game TOTAL as a separate
  // play. The board then features the day's BEST plays by confidence — and since dedup is
  // per-PICK (game+market+selection), one great game can fill multiple products with
  // DIFFERENT bets (e.g. its side in Grand Slam, its total in VIP). The exact same pick
  // never repeats. (Per owner: best picks of the day win; game overlap is fine when that's
  // where the value is.)
  const picksExpanded: DeepPickResult[] = [];
  for (const p of picks) {
    picksExpanded.push(p);
    const ht = p.homeTeam?.trends?.avgTotal10 ?? null;
    const at = p.awayTeam?.trends?.avgTotal10 ?? null;
    if (p.marketType !== 'total' && p.total != null && ht != null && at != null) {
      const predicted = (ht + at) / 2;
      if (Math.abs(predicted - p.total) >= 0.6) {
        const over = predicted >= p.total;
        const totalConf = scoreTotalsConfidence(predicted, p.total, null);
        // FIX 2026-06-06: was spreading the parent ML's reasonsFor onto a TOTAL
        // pick. Build a fresh total-specific list so customers see real reasons.
        const dir = over ? 'OVER' : 'UNDER';
        const derivedTotalReasons: string[] = [
          `Projected total: ${predicted.toFixed(1)} runs/points vs market line ${p.total} — ${Math.abs(predicted - p.total).toFixed(1)}-point edge on the ${dir}.`,
          `${p.homeTeam?.abbreviation || p.homeTeam?.name} average L10 total: ${ht.toFixed(1)} runs/points per game.`,
          `${p.awayTeam?.abbreviation || p.awayTeam?.name} average L10 total: ${at.toFixed(1)} runs/points per game.`,
          `Combined recent scoring trend supports the ${dir.toLowerCase()} side of ${p.total}.`,
          `Engine confidence ${totalConf}/100 on this totals signal.`,
        ];
        picksExpanded.push({
          ...p, marketType: 'total', selection: `${over ? 'Over' : 'Under'} ${p.total}`,
          odds: '-110', line: `${p.total}`, selectionSide: over ? 'home' : 'away',
          confidenceScore: totalConf,
          reasonsFor: derivedTotalReasons,
          tier: assignTier(totalConf, p.signals?.confirmingSignals ?? 0),
        });
      }
    }
  }
  // NRFI IN THE POOL — make NRFI plays eligible for every product (Pressure / VIP / $10
  // Parlay / Grand Slam), not just their own tile. Only pregame, 80+ NRFI compete (so they're
  // honestly recordable and clear the global floor). They flow through tiering + the parlay
  // like any pick; whichever games get used are excluded from the standalone NRFI tile below.
  if (board === 'north-american') {
    for (const n of buildNrfiPlays(mlbEvents)) {
      if (n.state === 'pre' && n.nrfiScore >= 80) picksExpanded.push(nrfiToPick(n, board));
    }
  }
  // Re-sort AFTER expansion so the best play (derived total or NRFI) competes fairly
  // for the GS / Pressure / VIP slots — not whichever primary happened to be first.
  // Caught 2026-06-02: Under 8 at conf 100 was landing in Parlay because its primary
  // pick (SD@PHI ML at lower conf) reserved the game slot first.
  picksExpanded.sort((a, b) => b.confidenceScore - a.confidenceScore);

  // (Removed 2026-05-31: the -185-to-250 parlayChalkExtras pool. It was the routing path
  //  that let $10 Parlay take chalk legs that were too heavy to be straights — exactly
  //  the "forced chalk leg" mechanic that made $10 Parlay lose. The Parlay product now
  //  follows the same -145 cap + 85 quality floor as Pressure + VIP. If a slate can't
  //  produce 4 quality legs after dig-wider, the product ships short. Honest > forced.)

  // Assign tiers with hard caps. Dedup is per-PICK (game+market+selection) so one game can
  // appear in multiple products with DIFFERENT bets, but the exact same pick never repeats.
  // usedGames is still tracked (gameId) for downstream consumers (marquee/NRFI/parlay fill).
  const usedGames = new Set<string>();
  const usedPicks = new Set<string>();
  const pickKey = (p: DeepPickResult) => `${p.gameId}|${p.marketType}|${(p.selection || '').toLowerCase()}`;
  const pressurePack: DeepPickResult[] = [];
  const vip4Pack: DeepPickResult[] = [];
  const parlayPlan: DeepPickResult[] = [];

  // GRAND SLAM = the single highest-confidence pick of the day. The confidence score
  // already weighs win-prob, ATS tendency, recent form, sharp money, injuries, signal
  // confluence, and data quality — so if a pick rises to the top, the system already
  // believes in it. We only add two hard guards on top of the score: no key injury on
  // our side (breaking news would invalidate the score itself) and no signal conflict
  // (a contradicting signal makes the score unreliable). Floor is 88: if the day's best
  // pick can't clear 88, we don't drop a Grand Slam at all — better to leave it empty
  // than label a mediocre top pick as "our best of the day."
  // PREMIUM ML CAP: the user does not want any moneyline steeper than -145 on the Grand
  // Slam or Pressure Pack. Heavy chalk ML pays too little for the flagship products.
  // (Spreads/totals at -110 are unaffected — this only blocks heavy-chalk MONEYLINES.)
  const PREMIUM_ML_FLOOR = -145;
  const isHeavyMlForPremium = (p: DeepPickResult): boolean => {
    if (p.marketType !== 'moneyline') return false;
    const ml = parseAmericanOdds(p.odds);
    return ml != null && ml < PREMIUM_ML_FLOOR;
  };

  // Owner rule: if it's not a 96+, it's NOT a Grand Slam. On days when nothing clears 96
  // there is simply no Grand Slam — we never crown a weaker play just to fill the slot.
  // 2026-06-04: lowered from 96 to 92. The old 96 floor only made sense when
  // sharpLineDetected was silently adding +4 to every favorite. With the fake
  // signal removed, real Grand-Slam-grade picks now score 92-95. Holding the
  // floor at 96 effectively zero'd out the tier on most days. 92 lets honest
  // top-of-slate plays through while still gating slot-fill (the floor is
  // still a real bar, just calibrated to the current engine output).
  // FIX 2026-06-05: bumped 92 → 94. The 96 → 92 drop on 06-04 was based on the
  // assumption scoring would drop ~4 pts after removing the dead sharpLineDetected
  // signal — but other +signals were still add-only until today. Net effect:
  // marginal 88-91 picks were sailing through at 92-95 and shipping as Grand
  // Slams. 94 is the compromise while the symmetric scoring fixes calibrate.
  const GRAND_SLAM_FLOOR = 94;
  // Quality floor for Pressure / VIP / Parlay backfill — owner target is 85+ across every
  // product. Lower than this and we'd be slot-filling garbage.
  const QUALITY_FLOOR = 85;
  const isGrandSlamEligible = (p: DeepPickResult): boolean => {
    if (p.confidenceScore < GRAND_SLAM_FLOOR) return false;
    if (p.signals.keyInjuryOnPickSide) return false;
    if (p.signals.signalConflict) return false;
    if (isHeavyMlForPremium(p)) return false;
    // FIX 2026-06-05 (Marlins loss audit): block fallback AI text from GS tier.
    if (hasAIFallback(p)) return false;
    // FIX 2026-06-05 (audit finding #5): GS re-crown also needs the wash guard.
    if (hasMutualInjuryWash(p)) return false;
    return true;
  };
  // FIX 2026-06-05 (Marlins loss audit): the Marlins ML went out at VIP tier
  // with AI fallback boilerplate + mutual injuries. New gate blocks both.
  const isVipEligible = (p: DeepPickResult): boolean => {
    if (hasAIFallback(p)) return false;             // boilerplate → not premium
    if (hasMutualInjuryWash(p)) return false;       // we're hurt too → no edge
    if (p.signals.dataQuality != null && p.signals.dataQuality < 70 && p.signals.keyInjuryOnPickSide) return false;
    return true;
  };
  // picksExpanded is sorted by confidenceScore desc — take the first eligible play (which
  // may be a side OR a total).
  let grandSlam: DeepPickResult | null = picksExpanded.find(isGrandSlamEligible) || null;
  if (grandSlam) { usedPicks.add(pickKey(grandSlam)); usedGames.add(grandSlam.gameId); }

  // Reserve EVERY asleep-flagged pick so none of them crowd the main board. The asleep
  // tile shows a curated slice (top 8 by confidence) but all are excluded from competing
  // for the mainstream Pressure Pack / VIP / Parlay slots.
  // EXCEPTION: only the flagship north-american board has a meaningful "main vs asleep"
  // distinction. Every other board IS one of these quieter markets (tennis, soccer, combat,
  // golf, racing, global), so on those the asleep leagues ARE the main content.
  const asleepReserved = new Set<string>();
  if (board === 'north-american') {
    for (const p of picks) {
      if (p.isAsleepPick && !usedGames.has(p.gameId)) asleepReserved.add(p.gameId);
    }
  }

  for (const pick of picksExpanded) {
    if (usedPicks.has(pickKey(pick))) continue;        // exact same pick already placed
    if (usedGames.has(pick.gameId)) continue;          // game already used elsewhere — no double-up
    if (asleepReserved.has(pick.gameId)) continue;     // asleep games skip the main buckets
    const t = pick.tier;
    const place = (target: DeepPickResult[], tier: ProductTier) => {
      target.push({ ...pick, tier }); usedPicks.add(pickKey(pick)); usedGames.add(pick.gameId);
    };

    if ((t === 'GRAND_SLAM' || t === 'PRESSURE_PACK') && pressurePack.length < 2 && !isHeavyMlForPremium(pick) && isVipEligible(pick)) {
      place(pressurePack, 'PRESSURE_PACK');
    } else if ((t === 'GRAND_SLAM' || t === 'PRESSURE_PACK' || t === 'VIP_4_PACK') && vip4Pack.length < 4 && !isHeavyMlForPremium(pick) && isVipEligible(pick)) {
      // VIP now respects the -145 chalk cap (consistency with Pressure + GS).
      // FIX 2026-06-02: added 'GRAND_SLAM' so a runner-up Conf 96+ pick can land in
      // VIP when Pressure is full — previously fell straight to Parlay.
      place(vip4Pack, 'VIP_4_PACK');
    } else if (parlayPlan.length < 6 && t !== 'PASS' && pick.confidenceScore >= QUALITY_FLOOR) {
      // Parlay legs must clear the 85 quality floor — no slot-filling with 80s
      place(parlayPlan, 'PARLAY_PLAN');
    }

    if (pressurePack.length === 2 && vip4Pack.length === 4 && parlayPlan.length === 6) break;
  }

  // STRUCTURAL FILL — Pressure ALWAYS ships 2, VIP ALWAYS ships 4, $10 Parlay ALWAYS
  // ships 4. The user is explicit: the structure is non-negotiable. The job is to FIND
  // 2 quality Pressure picks every night — not to ship short when the slate looks thin.
  //
  // Strategy (in order):
  //   Stage 1: leftover non-PASS picks at 85+ — pure quality leftovers from main routing
  //   Stage 2: asleep-reserved 85+ — quiet markets we reserved away from main
  //   Stage 3: DIG-WIDER — scan every market on every scored game (F5, team totals,
  //            periods, alt lines) for 85+ candidates the engine missed
  //   Stage 4: step-down to 80-84 from the same quality pool — never PASS-tier (sub-80),
  //            never chalk-extras. Picks here are GOOD-but-not-great; honest about it.
  //
  // The 80 GLOBAL_FLOOR is the hard line — we will never ship a sub-80 confidence pick
  // even to hit a slot count. If we somehow can't fill at 80+, the slot stays short
  // (this should be extremely rare given ~20 MLB games × 5+ markets each = 100+
  // candidates per night).
  // PARLAY SAFETY: track game IDs already used in the $10 Parlay separately, so even
  // if usedGames is somehow stale we never ship two legs from the same game (which
  // would correlate the parlay outcomes and silently inflate the implied odds shown
  // to customers — a major safety issue).
  const parlayGames = new Set<string>(parlayPlan.map((p) => p.gameId));

  const promote = (target: DeepPickResult[], cap: number, tierTag: ProductTier, pool: DeepPickResult[]) => {
    while (target.length < cap && pool.length > 0) {
      const p = pool.shift()!;
      if (usedPicks.has(pickKey(p))) continue;
      if (usedGames.has(p.gameId)) continue;
      // Parlay-specific guard: even if main usedGames is wrong, the parlay never gets
      // two legs from the same game. Distinct-games is a hard correlation-suppression rule.
      if (tierTag === 'PARLAY_PLAN' && parlayGames.has(p.gameId)) continue;
      target.push({ ...p, tier: tierTag }); usedPicks.add(pickKey(p)); usedGames.add(p.gameId);
      if (tierTag === 'PARLAY_PLAN') parlayGames.add(p.gameId);
    }
  };
  // Quality gates at each tier — same -145 cap for Pressure + VIP, no PASS for Parlay.
  // FIX 2026-06-05 (audit findings #2, #4): backfill filters previously skipped
  // isVipEligible entirely, so a pick with AI-fallback boilerplate + mutual
  // injury wash could ride through any of stages 1-4. The Marlins ML almost
  // certainly slipped through a backfill stage. Add isVipEligible to ALL
  // backfill filters for premium tiers.
  const pressureOk85 = (p: DeepPickResult) => !isHeavyMlForPremium(p) && p.confidenceScore >= QUALITY_FLOOR && isVipEligible(p);
  const vipOk85 = (p: DeepPickResult) => !isHeavyMlForPremium(p) && p.confidenceScore >= QUALITY_FLOOR && isVipEligible(p);
  const parlayOk85 = (p: DeepPickResult) => p.confidenceScore >= QUALITY_FLOOR && p.tier !== 'PASS';
  // Step-down gates — same chalk caps + 80 (GLOBAL_FLOOR) — never PASS-tier.
  const pressureOk80 = (p: DeepPickResult) => !isHeavyMlForPremium(p) && p.confidenceScore >= GLOBAL_FLOOR && p.tier !== 'PASS' && isVipEligible(p);
  const vipOk80 = (p: DeepPickResult) => !isHeavyMlForPremium(p) && p.confidenceScore >= GLOBAL_FLOOR && p.tier !== 'PASS' && isVipEligible(p);
  const parlayOk80 = (p: DeepPickResult) => p.confidenceScore >= GLOBAL_FLOOR && p.tier !== 'PASS';

  // Stage 1: leftover non-PASS picks at 85+ that aren't asleep-reserved.
  const stage1 = picksExpanded.filter((p) => !usedPicks.has(pickKey(p)) && !asleepReserved.has(p.gameId) && p.tier !== 'PASS');
  promote(pressurePack, 2, 'PRESSURE_PACK', stage1.filter(pressureOk85));
  promote(vip4Pack, 4, 'VIP_4_PACK', stage1.filter(vipOk85));
  promote(parlayPlan, 6, 'PARLAY_PLAN', stage1.filter(parlayOk85));

  // Stage 2: asleep-reserved picks at 85+ if still short.
  if (vip4Pack.length < 4 || parlayPlan.length < 4 || pressurePack.length < 2) {
    const stage2 = picksExpanded.filter((p) => !usedPicks.has(pickKey(p)) && asleepReserved.has(p.gameId) && p.tier !== 'PASS');
    promote(pressurePack, 2, 'PRESSURE_PACK', stage2.filter(pressureOk85));
    promote(vip4Pack, 4, 'VIP_4_PACK', stage2.filter(vipOk85));
    promote(parlayPlan, 6, 'PARLAY_PLAN', stage2.filter(parlayOk85));
    for (const p of stage2) if (usedGames.has(p.gameId)) asleepReserved.delete(p.gameId);
  }

  // Stage 3 (EXHAUSTIVE DIG-WIDER): scan EVERY market on EVERY scored game for 85+
  // candidates. Owner's directive: "every game has something — totals, team totals,
  // halves, F5, NRFI, props, alt lines. If you really do your job, every category
  // has 90+ available." So we scan all games, include props, and run in parallel.
  // No cap of 20 games; if there are 25 games tonight, scan all 25.
  if (pressurePack.length < 2 || vip4Pack.length < 4 || parlayPlan.length < 4) {
    try {
      const unusedScored = allScoredRaw.filter((p) => !usedGames.has(p.gameId));
      // Score EVERY market on EVERY unused game in parallel. Each call returns up to ~10
      // candidates (side, total, F5, team totals, period markets, alt lines, props).
      const candidateBatches = await Promise.all(
        unusedScored.map(async (game) => {
          try {
            const cands = await buildMarketCandidates(game, { includeProps: true });
            return cands.map((c) => ({ game, c }));
          } catch { return []; }
        }),
      );
      const digFinds: DeepPickResult[] = [];
      for (const batch of candidateBatches) {
        for (const { game, c } of batch) {
          // Confidence is already tendency-boosted by buildMarketCandidates.
          if ((c.confidence ?? 0) < QUALITY_FLOOR) continue;
          // FIX 2026-06-06: was spreading the parent ML pick's reasonsFor (which
          // explains the ML, not this new TT/total/F5 market). Replace with the
          // candidate's own bullet list built in buildMarketCandidates.
          digFinds.push({
            ...game,
            selection: c.selection, marketType: c.marketType, selectionSide: c.selectionSide,
            odds: c.odds, line: c.line, confidenceScore: c.confidence,
            reasonsFor: (c as any).reasonsFor && (c as any).reasonsFor.length > 0
              ? (c as any).reasonsFor
              : [c.detail || ''],
          } as DeepPickResult);
        }
      }
      digFinds.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
      promote(pressurePack, 2, 'PRESSURE_PACK', digFinds.filter(pressureOk85));
      promote(vip4Pack, 4, 'VIP_4_PACK', digFinds.filter(vipOk85));
      promote(parlayPlan, 6, 'PARLAY_PLAN', digFinds.filter(parlayOk85));

      // POST-DIG-WIDER GRAND SLAM UPGRADE (2026-06-02). The initial GS selection at
      // line ~3590 only sees the primary-pick pool (one per game + derived totals).
      // Dig-wider scans EVERY market on every game and frequently finds the night's
      // best play (a total or team-total at conf 100). If we already have a GS, we
      // only swap when the dig-find genuinely outranks it. If GS was null, any
      // dig-find that clears the eligibility check becomes GS.
      const bestDigGsCandidate = digFinds.find((p) => {
        if ((p.confidenceScore || 0) < GRAND_SLAM_FLOOR) return false;
        // Reuse eligibility — same safety checks (injury on picked side, signal
        // conflict, chalk ML cap).
        if (p.signals?.keyInjuryOnPickSide) return false;
        if (p.signals?.signalConflict) return false;
        if (isHeavyMlForPremium(p)) return false;
        return true;
      });
      if (bestDigGsCandidate) {
        const currentConf = grandSlam?.confidenceScore || 0;
        if (!grandSlam || (bestDigGsCandidate.confidenceScore || 0) > currentConf) {
          // Remove dig-find from wherever it landed (Pressure/VIP/Parlay) and crown it.
          const k = pickKey(bestDigGsCandidate);
          const removeFrom = (arr: DeepPickResult[]) => {
            const idx = arr.findIndex((p) => pickKey(p) === k);
            if (idx >= 0) arr.splice(idx, 1);
          };
          removeFrom(pressurePack); removeFrom(vip4Pack); removeFrom(parlayPlan);
          // If we're displacing an existing GS, bump it down to Pressure Pack (it was
          // already eligible at GS-floor confidence). Otherwise just crown the dig-find.
          if (grandSlam && pressurePack.length < 2 && !isHeavyMlForPremium(grandSlam)) {
            pressurePack.push({ ...grandSlam, tier: 'PRESSURE_PACK' });
          }
          grandSlam = bestDigGsCandidate;
          usedPicks.add(pickKey(grandSlam));
          usedGames.add(grandSlam.gameId);
        }
      }
    } catch { /* non-blocking */ }
  }

  // Stage 4 (STEP-DOWN to 80-84): structural counts are non-negotiable. If after the
  // 85+ scans we still don't have 2 Pressure / 4 VIP / 4 Parlay, drop to the 80-84 band
  // (GLOBAL_FLOOR is 80 — we never go below). Picks here are honest "best available
  // tonight" — not slot-fill garbage. Per-product step-down stages so a quality 82
  // gets considered rather than a 79.
  if (pressurePack.length < 2 || vip4Pack.length < 4 || parlayPlan.length < 4) {
    const stage4a = picksExpanded.filter((p) => !usedPicks.has(pickKey(p)) && !asleepReserved.has(p.gameId) && p.tier !== 'PASS');
    promote(pressurePack, 2, 'PRESSURE_PACK', stage4a.filter(pressureOk80));
    promote(vip4Pack, 4, 'VIP_4_PACK', stage4a.filter(vipOk80));
    promote(parlayPlan, 6, 'PARLAY_PLAN', stage4a.filter(parlayOk80));
  }
  // Stage 4b: asleep-reserved 80+ if still short.
  if (pressurePack.length < 2 || vip4Pack.length < 4 || parlayPlan.length < 4) {
    const stage4b = picksExpanded.filter((p) => !usedPicks.has(pickKey(p)) && asleepReserved.has(p.gameId) && p.tier !== 'PASS');
    promote(pressurePack, 2, 'PRESSURE_PACK', stage4b.filter(pressureOk80));
    promote(vip4Pack, 4, 'VIP_4_PACK', stage4b.filter(vipOk80));
    promote(parlayPlan, 6, 'PARLAY_PLAN', stage4b.filter(parlayOk80));
  }
  // Stage 4c (exhaustive 80+ dig): same parallel scan, all games + props, 80+ floor.
  // This is the LAST resort before slots ship short. With ~15-25 games × ~10 markets
  // each + props, we should always find quality fills here on any normal night.
  if (pressurePack.length < 2 || vip4Pack.length < 4 || parlayPlan.length < 4) {
    try {
      const unusedScored = allScoredRaw.filter((p) => !usedGames.has(p.gameId));
      const candidateBatches = await Promise.all(
        unusedScored.map(async (game) => {
          try {
            const cands = await buildMarketCandidates(game, { includeProps: true });
            return cands.map((c) => ({ game, c }));
          } catch { return []; }
        }),
      );
      const digFinds80: DeepPickResult[] = [];
      for (const batch of candidateBatches) {
        for (const { game, c } of batch) {
          // Confidence is already tendency-boosted by buildMarketCandidates.
          if ((c.confidence ?? 0) < GLOBAL_FLOOR) continue;
          // FIX 2026-06-06: carry through the candidate's bullet list (was dropping).
          digFinds80.push({
            ...game,
            selection: c.selection, marketType: c.marketType, selectionSide: c.selectionSide,
            odds: c.odds, line: c.line, confidenceScore: c.confidence,
            reasonsFor: (c as any).reasonsFor && (c as any).reasonsFor.length > 0
              ? (c as any).reasonsFor
              : [c.detail || ''],
          } as DeepPickResult);
        }
      }
      digFinds80.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
      promote(pressurePack, 2, 'PRESSURE_PACK', digFinds80.filter(pressureOk80));
      promote(vip4Pack, 4, 'VIP_4_PACK', digFinds80.filter(vipOk80));
      promote(parlayPlan, 6, 'PARLAY_PLAN', digFinds80.filter(parlayOk80));

      // SECOND GS UPGRADE PASS (2026-06-02). Stage 4c is the last chance for a
      // conf-96+ pick to find its slot. If any dig-find clears GS eligibility AND
      // outranks current GS, upgrade. This is what was missing tonight — Under 8
      // at conf 100 came out of Stage 4c (not Stage 3) so the first upgrade missed it.
      const bestDigGsCandidate2 = digFinds80.find((p) => {
        if ((p.confidenceScore || 0) < GRAND_SLAM_FLOOR) return false;
        if (p.signals?.keyInjuryOnPickSide) return false;
        if (p.signals?.signalConflict) return false;
        if (isHeavyMlForPremium(p)) return false;
        return true;
      });
      if (bestDigGsCandidate2) {
        const currentConf = grandSlam?.confidenceScore || 0;
        if (!grandSlam || (bestDigGsCandidate2.confidenceScore || 0) > currentConf) {
          const k = pickKey(bestDigGsCandidate2);
          const removeFrom = (arr: DeepPickResult[]) => {
            const idx = arr.findIndex((p) => pickKey(p) === k);
            if (idx >= 0) arr.splice(idx, 1);
          };
          removeFrom(pressurePack); removeFrom(vip4Pack); removeFrom(parlayPlan);
          if (grandSlam && pressurePack.length < 2 && !isHeavyMlForPremium(grandSlam)) {
            pressurePack.push({ ...grandSlam, tier: 'PRESSURE_PACK' });
          }
          grandSlam = bestDigGsCandidate2;
          usedPicks.add(pickKey(grandSlam));
          usedGames.add(grandSlam.gameId);
        }
      }
    } catch { /* non-blocking */ }
  }

  // FINAL CONFIDENCE REBALANCE (2026-06-03). Owner directive: "It's supposed to go
  // from highest confidence to lowest confidence, falls into the parlays."
  try {
    const allPlaced: DeepPickResult[] = [
      ...(grandSlam ? [grandSlam] : []),
      ...pressurePack,
      ...vip4Pack,
      ...parlayPlan,
    ].filter((p): p is DeepPickResult => Boolean(p && p.gameId && p.selection));

    const seenKeys = new Set<string>();
    const uniquePool: DeepPickResult[] = [];
    for (const p of allPlaced) {
      const k = pickKey(p);
      if (seenKeys.has(k)) continue;
      seenKeys.add(k);
      uniquePool.push(p);
    }
    uniquePool.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

    let newGS: DeepPickResult | null = null;
    const newPressure: DeepPickResult[] = [];
    const newVip: DeepPickResult[] = [];
    const newParlay: DeepPickResult[] = [];
    const parlayGamesNew = new Set<string>();

    // FIX 2026-06-05 (audit finding #1, smoking gun): this final rebalance
    // previously bypassed isVipEligible + hasAIFallback + hasMutualInjuryWash
    // and rebuilt tiers from scratch on confidence score alone. Marlins ML
    // almost certainly landed here. Apply the gates.
    for (const p of uniquePool) {
      const heavyChalk = isHeavyMlForPremium(p);
      const vipOk = isVipEligible(p);
      if (!newGS && (p.confidenceScore || 0) >= GRAND_SLAM_FLOOR
          && !p.signals?.keyInjuryOnPickSide && !p.signals?.signalConflict && !heavyChalk
          && !hasAIFallback(p) && !hasMutualInjuryWash(p)) {
        newGS = { ...p, tier: 'GRAND_SLAM' };
        continue;
      }
      if (newPressure.length < 2 && !heavyChalk && vipOk) {
        newPressure.push({ ...p, tier: 'PRESSURE_PACK' });
        continue;
      }
      if (newVip.length < 4 && !heavyChalk && vipOk) {
        newVip.push({ ...p, tier: 'VIP_4_PACK' });
        continue;
      }
      if (newParlay.length < 6 && !parlayGamesNew.has(p.gameId)) {
        newParlay.push({ ...p, tier: 'PARLAY_PLAN' });
        parlayGamesNew.add(p.gameId);
      }
    }

    grandSlam = newGS;
    pressurePack.length = 0;
    pressurePack.push(...newPressure);
    vip4Pack.length = 0;
    vip4Pack.push(...newVip);
    parlayPlan.length = 0;
    parlayPlan.push(...newParlay);
    console.log('[rebalance] applied:', { gs: !!grandSlam, pp: pressurePack.length, vip: vip4Pack.length, parlay: parlayPlan.length, poolSize: uniquePool.length });
  } catch (err) {
    console.error('[rebalance] FAILED — keeping pre-rebalance state', err);
  }

  // THIN-SLATE PARLAY FILL: when the straights have eaten the few quality games and the
  // parlay is short, top it up to PARLAY_TARGET_LEGS with real-value PROP / game TOTAL legs
  // from games we aren't already using — never repeating a straight, never heavy chalk.
  let parlayExtraLegs: ParlayExtraLeg[] = [];
  if (board === 'north-american' && parlayPlan.length < PARLAY_TARGET_LEGS) {
    const scoredByGameId = new Map(allScoredRaw.map((p) => [p.gameId, p]));
    const parlayGameIds = new Set(parlayPlan.map((p) => p.gameId));
    try {
      parlayExtraLegs = await buildParlayPlanExtraLegs(
        fillEvents, scoredByGameId, usedGames, parlayGameIds, PARLAY_TARGET_LEGS - parlayPlan.length,
      );
    } catch { parlayExtraLegs = []; }
  }

  // A parlay needs at least 2 legs total (game legs + fill) — otherwise it's a straight bet.
  if (parlayPlan.length + parlayExtraLegs.length < 2) {
    for (const p of parlayPlan) usedGames.delete(p.gameId);
    parlayPlan.length = 0;
    parlayExtraLegs = [];
  }

  // Tonight's big games — headline NBA/NHL/NFL/WNBA matchups we always cover. Only
  // TRULY big games — playoffs/finals/championship/Game 7. detectBigGame() sets
  // bigGameLabel from ESPN postseason/notes.
  // FIX 2026-06-03: removed the `!usedGames.has(p.gameId)` exclusion. The previous
  // logic hid the Big Games section entirely when a championship game was already on
  // Pressure Pack / Grand Slam / VIP — e.g. NBA Finals Game 1 (Knicks @ Spurs) was
  // landing on PP and getting stripped from marquee. Users expect the Big Games
  // section to reflect every flagged headline matchup, even if we're also playing
  // it elsewhere. Duplicates here are intentional — Big Games is a CONTEXT label,
  // not a separate slate.
  // No slice cap — owner directive 2026-06-03 "if you find ten things out of the big
  // game, put them on there." Each Big Game contributes its primary product pick here;
  // multi-angle prop/alt-line enrichment is layered on top via a separate endpoint
  // (see /api/research/big-games-extra).
  const marquee = picks
    .filter((p) => MARQUEE_LEAGUES.has(p.league) && p.bigGameLabel)
    .sort((a, b) => b.confidenceScore - a.confidenceScore);

  // Asleep picks — quieter leagues (NCAA Baseball, UFC, AFL, Cricket, etc.) where the
  // user wants edges surfaced regardless of tier. Cap at 8 so the slate stays curated.
  // Only relevant on the main `north-american` board (other boards ARE the quiet markets).
  // FIX 2026-06-05 (audit #5 alt-products): asleep tile previously shipped with
  // zero VIP gates. Now blocks AI fallback + mutual injury wash, same as premium.
  let asleepPicks = board === 'north-american'
    ? picks
        .filter((p) => p.isAsleepPick && !usedGames.has(p.gameId) && !hasAIFallback(p) && !hasMutualInjuryWash(p))
        .sort((a, b) => b.confidenceScore - a.confidenceScore)
        .slice(0, 8)
    : [];
  for (const p of asleepPicks) usedGames.add(p.gameId);

  // NRFI — No Runs First Inning (MLB only), judged off both probable starters' ERA.
  const nrfi = board === 'north-american' ? buildNrfiPlays(mlbEvents, usedGames) : [];

  // Outright tournament markets — golf majors on the `individual` board, motorsport
  // championships on the `racing` board. Pulls from Odds API and applies the heavy-chalk
  // floor so we don't show $1->$1.50 outrights (no real-world value).
  let outrights: any[] = [];
  if (board === 'individual' || board === 'racing') {
    try {
      const { getActiveTournaments } = await import('@/services/oddsApiService');
      const category = board === 'individual' ? 'golf' : 'racing';
      const tournaments = await getActiveTournaments(category);
      // Filter each tournament's contenders: drop anything steeper than -195 (single-pick
      // floor) and cap at the top 12 contenders so the page stays readable.
      outrights = tournaments.map((t: any) => ({
        ...t,
        contenders: (t.contenders || [])
          .filter((c: any) => c.bestPrice == null || c.bestPrice > SINGLE_PICK_ML_FLOOR)
          .slice(0, 12),
      }));
    } catch { /* non-blocking */ }
  }

  // Enrich EVERY board pick with AI so each breakdown is uniquely worded — owner
  // directive 2026-06-03: "I need unique breakdowns of each pick. Don't give me
  // the same looking stuff." The AI step generates a per-pick paragraph + key
  // angles based on that pick's specific signal stack. Cost is ~$0.01/pick.
  const toEnrich = [grandSlam, ...pressurePack, ...vip4Pack, ...parlayPlan, ...marquee, ...asleepPicks]
    .filter(Boolean) as DeepPickResult[];
  const enriched = await Promise.allSettled(toEnrich.map(enrichWithAI));
  const enrichedMap = new Map<string, DeepPickResult>();
  for (const r of enriched) {
    if (r.status === 'fulfilled') enrichedMap.set(r.value.gameId, r.value);
  }

  // EXTRA SIGNALS — referee crew, late scratch, public money posture, line velocity,
  // player matchup history, advanced sabermetric. Each adds reasonsFor/reasonsAgainst
  // bullets and a small confidence delta. Owner directive 2026-06-03 "use all of this
  // stuff as we break it down and help us win our games." Best-effort: each sub-fetch
  // can fail without affecting the rest of the slate.
  try {
    const { enrichWithExtraSignals } = await import('@/services/extraSignalsService');
    // 2026-06-05 fix: AI enrichment (above) returns NEW pick objects into
    // enrichedMap. verifyAndCleanPicks below uses the map's versions. Previously
    // we ran extraSignals on the ORIGINAL pick objects — so confidenceDelta +
    // reasonsFor + diagnostics mutated picks that the publish path never read.
    // Now we enrich the AI-enriched picks directly (or the original if AI
    // failed for that gameId), so the signals actually reach the customer board.
    const allBoardPicks = ([
      grandSlam, ...pressurePack, ...vip4Pack, ...parlayPlan, ...marquee, ...asleepPicks,
    ].filter(Boolean) as DeepPickResult[]).map((orig) => enrichedMap.get(orig.gameId) || orig);
    await Promise.allSettled(allBoardPicks.map(async (p) => {
      const homeId = (p.homeTeam as any)?.id || (p.homeTeam as any)?.teamId;
      const awayId = (p.awayTeam as any)?.id || (p.awayTeam as any)?.teamId;
      const oppId = p.selectionSide === 'home' ? awayId : homeId;
      const oppName = p.selectionSide === 'home' ? p.awayTeam.name : p.homeTeam.name;
      const pickedKeyPlayers = (p.selectionSide === 'home' ? (p.homeTeam.keyPlayers || []) : (p.awayTeam.keyPlayers || [])).slice(0, 3);
      const isTotals = /total|over|under/i.test(p.marketType || '');
      const isOver = /over/i.test(p.selection || '');
      const pickedPitcherName = p.selectionSide === 'home'
        ? (p.homeTeam as any)?.probablePitcherName
        : (p.awayTeam as any)?.probablePitcherName;
      // 2026-06-04: feed the new venue / travel / devig / minutes / bullpen
      // signals all the context they need. Best-effort; missing fields just
      // mean those signal blocks return null.
      const homeAbbr = (p.homeTeam as any)?.abbreviation || p.homeTeam.name;
      const awayAbbr = (p.awayTeam as any)?.abbreviation || p.awayTeam.name;
      const winProbPct = (p as any)?.signals?.winProbabilityGap != null && (p.homeTeam as any)?.winProbability
        ? (p.selectionSide === 'home' ? (p.homeTeam as any).winProbability : (p.awayTeam as any).winProbability)
        : null;
      const modelProb = winProbPct != null && winProbPct > 0 && winProbPct <= 100 ? winProbPct / 100 : null;
      // FIX 2026-06-05 (audit finding #2): wire mlbGamePk so BvP + per-pitcher
      // season-rates blocks actually run. Was dead-coded — block bailed at the
      // first if() because mlbGamePk was never passed.
      let mlbGamePk: number | undefined;
      if (p.league === 'MLB' && (p.homeTeam as any)?.mlbStatsApiId && (p.awayTeam as any)?.mlbStatsApiId) {
        try {
          const { findMlbGamePk } = await import('@/services/mlbStatsService');
          const dt = new Date(p.startTime || Date.now());
          const mmdd = `${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${String(dt.getUTCDate()).padStart(2, '0')}/${dt.getUTCFullYear()}`;
          const pk = await findMlbGamePk((p.homeTeam as any).mlbStatsApiId, (p.awayTeam as any).mlbStatsApiId, mmdd);
          if (pk) mlbGamePk = Number(pk);
        } catch { /* non-blocking */ }
      }
      const extra = await enrichWithExtraSignals({
        gameId: p.gameId, league: p.league, marketType: p.marketType,
        pickedSide: p.selectionSide,
        pickedTeamId: p.selectionSide === 'home' ? homeId : awayId,
        oppTeamId: oppId,
        pickedTeamName: p.selectionSide === 'home' ? p.homeTeam.name : p.awayTeam.name,
        oppTeamName: oppName,
        homeTeamName: p.homeTeam.name,
        awayTeamName: p.awayTeam.name,
        homeTeamAbbr: homeAbbr,
        awayTeamAbbr: awayAbbr,
        homeKeyPlayerNames: p.homeTeam.keyPlayers || [],
        awayKeyPlayerNames: p.awayTeam.keyPlayers || [],
        mlbHomeTeamStatsApiId: (p.homeTeam as any)?.mlbStatsApiId,
        mlbAwayTeamStatsApiId: (p.awayTeam as any)?.mlbStatsApiId,
        mlbGamePk,
        gameStartUtc: p.startTime,
        modelProjectedWinProb: modelProb ?? undefined,
        // FIX 2026-06-05 (audit dead-block #4): line velocity requires currentOdds;
        // was never passed → block silently exited on every call. Steam-move
        // detection has never fired in production.
        currentOdds: {
          homeML: (p.homeTeam as any)?.moneyline ?? null,
          awayML: (p.awayTeam as any)?.moneyline ?? null,
          spread: p.spread ?? null,
          total: p.total ?? null,
        },
        keyPlayerNames: pickedKeyPlayers,
        isTotalsPick: isTotals,
        isOver,
        pitcherProbableName: pickedPitcherName,
        // FIX 2026-06-05 (audit Block #6 bias): was `pickedPitcherName ? true : false`
        // which meant "we picked the pitcher's team" was always true if any pitcher
        // existed — so the "betting AGAINST the pitcher" sign-flip branch was
        // unreachable. Real logic: true only when the picked side IS the pitcher's team
        // AND market is moneyline/spread (we want our pitcher to win), OR the picked
        // total is UNDER (we want the pitcher to suppress runs).
        isPickedPitcher: pickedPitcherName != null && (
          (!isTotals) ||                              // ML/spread = ride the team with the better SP
          (isTotals && isOver === false)              // Under = ride the suppressing SP
        ),
      });
      if (extra.reasonsFor.length) p.reasonsFor.push(...extra.reasonsFor);
      if (extra.reasonsAgainst.length) p.reasonsAgainst.push(...extra.reasonsAgainst);
      if (extra.confidenceDelta !== 0) {
        p.confidenceScore = Math.max(0, Math.min(100, Number((p.confidenceScore + extra.confidenceDelta).toFixed(1))));
      }
      // Stash diagnostics + late-scratch alert in an admin-only field. We surface
      // these via the breakdown's admin view, never to customers.
      (p as any).extraSignals = extra.diagnostics;
      if (extra.lateScratchAlert?.affected) {
        (p as any).lateScratchAlert = extra.lateScratchAlert;
      }
    }));
  } catch (err) {
    console.error('[deepResearch] extraSignals enrichment failed', err);
  }

  // Board-specific floor relaxation (owner directive 2026-06-03):
  // "If you can find something with a confidence of a cap at 70 I will accept those
  //  as well only for the sports that have a hard time finding picks."
  // For soccer / tennis / global (the boards that frequently empty out due to thin
  // markets), if the standard 80+ pool is empty BUT we have scored games, we drop
  // the floor to 70 and surface the top N as asleepPicks. The pick's confidenceScore
  // is preserved + rendered on the card so customers see exactly what conviction
  // they're getting (e.g. 72/100 vs 95/100 on a flagship pick).
  const RELAX_BOARDS = new Set(['soccer', 'tennis', 'global']);
  if (RELAX_BOARDS.has(board)) {
    const total = pressurePack.length + vip4Pack.length + parlayPlan.length + marquee.length + asleepPicks.length;
    if (total === 0 && picks.length > 0) {
      const relaxed = picks
        .filter((p: any) => p && p.confidenceScore != null && p.confidenceScore >= 70)
        .sort((a: any, b: any) => (b.confidenceScore || 0) - (a.confidenceScore || 0))
        .slice(0, 4);
      if (relaxed.length > 0) {
        asleepPicks = relaxed as any;
      }
    }
  }
  // Other non-NA boards (combat / individual / racing / overseas) still need 4+
  // qualifying picks. Outrights boards earn their own publish floor via the
  // contenders array.
  if (board !== 'north-american' && !RELAX_BOARDS.has(board)) {
    const total = pressurePack.length + vip4Pack.length + parlayPlan.length + marquee.length + asleepPicks.length + (outrights || []).reduce((s, t: any) => s + (t.contenders?.length || 0), 0);
    if (total < 4) {
      return {
        generatedAt: now.toISOString(),
        boardDate: getEtDateKey(now),
        board,
        grandSlam: null,
        pressurePack: [],
        vip4Pack: [],
        parlayPlan: [],
        marquee: [],
        asleepPicks: [],
        outrights: [],
        nrfi: [],
        allScored: [],
        totalGamesScanned: totalScanned,
        emptyReason: `Not enough qualifying picks for the ${board} board today (need 4, found ${total}).`,
      };
    }
  }

  // PRE-PUBLISH VERIFICATION — owner directive 2026-06-04 "we need to fix every
  // problem, big or small." Each pick on every product runs through verifyPick()
  // to catch hallucinated reasoning, sub-300 odds, conf-over-cap, and other
  // integrity issues BEFORE the slate ships. Rejected picks are dropped; minor
  // issues are cleaned in-place.
  const { verifyAndCleanPicks } = await import('@/services/pickVerification');
  const verifiedGrandSlam = grandSlam ? verifyAndCleanPicks([enrichedMap.get(grandSlam.gameId) || grandSlam])[0] || null : null;
  const verifiedPressure = verifyAndCleanPicks(pressurePack.map((p) => enrichedMap.get(p.gameId) || p));
  const verifiedVip = verifyAndCleanPicks(vip4Pack.map((p) => enrichedMap.get(p.gameId) || p));
  const verifiedParlay = verifyAndCleanPicks(parlayPlan.map((p) => enrichedMap.get(p.gameId) || p));
  const verifiedMarquee = verifyAndCleanPicks(marquee.map((p) => enrichedMap.get(p.gameId) || p));
  const verifiedAsleep = verifyAndCleanPicks(asleepPicks.map((p) => enrichedMap.get(p.gameId) || p));

  return {
    generatedAt: now.toISOString(),
    boardDate: getEtDateKey(now),
    board,
    grandSlam: verifiedGrandSlam,
    pressurePack: verifiedPressure,
    vip4Pack: verifiedVip,
    parlayPlan: verifiedParlay,
    parlayExtraLegs,
    marquee: verifiedMarquee,
    asleepPicks: verifiedAsleep,
    outrights,
    nrfi,
    // SUPPLEMENTAL MARKETS — owner directive 2026-06-03: "There are so many leads.
    // We're being lazy." For every scored game we emit additional candidates from
    // the signal data (1H ML, 1H total, Q1 ML, Q1 total, team totals). Each is a
    // separate row in allScored so backfill has real depth.
    allScored: buildSupplementalCandidatePool(picks).slice(0, 80),
    totalGamesScanned: totalScanned,
  };
}

// Builds a DEEP pool of candidates per game — game ML/total stays, PLUS halves,
// quarters, and team totals derived from the existing signal averages. Confidence
// for supplementals is bounded so they never outrank a properly-scored primary,
// but they're available when backfill or product slots come up short.
function buildSupplementalCandidatePool(picks: DeepPickResult[]): DeepPickResult[] {
  const out: DeepPickResult[] = [...picks];
  for (const p of picks) {
    const s = p.signals as any;
    if (!s) continue;
    const baseSide = p.selectionSide;
    const pickedTeam = baseSide === 'home' ? p.homeTeam : p.awayTeam;
    const oppTeam = baseSide === 'home' ? p.awayTeam : p.homeTeam;
    const baseConf = p.confidenceScore || 0;

    // 1H ML — if our side leads after H1 in >=65% of recent games
    if (s.pickedPctLeadAfterH1 >= 65) {
      const conf = Math.min(baseConf, Math.round(s.pickedPctLeadAfterH1 + 5));
      out.push({
        ...p,
        marketType: '1H_moneyline' as any,
        selection: `${pickedTeam.abbreviation || pickedTeam.name} 1H ML`,
        confidenceScore: conf,
        reasonsFor: [
          `${pickedTeam.abbreviation || pickedTeam.name} leads at the half in ${Math.round(s.pickedPctLeadAfterH1)}% of recent games — they win the first 24 minutes more often than not.`,
        ],
        reasonsAgainst: [],
      });
    }

    // Q1 ML — basketball pattern; if our side leads after Q1 in >=60% of games
    if (s.pickedPctLeadAfterQ1 >= 60) {
      const conf = Math.min(baseConf, Math.round(s.pickedPctLeadAfterQ1 + 5));
      out.push({
        ...p,
        marketType: 'Q1_moneyline' as any,
        selection: `${pickedTeam.abbreviation || pickedTeam.name} Q1 ML`,
        confidenceScore: conf,
        reasonsFor: [
          `${pickedTeam.abbreviation || pickedTeam.name} leads after Q1 in ${Math.round(s.pickedPctLeadAfterQ1)}% of recent games — fast-start team.`,
        ],
        reasonsAgainst: [],
      });
    }

    // 1H Total — if both H1 averages exist, project a 1H total and grade vs a
    // typical 1H line (full-game total / 2 as a proxy). Bonus when the projection
    // gap is >= 3 pts.
    if (s.pickedAvgH1Scored > 0 && s.oppAvgH1Allowed > 0 && p.total != null) {
      const projected1H = (s.pickedAvgH1Scored + s.oppAvgH1Allowed) / 2;
      const half = p.total / 2;
      const gap = projected1H - half;
      if (Math.abs(gap) >= 2.5) {
        const isOver = gap > 0;
        const conf = Math.min(85, 70 + Math.round(Math.abs(gap) * 1.5));
        // FIX 2026-06-06: was single-bullet. Build a full reason list.
        const dir = isOver ? 'OVER' : 'UNDER';
        const h1Reasons: string[] = [
          `1H projection: ${projected1H.toFixed(1)} points vs implied 1H line of ${half.toFixed(1)} — ${Math.abs(gap).toFixed(1)}-point edge on the ${dir}.`,
          `${pickedTeam.abbreviation || pickedTeam.name} averages ${s.pickedAvgH1Scored.toFixed(1)} points scored in 1H over their last 10 games.`,
          `Opponent allows ${s.oppAvgH1Allowed.toFixed(1)} points in 1H over their last 10 — combined with our offense gives the projection.`,
          `1H share is typically ~50% of full-game scoring — projection respects that share against the ${p.total} game total.`,
          `Engine confidence ${conf}/100 — passes the period-pick quality floor.`,
        ];
        out.push({
          ...p,
          marketType: '1H_total' as any,
          selection: `1H ${isOver ? 'Over' : 'Under'} ${half.toFixed(1)}`,
          confidenceScore: conf,
          reasonsFor: h1Reasons,
          reasonsAgainst: [],
        });
      }
    }

    // Q1 Total — basketball-only. Q1 averages exist if basketball league.
    if (s.pickedAvgQ1Scored > 0 && s.oppAvgQ1Allowed > 0 && p.total != null) {
      const projectedQ1 = (s.pickedAvgQ1Scored + s.oppAvgQ1Allowed) / 2;
      const quarter = p.total / 4;
      const gap = projectedQ1 - quarter;
      if (Math.abs(gap) >= 1.5) {
        const isOver = gap > 0;
        const conf = Math.min(82, 70 + Math.round(Math.abs(gap) * 2));
        const dir = isOver ? 'OVER' : 'UNDER';
        const q1Reasons: string[] = [
          `Q1 projection: ${projectedQ1.toFixed(1)} points vs implied Q1 line ${quarter.toFixed(1)} — ${Math.abs(gap).toFixed(1)}-point edge on the ${dir}.`,
          `${pickedTeam.abbreviation || pickedTeam.name} averages ${s.pickedAvgQ1Scored.toFixed(1)} points in Q1 over their last 10 games — early-pace signal.`,
          `Opponent allows ${s.oppAvgQ1Allowed.toFixed(1)} points in Q1 over their last 10 — combined our offense × their defense gives the projection.`,
          `Q1 share is typically ~25% of full-game scoring — projection respects that share against the ${p.total} game total.`,
          `Engine confidence ${conf}/100.`,
        ];
        out.push({
          ...p,
          marketType: 'Q1_total' as any,
          selection: `Q1 ${isOver ? 'Over' : 'Under'} ${quarter.toFixed(1)}`,
          confidenceScore: conf,
          reasonsFor: q1Reasons,
          reasonsAgainst: [],
        });
      }
    }

    // Team Total Over — picked side. If their last-10 avgTotal is well above the
    // game total / 2, they're trending toward an over on their side specifically.
    const pickedAvg = (pickedTeam as any).avgScoring10 ?? (pickedTeam as any).avgTotal10;
    if (typeof pickedAvg === 'number' && p.total != null) {
      const teamTotalLine = (p.total / 2) + 0.5;
      const gap = pickedAvg - teamTotalLine;
      if (gap >= 1.5) {
        const conf = Math.min(83, 70 + Math.round(gap * 2));
        const teamName = pickedTeam.abbreviation || pickedTeam.name;
        const ttReasons: string[] = [
          `${teamName} averages ${pickedAvg.toFixed(1)} runs/points per game over their last 10 — ${gap.toFixed(1)} above the implied team-total line of ${teamTotalLine.toFixed(1)}.`,
          `Team-total line derived from full-game total of ${p.total} (split in half + standard offset).`,
          `Pure offensive bet — wins as long as ${teamName} clears ${teamTotalLine.toFixed(1)} regardless of who wins the game.`,
          `Engine confidence ${conf}/100.`,
        ];
        out.push({
          ...p,
          marketType: 'team_total' as any,
          selection: `${teamName} Team Total Over ${teamTotalLine.toFixed(1)}`,
          confidenceScore: conf,
          reasonsFor: ttReasons,
          reasonsAgainst: [],
        });
      }
    }
  }
  // Sort the combined pool by confidence so backfill always gets the strongest
  // available candidate first.
  return out.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
}

// ─── Power 20 / Power 10 — Hail-Mary Mega-Parlay Builders ───────────────────
// Owner directive 2026-06-04: Power 20 and Power 10 are not curated menus. They
// are two single Hail-Mary parlay tickets — Power 10 = 10 legs, Power 20 = 20
// legs — sized so $1 returns ~$1000+. Constraints:
//   - North American leagues only (no tennis, soccer, combat, global)
//   - Moneyline ONLY (no MLB runline substitution, no spreads)
//   - Max -450 per leg (hard cap, no backfill relaxation)
//   - Mix of dogs and favorites is fine — whichever side we think wins.

const ALL_POWER20_LEAGUES = BOARD_LEAGUES['north-american'];

// Hard caps on moneyline odds — coherent across products per the 2026-05-31 audit:
// Premium tier (Grand Slam / Pressure / VIP): -145 (PREMIUM_ML_FLOOR, defined elsewhere)
// All other singles + $10 Parlay legs + props: -195 (per 2026-06-05 update; was -185)
// Power 20/10 parlay legs: -450 (capacity products — chalk is the product)
// Removed 2026-05-31: $10 Parlay used to take -185 to -250 chalk via parlayChalkExtras pool.
// That pool was the engine forcing chalk legs into the parlay to hit 4. Killed entirely.
// 2026-06-05: owner widened the value floor from -185 to -195. "One ninety
// five is pretty good also." -195 stays in two-digit-payout range while
// catching slightly more chalky favorites the engine likes.
const SINGLE_PICK_ML_FLOOR = -195;
const PARLAY_PLAN_ML_FLOOR = -195;   // unified — $10 Parlay legs follow the same single-pick cap
const PARLAY_LEG_ML_FLOOR = -450;    // Power of Parlays / Power 10 moonshot legs (capacity product exception)

function parseAmericanOdds(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = Number(String(s).replace(/[^\-+\d]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// True if this pick is a moneyline at odds steeper than the given floor (e.g., -400 < -350).
function isHeavyChalkML(p: { marketType?: string; odds?: string | null; moneyline?: number | null }, floor: number): boolean {
  if (p.marketType !== 'moneyline') return false;
  const ml = typeof p.moneyline === 'number' ? p.moneyline : parseAmericanOdds(p.odds);
  if (ml == null) return false;
  return ml < floor; // -500 < -350 = true; +120 < -350 = false
}

function mlToDecimal(ml: number): number {
  if (ml > 0) return 1 + ml / 100;
  return 1 + 100 / Math.abs(ml);
}

function decimalToAmerican(decimal: number): string {
  if (decimal >= 2.0) return `+${Math.round((decimal - 1) * 100)}`;
  return `-${Math.round(100 / (decimal - 1))}`;
}

function estimateParlayOdds(legs: Power20Pick[]): { odds: string; decimal: number } {
  let decimal = 1;
  for (const leg of legs) {
    const ml = leg.moneyline;
    decimal *= ml != null ? mlToDecimal(ml) : mlToDecimal(-110);
  }
  return { decimal: Math.round(decimal * 100) / 100, odds: decimalToAmerican(decimal) };
}

// Flatten tennis tournaments and combat fight cards into per-match fight-shaped events.
// Tennis nests matches under `groupings[].competitions[]`; combat events have them under
// `competitions[]`. We rewrite each match into the `competitions[0].competitors[]` shape
// that processGame / processGameForPower20 expect, so the rest of the pipeline can score
// individual matches without league-specific branching.
async function flattenTournamentEvents(events: any[], league: string): Promise<any[]> {
  const isCombat = league.startsWith('MMA') || league === 'Boxing';
  const isTennis = league.startsWith('Tennis');
  if (!isCombat && !isTennis) return events;

  const { getOddsInsightForPick } = await import('@/services/oddsApiService');
  const todayKeyMatch = dateStr(0);
  const fightEvents: any[] = [];

  for (const card of events) {
    const allComps: any[] = [];
    if (isTennis && Array.isArray(card?.groupings)) {
      for (const g of card.groupings) {
        const gc = Array.isArray(g?.competitions) ? g.competitions : [];
        for (const c of gc) allComps.push(c);
      }
    } else {
      const comps = Array.isArray(card?.competitions) ? card.competitions : [];
      for (const c of comps) allComps.push(c);
    }
    for (const comp of allComps) {
      // Per frozen-slate rule: finals stay visible on today's slate. Tennis especially —
      // French Open / Wimbledon matches play overnight Europe time, so by US evening every
      // match is `state=post`. Dropping them here would empty the tennis board every day
      // after ~11am ET. Date filter below keeps us scoped to today's matches only.
      const matchIso = comp?.date;
      if (matchIso) {
        try {
          const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
          }).formatToParts(new Date(matchIso));
          const matchKey = `${parts.find((p) => p.type === 'year')?.value}${parts.find((p) => p.type === 'month')?.value}${parts.find((p) => p.type === 'day')?.value}`;
          if (matchKey !== todayKeyMatch) continue;
        } catch { continue; }
      }
      const cs: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
      if (cs.length < 2) continue;
      const f1Name = cs[0]?.athlete?.displayName || 'Fighter 1';
      const f2Name = cs[1]?.athlete?.displayName || 'Fighter 2';
      let homeML: number | null = null;
      let awayML: number | null = null;
      try {
        const homeInsight = await getOddsInsightForPick(league, f2Name, f1Name, 'home');
        const awayInsight = await getOddsInsightForPick(league, f2Name, f1Name, 'away');
        homeML = homeInsight?.bestOdds ?? null;
        awayML = awayInsight?.bestOdds ?? null;
      } catch { /* no odds — match falls through with limited data */ }

      const adapted = cs.map((c: any, i: number) => {
        const ath = c.athlete || {};
        return {
          ...c,
          homeAway: i === 0 ? 'home' : 'away',
          team: { id: c.id, displayName: ath.displayName || `Fighter ${i + 1}`, abbreviation: (ath.shortName || `F${i + 1}`).slice(0, 4) },
        };
      });
      fightEvents.push({
        id: String(comp.id || `${card.id}-${comp.id}`),
        name: `${f1Name} vs ${f2Name}`,
        shortName: `${cs[0]?.athlete?.shortName || ''} vs ${cs[1]?.athlete?.shortName || ''}`,
        date: comp.date || card.date,
        status: comp.status || card.status,
        competitions: [{
          ...comp,
          competitors: adapted,
          odds: [{
            spread: null,
            overUnder: null,
            homeTeamOdds: { moneyLine: homeML },
            awayTeamOdds: { moneyLine: awayML },
          }],
        }],
      });
    }
  }
  return fightEvents;
}

async function processGameForPower20(
  event: any,
  league: string,
): Promise<Power20Pick | null> {
  const comp = event?.competitions?.[0];
  if (!comp) return null;
  // Include live + finished games (re-derived from the frozen closing line) so Power 20
  // legs stay visible with live scores and final results until the day rolls over at ET midnight.
  if (!event.status?.type?.state) return null;

  const homeRaw = comp.competitors?.find((c: any) => c.homeAway === 'home');
  const awayRaw = comp.competitors?.find((c: any) => c.homeAway === 'away');
  if (!homeRaw || !awayRaw) return null;

  const gameId = String(event.id);

  // Start from the scoreboard, then pull the REAL moneyline from summary/pickcenter
  // (the scoreboard odds node usually has no moneyLine/win%). This is the heavy-favorite
  // product, so we need the true ML to find the chalk we love.
  const oddsNode = comp.odds?.[0];
  let homeML: number | null = oddsNode?.homeTeamOdds?.moneyLine ?? null;
  let awayML: number | null = oddsNode?.awayTeamOdds?.moneyLine ?? null;
  let homeWinPctRaw: number | null = oddsNode?.homeTeamOdds?.winPercentage ?? null;
  let awayWinPctRaw: number | null = oddsNode?.awayTeamOdds?.winPercentage ?? null;
  const sbSpread2: number | null = oddsNode?.spread != null ? Number(oddsNode.spread) : null;

  if (homeML == null && awayML == null) {
    const baseUrl = LEAGUE_URLS[league];
    if (baseUrl) {
      const summary = await fetchGameSummary(gameId, baseUrl);
      const pc = extractPickcenterData(Array.isArray(summary?.pickcenter) ? summary.pickcenter : []);
      homeML = pc.homeMoneyline ?? homeML;
      awayML = pc.awayMoneyline ?? awayML;
      homeWinPctRaw = pc.homeWinPct ?? homeWinPctRaw;
      awayWinPctRaw = pc.awayWinPct ?? awayWinPctRaw;
    }
  }

  const mlHomeWinPct = homeML != null ? winProbFromML(homeML) : null;
  const mlAwayWinPct = awayML != null ? winProbFromML(awayML) : null;

  const homeWinPct = homeWinPctRaw ?? mlHomeWinPct;
  const awayWinPct = awayWinPctRaw ?? mlAwayWinPct ?? (homeWinPct !== null ? 100 - homeWinPct : null);

  if (homeWinPct === null && awayWinPct === null) return null;

  const homeFav = (homeWinPct ?? 0) >= (awayWinPct ?? 0);
  const favWinPct = homeFav ? (homeWinPct ?? 0) : (awayWinPct ?? 0);
  // Power 20/10 deliberately includes ANY game with a real favorite (52%+) so we can
  // stack 20 legs across a normal day's slate (NBA finals, NHL playoffs, MLB, WNBA).
  // The parlay structure (heavy chalk + many legs) protects us — sort by win prob and
  // take the top 20, then the top 10. Lesser-known matchups are explicitly welcome.
  if (favWinPct < 52) return null;

  const favRaw = homeFav ? homeRaw : awayRaw;
  const dogRaw = homeFav ? awayRaw : homeRaw;

  const favName = favRaw.team?.displayName || (homeFav ? 'Home' : 'Away');
  const favAbbr = favRaw.team?.abbreviation || (homeFav ? 'HOME' : 'AWAY');
  const dogName = dogRaw.team?.displayName || (homeFav ? 'Away' : 'Home');
  const favML = homeFav ? homeML : awayML;

  // No injury data without summary fetch — Power 20 skips injury filter
  const hasInjury = false;
  const injuryNote: string | null = null;

  // ML-only per 2026-06-04 owner directive. No run-line substitution, no spread
  // fallback. If we can't get a real moneyline number, the game can't ride.
  if (favML == null) return null;
  const marketType: Power20Pick['marketType'] = 'moneyline';
  const selection = `${favName} ML`;
  const odds = `${favML > 0 ? '+' : ''}${favML}`;

  return {
    gameId,
    eventName: `${awayRaw.team?.displayName || 'Away'} @ ${homeRaw.team?.displayName || 'Home'}`,
    league,
    startTime: event.date || '',
    favoriteName: favName,
    favoriteAbbr: favAbbr,
    underdogName: dogName,
    winProbability: favWinPct,
    moneyline: favML,
    marketType,
    selection,
    selectionSide: homeFav ? 'home' : 'away',
    odds,
    isInjuryClear: !hasInjury,
    injuryNote,
  };
}

// Normalizes a pick into the canonical key we use to detect duplicates between
// the regular-card picks and the Power 20 parlay. Two picks collide when they reference
// the same game AND the same actual selection (e.g., "Yankees ML" or "Yankees -1.5").
// Game-id alone is NOT a collision — the user explicitly allowed multiple angles on the
// same game; only the *exact same bet* is forbidden.
function pickDedupeKey(gameId: string, selection: string): string {
  const norm = (selection || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${gameId}|${norm}`;
}

export async function runPower20Research(excludedKeys: Set<string> = new Set()): Promise<Power20Result> {
  const now = new Date();
  let totalScanned = 0;

  // 2026-06-04 owner directive: "Every pick on this site should be using the
  // complete full tendency/sharp/line-movement/injury stack that powers Grand
  // Slam and Pressure Pack." Previously this function ran processGameForPower20
  // — a thin re-scan that only consulted ESPN's market win-percentage. That
  // bypassed the entire signal stack we trust.
  //
  // New flow: read the fully-scored NA board (allScored) from cache. Every
  // game on that pool already went through processGame → enrichWithExtraSignals
  // → side-stickiness → pre-publish verification. We just project the ML
  // candidate per game via buildMarketCandidates and pick the top N by
  // confidence. If the cache is cold we trigger a compute first.
  let mainBoardData: any = null;
  try {
    const { getCachedBoard, getOrComputeBoard } = await import('@/services/dailyBoardCache');
    let mainBoard = getCachedBoard('north-american');
    if (!mainBoard) {
      await getOrComputeBoard('north-american');
      mainBoard = getCachedBoard('north-american');
    }
    mainBoardData = mainBoard?.data || null;
  } catch (err) {
    console.error('[Power20] failed to read NA board', err);
  }

  const allScored: any[] = Array.isArray(mainBoardData?.allScored) ? mainBoardData.allScored : [];
  totalScanned = allScored.length;

  // For each NA-scored game, ask buildMarketCandidates() for ALL market options
  // (we filter to ML below). buildMarketCandidates is the same scorer used by
  // the regular board's best-market swap, so each ML candidate carries a real
  // confidence number derived from the deep signal stack.
  const mlCandidates: Power20Pick[] = [];
  for (const pick of allScored) {
    try {
      const cands = await buildMarketCandidates(pick, { includeProps: false });
      // Pick the strongest ML candidate per game (one side per game, no double-dipping).
      const mls = cands.filter((c: any) => c.marketType === 'moneyline');
      if (mls.length === 0) continue;
      mls.sort((a: any, b: any) => (b.confidence ?? 0) - (a.confidence ?? 0));
      const top = mls[0];
      const odds = String(top.odds || '');
      const ml = parseAmericanOdds(odds);
      if (ml == null) continue;
      // Hard -450 cap. No relaxation.
      if (ml < PARLAY_LEG_ML_FLOOR) continue;
      // Skip plays the engine itself didn't lean on — use a quality floor so we
      // only ride sides we'd actually back. 70 = "we like it"; below that the
      // engine is essentially shrugging.
      const conf = Number(top.confidence ?? 0);
      if (conf < 70) continue;

      const selectionSide: 'home' | 'away' = top.selectionSide === 'home' ? 'home' : 'away';
      const pickedTeam = selectionSide === 'home' ? pick.homeTeam : pick.awayTeam;
      const oppTeam = selectionSide === 'home' ? pick.awayTeam : pick.homeTeam;
      mlCandidates.push({
        gameId: String(pick.gameId),
        eventName: pick.eventName || `${pick.awayTeam?.name || 'Away'} @ ${pick.homeTeam?.name || 'Home'}`,
        league: pick.league || '',
        startTime: pick.startTime || '',
        favoriteName: pickedTeam?.name || 'Pick',
        favoriteAbbr: pickedTeam?.abbreviation || pickedTeam?.name?.slice(0, 3)?.toUpperCase() || 'PCK',
        underdogName: oppTeam?.name || 'Opp',
        winProbability: conf,         // expose the engine confidence as "win probability" for UI
        moneyline: ml,
        marketType: 'moneyline',
        selection: top.selection || `${pickedTeam?.name || 'Pick'} ML`,
        selectionSide,
        odds,
        isInjuryClear: true,
        injuryNote: null,
      });
    } catch (err) {
      // per-game failures shouldn't kill the whole parlay
      console.warn('[Power20] candidate gen failed for', pick?.gameId, err);
    }
  }

  // Sort by engine confidence (which already encodes tendency, sharp, line
  // move, injuries, advanced stats, refs, weather, goaltenders, etc.).
  mlCandidates.sort((a, b) => b.winProbability - a.winProbability);

  // 2026-06-04 owner directive: "Power 20 and Power 10 can never copy off
  // picks from the main board. Actually, nowhere on the site should I have
  // the same pick." Block ANY game that already has a pick on Grand Slam,
  // Pressure Pack, VIP, $10 Parlay, Marquee, NRFI, or Asleep — full game
  // exclusion, not just same-selection exclusion. The `game:${gameId}` key
  // is emitted by the route from flattenBoardPicks (now includes asleepPicks).
  const isExcluded = (p: Power20Pick) =>
    excludedKeys.has(`game:${p.gameId}`) || excludedKeys.has(pickDedupeKey(p.gameId, p.selection));
  const allPicksUnfiltered = mlCandidates.filter((p) => !isExcluded(p));
  const excludedFromRegularCards = mlCandidates.length - allPicksUnfiltered.length;

  // For back-compat with the result shape.
  const allCandidates = mlCandidates;
  void allCandidates;

  // Take up to 30 picks for the combined product. Power 20 = top 20 by engine
  // confidence; Power 10 = ranks 21-30 (the "next 10"). Both are full Hail
  // Mary tickets, but disjoint — no pick appears in both, per owner directive
  // 2026-06-04: "We should look at every North American game to make sure we
  // have thirty picks a day."
  const picks = allPicksUnfiltered.slice(0, 30);

  // Back-compat: also keep the 4×5 mini-parlay grouping in case anything still reads it.
  const GROUP_LABELS = ['Lock Pack', 'Chalk Pack', 'Value Pack', 'Wildcard Pack'];
  const parlayGroups: Power20Group[] = [];
  for (let g = 0; g < 4; g++) {
    const legs = picks.slice(g * 5, g * 5 + 5);
    if (legs.length === 0) break;
    const { odds, decimal } = estimateParlayOdds(legs);
    parlayGroups.push({ group: g + 1, label: GROUP_LABELS[g], legs, estimatedOdds: odds, estimatedDecimal: decimal });
  }

  // Two Hail-Mary parlays per owner directive 2026-06-04:
  //   - "Power 10" → 7–10 NA moneyline legs (smaller Hail Mary)
  //   - "Power 20" → 11–20 NA moneyline legs (bigger Hail Mary, $1 → $1000+ target)
  // Each must hit its minimum or it doesn't publish (better honest no-show than a
  // "Power 4" that looks broken). The leg counts always respect their bands.
  const formatPayout = (decimal: number) => {
    const payout = decimal; // $1 stake → $payout total (incl. stake)
    if (payout >= 1000) return `$1 → $${Math.round(payout).toLocaleString()}`;
    if (payout >= 10) return `$1 → $${payout.toFixed(0)}`;
    return `$1 → $${payout.toFixed(2)}`;
  };
  const buildParlay = (label: string, legs: Power20Pick[]): Power20Parlay | null => {
    if (legs.length === 0) return null;
    const { odds, decimal } = estimateParlayOdds(legs);
    const avg = Math.round((legs.reduce((s, p) => s + p.winProbability, 0) / legs.length) * 10) / 10;
    return { label, legCount: legs.length, legs, estimatedOdds: odds, estimatedDecimal: decimal, payoutOnDollar: formatPayout(decimal), avgWinProbability: avg };
  };
  // DISJOINT TICKETS per owner directive 2026-06-04. When we have a full
  // slate (≥30 NA picks after exclusion):
  //   - Power 20 = top 20 by engine confidence (ranks 1-20)
  //   - Power 10 = next 10 by engine confidence (ranks 21-30)
  // When the slate is thin (<30 NA picks), Power 20 doesn't ship — we
  // collapse everything we have into Power 10 and surface a customer-visible
  // message: "Not enough games today, running Power 10 only."
  let parlay20: Power20Parlay | null = null;
  let parlay10: Power20Parlay | null = null;
  let thinSlate = false;
  let thinSlateMessage: string | undefined;

  if (picks.length >= 30) {
    const p20Legs = picks.slice(0, 20);
    const p10Legs = picks.slice(20, 30);
    parlay20 = buildParlay('Power 20', p20Legs);
    parlay10 = buildParlay('Power 10', p10Legs);
  } else if (picks.length >= 7) {
    // Thin slate — all available picks go into Power 10, Power 20 sits out.
    const p10Legs = picks.slice(0, Math.min(10, picks.length));
    parlay10 = buildParlay('Power 10', p10Legs);
    thinSlate = true;
    thinSlateMessage = `Not enough North American games today (${picks.length} qualifying ML picks) for a full Power 20. Running Power 10 only.`;
  } else {
    // Almost no slate at all. Nothing publishes; the UI will already say "no qualifying picks."
    thinSlate = true;
    thinSlateMessage = `Only ${picks.length} North American games qualify today — too few to publish either Hail Mary parlay.`;
  }

  const avgWinProbability = picks.length > 0
    ? Math.round((picks.reduce((s, p) => s + p.winProbability, 0) / picks.length) * 10) / 10
    : 0;

  return {
    generatedAt: now.toISOString(),
    boardDate: getEtDateKey(now),
    totalScanned,
    picks,
    parlayGroups,
    parlay20,
    parlay10,
    excludedFromRegularCards,
    avgWinProbability,
    thinSlate,
    thinSlateMessage,
  };
}

// ─── Per-Sport Parlays ───────────────────────────────────────────────────────
// One 4-leg parlay per major NA sport, containing ONLY that sport. Per user:
//   - Always exactly 4 legs.
//   - Each parlay is single-sport (MLB parlay = only MLB, NBA = only NBA, etc.).
//   - If a sport can't produce 4 quality legs, skip that sport entirely (no parlay).
//   - When a sport has few games (e.g. NBA playoffs = 1 game/night), fill the 4 legs
//     from WITHIN those games using player props + game props — real value only, no
//     guessing. A single playoff game can yield: favorite ML + game total + 2 player
//     props = a legit 4-leg correlated parlay.

// FIX 2026-06-03: dropped duplicate 'NCAA Football' (same as 'College Football' —
// would build two near-identical parlays). NFL stays (will return empty in offseason).
const SPORT_PARLAY_LEAGUES = ['MLB', 'NBA', 'NFL', 'NHL', 'WNBA', 'NCAA Basketball', 'NCAA Baseball', 'College Football'];

export interface SportParlayLeg {
  type: 'game' | 'prop';
  league: string;
  gameId: string;
  eventName: string;
  startTime: string | null;  // ISO start time so the UI can show when the game begins
  selection: string;
  odds: string | null;
  edgeScore: number;         // 0-100
  detail: string;            // human-readable reasoning
  // For live grading on the page (game legs only; props can't be live-graded):
  selectionSide?: 'home' | 'away' | null;
  marketType?: string | null;
}
export interface SportParlay {
  sport: string;
  legs: SportParlayLeg[];
  legCount: number;
  estimatedOdds: string;
  estimatedDecimal: number;
  payoutOnDollar: string;
  singleGame: boolean;     // true when all legs come from one game (props-heavy)
  earliestStart: string | null; // earliest leg start time — when the parlay "locks"
}

// `excluded` is a set of `gameId|selection` keys (lowercased) from the main board so the
// sport parlays never repeat a pick already published as Grand Slam / Pressure / VIP /
// Parlay Plan. Per user: "I don't want my main picks in parlays. Find different picks."
async function buildOneSportParlay(sport: string, excluded: Set<string>): Promise<SportParlay | null> {
  const result = await fetchLeagueScoreboard(sport);
  if (!result) return null;
  const events = await flattenTournamentEvents(result.events, sport);
  if (events.length === 0) return null;

  // SMART DEDUP (revised 2026-06-01 per owner):
  // The contradiction we must prevent is the OPPOSITE SIDE on the SAME SIDE-BET.
  // Same game, DIFFERENT MARKET (total, team total, F5, period, prop) is FINE —
  // those bets don't contradict each other. Detroit ML + Over 8.5 + Detroit team
  // total over 4 + a player prop are all legitimately distinct angles on one game.
  // Exclude only when:
  //   1. Exact same pick (gameId + selection match)
  //   2. Side bet (ML/spread) with OPPOSITE selectionSide vs a main-board side bet
  //      on the same game (the actual contradiction case)
  const conflictsWith = (gameId: string, selection: string, marketType: string, selectionSide: 'home' | 'away'): boolean => {
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const norm = normalize(selection);
    if (excluded.has(`${gameId}|${norm}`)) return true; // exact duplicate
    // Only side bets (ML, spread, runline) can produce the "opposite side" contradiction.
    // Totals, team totals, F5, periods, and props are independent of which team wins.
    const isSideBet = marketType === 'moneyline' || marketType === 'spread' || marketType === 'runline';
    if (!isSideBet) return false;
    // Look for any main-board PICK on this game whose stored selectionSide is the OPPOSITE
    // of this leg's. Excluded keys are stored as "gameId|selection" — we don't have side
    // info in the Set, so we have to consult main board picks separately. The check is:
    // if main board picked the home team's ML/spread, exclude an away ML/spread leg.
    for (const key of Array.from(excluded)) {
      if (!key.startsWith(`${gameId}|`)) continue;
      const mainSel = normalize(key.split('|')[1] || '');
      // Heuristic: if BOTH selections include the same team-name fragment, they're the
      // same side (allowed, same bet). If they include DIFFERENT team-name fragments
      // AND both look like side bets, that's the opposite-side contradiction.
      const isMainSideBet = !/over|under|nrfi|yrfi|prop|1q|q1|1h|h1|2h|h2|f5|first 5/i.test(mainSel);
      if (!isMainSideBet) continue;
      // Compare the leading word/team identifier. Different teams on side bets → conflict.
      const mainTeamHead = mainSel.split(/\s+(ml|-|\+|\d)/)[0].trim();
      const newTeamHead = norm.split(/\s+(ml|-|\+|\d)/)[0].trim();
      if (mainTeamHead && newTeamHead && mainTeamHead !== newTeamHead) {
        // Different teams on side bets on the same game = opposite sides
        return true;
      }
    }
    return false;
  };
  const isExcluded = (gameId: string, selection: string, marketType: string = 'moneyline', selectionSide: 'home' | 'away' = 'home') =>
    conflictsWith(gameId, selection, marketType, selectionSide);

  // 1. GAME-LEVEL legs first (fast). A real favorite = winProbability >= 55.
  // Excludes any leg that contradicts a main-board side bet on the same game.
  const gameLegs: SportParlayLeg[] = [];
  for (const event of events) {
    const gp = await processGameForPower20(event, sport);
    // FIX 2026-06-03: raise win-prob floor from 55 → 70 (the 80-confidence floor
    // memory rule), and use PARLAY_LEG_ML_FLOOR (-450) not SINGLE_PICK_ML_FLOOR (-195)
    // since parlay legs are allowed heavier chalk than straight picks.
    if (!gp || gp.winProbability < 70) continue;
    if (isHeavyChalkML(gp, PARLAY_LEG_ML_FLOOR)) continue;
    if (isExcluded(gp.gameId, gp.selection, gp.marketType || 'moneyline', gp.selectionSide || 'home')) continue;
    gameLegs.push({
      type: 'game', league: sport, gameId: gp.gameId, eventName: gp.eventName,
      startTime: gp.startTime || event.date || null,
      selection: gp.selection, odds: gp.odds, edgeScore: Math.round(gp.winProbability),
      detail: `${gp.winProbability.toFixed(0)}% win probability`,
      selectionSide: gp.selectionSide, marketType: gp.marketType,
    });
  }
  gameLegs.sort((a, b) => b.edgeScore - a.edgeScore);

  // 1b. DIG WIDER — scan TOTALS, TEAM TOTALS, F5, PERIODS on every game (not just side bets).
  // These don't contradict the main board's side picks, so they're fully eligible. The
  // main board scanned these too via dig-wider; we use the same buildMarketCandidates
  // engine so leg quality matches main-board quality.
  //
  // To make buildMarketCandidates work we need each game's full TEAM PROFILES (trends,
  // avgMargin10, avgTotal10, etc.) which processGameForPower20 doesn't fetch. We pull
  // these from the main board's allScored cache by gameId — that's already populated
  // with the deep analysis for every MLB game tonight.
  const altLegs: SportParlayLeg[] = [];
  try {
    const { getCachedBoard } = await import('@/services/dailyBoardCache');
    const mainBoard = getCachedBoard('north-american');
    const mainBoardData: any = mainBoard?.data;
    const allScored: any[] = mainBoardData?.allScored || [];
    const byGameId = new Map<string, any>();
    for (const p of allScored) byGameId.set(String(p.gameId), p);

    for (const event of events) {
      const eid = String(event.id);
      const fullPick = byGameId.get(eid);
      if (!fullPick) continue; // game wasn't deep-scored on the main board → skip
      try {
        const cands = await buildMarketCandidates(fullPick, { includeProps: false });
        for (const c of cands) {
          // Skip side bets — already covered by gameLegs path.
          if (c.marketType === 'moneyline' || c.marketType === 'spread' || c.marketType === 'runline') continue;
          if ((c.confidence ?? 0) < 80) continue; // hard quality floor
          if (isExcluded(eid, c.selection, c.marketType, c.selectionSide)) continue;
          altLegs.push({
            type: 'game', league: sport, gameId: eid, eventName: fullPick.eventName || event.name || '',
            startTime: fullPick.startTime || event.date || null,
            selection: c.selection, odds: c.odds || '-110', edgeScore: Math.round(c.confidence ?? 0),
            detail: c.detail || `${(c.confidence ?? 0).toFixed(0)} confidence`,
            selectionSide: c.selectionSide, marketType: c.marketType,
          });
        }
      } catch { /* per-game failures shouldn't stop the parlay */ }
    }
  } catch { /* missing cache shouldn't block — props path still runs */ }
  altLegs.sort((a, b) => b.edgeScore - a.edgeScore);

  // 2. If gameLegs + altLegs already give us 4+, take top 4 — no props needed.
  // CORRELATION CAP (added 2026-06-01 after the DET/TB game contributed BOTH a Tampa
  // Team Total Under AND Detroit Tigers ML — same low-scoring thesis, both bets bleed
  // from the same trauma. Cap at ONE LEG per game so the parlay is genuinely 4
  // independent edges, not 1 thesis x 4 markets.)
  const combinedTop = [...gameLegs, ...altLegs].sort((a, b) => b.edgeScore - a.edgeScore);
  if (combinedTop.length >= 4) {
    const seen = new Set<string>();
    const gameIdsUsed = new Set<string>();
    const top4: SportParlayLeg[] = [];
    for (const l of combinedTop) {
      const key = `${l.gameId}|${l.selection.toLowerCase()}`;
      if (seen.has(key)) continue;
      if (gameIdsUsed.has(l.gameId)) continue; // one leg per game (correlation cap)
      seen.add(key);
      gameIdsUsed.add(l.gameId);
      top4.push(l);
      if (top4.length >= 4) break;
    }
    if (top4.length >= 4) return assembleSportParlay(sport, top4, false);
  }

  // 3. Otherwise, fill remaining slots with PROP legs from the sport's games (real value
  //    only — buildPreGameProps already filters to projection-vs-line edges). This is the
  //    "NBA playoffs, 1 game, dig deep" path.
  const propLegs: SportParlayLeg[] = [];
  try {
    const { buildPreGameProps } = await import('@/services/preGamePropsService');
    for (const event of events) {
      const comp = event?.competitions?.[0];
      if (!comp) continue;
      const props = await buildPreGameProps(String(event.id), event.name || '', sport, comp);
      for (const p of props.propEdges) {
        if (p.edgeScore < 80) continue; // FIX 2026-06-03: raised from 55 to match memory "nothing below 80 (85 target) anywhere"
        const marketLabel = p.market.replace(/^(player_|batter_|pitcher_)/, '').replace(/_/g, ' ');
        const side = p.recommended === 'over' ? 'Over' : p.recommended === 'under' ? 'Under' : '';
        const selection = `${p.playerName} ${side} ${p.marketLine ?? p.projection.toFixed(1)} ${marketLabel}`.trim();
        const odds = p.recommended === 'under'
          ? (p.marketUnderPrice != null ? `${p.marketUnderPrice > 0 ? '+' : ''}${p.marketUnderPrice}` : '-110')
          : (p.marketOverPrice != null ? `${p.marketOverPrice > 0 ? '+' : ''}${p.marketOverPrice}` : '-110');
        const detail = `proj ${p.projection.toFixed(1)}${p.marketLine != null ? ` vs line ${p.marketLine}` : ''}, L10 ${p.l10Avg ?? '—'}`;
        // Props never contradict main board side bets — always allowed unless exact dup.
        if (isExcluded(String(event.id), selection, 'player_prop', 'home')) continue;
        propLegs.push({
          type: 'prop', league: sport, gameId: String(event.id), eventName: event.name || '',
          startTime: event.date || null,
          selection, odds, edgeScore: p.edgeScore, detail,
        });
      }
    }
  } catch (err) {
    console.error(`[sportParlay] prop fetch failed for ${sport}`, err);
  }
  propLegs.sort((a, b) => b.edgeScore - a.edgeScore);

  // Combine game legs + alt-market legs + prop legs, dedupe by selection + by player.
  // ALSO enforce 1-leg-per-game correlation cap (same fix as above for the no-props path).
  const combined = [...gameLegs, ...altLegs, ...propLegs].sort((a, b) => b.edgeScore - a.edgeScore);
  const legs: SportParlayLeg[] = [];
  const seenSelections = new Set<string>();
  const seenPlayers = new Set<string>();
  const gameIdsUsed = new Set<string>();
  for (const c of combined) {
    const selKey = c.selection.toLowerCase();
    if (seenSelections.has(selKey)) continue;
    if (gameIdsUsed.has(c.gameId)) continue; // 1 leg per game — correlation cap
    // crude player extraction: prop selections lead with the player name
    const playerKey = c.type === 'prop' ? c.selection.split(/\s+(over|under|\d)/i)[0].toLowerCase().trim() : '';
    if (playerKey && seenPlayers.has(playerKey)) continue;
    legs.push(c);
    seenSelections.add(selKey);
    gameIdsUsed.add(c.gameId);
    if (playerKey) seenPlayers.add(playerKey);
    if (legs.length >= 4) break;
  }

  // Hard rule: exactly 4 legs or no parlay for this sport.
  if (legs.length < 4) return null;
  const singleGame = new Set(legs.map((l) => l.gameId)).size === 1;
  return assembleSportParlay(sport, legs, singleGame);
}

function assembleSportParlay(sport: string, legs: SportParlayLeg[], singleGame: boolean): SportParlay {
  let decimal = 1;
  for (const l of legs) {
    const ml = parseAmericanOdds(l.odds);
    decimal *= ml != null ? mlToDecimal(ml) : mlToDecimal(-110);
  }
  // SAME-GAME PARLAY HAIRCUT: when every leg is from one game, the legs are correlated, so
  // a book prices the SGP BELOW the naive product. Quote a conservative ~70% of the naive
  // profit so our advertised payout doesn't overstate what Hard Rock actually pays.
  if (singleGame && decimal > 1) {
    decimal = 1 + (decimal - 1) * 0.7;
  }
  decimal = Math.round(decimal * 100) / 100;
  const startTimes = legs.map((l) => l.startTime).filter(Boolean) as string[];
  const earliestStart = startTimes.length
    ? startTimes.reduce((min, t) => (new Date(t) < new Date(min) ? t : min))
    : null;
  return {
    sport, legs, legCount: legs.length,
    estimatedOdds: decimalToAmerican(decimal),
    estimatedDecimal: decimal,
    payoutOnDollar: decimal >= 10 ? `$1 → $${decimal.toFixed(0)}` : `$1 → $${decimal.toFixed(2)}`,
    singleGame,
    earliestStart,
  };
}

// Pass `excludedKeys` (gameId|selection from the main board) so sport parlays never repeat
// a published main-board pick. The endpoint builds this from the daily slate.
export async function buildSportParlays(excludedKeys: Set<string> = new Set()): Promise<SportParlay[]> {
  const out: SportParlay[] = [];
  // Sequential per-sport so we don't fan out dozens of prop fetches simultaneously.
  for (const sport of SPORT_PARLAY_LEAGUES) {
    try {
      const parlay = await buildOneSportParlay(sport, excludedKeys);
      if (parlay) out.push(parlay);
    } catch (err) {
      console.error(`[sportParlay] build failed for ${sport}`, err);
    }
  }
  return out;
}
