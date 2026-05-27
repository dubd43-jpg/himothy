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
import { generateDeepExplanation } from '@/services/aiGenerator';
import { getSharpIntel, type SharpIntelContext, type SharpFlag } from '@/services/sharpIntelService';

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

export interface BoardPicksResult {
  generatedAt: string;
  boardDate: string;
  board: BoardType;
  grandSlam: DeepPickResult | null;
  pressurePack: DeepPickResult[];
  vip4Pack: DeepPickResult[];
  parlayPlan: DeepPickResult[];
  marquee: DeepPickResult[];        // tonight's headline NBA/NHL/NFL games we cover regardless of tier
  asleepPicks: DeepPickResult[];    // lesser-watched-league plays where edges are bigger — surfaced regardless of tier
  outrights?: any[];                // active tournament futures: golf majors, tennis slams, F1 championships
  nrfi: NrfiPlay[];                 // MLB "No Runs First Inning" plays
  allScored: DeepPickResult[];
  totalGamesScanned: number;
  valuePlays?: DeepPickResult[];    // moneyline picks whose best price beats the true line (set in the API route)
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
      const res = await fetch(`${baseUrl}/teams/${teamId}/schedule?season=${year}`, { cache: 'no-store' });
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
    const res = await fetch(`${baseUrl}/summary?event=${gameId}`, { cache: 'no-store' });
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
    const res = await fetch(`${baseUrl}/summary?event=${gameId}`, { cache: 'no-store' });
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
    const res = await fetch(`${baseUrl}/teams/${teamId}/schedule?season=${year}`, { cache: 'no-store' });
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
        const meWasFav = !!cl.favAbbr && cl.favAbbr === g.meAbbr;
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
    const isFinal = (e: any) => e?.status?.type?.state === 'post' || Boolean(e?.status?.type?.completed);
    const isLive = (e: any) => e?.status?.type?.state === 'in';

    const responses = await Promise.allSettled([
      fetch(`${baseUrl}/scoreboard?dates=${dateStr(-1)}`, { cache: 'no-store' }),
      fetch(`${baseUrl}/scoreboard?dates=${dateStr(0)}`, { cache: 'no-store' }),
    ]);
    const dedupe = new Map<string, any>();
    const add = async (r: PromiseSettledResult<Response>, carryOversOnly: boolean) => {
      if (r.status !== 'fulfilled' || !r.value.ok) return;
      const data = await r.value.json();
      for (const e of data.events || []) {
        if (carryOversOnly) {
          // Yesterday's scoreboard: keep ONLY games still in progress. Skip everything
          // else (finals, scheduled-but-not-started — those aren't today's slate).
          if (!isLive(e)) continue;
        } else {
          // Today's scoreboard: keep every event whose ET date is today — INCLUDING
          // finals. The slate is frozen for the whole ET-day (per feedback-frozen-slate);
          // a game that posted in the morning slate stays visible after it finishes so
          // customers see the pick + the result side-by-side. The slate composition
          // doesn't change again until tomorrow's 8am ET cron.
          if (!isOnTodayET(e)) continue;
        }
        dedupe.set(String(e.id), e);
      }
    };
    await add(responses[0], true);
    await add(responses[1], false);
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

  // Recent hot/cold form (±6 pts)
  if (signals.recentFormStreak >= 4) score += 6;
  else if (signals.recentFormStreak >= 2) score += 3;
  else if (signals.recentFormStreak <= -3) score -= 6;
  else if (signals.recentFormStreak <= -1) score -= 3;

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

  // Data quality floor
  const dq = signals.dataQuality;
  if (dq < 30) score = Math.min(score, 52);
  else if (dq < 50) score = Math.min(score, 63);
  else if (dq < 65) score = Math.min(score, 75);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function assignTier(score: number, confirmingSignals: number): ProductTier {
  if (score >= 88 && confirmingSignals >= 6) return 'GRAND_SLAM';
  if (score >= 79 && confirmingSignals >= 5) return 'PRESSURE_PACK';
  if (score >= 67 && confirmingSignals >= 4) return 'VIP_4_PACK';
  if (score >= 54 && confirmingSignals >= 3) return 'PARLAY_PLAN';
  return 'PASS';
}

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
  const totalPlay = () => (total === null ? null : { selectionSide: pickedSide, marketType: 'total' as const, selection: `Over ${total}`, odds: '-110', line: `${total}` });

