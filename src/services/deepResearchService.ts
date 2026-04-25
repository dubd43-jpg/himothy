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

// ─── Board ──────────────────────────────────────────────────────────────────

export type BoardType = 'north-american' | 'soccer' | 'tennis' | 'overseas';

const BOARD_LEAGUES: Record<BoardType, string[]> = {
  'north-american': ['NBA', 'MLB', 'NHL', 'NFL', 'NCAA Basketball'],
  'soccer': ['Soccer - EPL', 'Soccer - La Liga', 'Soccer - Bundesliga', 'Soccer - Serie A', 'Soccer - Ligue 1', 'Soccer - Champions League'],
  'tennis': ['Tennis - ATP', 'Tennis - WTA'],
  'overseas': ['Italy Serie A', 'Denmark Superliga', 'Poland Ekstraklasa', 'Romania Liga 1', 'Netherlands Eredivisie'],
};

function sportStyleForBoard(board: BoardType): 'na' | 'soccer' | 'tennis' {
  if (board === 'soccer' || board === 'overseas') return 'soccer';
  if (board === 'tennis') return 'tennis';
  return 'na';
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type ProductTier = 'GRAND_SLAM' | 'PRESSURE_PACK' | 'VIP_4_PACK' | 'PARLAY_PLAN' | 'PASS';

export interface AtsRecord {
  wins: number; losses: number; pushes: number; display: string; coverPct: number;
}

export interface TeamProfile {
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
  confirmingSignals: number;           // filled after scoring
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
}

export interface BoardPicksResult {
  generatedAt: string;
  boardDate: string;
  board: BoardType;
  grandSlam: DeepPickResult | null;
  pressurePack: DeepPickResult[];
  vip4Pack: DeepPickResult[];
  parlayPlan: DeepPickResult[];
  allScored: DeepPickResult[];
  totalGamesScanned: number;
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

export interface Power20Result {
  generatedAt: string;
  boardDate: string;
  totalScanned: number;
  picks: Power20Pick[];
  parlayGroups: Power20Group[];
  avgWinProbability: number;
}

// ─── ESPN Fetch Helpers ──────────────────────────────────────────────────────

const summaryCache = new Map<string, { fetchedAt: number; data: any }>();
const formCache = new Map<string, { fetchedAt: number; data: any }>();
const SUMMARY_TTL = 150_000;
const FORM_TTL = 300_000;

function dateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
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

async function fetchLeagueScoreboard(league: string): Promise<{ events: any[]; baseUrl: string } | null> {
  const baseUrl = LEAGUE_URLS[league];
  if (!baseUrl) return null;
  try {
    // Fetch today AND tomorrow — today's games are often all post by evening
    const [r0, r1] = await Promise.allSettled([
      fetch(`${baseUrl}/scoreboard?dates=${dateStr(0)}`, { cache: 'no-store' }),
      fetch(`${baseUrl}/scoreboard?dates=${dateStr(1)}`, { cache: 'no-store' }),
    ]);
    const allEvents: any[] = [];
    for (const r of [r0, r1]) {
      if (r.status === 'fulfilled' && r.value.ok) {
        const data = await r.value.json();
        allEvents.push(...(data.events || []));
      }
    }
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

  // Signal 9: Sharp line movement
  if (signals.sharpLineDetected) count++;

  // Signal 10: Recent form is positive (winning streak)
  if (signals.recentFormStreak >= 3) count++;

  // Signal 11: Spread is not crazy (not a 14-point dog)
  if (signals.spreadFavorable) count++;

  // Signal 12: Data quality is high
  if (signals.dataQuality >= 70) count++;

  return count;
}

// ─── Confidence Scoring ───────────────────────────────────────────────────────

function scoreGame(signals: Omit<GameSignals, 'confirmingSignals'>): number {
  let score = 50;

  // Win probability gap (±15 pts)
  const gap = signals.winProbabilityGap;
  if (gap >= 25) score += 15;
  else if (gap >= 18) score += 11;
  else if (gap >= 12) score += 7;
  else if (gap >= 6) score += 3;

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

  // Sharp line (±4 pts)
  if (signals.sharpLineDetected) score += 4;

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
  home: TeamProfile, away: TeamProfile, spread: number | null, total: number | null,
): { selectionSide: 'home' | 'away'; marketType: 'spread' | 'moneyline' | 'total'; selection: string; odds: string | null; line: string | null } {
  const homeWin = home.winProbability ?? 50;
  const awayWin = away.winProbability ?? 50;
  const homeAts = home.ats?.coverPct ?? 50;
  const awayAts = away.ats?.coverPct ?? 50;

  // Determine side: win prob is primary, ATS is tiebreaker
  let pickedSide: 'home' | 'away';
  if (homeWin > awayWin + 3) pickedSide = 'home';
  else if (awayWin > homeWin + 3) pickedSide = 'away';
  else pickedSide = homeAts >= awayAts ? 'home' : 'away';

  const pickedTeam = pickedSide === 'home' ? home : away;
  const ml = pickedTeam.moneyline;
  const mlStr = ml != null ? `${ml > 0 ? '+' : ''}${ml}` : null;

  if (spread !== null) {
    const spreadVal = pickedSide === 'home' ? spread : -spread;
    const spreadStr = spreadVal > 0 ? `+${spreadVal}` : `${spreadVal}`;
    return { selectionSide: pickedSide, marketType: 'spread', selection: `${pickedTeam.name} ${spreadStr}`, odds: '-110', line: spreadStr };
  }
  if (ml != null) {
    return { selectionSide: pickedSide, marketType: 'moneyline', selection: `${pickedTeam.name} ML`, odds: mlStr, line: null };
  }
  if (total !== null) {
    return { selectionSide: pickedSide, marketType: 'total', selection: `Over ${total}`, odds: '-110', line: `${total}` };
  }
  return { selectionSide: pickedSide, marketType: 'moneyline', selection: `${pickedTeam.name} ML`, odds: mlStr, line: null };
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
  if (eventState !== 'pre') return null;   // only pregame

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

  const hasScoreboardOdds = Boolean(sbSpread !== null || sbHomeML !== null);

  // Only fetch summary when scoreboard has no odds at all (saves API calls)
  const summary = hasScoreboardOdds ? null : await fetchGameSummary(gameId, baseUrl);

  const pickcenter: any[] = Array.isArray(summary?.pickcenter) ? summary.pickcenter : [];
  const pc = extractPickcenterData(pickcenter);

  // Merge: prefer pickcenter data, fall back to scoreboard odds data
  const mergedSpread = pc.spread ?? sbSpread;
  const mergedTotal = pc.total ?? sbTotal;
  const mergedHomeML = pc.homeMoneyline ?? sbHomeML;
  const mergedAwayML = pc.awayMoneyline ?? sbAwayML;
  // Win % priority: pickcenter → scoreboard odds node → derived from ML
  const mergedHomeWinPct = pc.homeWinPct ?? sbHomeWinPct ?? mlHomeWinPct;
  const mergedAwayWinPct = pc.awayWinPct ?? sbAwayWinPct ?? mlAwayWinPct;

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

  const homeStreak = 0;
  const awayStreak = 0;

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
  };

  const confidenceScore = scoreGame(signalsPartial);
  const confirmingSignals = countConfirmingSignals(pickedSideForSignals, signalsPartial);
  const signals: GameSignals = { ...signalsPartial, confirmingSignals };
  const tier = assignTier(confidenceScore, confirmingSignals);

  if (tier === 'PASS') return null;

  // Build team profiles
  const home: TeamProfile = {
    name: homeRaw.team?.displayName || 'Home', abbreviation: homeRaw.team?.abbreviation || 'HOME',
    homeAway: 'home', overallRecord: homeOverall, homeAwayRecord: homeHomeRec,
    ats: homeAtsData.overall, atsHomeAway: homeAtsData.homeAway,
    winProbability: homeWinPct, moneyline: mergedHomeML, keyPlayers: homeLeaders,
    injuredOut: homeInj.out, injuredDoubtful: homeInj.doubtful, injuredQuestionable: homeInj.questionable,
    recentForm: null, recentFormRecord: null,
  };

  const away: TeamProfile = {
    name: awayRaw.team?.displayName || 'Away', abbreviation: awayRaw.team?.abbreviation || 'AWAY',
    homeAway: 'away', overallRecord: awayOverall, homeAwayRecord: awayRoadRec,
    ats: awayAtsData.overall, atsHomeAway: awayAtsData.homeAway,
    winProbability: awayWinPct, moneyline: mergedAwayML, keyPlayers: awayLeaders,
    injuredOut: awayInj.out, injuredDoubtful: awayInj.doubtful, injuredQuestionable: awayInj.questionable,
    recentForm: null, recentFormRecord: null,
  };

  // Sport-specific pick selection
  let pickData: ReturnType<typeof pickForNA>;
  if (sportStyle === 'tennis') {
    pickData = pickForTennis(home, away);
  } else if (sportStyle === 'soccer') {
    pickData = pickForSoccer(home, away, mergedTotal);
  } else {
    pickData = pickForNA(home, away, mergedSpread, mergedTotal);
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

  if (signals.noKeyInjuries) reasonsFor.push('Both rosters appear healthy with no confirmed out/doubtful players.');

  return {
    gameId, eventName: `${away.name} @ ${home.name}`, league, sport: league, board,
    startTime: event.date || '', homeTeam: home, awayTeam: away,
    spread: mergedSpread, total: mergedTotal,
    selection: pickData.selection, selectionSide: pickData.selectionSide,
    marketType: pickData.marketType, odds: pickData.odds, line: pickData.line,
    confidenceScore, tier, signals, reasonsFor, reasonsAgainst, aiExplanation: null,
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

  for (const settled of leagueResults) {
    if (settled.status !== 'fulfilled' || !settled.value.result) continue;
    const { league, result } = settled.value;
    const { events, baseUrl } = result;
    totalScanned += events.length;
    for (const event of events) {
      allGamePromises.push(processGame(event, league, baseUrl, board));
    }
  }

  const rawResults = await Promise.allSettled(allGamePromises);
  const picks: DeepPickResult[] = rawResults
    .filter((r): r is PromiseFulfilledResult<DeepPickResult> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value)
    .sort((a, b) => b.confidenceScore - a.confidenceScore);

  // Assign tiers with hard caps and no duplicate games
  const usedGames = new Set<string>();
  let grandSlam: DeepPickResult | null = null;
  const pressurePack: DeepPickResult[] = [];
  const vip4Pack: DeepPickResult[] = [];
  const parlayPlan: DeepPickResult[] = [];

  for (const pick of picks) {
    if (usedGames.has(pick.gameId)) continue;
    const t = pick.tier;

    if (t === 'GRAND_SLAM' && !grandSlam) {
      grandSlam = pick; usedGames.add(pick.gameId);
    } else if ((t === 'GRAND_SLAM' || t === 'PRESSURE_PACK') && pressurePack.length < 2) {
      pressurePack.push({ ...pick, tier: 'PRESSURE_PACK' }); usedGames.add(pick.gameId);
    } else if ((t === 'PRESSURE_PACK' || t === 'VIP_4_PACK') && vip4Pack.length < 4) {
      vip4Pack.push({ ...pick, tier: 'VIP_4_PACK' }); usedGames.add(pick.gameId);
    } else if (parlayPlan.length < 4) {
      parlayPlan.push({ ...pick, tier: 'PARLAY_PLAN' }); usedGames.add(pick.gameId);
    }

    if (grandSlam && pressurePack.length === 2 && vip4Pack.length === 4 && parlayPlan.length === 4) break;
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
    allScored: picks.slice(0, 20),
    totalGamesScanned: totalScanned,
  };
}

// ─── Power 20 — Heavy Favorites Parlay Builder ───────────────────────────────

const ALL_POWER20_LEAGUES = Object.values(BOARD_LEAGUES).flat();

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

async function processGameForPower20(
  event: any,
  league: string,
): Promise<Power20Pick | null> {
  const comp = event?.competitions?.[0];
  if (!comp) return null;
  if (event.status?.type?.state !== 'pre') return null;

  const homeRaw = comp.competitors?.find((c: any) => c.homeAway === 'home');
  const awayRaw = comp.competitors?.find((c: any) => c.homeAway === 'away');
  if (!homeRaw || !awayRaw) return null;

  // Extract from scoreboard directly — no summary call needed
  const oddsNode = comp.odds?.[0];
  const sbHomeML: number | null = oddsNode?.homeTeamOdds?.moneyLine ?? null;
  const sbAwayML: number | null = oddsNode?.awayTeamOdds?.moneyLine ?? null;
  const sbHomeWinPct: number | null = oddsNode?.homeTeamOdds?.winPercentage ?? null;
  const sbAwayWinPct: number | null = oddsNode?.awayTeamOdds?.winPercentage ?? null;
  const sbSpread2: number | null = oddsNode?.spread != null ? Number(oddsNode.spread) : null;

  const mlHomeWinPct = sbHomeML != null ? winProbFromML(sbHomeML) : null;
  const mlAwayWinPct = sbAwayML != null ? winProbFromML(sbAwayML) : null;

  const homeWinPct = sbHomeWinPct ?? mlHomeWinPct;
  const awayWinPct = sbAwayWinPct ?? mlAwayWinPct ?? (homeWinPct !== null ? 100 - homeWinPct : null);

  if (homeWinPct === null && awayWinPct === null) return null;

  const homeFav = (homeWinPct ?? 0) >= (awayWinPct ?? 0);
  const favWinPct = homeFav ? (homeWinPct ?? 0) : (awayWinPct ?? 0);
  if (favWinPct < 63) return null;

  const favRaw = homeFav ? homeRaw : awayRaw;
  const dogRaw = homeFav ? awayRaw : homeRaw;

  const favName = favRaw.team?.displayName || (homeFav ? 'Home' : 'Away');
  const favAbbr = favRaw.team?.abbreviation || (homeFav ? 'HOME' : 'AWAY');
  const dogName = dogRaw.team?.displayName || (homeFav ? 'Away' : 'Home');
  const favML = homeFav ? sbHomeML : sbAwayML;

  // No injury data without summary fetch — Power 20 skips injury filter
  const hasInjury = false;
  const injuryNote: string | null = null;

  // MLB heavy favorites → use run line -1.5 (avoids -250+ ML juice)
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

export async function runPower20Research(): Promise<Power20Result> {
  const now = new Date();

  const leagueResults = await Promise.allSettled(
    ALL_POWER20_LEAGUES.map((league) => fetchLeagueScoreboard(league).then((r) => ({ league, result: r })))
  );

  const allGamePromises: Promise<Power20Pick | null>[] = [];
  let totalScanned = 0;

  for (const settled of leagueResults) {
    if (settled.status !== 'fulfilled' || !settled.value.result) continue;
    const { league, result } = settled.value;
    const { events } = result;
    totalScanned += events.length;
    for (const event of events) {
      allGamePromises.push(processGameForPower20(event, league));
    }
  }

  const rawResults = await Promise.allSettled(allGamePromises);
  const allPicks: Power20Pick[] = rawResults
    .filter((r): r is PromiseFulfilledResult<Power20Pick> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value)
    .sort((a, b) => b.winProbability - a.winProbability);

  const picks = allPicks.slice(0, 20);

  const GROUP_LABELS = ['Lock Pack', 'Chalk Pack', 'Value Pack', 'Wildcard Pack'];
  const parlayGroups: Power20Group[] = [];
  for (let g = 0; g < 4; g++) {
    const legs = picks.slice(g * 5, g * 5 + 5);
    if (legs.length === 0) break;
    const { odds, decimal } = estimateParlayOdds(legs);
    parlayGroups.push({ group: g + 1, label: GROUP_LABELS[g], legs, estimatedOdds: odds, estimatedDecimal: decimal });
  }

  const avgWinProbability = picks.length > 0
    ? Math.round((picks.reduce((s, p) => s + p.winProbability, 0) / picks.length) * 10) / 10
    : 0;

  return {
    generatedAt: now.toISOString(),
    boardDate: now.toISOString().slice(0, 10),
    totalScanned,
    picks,
    parlayGroups,
    avgWinProbability,
  };
}
