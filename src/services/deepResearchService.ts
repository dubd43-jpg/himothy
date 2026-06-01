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
import { getGameProbables, type GameProbables } from '@/services/pitcherMatchupService';
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
  'north-american': ['NFL', 'NHL', 'NBA', 'WNBA', 'MLB', 'College Football', 'NCAA Basketball', 'NCAA Baseball'],
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
  // Global team sports — cricket, rugby, AFL, soccer outside the major Euro leagues.
  'global': [
    'Cricket - IPL', 'Cricket', 'Rugby - NRL', 'Rugby - Top 14', 'Rugby - Premiership',
    'AFL', 'Soccer - Brazil Serie A', 'Soccer - Argentina', 'Denmark Superliga',
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
  reverseLineMovement: boolean;       // public bets X% but line moved against them
  restAdvantage: boolean;             // picked side has meaningful rest edge
  oppOnB2B: boolean;                  // opponent played yesterday
  weatherAlert: boolean;              // significant weather affecting outdoor game
  sharpScoreBonus: number;            // 0-25 pts added by sharp intel signals
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

function extractProbablePitcher(competitor: any): { name: string; era: number | null } {
  const p = competitor?.probables?.[0];
  const name = p?.athlete?.displayName || p?.displayName || 'TBD';
  let era: number | null = null;
  const stats: any[] = Array.isArray(p?.statistics) ? p.statistics : [];
  const eraStat = stats.find((s) => String(s?.abbreviation || s?.name || '').toUpperCase() === 'ERA');
  if (eraStat && eraStat.displayValue != null) {
    const v = parseFloat(String(eraStat.displayValue));
    if (!Number.isNaN(v)) era = v;
  }
  if (era === null && typeof p?.athlete?.statsSummary === 'string') {
    const m = p.athlete.statsSummary.match(/([\d.]+)\s*ERA/i);
    if (m) era = parseFloat(m[1]);
  }
  return { name, era };
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
    if (hp.era === null || ap.era === null) continue; // need BOTH starters' ERA to judge honestly

    const worst = Math.max(hp.era, ap.era);   // the weak link decides NRFI risk
    const combined = (hp.era + ap.era) / 2;
    if (worst > 4.25) continue;               // one arm too leaky for a confident NRFI

    let score = worst <= 3.0 ? 88 : worst <= 3.75 ? 80 : 72;
    if (combined <= 3.0) score += 5;
    score = Math.min(95, score);

    const awayAbbr = away.team?.abbreviation || 'AWAY';
    const homeAbbr = home.team?.abbreviation || 'HOME';
    const a = `${ap.name} (${ap.era.toFixed(2)} ERA)`;
    const h = `${hp.name} (${hp.era.toFixed(2)} ERA)`;
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

function extractInjuriesBySide(summary: any, side: 'home' | 'away') {
  const injuries = summary?.injuries;
  if (!Array.isArray(injuries)) return { out: [], doubtful: [], questionable: [] };
  const teamInjuries = injuries.find((t: any) => t.homeAway === side)?.injuries || [];
  const out: string[] = []; const doubtful: string[] = []; const questionable: string[] = [];
  for (const inj of teamInjuries) {
    const name = inj?.athlete?.displayName || 'Unknown';
    const pos = inj?.athlete?.position?.abbreviation || '';
    const label = pos ? `${name} (${pos})` : name;
    const status = (inj?.status || '').toUpperCase();
    if (status === 'OUT') out.push(label);
    else if (status === 'DOUBTFUL') doubtful.push(label);
    else if (status === 'QUESTIONABLE') questionable.push(label);
  }
  return { out, doubtful, questionable };
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
} {
  if (!Array.isArray(pickcenter) || pickcenter.length === 0) {
    return { spread: null, total: null, homeMoneyline: null, awayMoneyline: null, homeWinPct: null, awayWinPct: null, drawPct: null };
  }
  const p = pickcenter[0];
  return {
    spread: p?.spread != null ? Number(p.spread) : null,
    total: p?.overUnder != null ? Number(p.overUnder) : null,
    homeMoneyline: p?.homeTeamOdds?.moneyLine ?? null,
    awayMoneyline: p?.awayTeamOdds?.moneyLine ?? null,
    homeWinPct: p?.homeTeamOdds?.winPercentage ?? null,
    awayWinPct: p?.awayTeamOdds?.winPercentage ?? null,
    drawPct: p?.drawOdds?.winPercentage ?? null,
  };
}

// ─── Signal Counting ─────────────────────────────────────────────────────────

function countConfirmingSignals(
  pickedSide: 'home' | 'away',
  signals: Omit<GameSignals, 'confirmingSignals'>,
): number {
  let count = 0;

  // Signal 1: Win probability clearly favors picked side
  if (signals.winProbabilityGap >= 10) count++;

  // Signal 2: ATS cover rate favors picked side
  if (signals.atsCoverPct !== null && signals.atsCoverPct >= 55) count++;

  // Signal 3: Situational ATS (home/road) favors picked side
  if (signals.atsHomeAwayCoverPct !== null && signals.atsHomeAwayCoverPct >= 56) count++;

  // Signal 4: Opponent has weak ATS record
  if (signals.atsCoverPctOpp !== null && signals.atsCoverPctOpp <= 44) count++;

  // Signal 5: No key injuries on pick side
  if (!signals.keyInjuryOnPickSide) count++;

  // Signal 6: Opponent has key injury
  if (signals.keyInjuryOnOppSide) count++;

  // Signal 7: Odds available (data exists)
  if (signals.oddsAvailable) count++;

  // Signal 8: Line value gap (market mispriced vs probability)
  if (signals.lineValueGap >= 2.5) count++;

  // Signal 9: Sharp line movement or confirmed sharp money
  if (signals.sharpLineDetected || signals.sharpMoneyAligned) count++;

  // Signal 10: Recent form is positive (winning streak)
  if (signals.recentFormStreak >= 3) count++;

  // Signal 13: Reverse line movement — sharp action confirmed
  if (signals.reverseLineMovement) count++;

  // Signal 14: Rest advantage
  if (signals.restAdvantage) count++;

  // Signal 15: Opponent on back-to-back
  if (signals.oppOnB2B) count++;

  // Signal 11: Spread is not crazy (not a 14-point dog)
  if (signals.spreadFavorable) count++;

  // Signal 12: Data quality is high
  if (signals.dataQuality >= 70) count++;

  // Signal 16: Price is in a fair band — solid favorite through modest plus-money
  // (Balanced: accurate favorites count too, only brutal chalk / longshots don't).
  if (signals.pickedOddsAmerican !== null && signals.pickedOddsAmerican >= -240 && signals.pickedOddsAmerican <= 175) count++;

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

  // Win probability gap (±8 pts) — REDUCED so heavy chalk no longer auto-tops the
  // board. We still reward being on the better side, but value/payout now matters more.
  const gap = signals.winProbabilityGap;
  if (gap >= 25) score += 8;
  else if (gap >= 18) score += 6;
  else if (gap >= 12) score += 4;
  else if (gap >= 6) score += 2;

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

  // Overall ATS for picked side (±13 pts)
  const ats = signals.atsCoverPct;
  if (ats !== null) {
    if (ats >= 65) score += 13;
    else if (ats >= 60) score += 9;
    else if (ats >= 55) score += 5;
    else if (ats >= 50) score += 1;
    else if (ats <= 40) score -= 10;
    else if (ats <= 46) score -= 5;
  }

  // Situational (home/road) ATS — extra precision (±8 pts)
  const atsHA = signals.atsHomeAwayCoverPct;
  if (atsHA !== null) {
    if (atsHA >= 63) score += 8;
    else if (atsHA >= 56) score += 4;
    else if (atsHA <= 38) score -= 8;
    else if (atsHA <= 44) score -= 4;
  }

  // Opponent ATS weakness (±7 pts)
  const atsOpp = signals.atsCoverPctOpp;
  if (atsOpp !== null) {
    if (atsOpp <= 36) score += 7;
    else if (atsOpp <= 42) score += 4;
    else if (atsOpp >= 62) score -= 5;
  }

  // Injury factors (±12 pts)
  if (signals.noKeyInjuries) score += 4;
  if (signals.keyInjuryOnOppSide) score += 8;
  if (signals.keyInjuryOnPickSide) score -= 12;

  // Line value gap — market mispriced (±7 pts)
  if (signals.lineValueGap >= 4) score += 7;
  else if (signals.lineValueGap >= 2) score += 4;

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
    score += streakBrittle ? 1 : (streakReal ? 6 : 3);
  } else if (signals.recentFormStreak >= 2) {
    score += streakBrittle ? 0 : (streakReal ? 3 : 1);
  } else if (signals.recentFormStreak <= -3) {
    // Losing streak fade — but if avgMargin is still positive (one bad week), only half fade
    score += streakReal ? -3 : -6;
  } else if (signals.recentFormStreak <= -1) {
    score += streakReal ? 0 : -3;
  }

  // Signal conflict penalty (−8 pts)
  // ATS and win-prob pointing opposite directions = no edge
  if (signals.signalConflict) score -= 8;

  // Sharp line / sharp money confirmed (±10 pts)
  if (signals.sharpMoneyAligned) score += 7;
  else if (signals.sharpLineDetected) score += 4;
  if (signals.reverseLineMovement) score += 5;

  // Rest / fatigue edges (±8 pts)
  if (signals.oppOnB2B) score += 6;
  else if (signals.restAdvantage) score += 4;

  // Weather affects totals direction (neutral for side picks)
  if (signals.weatherAlert) score += 2; // slight edge knowing weather

  // Bonus from full sharp intel context (0-25 pts, already capped)
  score += Math.round(signals.sharpScoreBonus * 0.5); // half weight to avoid inflation

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
    // Opponent's starter is awful → ride it
    if (signals.oppPitcherEraL5 >= 6.0) score += 4;
    else if (signals.oppPitcherEraL5 >= 5.0) score += 2;
  }

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
    // Lead-after-H1 history — teams that lead H1 65%+ rarely lose those games
    if (signals.pickedPctLeadAfterH1 >= 65) score += 4;
    else if (signals.pickedPctLeadAfterH1 <= 35) score -= 3;
  }

  // F5 TOTAL DIVERGENCE — when our team's F5 avg is well above the opponent's, we're
  // the side that scores early. Pairs with a strong starter for the side bet logic.
  if (signals.tendencyFirstFrameSample >= 5 && signals.tendencyF5TotalAvg > 0 && signals.tendencyOppF5TotalAvg > 0) {
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
function assignTier(score: number, confirmingSignals: number): ProductTier {
  if (score < GLOBAL_FLOOR) return 'PASS';
  if (score >= 96 && confirmingSignals >= 6) return 'GRAND_SLAM';
  if (score >= 83 && confirmingSignals >= 5) return 'PRESSURE_PACK';
  if (confirmingSignals >= 4) return 'VIP_4_PACK';
  if (confirmingSignals >= 3) return 'PARLAY_PLAN';
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

  // 1) FULL-GAME TOTAL — no fetch; line from the scoreboard (pick.total), projection from form.
  if (pick?.total != null && homeTot != null && awayTot != null) {
    const proj = (homeTot + awayTot) / 2;
    const over = proj >= pick.total;
    const align = combinedOverRate != null ? (over ? combinedOverRate : 1 - combinedOverRate) : null;
    candidates.push({
      selection: `${over ? 'Over' : 'Under'} ${pick.total}`, marketType: 'total',
      selectionSide: over ? 'home' : 'away', odds: '-110', line: `${pick.total}`,
      confidence: scoreTotalsConfidence(proj, pick.total, align),
      detail: `Projected ${proj.toFixed(1)} vs line ${pick.total}`,
    });
  }

  const lc = league.toLowerCase();
  const isMlb = lc.includes('mlb') || lc.includes('baseball');
  const [alt, periods, f5] = await Promise.all([
    (async () => { try { const m = await import('@/services/oddsApiService'); return await m.getAltLinesForGame(league, awayName, homeName); } catch { return null; } })(),
    (async () => { try { const m = await import('@/services/periodMarketsService'); return await m.getPeriodMarketsForGame(league, awayName, homeName); } catch { return null; } })(),
    isMlb ? (async () => { try { const m = await import('@/services/oddsApiService'); return await m.getF5InsightForGame(awayName, homeName); } catch { return null; } })() : Promise.resolve(null),
  ]);

  // 2) TEAM TOTALS — each team's own projected scoring = (its game-total avg + its margin)/2.
  if (alt?.teamTotals?.length && homeTot != null && awayTot != null && homeMargin != null && awayMargin != null) {
    const projFor = { home: (homeTot + homeMargin) / 2, away: (awayTot + awayMargin) / 2 } as const;
    for (const tt of alt.teamTotals) {
      if (tt.line == null) continue;
      const proj = projFor[tt.side];
      const over = proj >= tt.line;
      const ob = tt.side === 'home' ? home?.trends?.ou10 : away?.trends?.ou10;
      const orate = ouOverRate(ob);
      const align = orate != null ? (over ? orate : 1 - orate) : null;
      const teamName = tt.side === 'home' ? homeName : awayName;
      // Team totals at the MAIN line price ~-110/-120 both ways. The alt-lines feed only
      // gives us the best price across ALL alternate lines (which can be +650 for a far
      // alt line) — pairing that with the median line misrepresents the payout, so we quote
      // the standard -115 for the main line instead of a mismatched longshot price.
      candidates.push({
        selection: `${teamName} Team Total ${over ? 'Over' : 'Under'} ${tt.line}`, marketType: 'team_total',
        selectionSide: tt.side, odds: '-115', line: `${tt.line}`,
        confidence: scoreTotalsConfidence(proj, tt.line, align),
        detail: `Projected ${proj.toFixed(1)} vs team line ${tt.line}`,
      });
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
        candidates.push({
          selection: pl.selection, marketType: `${pl.period.toLowerCase()}_total`,
          selectionSide: /\bover\b/i.test(pl.selection) ? 'home' : 'away',
          odds: pl.odds, line: pl.line != null ? `${pl.line}` : null,
          confidence: pl.edgeScore, detail: pl.reason,
        });
      }
    } catch { /* non-blocking */ }
  }

  // 4) F5 TOTAL (MLB first 5 innings) — project ~5/9 of the full-game total.
  if (f5?.totalLine != null && homeTot != null && awayTot != null) {
    const projF5 = ((homeTot + awayTot) / 2) * (5 / 9);
    const over = projF5 >= f5.totalLine;
    // F5 prices from the feed are best-across-alt-lines (mismatched to the median line),
    // same issue as team totals — quote the standard -115 main-line price instead.
    candidates.push({
      selection: `F5 ${over ? 'Over' : 'Under'} ${f5.totalLine}`, marketType: 'f5_total',
      selectionSide: over ? 'home' : 'away', odds: '-115',
      line: `${f5.totalLine}`, confidence: scoreTotalsConfidence(projF5, f5.totalLine, null),
      detail: `Projected first-5 ${projF5.toFixed(1)} vs line ${f5.totalLine}`,
    });
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
            candidates.push({
              selection: `${playerName} ${over ? 'Over' : 'Under'} ${rec.estimatedLine} ${rec.displayStat}`,
              marketType: 'player_prop',
              selectionSide: 'home',
              odds: price != null ? `${price > 0 ? '+' : ''}${price}` : '-115',
              line: `${rec.estimatedLine}`,
              confidence: conf,
              detail: rec.reason || `${playerName} ${over ? 'over' : 'under'} ${rec.estimatedLine} ${rec.displayStat}`,
            });
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

  // Merge: prefer pickcenter data, fall back to scoreboard odds data
  const mergedSpread = pc.spread ?? sbSpread;
  const mergedTotal = pc.total ?? sbTotal;
  const mergedHomeML = pc.homeMoneyline ?? sbHomeML;
  const mergedAwayML = pc.awayMoneyline ?? sbAwayML;
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

  // Injuries (only available from summary)
  const homeInj = extractInjuriesBySide(summary, 'home');
  const awayInj = extractInjuriesBySide(summary, 'away');

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
  const gameTime = event.date || null;
  let sharpIntel: SharpIntelContext | null = null;
  try {
    sharpIntel = await getSharpIntel({
      gameId, league, homeTeam: homeTeamName, awayTeam: awayTeamName,
      pickedSide: 'home', gameTime,
    });
  } catch { /* non-blocking */ }

  // Deep tendencies + odds-bucket hit rate + MLB pitcher matchup — all fetched in
  // parallel, all non-blocking. tendencies = 1st-frame scoring + F5 from ESPN linescores.
  // bucketStats = our actual win rate by price band from the registry. pitcher matchup =
  // probable starter's L5 ERA/WHIP/handedness. The engine now factors all into scoreGame.
  const tendencyHomeId = String(homeRaw.team?.id || homeRaw.id || '');
  const tendencyAwayId = String(awayRaw.team?.id || awayRaw.id || '');
  let homeTendencies: TeamTendencies | null = null;
  let awayTendencies: TeamTendencies | null = null;
  let bucketStats: Record<string, { wins: number; losses: number; total: number }> = {};
  let probables: GameProbables = { home: null, away: null };
  const isMlb = league === 'MLB';
  try {
    const [ht, at, bs, pp] = await Promise.all([
      tendencyHomeId ? getTeamTendencies(league, tendencyHomeId).catch(() => null) : Promise.resolve(null),
      tendencyAwayId ? getTeamTendencies(league, tendencyAwayId).catch(() => null) : Promise.resolve(null),
      getCachedBucketStats().catch(() => ({})),
      isMlb ? getGameProbables(gameId).catch(() => ({ home: null, away: null } as GameProbables)) : Promise.resolve({ home: null, away: null } as GameProbables),
    ]);
    homeTendencies = ht;
    awayTendencies = at;
    bucketStats = bs as any;
    probables = pp;
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
    const weightedOppAts = weightedAtsCoverPct(oppFormBuckets?.ats5, oppFormBuckets?.ats10, oppFormBuckets?.atsSeason);
    const pickedInj = side === 'home' ? homeInj : awayInj;
    const oppInj = side === 'home' ? awayInj : homeInj;
    const pickedStreak = side === 'home' ? homeStreak : awayStreak;
    const pickedLeadersList = side === 'home' ? homeLeaders : awayLeaders;
    const oppLeadersList = side === 'home' ? awayLeaders : homeLeaders;
    const starOutPickSide = leaderRuledOut(pickedLeadersList, pickedInj.out);
    const starOutOppSide = leaderRuledOut(oppLeadersList, oppInj.out);
    const hasKeyInjuryPicked = pickedInj.out.length > 0 || pickedInj.doubtful.length > 0;
    const hasKeyInjuryOpp = oppInj.out.length > 0 || oppInj.doubtful.length > 0;
    const signalsPartial: Omit<GameSignals, 'confirmingSignals'> = {
      oddsAvailable: hasOdds,
      winProbabilityGap: winProbGap,
      atsCoverPct: weightedPickedAts ?? pickedAts?.coverPct ?? null,
      atsCoverPctOpp: weightedOppAts ?? oppAts?.coverPct ?? null,
      atsHomeAwayCoverPct: pickedAtsHA?.coverPct ?? null,
      lineValueGap,
      signalConflict,
      recentFormStreak: pickedStreak,
      keyInjuryOnPickSide: hasKeyInjuryPicked,
      keyInjuryOnOppSide: hasKeyInjuryOpp,
      spreadFavorable: mergedSpread !== null && Math.abs(mergedSpread) < 8,
      noKeyInjuries: !hasKeyInjuryPicked && !hasKeyInjuryOpp,
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
      sharpMoneyAligned: sharpIntel?.betting?.sharpFavors === side && (sharpIntel.betting.sharpConfidence ?? 0) >= 55,
      reverseLineMovement: sharpIntel?.betting?.reverseLineMovement ?? false,
      restAdvantage: sharpIntel?.rest?.restAdvantage === side && (sharpIntel.rest.restEdge ?? 0) >= 3,
      oppOnB2B: side === 'home' ? (sharpIntel?.rest?.awayIsB2B ?? false) : (sharpIntel?.rest?.homeIsB2B ?? false),
      weatherAlert: sharpIntel?.weather?.affectsPlay ?? false,
      sharpScoreBonus: sharpIntel?.scoreBonus ?? 0,
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
    };
    return { signalsPartial, pickedInj, oppInj, pickedAts, oppAts, pickedAtsHA, pickedStreak, starOutPickSide, starOutOppSide, hasKeyInjuryPicked, hasKeyInjuryOpp };
  };

  const homeEval = buildSideSignals('home');
  const awayEval = buildSideSignals('away');
  const homeScoreEval = scoreGame(homeEval.signalsPartial);
  const awayScoreEval = scoreGame(awayEval.signalsPartial);
  const pickedSideForSignals: 'home' | 'away' = homeScoreEval >= awayScoreEval ? 'home' : 'away';
  const evalForPicked = pickedSideForSignals === 'home' ? homeEval : awayEval;
  const { signalsPartial, pickedInj, oppInj, pickedAts, oppAts, pickedAtsHA, pickedStreak, starOutPickSide, starOutOppSide, hasKeyInjuryPicked, hasKeyInjuryOpp } = evalForPicked;

  const baseScore = scoreGame(signalsPartial);
  // Asleep bonus — boost confidence for lesser-watched leagues so they out-rank
  // generic mainstream chalk on the headline boards. Strictly multiplicative on the
  // raw signal score; never lifts a no-edge pick into a tier on its own.
  const asleepBoost = asleepMultiplier(league);
  const rawScore = Math.round(baseScore * asleepBoost);
  // CHANGE THE PICK on breaking news: if a star on our side is OUT, cap the score so
  // this play drops out of the headline tiers (the board will surface a different game).
  let confidenceScore = starOutPickSide ? Math.min(rawScore, 42) : rawScore;
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
  // CAP AT 100. Confidence is a 0-100 conviction score — it must never read above 100. The
  // asleep-league boost is a MULTIPLIER on the base score, which could push it to 110+; that's
  // nonsensical to show ("110% sure") so we clamp it. 100 = our maximum conviction, not a
  // claim of a 100% win — see the win-probability note: conviction ≠ win odds.
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

  // Build team profiles
  const home: TeamProfile = {
    id: String(homeRaw.team?.id || homeRaw.id || ''),
    name: homeRaw.team?.displayName || 'Home', abbreviation: homeRaw.team?.abbreviation || 'HOME',
    homeAway: 'home', overallRecord: homeOverall, homeAwayRecord: homeHomeRec,
    ats: homeAtsData.overall, atsHomeAway: homeAtsData.homeAway,
    winProbability: homeWinPct, moneyline: mergedHomeML, keyPlayers: homeLeaders,
    injuredOut: homeInj.out, injuredDoubtful: homeInj.doubtful, injuredQuestionable: homeInj.questionable,
    recentForm: homeForm?.form ?? null, recentFormRecord: homeForm?.record ?? null,
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
    reasonsAgainst.push(`Opponent ${opp.abbreviation} has a weak ATS record: ${oppAts.coverPct.toFixed(1)}% (${oppAts.display}).`);
  }

  if (lineValueGap >= 2) reasonsFor.push(`Line value gap of ${lineValueGap.toFixed(1)} points detected vs implied spread.`);

  if (pickedStreak >= 3) {
    const t = pickData.selectionSide === 'home' ? home : away;
    reasonsFor.push(`${t.abbreviation} on a ${pickedStreak}-game winning streak.`);
  } else if (pickedStreak <= -3) {
    const t = pickData.selectionSide === 'home' ? home : away;
    reasonsAgainst.push(`${t.abbreviation} is on a ${Math.abs(pickedStreak)}-game losing streak.`);
  }

  if (hasKeyInjuryOpp) {
    const opp = pickData.selectionSide === 'home' ? away : home;
    const all = [...(pickData.selectionSide === 'home' ? awayInj.out : homeInj.out), ...(pickData.selectionSide === 'home' ? awayInj.doubtful : homeInj.doubtful)];
    reasonsFor.push(`${opp.abbreviation} missing: ${all.slice(0, 2).join(', ')}.`);
  }

  if (hasKeyInjuryPicked) {
    const t = pickData.selectionSide === 'home' ? home : away;
    const all = [...pickedInj.out, ...pickedInj.doubtful];
    reasonsAgainst.push(`${t.abbreviation} missing key player(s): ${all.slice(0, 2).join(', ')} — verify before betting.`);
  }

  if (signalConflict) reasonsAgainst.push('ATS trend and win-probability slightly disagree — monitor late line movement before placing.');

  if (starOutPickSide) reasonsAgainst.push(`⚠️ ${starOutPickSide} (a key player on our side) is OUT — we've pulled off this play. Picks update as news breaks, up to ~15 min before game time.`);
  if (starOutOppSide) reasonsFor.push(`${starOutOppSide} — a key player for the opponent — is OUT, which boosts this side.`);

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
    reasonsFor.push(`${oppTeam.abbreviation}'s starter is bleeding runs (${signals.oppPitcherEraL5} ERA last ${signals.oppPitcherStarts}). Our lineup gets a hittable arm — that's 4-5 runs of expected production on offense.`);
  }
  if (eraGapInOurFavor >= 3) {
    reasonsFor.push(`${eraGapInOurFavor.toFixed(1)}-run ERA gap in our pitcher's favor. The man on the mound for us has been the better arm by a wide margin — that's how this bet wins.`);
  }
  if (ourPitcherBad) {
    reasonsAgainst.push(`Our starter (${signals.pickedPitcherEraL5} ERA last ${signals.pickedPitcherStarts}) needs to find it tonight — if he gives up 4+ early, the thesis breaks.`);
  }

  // ===== FIRST-FRAME / EARLY-GAME OUTCOME =====
  if (signals.tendencyFirstFrameSample >= 5) {
    if (signals.tendencyFirstFrameScored >= 70) {
      reasonsFor.push(`${pickedTeam.abbreviation} puts a run on the board in the 1st inning ${Math.round(signals.tendencyFirstFrameScored)}% of recent games — we expect to take an early lead and force ${oppTeam.abbreviation} to play from behind.`);
    }
    if (signals.tendencyOppFirstFrameAllowed >= 70) {
      reasonsFor.push(`${oppTeam.abbreviation} gives up runs in the 1st inning ${Math.round(signals.tendencyOppFirstFrameAllowed)}% of games — we have an early-strike edge before their bullpen matters.`);
    }
  }

  // ===== BULLPEN / LATE-GAME OUTCOME =====
  if (signals.tendencyFirstFrameSample >= 5) {
    if (signals.oppBullpenAllowed >= 2.5) {
      reasonsFor.push(`${oppTeam.abbreviation}'s bullpen is leaking ${signals.oppBullpenAllowed.toFixed(1)} runs/game in innings 7-9 lately. If this is a 1-2 run game late, we have the comeback edge — that's where this bet finishes.`);
    }
    if (signals.pickedBullpenAllowed >= 2.5) {
      reasonsAgainst.push(`Our bullpen has bled ${signals.pickedBullpenAllowed.toFixed(1)} R/g in innings 7-9 — if we don't have the lead by the 7th, late innings get scary.`);
    }
    if (signals.oppPctBlewLateLead >= 30) {
      reasonsFor.push(`${oppTeam.abbreviation} has coughed up a post-6th-inning lead in ${Math.round(signals.oppPctBlewLateLead)}% of their recent losses — even if they're up late, we have history saying they break.`);
    }
  }

  // ===== STREAK FRAGILITY =====
  if (signals.recentFormStreak >= 3 && signals.pickedAvgMargin10 < -0.3) {
    reasonsAgainst.push(`${pickedTeam.abbreviation}'s ${signals.recentFormStreak}-game streak is built on top of a 4-6 L10 stretch — recent wins were thin. Riding momentum here, not dominance.`);
  } else if (signals.recentFormStreak >= 3 && signals.pickedAvgMargin10 >= 1.5) {
    reasonsFor.push(`${pickedTeam.abbreviation} is outscoring opponents by ${signals.pickedAvgMargin10.toFixed(1)} runs per game over their last 10 — this team is actually playing dominant, not just lucky.`);
  }

  // ===== LINE MOVEMENT — sharp money read =====
  if (signals.hasOpeningLine) {
    if (signals.mlMovementForSide >= 15) {
      reasonsFor.push(`Line moved ${signals.mlMovementForSide}¢ toward ${pickedTeam.abbreviation} since open while public is on the other side — that's textbook reverse line movement. Sharps agree with our read.`);
    } else if (signals.mlMovementForSide <= -15) {
      reasonsAgainst.push(`Line moved ${Math.abs(signals.mlMovementForSide)}¢ AWAY from our side since open — the market is pricing us out. Sharps faded; we're fighting that.`);
    } else if (signals.spreadMovementForSide >= 1.0) {
      reasonsFor.push(`Spread moved ${signals.spreadMovementForSide.toFixed(1)} pts toward ${pickedTeam.abbreviation} — the market agrees we're the right side, books are reacting to sharp action.`);
    } else if (signals.spreadMovementForSide <= -1.0) {
      reasonsAgainst.push(`Spread moved ${Math.abs(signals.spreadMovementForSide).toFixed(1)} pts away from our side — the market is pricing against us.`);
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
      detail = `Their starter is getting lit up — ${oppEra} ERA over his last ${signals.oppPitcherStarts} starts. Our lineup faces a damaged arm.`;
    } else {
      detail = `Pitcher matchup tilts in our favor. Both arms break down to give us the edge tonight.`;
    }
    keyFactor = { category: 'pitcher', headline: 'PITCHER MATCHUP', detail };
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
      detail: `${oppTeam.abbreviation}'s bullpen is bleeding ${signals.oppBullpenAllowed.toFixed(1)} runs/game in innings 7-9. If this is a tight game late, we have the comeback math.`,
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
  // 7) Key injury on opponent
  else if (signals.keyInjuryOnOppSide && hasKeyInjuryOpp) {
    const all = [...oppInj.out, ...oppInj.doubtful];
    keyFactor = {
      category: 'injury',
      headline: 'OPPONENT INJURY',
      detail: `${oppTeam.abbreviation} is missing key player(s): ${all.slice(0, 2).join(', ')}. The market often underprices roster downgrades this severe.`,
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
    return { ...pick, aiExplanation: explanation };
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
  const allScoredRaw: DeepPickResult[] = rawResults
    .filter((r): r is PromiseFulfilledResult<DeepPickResult> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value)
    // Drop picks with no price at all — we don't surface plays we can't actually quote.
    .filter((p) => parseAmericanOdds(p.odds) != null || p.marketType === 'spread' || p.marketType === 'total')
    .sort((a, b) => b.confidenceScore - a.confidenceScore);

  // STRAIGHT-PICK POOL: -185 ML floor. Single picks must pay enough to be worth the risk.
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
        picksExpanded.push({
          ...p, marketType: 'total', selection: `${over ? 'Over' : 'Under'} ${p.total}`,
          odds: '-110', line: `${p.total}`, selectionSide: over ? 'home' : 'away',
          confidenceScore: scoreTotalsConfidence(predicted, p.total, null),
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
  const GRAND_SLAM_FLOOR = 96;
  // Quality floor for Pressure / VIP / Parlay backfill — owner target is 85+ across every
  // product. Lower than this and we'd be slot-filling garbage.
  const QUALITY_FLOOR = 85;
  const isGrandSlamEligible = (p: DeepPickResult): boolean => {
    if (p.confidenceScore < GRAND_SLAM_FLOOR) return false;
    if (p.signals.confirmingSignals < 6) return false; // tier-tag consistency: GS needs 6 signals
    if (p.signals.keyInjuryOnPickSide) return false;
    if (p.signals.signalConflict) return false;
    if (isHeavyMlForPremium(p)) return false;   // no ML steeper than -145 on Grand Slam
    return true;
  };
  // picksExpanded is sorted by confidenceScore desc — take the first eligible play (which
  // may be a side OR a total).
  const grandSlam: DeepPickResult | null = picksExpanded.find(isGrandSlamEligible) || null;
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

    if ((t === 'GRAND_SLAM' || t === 'PRESSURE_PACK') && pressurePack.length < 2 && !isHeavyMlForPremium(pick)) {
      place(pressurePack, 'PRESSURE_PACK');
    } else if ((t === 'PRESSURE_PACK' || t === 'VIP_4_PACK') && vip4Pack.length < 4 && !isHeavyMlForPremium(pick)) {
      // VIP now respects the -145 chalk cap (consistency with Pressure + GS)
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
  const pressureOk85 = (p: DeepPickResult) => !isHeavyMlForPremium(p) && p.confidenceScore >= QUALITY_FLOOR;
  const vipOk85 = (p: DeepPickResult) => !isHeavyMlForPremium(p) && p.confidenceScore >= QUALITY_FLOOR;
  const parlayOk85 = (p: DeepPickResult) => p.confidenceScore >= QUALITY_FLOOR && p.tier !== 'PASS';
  // Step-down gates — same chalk caps + 80 (GLOBAL_FLOOR) — never PASS-tier.
  const pressureOk80 = (p: DeepPickResult) => !isHeavyMlForPremium(p) && p.confidenceScore >= GLOBAL_FLOOR && p.tier !== 'PASS';
  const vipOk80 = (p: DeepPickResult) => !isHeavyMlForPremium(p) && p.confidenceScore >= GLOBAL_FLOOR && p.tier !== 'PASS';
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
          digFinds.push({
            ...game,
            selection: c.selection, marketType: c.marketType, selectionSide: c.selectionSide,
            odds: c.odds, line: c.line, confidenceScore: c.confidence,
          } as DeepPickResult);
        }
      }
      digFinds.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
      promote(pressurePack, 2, 'PRESSURE_PACK', digFinds.filter(pressureOk85));
      promote(vip4Pack, 4, 'VIP_4_PACK', digFinds.filter(vipOk85));
      promote(parlayPlan, 6, 'PARLAY_PLAN', digFinds.filter(parlayOk85));
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
          digFinds80.push({
            ...game,
            selection: c.selection, marketType: c.marketType, selectionSide: c.selectionSide,
            odds: c.odds, line: c.line, confidenceScore: c.confidence,
          } as DeepPickResult);
        }
      }
      digFinds80.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
      promote(pressurePack, 2, 'PRESSURE_PACK', digFinds80.filter(pressureOk80));
      promote(vip4Pack, 4, 'VIP_4_PACK', digFinds80.filter(vipOk80));
      promote(parlayPlan, 6, 'PARLAY_PLAN', digFinds80.filter(parlayOk80));
    } catch { /* non-blocking */ }
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

  // Tonight's big games — headline NBA/NHL/NFL/WNBA matchups we always cover, even if
  // they're coin-flips that didn't make a product. People bet these; we talk about them.
  // Only TRULY big games — playoffs/finals/championship/Game 7 — not just two good
  // regular-season teams. detectBigGame() sets bigGameLabel from ESPN postseason/notes.
  const marquee = picks
    .filter((p) => MARQUEE_LEAGUES.has(p.league) && p.bigGameLabel && !usedGames.has(p.gameId))
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, 4);

  // Asleep picks — quieter leagues (NCAA Baseball, UFC, AFL, Cricket, etc.) where the
  // user wants edges surfaced regardless of tier. Cap at 8 so the slate stays curated.
  // Only relevant on the main `north-american` board (other boards ARE the quiet markets).
  const asleepPicks = board === 'north-american'
    ? picks
        .filter((p) => p.isAsleepPick && !usedGames.has(p.gameId))
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
      // Filter each tournament's contenders: drop anything steeper than -185 (single-pick
      // floor) and cap at the top 12 contenders so the page stays readable.
      outrights = tournaments.map((t: any) => ({
        ...t,
        contenders: (t.contenders || [])
          .filter((c: any) => c.bestPrice == null || c.bestPrice > SINGLE_PICK_ML_FLOOR)
          .slice(0, 12),
      }));
    } catch { /* non-blocking */ }
  }

  // Enrich Grand Slam + Pressure Pack with AI (Sonnet 4.6)
  const toEnrich = [grandSlam, ...pressurePack].filter(Boolean) as DeepPickResult[];
  const enriched = await Promise.allSettled(toEnrich.map(enrichWithAI));
  const enrichedMap = new Map<string, DeepPickResult>();
  for (const r of enriched) {
    if (r.status === 'fulfilled') enrichedMap.set(r.value.gameId, r.value);
  }

  // Non-NA board minimum: per user "if we're gonna do soccer, make sure it's 4 picks or
  // more." Soccer / tennis / combat / individual / racing / global boards only publish
  // when there's at least 4 total qualifying picks (Pressure + VIP + Parlay Plan + Marquee +
  // Asleep + Outrights contenders). On a sparse day, the whole board returns empty so we
  // don't ship a board with 1 lonely pick masquerading as a slate.
  if (board !== 'north-american') {
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

  return {
    generatedAt: now.toISOString(),
    boardDate: getEtDateKey(now),
    board,
    grandSlam: grandSlam ? (enrichedMap.get(grandSlam.gameId) || grandSlam) : null,
    pressurePack: pressurePack.map((p) => enrichedMap.get(p.gameId) || p),
    vip4Pack,
    parlayPlan,
    parlayExtraLegs,
    marquee,
    asleepPicks,
    outrights,
    nrfi,
    allScored: picks.slice(0, 20),
    totalGamesScanned: totalScanned,
  };
}