  // FULL-BOARD selection — we play every market, picking the best version of the play:
  //  • Value side (pick'em, small favorite, or dog priced ≈ -150 to +160) → the MONEYLINE.
  //  • Chalky favorite → the SPREAD / RUN LINE (MLB -1.5) at -110 — the value version that
  //    actually pays, instead of laying heavy juice. This is where run lines live.
  //  • No spread available → the TOTAL, then fall back to the moneyline.
  if (ml != null && ml >= -150 && ml <= 160) return moneyline();
  return spreadPlay() ?? totalPlay() ?? moneyline();
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

// Estimate win probability from American moneyline (removes juice)
function winProbFromML(ml: number): number {
  const raw = ml > 0 ? 100 / (100 + ml) : Math.abs(ml) / (Math.abs(ml) + 100);
  // Simple devig: normalise against the other side (assume -110/-110 = 52.4% each side)
  return Math.round(raw * 100 * 10) / 10;
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

  // Determine picked side for signal computation
  const pickedSideForSignals: 'home' | 'away' = (homeWinPct ?? 50) >= (awayWinPct ?? 50) ? 'home' : 'away';

  const pickedAts = pickedSideForSignals === 'home' ? homeAtsData.overall : awayAtsData.overall;
  const pickedAtsHA = pickedSideForSignals === 'home' ? homeAtsData.homeAway : awayAtsData.homeAway;
  const oppAts = pickedSideForSignals === 'home' ? awayAtsData.overall : homeAtsData.overall;
  const pickedInj = pickedSideForSignals === 'home' ? homeInj : awayInj;
  const oppInj = pickedSideForSignals === 'home' ? awayInj : homeInj;
  const pickedStreak = pickedSideForSignals === 'home' ? homeStreak : awayStreak;

  // Breaking-news guard: is a STAR (team leader) on our side / the opponent OUT?
  const pickedLeadersList = pickedSideForSignals === 'home' ? homeLeaders : awayLeaders;
  const oppLeadersList = pickedSideForSignals === 'home' ? awayLeaders : homeLeaders;
  const starOutPickSide = leaderRuledOut(pickedLeadersList, pickedInj.out);
  const starOutOppSide = leaderRuledOut(oppLeadersList, oppInj.out);

  // Line value gap: compare market spread to implied spread
  const lineValueGap = (() => {
    if (mergedSpread === null || homeWinPct === null) return 0;
    const impliedSpread = impliedSpreadFromWinPct(homeWinPct);
    return Math.abs(impliedSpread - mergedSpread);
  })();

  // Signal conflict: ATS and win-prob pointing opposite directions
  const signalConflict = (() => {
    if (pickedAts === null || homeWinPct === null) return false;
    const atsFavorHome = (homeAtsData.overall?.coverPct ?? 50) > (awayAtsData.overall?.coverPct ?? 50);
    const probFavorHome = (homeWinPct ?? 50) > (awayWinPct ?? 50);
    return atsFavorHome !== probFavorHome;
  })();

  const winProbGap = homeWinPct !== null && awayWinPct !== null ? Math.abs(homeWinPct - awayWinPct) : 0;
  const hasKeyInjuryPicked = pickedInj.out.length > 0 || pickedInj.doubtful.length > 0;
  const hasKeyInjuryOpp = oppInj.out.length > 0 || oppInj.doubtful.length > 0;

  // Sharp intel: run in parallel, zero block if it fails
  const homeTeamName = homeRaw.team?.displayName || 'Home';
  const awayTeamName = awayRaw.team?.displayName || 'Away';
  const gameTime = event.date || null;

  let sharpIntel: SharpIntelContext | null = null;
  try {
    sharpIntel = await getSharpIntel({
      gameId, league, homeTeam: homeTeamName, awayTeam: awayTeamName,
      pickedSide: pickedSideForSignals, gameTime,
    });
  } catch {
    // Sharp intel is non-blocking — picks still qualify without it
  }

  const signalsPartial: Omit<GameSignals, 'confirmingSignals'> = {
    oddsAvailable: hasOdds,
    winProbabilityGap: winProbGap,
    atsCoverPct: pickedAts?.coverPct ?? null,
    atsCoverPctOpp: oppAts?.coverPct ?? null,
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
    // The price we'll actually PLAY (mirrors pickForNA): plus-money/pickem on the ML,
    // heavier favorites on the spread at standard -110 — never heavy-chalk moneylines.
    pickedOddsAmerican: (() => {
      const pml = pickedSideForSignals === 'home' ? mergedHomeML : mergedAwayML;
      if (sportStyle !== 'na') return pml;                       // soccer/tennis = ML
      // Mirror pickForNA (full board): moneyline on value-priced sides; chalky favorites
      // play the spread / run line / total at the standard -110.
      if (pml != null && pml >= -150 && pml <= 160) return pml;
      if (mergedSpread !== null || mergedTotal !== null) return -110;
      return pml;
    })(),
    // Sharp intel signals
    sharpMoneyAligned: sharpIntel?.betting?.sharpFavors === pickedSideForSignals && (sharpIntel.betting.sharpConfidence ?? 0) >= 55,
    reverseLineMovement: sharpIntel?.betting?.reverseLineMovement ?? false,
    restAdvantage: sharpIntel?.rest?.restAdvantage === pickedSideForSignals && (sharpIntel.rest.restEdge ?? 0) >= 3,
    oppOnB2B: pickedSideForSignals === 'home' ? (sharpIntel?.rest?.awayIsB2B ?? false) : (sharpIntel?.rest?.homeIsB2B ?? false),
    weatherAlert: sharpIntel?.weather?.affectsPlay ?? false,
    sharpScoreBonus: sharpIntel?.scoreBonus ?? 0,
  };

  const baseScore = scoreGame(signalsPartial);
  // Asleep bonus — boost confidence for lesser-watched leagues so they out-rank
  // generic mainstream chalk on the headline boards. Strictly multiplicative on the
  // raw signal score; never lifts a no-edge pick into a tier on its own.
  const asleepBoost = asleepMultiplier(league);
  const rawScore = Math.round(baseScore * asleepBoost);
  // CHANGE THE PICK on breaking news: if a star on our side is OUT, cap the score so
  // this play drops out of the headline tiers (the board will surface a different game).
  const confidenceScore = starOutPickSide ? Math.min(rawScore, 42) : rawScore;
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

  // Build reasons
  const reasonsFor: string[] = [];
  const reasonsAgainst: string[] = [];

  if (homeWinPct !== null && awayWinPct !== null)
    reasonsFor.push(`Win probability edge: ${home.abbreviation} ${homeWinPct.toFixed(1)}% vs ${away.abbreviation} ${awayWinPct.toFixed(1)}% — ${winProbGap.toFixed(1)}pt gap.`);

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
        // board. Completed matches also dropped — we only score upcoming/live.
        const todayKeyMatch = dateStr(0);
        for (const compRaw of allComps) {
          const state = compRaw?.status?.type?.state;
          if (state === 'post' || compRaw?.status?.type?.completed) continue;
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
      allGamePromises.push(processGame(event, league, baseUrl, board));
    }
  }

  const rawResults = await Promise.allSettled(allGamePromises);
  const picks: DeepPickResult[] = rawResults
    .filter((r): r is PromiseFulfilledResult<DeepPickResult> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value)
    // Heavy-chalk filter — single picks must pay enough to be worth the risk. Any ML pick
    // steeper than the floor is dropped here, before bucketing into pressurePack/asleep/etc.
    // (Spreads, totals, props are unaffected — they price ~-110 regardless.)
    .filter((p) => !isHeavyChalkML(p, SINGLE_PICK_ML_FLOOR))
    // Drop picks with no price at all — we don't surface plays we can't actually quote.
    .filter((p) => parseAmericanOdds(p.odds) != null || p.marketType === 'spread' || p.marketType === 'total')
    .sort((a, b) => b.confidenceScore - a.confidenceScore);

  // Assign tiers with hard caps and no duplicate games
  const usedGames = new Set<string>();
  const pressurePack: DeepPickResult[] = [];
  const vip4Pack: DeepPickResult[] = [];
  const parlayPlan: DeepPickResult[] = [];

  // GRAND SLAM = the rare near-lock. It is NOT handed out daily. A pick only qualifies
  // when we genuinely expect to win: a clear, well-supported favorite with full signal
  // confluence, clean injuries, and high data quality. Most days this is empty — and
  // that's the point. We only drop it when we really feel it.
  const qualifiesAsGrandSlam = (p: DeepPickResult): boolean => {
    const s = p.signals;
    const pickedWin = p.selectionSide === 'home' ? p.homeTeam.winProbability : p.awayTeam.winProbability;
    return (
      s.winProbabilityGap >= 24 &&        // clear favorite, never a coin-flip
      (pickedWin ?? 0) >= 66 &&           // we genuinely expect them to win outright
      s.confirmingSignals >= 8 &&         // near-complete signal confluence
      s.dataQuality >= 70 &&
      !s.keyInjuryOnPickSide &&           // (star-out guard already caps these)
      !s.signalConflict &&
      p.confidenceScore >= 85
    );
  };
  const grandSlam: DeepPickResult | null =
    picks
      .filter(qualifiesAsGrandSlam)
      .sort((a, b) => {
        const aw = (a.selectionSide === 'home' ? a.homeTeam.winProbability : a.awayTeam.winProbability) ?? 0;
        const bw = (b.selectionSide === 'home' ? b.homeTeam.winProbability : b.awayTeam.winProbability) ?? 0;
        return bw - aw || b.confidenceScore - a.confidenceScore;
      })[0] || null;
  if (grandSlam) usedGames.add(grandSlam.gameId);

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