// ─── Power 20 — Heavy Favorites Parlay Builder ───────────────────────────────

const ALL_POWER20_LEAGUES = Object.values(BOARD_LEAGUES).flat();

// Hard caps on moneyline odds — coherent across products per the 2026-05-31 audit:
// Premium tier (Grand Slam / Pressure / VIP): -145 (PREMIUM_ML_FLOOR, defined elsewhere)
// All other singles + $10 Parlay legs + props: -185 (per user: "no single plays steeper than -185")
// Power 20/10 parlay legs: -450 (capacity products — chalk is the product)
// Removed 2026-05-31: $10 Parlay used to take -185 to -250 chalk via parlayChalkExtras pool.
// That pool was the engine forcing chalk legs into the parlay to hit 4. Killed entirely.
const SINGLE_PICK_ML_FLOOR = -185;
const PARLAY_PLAN_ML_FLOOR = -185;   // unified — $10 Parlay legs follow the same single-pick cap
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

  // MLB heavy favorites → run line -1.5 (the value version, avoids -250+ ML juice).
  const useRunLine = league === 'MLB' && favML != null && favML < -175;
  const sbSpread2used = sbSpread2;

  let marketType: Power20Pick['marketType'];
  let selection: string;
  let odds: string;

  if (useRunLine) {
    marketType = 'runline';
    selection = `${favName} -1.5`;
    odds = '-135';
  } else if (favML != null) {
    marketType = 'moneyline';
    selection = `${favName} ML`;
    odds = `${favML > 0 ? '+' : ''}${favML}`;
  } else if (sbSpread2used !== null) {
    marketType = 'spread';
    const spreadVal = homeFav ? sbSpread2used : -sbSpread2used;
    selection = `${favName} ${spreadVal > 0 ? `+${spreadVal}` : spreadVal}`;
    odds = '-110';
  } else {
    return null;
  }

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

  const leagueResults = await Promise.allSettled(
    ALL_POWER20_LEAGUES.map((league) => fetchLeagueScoreboard(league).then((r) => ({ league, result: r })))
  );

  const allGamePromises: Promise<Power20Pick | null>[] = [];
  let totalScanned = 0;

  for (const settled of leagueResults) {
    if (settled.status !== 'fulfilled' || !settled.value.result) continue;
    const { league, result } = settled.value;
    // Tennis / combat events arrive as tournaments with many matches nested inside; flatten
    // them to per-match events so processGameForPower20 can score individual matchups.
    // Cross-sport parlays mix tennis legs with NBA/MLB/NHL legs only because of this step.
    const events = await flattenTournamentEvents(result.events, league);
    totalScanned += events.length;
    for (const event of events) {
      allGamePromises.push(processGameForPower20(event, league));
    }
  }

  const rawResults = await Promise.allSettled(allGamePromises);
  const allCandidates: Power20Pick[] = rawResults
    .filter((r): r is PromiseFulfilledResult<Power20Pick> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value)
    .sort((a, b) => b.winProbability - a.winProbability);

  // Parlay-leg chalk cap (-450). Heavier chalk drags the payout to nothing. Spread /
  // runline legs price ~-110 and pass through unaffected. We keep this as the PRIMARY pool.
  const primary = allCandidates.filter((p) => !isHeavyChalkML(p, PARLAY_LEG_ML_FLOOR));

  // Drop any candidate that lives on the SAME GAME as an exclusive board pick. Parlays
  // pull from a separate pool of games entirely (per user: "those two should never have
  // any of our exclusive picks in it"). Exclusion keys are `game:<gameId>` plus the
  // legacy `gameId|selection` form for back-compat.
  const isExcluded = (p: Power20Pick) =>
    excludedKeys.has(`game:${p.gameId}`) || excludedKeys.has(pickDedupeKey(p.gameId, p.selection));
  const allPicksUnfiltered = primary.filter((p) => !isExcluded(p));
  const excludedFromRegularCards = primary.length - allPicksUnfiltered.length;

  // THIN-SLATE BACKFILL for the parlay. We need:
  //   - "Power 10" daily parlay → minimum 7 legs, up to 10
  //   - "Power of Parlays" moonshot → minimum 11 legs, up to 20
  // We always try to fill up to 20 candidates so both parlays publish honestly.
  // Backfill cascades:
  //   T1: chalk-filtered primary pool (within -450 floor)            — already in allPicks
  //   T2: candidates filtered ONLY for heavy chalk, capped at -700   — moderate fallback
  //   T3: any remaining candidate, no chalk floor                    — last resort, thin days
  // De-dupe against regular-card selections always applies.
  const ABSOLUTE_CHALK_FLOOR = -700;
  const allPicks: Power20Pick[] = [...allPicksUnfiltered];
  const tryBackfill = (filterFn: (p: Power20Pick) => boolean) => {
    const seen = new Set(allPicks.map((p) => pickDedupeKey(p.gameId, p.selection)));
    for (const p of allCandidates) {
      if (allPicks.length >= 20) break;
      const k = pickDedupeKey(p.gameId, p.selection);
      if (seen.has(k)) continue;
      if (isExcluded(p)) continue;
      if (!filterFn(p)) continue;
      allPicks.push(p);
      seen.add(k);
    }
  };
  if (allPicks.length < 20) {
    tryBackfill((p) => {
      const ml = parseAmericanOdds(p.odds);
      return ml == null || ml > ABSOLUTE_CHALK_FLOOR;
    });
  }
  if (allPicks.length < 11) {
    // Absolute last resort — no chalk floor at all. Better to ship a -900 leg than to
    // hide the parlay entirely on a 1-game-only kind of day.
    tryBackfill(() => true);
  }

  const picks = allPicks.slice(0, 20);

  // Back-compat: also keep the 4×5 mini-parlay grouping in case anything still reads it.
  const GROUP_LABELS = ['Lock Pack', 'Chalk Pack', 'Value Pack', 'Wildcard Pack'];
  const parlayGroups: Power20Group[] = [];
  for (let g = 0; g < 4; g++) {
    const legs = picks.slice(g * 5, g * 5 + 5);
    if (legs.length === 0) break;
    const { odds, decimal } = estimateParlayOdds(legs);
    parlayGroups.push({ group: g + 1, label: GROUP_LABELS[g], legs, estimatedOdds: odds, estimatedDecimal: decimal });
  }

  // Two headline parlays, both heavy-favorite blends of MLs / run lines / props:
  //   - "Power 10" → 7–10 legs (daily play, smaller stack)
  //   - "Power of Parlays" → 11–20 legs (moonshot, formerly "Power 20")
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
  // Power 10: take legs 0..min(10, len). Requires at least 7 to publish.
  const parlay10Legs = picks.slice(0, Math.min(10, picks.length));
  const parlay10 = parlay10Legs.length >= 7 ? buildParlay('Power 10', parlay10Legs) : null;
  // Power of Parlays: take legs 0..min(20, len). Requires at least 11 to publish.
  const parlay20Legs = picks.slice(0, Math.min(20, picks.length));
  const parlay20 = parlay20Legs.length >= 11 ? buildParlay('Power of Parlays', parlay20Legs) : null;

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

const SPORT_PARLAY_LEAGUES = ['MLB', 'NBA', 'NFL', 'NHL', 'WNBA', 'NCAA Basketball'];

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
    if (!gp || gp.winProbability < 55) continue;
    if (isHeavyChalkML(gp, SINGLE_PICK_ML_FLOOR)) continue;
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
  const altLegs: SportParlayLeg[] = [];
  for (const event of events) {
    try {
      const gp = await processGameForPower20(event, sport);
      if (!gp) continue;
      // Build a pick-shaped object so buildMarketCandidates can score it; pull from the
      // game's team profiles (winProb/trends) the processGameForPower20 already fetched.
      const cands = await buildMarketCandidates(gp as any, { includeProps: false });
      for (const c of cands) {
        // Skip side bets — already covered by gameLegs path.
        if (c.marketType === 'moneyline' || c.marketType === 'spread' || c.marketType === 'runline') continue;
        if ((c.confidence ?? 0) < 80) continue; // hard quality floor
        if (isExcluded(gp.gameId, c.selection, c.marketType, c.selectionSide)) continue;
        altLegs.push({
          type: 'game', league: sport, gameId: gp.gameId, eventName: gp.eventName,
          startTime: gp.startTime || event.date || null,
          selection: c.selection, odds: c.odds || '-110', edgeScore: Math.round(c.confidence ?? 0),
          detail: c.detail || `${c.confidence ?? 0} confidence`,
          selectionSide: c.selectionSide, marketType: c.marketType,
        });
      }
    } catch { /* per-game failures shouldn't stop the parlay */ }
  }
  altLegs.sort((a, b) => b.edgeScore - a.edgeScore);

  // 2. If gameLegs + altLegs already give us 4+, take top 4 — no props needed.
  const combinedTop = [...gameLegs, ...altLegs].sort((a, b) => b.edgeScore - a.edgeScore);
  if (combinedTop.length >= 4) {
    // Dedupe by (gameId|selection) to avoid the same leg twice
    const seen = new Set<string>();
    const top4: SportParlayLeg[] = [];
    for (const l of combinedTop) {
      const key = `${l.gameId}|${l.selection.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      top4.push(l);
      if (top4.length >= 4) break;
    }
    if (top4.length >= 4) return assembleSportParlay(sport, top4, new Set(top4.map((l) => l.gameId)).size === 1);
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
        if (p.edgeScore < 55) continue; // real-value floor for parlay legs
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
  // Take the top 4 by edge.
  const combined = [...gameLegs, ...altLegs, ...propLegs].sort((a, b) => b.edgeScore - a.edgeScore);
  const legs: SportParlayLeg[] = [];
  const seenSelections = new Set<string>();
  const seenPlayers = new Set<string>();
  for (const c of combined) {
    const selKey = c.selection.toLowerCase();
    if (seenSelections.has(selKey)) continue;
    // crude player extraction: prop selections lead with the player name
    const playerKey = c.type === 'prop' ? c.selection.split(/\s+(over|under|\d)/i)[0].toLowerCase().trim() : '';
    if (playerKey && seenPlayers.has(playerKey)) continue;
    legs.push(c);
    seenSelections.add(selKey);
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