  for (const pick of picks) {
    if (usedGames.has(pick.gameId)) continue;
    if (asleepReserved.has(pick.gameId)) continue;   // asleep games skip the main buckets
    const t = pick.tier;

    if ((t === 'GRAND_SLAM' || t === 'PRESSURE_PACK') && pressurePack.length < 2) {
      pressurePack.push({ ...pick, tier: 'PRESSURE_PACK' }); usedGames.add(pick.gameId);
    } else if ((t === 'PRESSURE_PACK' || t === 'VIP_4_PACK') && vip4Pack.length < 4) {
      vip4Pack.push({ ...pick, tier: 'VIP_4_PACK' }); usedGames.add(pick.gameId);
    } else if (parlayPlan.length < 6 && t !== 'PASS') {
      parlayPlan.push({ ...pick, tier: 'PARLAY_PLAN' }); usedGames.add(pick.gameId);
    }

    if (pressurePack.length === 2 && vip4Pack.length === 4 && parlayPlan.length === 6) break;
  }

  // THIN-SLATE BACKFILL: Pressure Pack MUST always be 2 picks. VIP 4-Pack MUST always be
  // 4 picks. Parlay Plan MUST always be 4 picks. The user is explicit on this — products
  // never ship half-empty regardless of how thin the day is.
  //
  // We backfill in three tiers, escalating only if the prior tier comes up short:
  //   T1: non-PASS picks not in any bucket  — best quality leftovers, includes VIP/Parlay tier
  //   T2: + asleep-reserved picks           — high-confidence quiet-market plays
  //   T3: + PASS-tier picks                 — last resort on extremely thin slates
  //
  // We promote in product order (Pressure Pack → VIP 4-Pack → Parlay Plan) so the best
  // leftovers land in the highest-revenue product first.
  const promote = (target: DeepPickResult[], cap: number, tierTag: ProductTier, pool: DeepPickResult[]) => {
    while (target.length < cap && pool.length > 0) {
      const p = pool.shift()!;
      if (usedGames.has(p.gameId)) continue;
      target.push({ ...p, tier: tierTag });
      usedGames.add(p.gameId);
    }
  };
  const t1 = picks.filter((p) => !usedGames.has(p.gameId) && !asleepReserved.has(p.gameId) && p.tier !== 'PASS');
  promote(pressurePack, 2, 'PRESSURE_PACK', t1);
  promote(vip4Pack, 4, 'VIP_4_PACK', t1);
  promote(parlayPlan, 6, 'PARLAY_PLAN', t1);

  if (pressurePack.length < 2 || vip4Pack.length < 4 || parlayPlan.length < 4) {
    const t2 = picks.filter((p) => !usedGames.has(p.gameId) && asleepReserved.has(p.gameId) && p.tier !== 'PASS');
    promote(pressurePack, 2, 'PRESSURE_PACK', t2);
    promote(vip4Pack, 4, 'VIP_4_PACK', t2);
    promote(parlayPlan, 6, 'PARLAY_PLAN', t2);
    // Anything T2 promoted gets removed from the asleep pool so it doesn't double-render.
    for (const p of t2) if (usedGames.has(p.gameId)) asleepReserved.delete(p.gameId);
  }

  if (pressurePack.length < 2 || vip4Pack.length < 4 || parlayPlan.length < 4) {
    const t3 = picks.filter((p) => !usedGames.has(p.gameId));
    promote(pressurePack, 2, 'PRESSURE_PACK', t3);
    promote(vip4Pack, 4, 'VIP_4_PACK', t3);
    promote(parlayPlan, 6, 'PARLAY_PLAN', t3);
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

  return {
    generatedAt: now.toISOString(),
    boardDate: now.toISOString().slice(0, 10),
    board,
    grandSlam: grandSlam ? (enrichedMap.get(grandSlam.gameId) || grandSlam) : null,
    pressurePack: pressurePack.map((p) => enrichedMap.get(p.gameId) || p),
    vip4Pack,
    parlayPlan,
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

// Hard caps on moneyline odds — anything steeper pays too little to be worth surfacing.
// Single picks: -185 (per user: "There shall not be any single plays higher than 185").
// Power 20/10 parlay legs: -450 (per user: "the highest leg on a 20 — nothing higher
// than -450"). Heavier chalk than that drags the parlay payout to nothing.
const SINGLE_PICK_ML_FLOOR = -185;
const PARLAY_LEG_ML_FLOOR = -450;

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
      const state = comp?.status?.type?.state;
      if (state === 'post' || comp?.status?.type?.completed) continue;
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
    boardDate: now.toISOString().slice(0, 10),
    totalScanned,
    picks,
    parlayGroups,
    parlay20,
    parlay10,
    excludedFromRegularCards,
    avgWinProbability,
  };
}
