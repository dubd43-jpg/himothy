import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { LEAGUE_URLS } from '@/lib/validation';
import { hasDatabase } from '@/lib/hasDatabase';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import {
  clampToOfficialStartDate,
  getEtDateKey,
  getOfficialBoardDate,
  OFFICIAL_TRACKING_START_DATE,
} from '@/lib/officialTracking';
import { logPickEvent } from '@/services/pickAuditLog';

export type RegistryStatus = 'draft' | 'validated' | 'published' | 'locked' | 'graded' | 'archived';
export type RegistryResult = 'pending' | 'win' | 'loss' | 'push' | 'void';

export interface RegistryPickInput {
  boardDate?: string;
  category: string;
  productLine: string;
  sport: string;
  league: string;
  eventId?: string | null;
  eventName: string;
  homeTeam?: string | null;
  awayTeam?: string | null;
  marketType: string;
  selection: string;
  line?: string | null;
  odds?: string | null;
  sportsbook?: string | null;
  confidenceTier?: string | null;
  reasoningSummary?: string | null;
  riskSummary?: string | null;
  researchPayload?: Record<string, unknown> | null;
  edgeScore?: number | null;
  edgeSignals?: Record<string, unknown> | null;
  marketOpenOdds?: string | null;
  projectedClosingOdds?: string | null;
  clvAtPublish?: number | null;
  isMainPick?: boolean;
  mainPickReason?: string | null;
  status?: RegistryStatus;
  isPublic?: boolean;
  // Capture-at-publish (Tier 1 — irreplaceable after the game starts):
  bestOddsAtPublish?: number | null;
  bestBookAtPublish?: string | null;
  fairProbAtPublish?: number | null;
  valueEdgeAtPublish?: number | null;
  bookCount?: number | null;
  sharpPct?: number | null;
  publicPct?: number | null;
  restDiffDays?: number | null;
  weatherJson?: Record<string, unknown> | null;
  starterHome?: string | null;
  starterAway?: string | null;
  oddsBucket?: string | null;
  // Parlay ticket grouping:
  parlayTicketId?: string | null;
  parlayLegPosition?: number | null;
  parlayLegCount?: number | null;
  parlayEstimatedOdds?: string | null;
  sgpTheme?: string | null;
  // Recovery-only: allow recording into a board that's already finalized. Used when we
  // recover a genuinely-published pick from the immutable frozen slate that never made it
  // into the registry (the daily board was finalized before the missing pick was added).
  allowFinalized?: boolean;
}

export interface RegistryPickRow {
  id: string;
  boardDate: string;
  publishTime: string | null;
  lockTime: string | null;
  status: RegistryStatus;
  result: RegistryResult;
  category: string;
  productLine: string;
  sport: string;
  league: string;
  eventId: string | null;
  eventName: string;
  homeTeam: string | null;
  awayTeam: string | null;
  marketType: string;
  selection: string;
  line: string | null;
  odds: string | null;
  sportsbook: string | null;
  confidenceTier: string | null;
  reasoningSummary: string | null;
  riskSummary: string | null;
  researchPayload: Record<string, unknown> | null;
  edgeScore: number | null;
  edgeSignals: Record<string, unknown> | null;
  marketOpenOdds: string | null;
  projectedClosingOdds: string | null;
  clvAtPublish: number | null;
  closingOdds: string | null;
  clvDelta: number | null;
  isMainPick: boolean;
  mainPickReason: string | null;
  createdAt: string;
  updatedAt: string;
  gradedAt: string | null;
  resultChangedAt: string | null;
  countedInDailyTotals: boolean;
  countedInLifetimeTotals: boolean;
  isPublic: boolean;
  isLocked: boolean;
  version: number;
  replacedById: string | null;
  // Parlay ticket tracking — null for single bets. Same ticket id across every leg of
  // one parlay so ticket-level aggregation can find them. parlayEstimatedOdds carries
  // the combined parlay payout (in American odds string form) so unit calc works for
  // the whole ticket as one bet.
  parlayTicketId: string | null;
  parlayLegPosition: number | null;
  parlayLegCount: number | null;
  parlayEstimatedOdds: string | null;
}

let schemaReady = false;

function boardDateKey(date = new Date()) {
  return getEtDateKey(date);
}

function toLeagueDate(boardDate: string) {
  return boardDate.replace(/-/g, '');
}

function parseNumeric(input?: string | null) {
  if (!input) return NaN;
  const n = Number.parseFloat(String(input).replace(/[+]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

// Convert American odds string ("-110", "+125") to decimal odds. Used to compare two
// offers and decide which is BETTER for the bettor (higher decimal = bigger payout =
// better). Returns null on parse failure.
function americanToDecimal(odds?: string | null): number | null {
  if (!odds) return null;
  const m = String(odds).match(/[+-]?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number.parseFloat(m[0]);
  if (!Number.isFinite(n) || n === 0) return null;
  if (n > 0) return 1 + n / 100;
  return 1 + 100 / Math.abs(n);
}

// LINE-UPDATE FREEZE — PER LEAGUE. User's rule: lines on a given league can update up
// to 15 min BEFORE the first game of THAT LEAGUE starts. Once the first NBA game tips
// off, no more NBA line changes for the day — but NHL can still update until its first
// faceoff. Only applies to North American leagues; international markets (soccer,
// tennis, cricket, etc.) follow their own slate-freeze rules and aren't covered here.
const LINE_LOCK_BEFORE_FIRST_GAME_MS = 15 * 60 * 1000;
const NORTH_AMERICAN_LEAGUES = new Set([
  'NFL', 'NBA', 'NHL', 'MLB', 'WNBA',
  'College Football', 'NCAA Football', 'NCAA Basketball', 'NCAA Baseball', 'NCAAB', 'NCAAF',
]);

async function getLineUpdateCutoff(boardDate: string, league?: string): Promise<Date | null> {
  if (!hasDatabase()) return null;
  // Non-NA leagues aren't covered by this rule.
  if (league && !NORTH_AMERICAN_LEAGUES.has(league)) return null;
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "data" FROM "DailySlateCache" WHERE "etDate" = $1 AND "board" = 'north-american' LIMIT 1`,
      boardDate.replace(/-/g, ''),
    );
    const slate = rows[0]?.data;
    if (!slate) return null;
    const allPicks: any[] = [];
    if (slate.grandSlam) allPicks.push(slate.grandSlam);
    for (const k of ['pressurePack', 'vip4Pack', 'parlayPlan', 'marquee', 'asleepPicks', 'nrfi']) {
      for (const p of slate[k] || []) allPicks.push(p);
    }
    // Find earliest startTime among picks in the SAME league. If no league passed,
    // bail (caller didn't ask league-specific) — fall back to a per-league answer the
    // caller must request explicitly.
    if (!league) return null;
    let earliest: number | null = null;
    for (const p of allPicks) {
      if (p?.league !== league) continue;
      if (!p?.startTime) continue;
      const t = new Date(p.startTime).getTime();
      if (!Number.isFinite(t)) continue;
      if (earliest == null || t < earliest) earliest = t;
    }
    if (earliest == null) return null;
    return new Date(earliest - LINE_LOCK_BEFORE_FIRST_GAME_MS);
  } catch (err) {
    console.error('[pickRegistry] getLineUpdateCutoff failed', err);
    return null;
  }
}

// Convenience export so the UI can show "lines lock at X" notice per league.
export async function getLineLockInfo(league: string): Promise<{ cutoff: Date | null; locked: boolean }> {
  const date = getOfficialBoardDate();
  const cutoff = await getLineUpdateCutoff(date, league);
  if (!cutoff) return { cutoff: null, locked: false };
  return { cutoff, locked: Date.now() > cutoff.getTime() };
}

function clampStatus(status?: string): RegistryStatus {
  const allowed: RegistryStatus[] = ['draft', 'validated', 'published', 'locked', 'graded', 'archived'];
  return allowed.includes(status as RegistryStatus) ? (status as RegistryStatus) : 'draft';
}

function clampResult(result?: string): RegistryResult {
  const allowed: RegistryResult[] = ['pending', 'win', 'loss', 'push', 'void'];
  return allowed.includes(result as RegistryResult) ? (result as RegistryResult) : 'pending';
}

function formatRow(row: any): RegistryPickRow {
  return {
    id: row.id,
    boardDate: new Date(row.board_date).toISOString().slice(0, 10),
    publishTime: row.publish_time ? new Date(row.publish_time).toISOString() : null,
    lockTime: row.lock_time ? new Date(row.lock_time).toISOString() : null,
    status: clampStatus(row.status),
    result: clampResult(row.result),
    category: row.category,
    productLine: row.product_line,
    sport: row.sport,
    league: row.league,
    eventId: row.event_id,
    eventName: row.event_name,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    marketType: row.market_type,
    selection: row.selection,
    line: row.line,
    odds: row.odds,
    sportsbook: row.sportsbook,
    confidenceTier: row.confidence_tier,
    reasoningSummary: row.reasoning_summary,
    riskSummary: row.risk_summary,
    researchPayload: row.research_payload,
    edgeScore: row.edge_score == null ? null : Number(row.edge_score),
    edgeSignals: row.edge_signals,
    marketOpenOdds: row.market_open_odds,
    projectedClosingOdds: row.projected_closing_odds,
    clvAtPublish: row.clv_at_publish == null ? null : Number(row.clv_at_publish),
    closingOdds: row.closing_odds,
    clvDelta: row.clv_delta == null ? null : Number(row.clv_delta),
    isMainPick: Boolean(row.is_main_pick),
    mainPickReason: row.main_pick_reason,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    gradedAt: row.graded_at ? new Date(row.graded_at).toISOString() : null,
    resultChangedAt: row.result_changed_at ? new Date(row.result_changed_at).toISOString() : null,
    countedInDailyTotals: Boolean(row.counted_in_daily_totals),
    countedInLifetimeTotals: Boolean(row.counted_in_lifetime_totals),
    isPublic: Boolean(row.is_public),
    isLocked: Boolean(row.is_locked),
    version: Number(row.version || 1),
    replacedById: row.replaced_by_id,
    parlayTicketId: row.parlay_ticket_id ?? null,
    parlayLegPosition: row.parlay_leg_position == null ? null : Number(row.parlay_leg_position),
    parlayLegCount: row.parlay_leg_count == null ? null : Number(row.parlay_leg_count),
    parlayEstimatedOdds: row.parlay_estimated_odds ?? null,
  };
}

async function ensureRegistrySchema() {
  if (schemaReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS himothy_pick_registry (
      id TEXT PRIMARY KEY,
      board_date DATE NOT NULL,
      publish_time TIMESTAMPTZ,
      lock_time TIMESTAMPTZ,
      status TEXT NOT NULL CHECK (status IN ('draft','validated','published','locked','graded','archived')),
      result TEXT NOT NULL DEFAULT 'pending' CHECK (result IN ('pending','win','loss','push','void')),
      category TEXT NOT NULL,
      product_line TEXT NOT NULL,
      sport TEXT NOT NULL,
      league TEXT NOT NULL,
      event_id TEXT,
      event_name TEXT NOT NULL,
      home_team TEXT,
      away_team TEXT,
      market_type TEXT NOT NULL,
      selection TEXT NOT NULL,
      line TEXT,
      odds TEXT,
      sportsbook TEXT,
      confidence_tier TEXT,
      reasoning_summary TEXT,
      risk_summary TEXT,
      research_payload JSONB,
      edge_score NUMERIC,
      edge_signals JSONB,
      market_open_odds TEXT,
      projected_closing_odds TEXT,
      clv_at_publish NUMERIC,
      closing_odds TEXT,
      clv_delta NUMERIC,
      is_main_pick BOOLEAN NOT NULL DEFAULT FALSE,
      main_pick_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      graded_at TIMESTAMPTZ,
      is_public BOOLEAN NOT NULL DEFAULT TRUE,
      is_locked BOOLEAN NOT NULL DEFAULT FALSE,
      result_changed_at TIMESTAMPTZ,
      counted_in_daily_totals BOOLEAN NOT NULL DEFAULT FALSE,
      counted_in_lifetime_totals BOOLEAN NOT NULL DEFAULT FALSE,
      version INTEGER NOT NULL DEFAULT 1,
      replaced_by_id TEXT,
      source_tag TEXT NOT NULL DEFAULT 'registry'
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_himo_registry_board_date ON himothy_pick_registry(board_date);
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_himo_registry_status ON himothy_pick_registry(status);
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_himo_registry_category ON himothy_pick_registry(category);
  `);

  // Ensure additive upgrades on existing deployments.
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS risk_summary TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS edge_score NUMERIC;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS edge_signals JSONB;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS market_open_odds TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS projected_closing_odds TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS clv_at_publish NUMERIC;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS closing_odds TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS clv_delta NUMERIC;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS is_main_pick BOOLEAN NOT NULL DEFAULT FALSE;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS main_pick_reason TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS result_changed_at TIMESTAMPTZ;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS counted_in_daily_totals BOOLEAN NOT NULL DEFAULT FALSE;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS counted_in_lifetime_totals BOOLEAN NOT NULL DEFAULT FALSE;`);

  // Capture-at-publish columns — data we can never recover after the game starts.
  // Powers CLV analysis, line-shopping proof, value edge measurement, and context mining.
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS best_odds_at_publish NUMERIC;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS best_book_at_publish TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS fair_prob_at_publish NUMERIC;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS value_edge_at_publish NUMERIC;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS book_count INTEGER;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS sharp_pct NUMERIC;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS public_pct NUMERIC;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS rest_diff_days NUMERIC;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS weather_json JSONB;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS starter_home TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS starter_away TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS odds_bucket TEXT;`);
  // Compute-at-grade columns — diagnostics from the real final score.
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS cover_margin NUMERIC;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS final_home_score INTEGER;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS final_away_score INTEGER;`);
  // Parlay ticket grouping — so legs can be rolled up by ticket id + leg position.
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS parlay_ticket_id TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS parlay_leg_position INTEGER;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS parlay_leg_count INTEGER;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS parlay_estimated_odds TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE himothy_pick_registry ADD COLUMN IF NOT EXISTS sgp_theme TEXT;`);

  // ONE-TIME REPAIR (idempotent): the old recorder used a non-word-boundary substring
  // check for "over"/"under" in the selection text. Teams like "Thunder" contain the
  // substring "under" and got misclassified as totals — leading to bogus grades.
  // This UPDATE re-flags misclassified rows as spreads, extracts the signed line from
  // the selection, and resets them to pending so the corrected grader can settle them.
  await prisma.$executeRawUnsafe(`
    UPDATE himothy_pick_registry
    SET market_type = 'spread',
        line = COALESCE(substring(selection FROM '([+-]\\d+(?:\\.\\d+)?)\\s*$'), line),
        result = 'pending',
        status = 'published',
        graded_at = NULL,
        is_locked = FALSE,
        counted_in_daily_totals = FALSE,
        counted_in_lifetime_totals = FALSE,
        lock_time = NULL,
        updated_at = NOW()
    WHERE market_type = 'total'
      AND selection !~* '\\yover\\y'
      AND selection !~* '\\yunder\\y'
      AND selection ~ '[+-]\\d+(?:\\.\\d+)?\\s*$';
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS himothy_daily_board_records (
      board_date DATE PRIMARY KEY,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      pushes INTEGER NOT NULL DEFAULT 0,
      voids INTEGER NOT NULL DEFAULT 0,
      pending_count INTEGER NOT NULL DEFAULT 0,
      total_published INTEGER NOT NULL DEFAULT 0,
      total_settled INTEGER NOT NULL DEFAULT 0,
      main_pick_record TEXT,
      core_record TEXT,
      parlay_record TEXT,
      sport_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
      finalized BOOLEAN NOT NULL DEFAULT FALSE,
      finalized_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS himothy_lifetime_stats (
      id TEXT PRIMARY KEY,
      official_start_date DATE NOT NULL,
      total_wins INTEGER NOT NULL DEFAULT 0,
      total_losses INTEGER NOT NULL DEFAULT 0,
      total_pushes INTEGER NOT NULL DEFAULT 0,
      total_voids INTEGER NOT NULL DEFAULT 0,
      total_published INTEGER NOT NULL DEFAULT 0,
      total_settled INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO himothy_lifetime_stats (id, official_start_date)
      VALUES ('official', $1::date)
      ON CONFLICT (id) DO UPDATE
      SET official_start_date = EXCLUDED.official_start_date
      WHERE himothy_lifetime_stats.official_start_date <> EXCLUDED.official_start_date
    `,
    OFFICIAL_TRACKING_START_DATE
  );

  schemaReady = true;
}

type DailyBoardAggregate = {
  boardDate: string;
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  pendingCount: number;
  totalPublished: number;
  totalSettled: number;
  mainPickRecord: string;
  coreRecord: string;
  parlayRecord: string;
  sportBreakdown: Record<string, { wins: number; losses: number; pushes: number; voids: number; pending: number }>;
};

function toRecordString(wins: number, losses: number, pushes: number) {
  if (pushes > 0) return `${wins}-${losses}-${pushes}`;
  return `${wins}-${losses}`;
}

function computeRecord(rows: RegistryPickRow[]) {
  const wins = rows.filter((p) => p.result === 'win').length;
  const losses = rows.filter((p) => p.result === 'loss').length;
  const pushes = rows.filter((p) => p.result === 'push').length;
  return toRecordString(wins, losses, pushes);
}

function isCoreProductLine(productLine: string) {
  const normalized = productLine.toLowerCase();
  return (
    normalized.includes('grand slam') ||
    normalized.includes('pressure') ||
    normalized.includes('vip') ||
    normalized.includes('himothy core') ||
    normalized.includes('personal')
  );
}

function isParlayProductLine(productLine: string) {
  const normalized = productLine.toLowerCase();
  return normalized.includes('parlay') || normalized.includes('hailmary');
}

// Convert a list of registry rows (mix of single bets + parlay legs) into a list of
// "bet results" where each parlay TICKET counts as ONE bet. A 4-leg parlay where 3
// legs hit and 1 loses is ONE loss, not 3 wins and 1 loss. Used by every stat
// aggregation so customers never see leg-level numbers misrepresented as bet counts.
//
// Single bets pass through unchanged. Parlay legs are grouped by parlayTicketId (or
// boardDate+productLine as a fallback when ticket id is missing on legacy rows) and
// reduced to one result per ticket using the all-or-nothing rule.
export interface BetResult {
  result: 'win' | 'loss' | 'push' | 'void' | 'pending';
  odds: string | null;       // for unit calc — combined parlay odds when applicable
  boardDate: string;
  gradedAt: string | null;
  productLine: string;
  isParlay: boolean;
  legCount: number;          // 1 for singles, N for parlay tickets
}

export function aggregateToBetResults(picks: RegistryPickRow[]): BetResult[] {
  const singles: BetResult[] = [];
  const parlayByTicket = new Map<string, RegistryPickRow[]>();

  for (const p of picks) {
    if (isParlayProductLine(p.productLine)) {
      const id = p.parlayTicketId || `${p.boardDate}|${p.productLine}`;
      const arr = parlayByTicket.get(id);
      if (arr) arr.push(p);
      else parlayByTicket.set(id, [p]);
    } else {
      singles.push({
        result: p.result,
        odds: p.odds ?? null,
        boardDate: String(p.boardDate || ''),
        gradedAt: p.gradedAt ? String(p.gradedAt) : null,
        productLine: p.productLine,
        isParlay: false,
        legCount: 1,
      });
    }
  }

  const tickets: BetResult[] = [];
  for (const legs of Array.from(parlayByTicket.values())) {
    let anyLost = false; let allWon = true; let anyPending = false; let anyVoid = false;
    for (const l of legs) {
      if (l.result === 'loss') { anyLost = true; allWon = false; }
      else if (l.result === 'pending') { anyPending = true; allWon = false; }
      else if (l.result === 'void') { anyVoid = true; }
      else if (l.result !== 'win') { allWon = false; }
    }
    const result: BetResult['result'] =
      anyLost ? 'loss'
      : anyPending ? 'pending'
      : allWon ? 'win'
      : anyVoid && legs.every((l) => l.result === 'void') ? 'void'
      : 'push';
    // Use the latest gradedAt across legs for time ordering of the ticket.
    const gradedAt = legs.reduce<string | null>((latest, l) => {
      if (!l.gradedAt) return latest;
      if (!latest) return String(l.gradedAt);
      return new Date(l.gradedAt) > new Date(latest) ? String(l.gradedAt) : latest;
    }, null);
    tickets.push({
      result,
      odds: legs[0]?.parlayEstimatedOdds ?? null,
      boardDate: String(legs[0]?.boardDate || ''),
      gradedAt,
      productLine: legs[0]?.productLine || 'Parlay',
      isParlay: true,
      legCount: legs.length,
    });
  }

  return [...singles, ...tickets];
}

function toDailyAggregate(boardDate: string, rows: RegistryPickRow[]): DailyBoardAggregate {
  const wins = rows.filter((p) => p.result === 'win').length;
  const losses = rows.filter((p) => p.result === 'loss').length;
  const pushes = rows.filter((p) => p.result === 'push').length;
  const voids = rows.filter((p) => p.result === 'void').length;
  const pendingCount = rows.filter((p) => p.result === 'pending').length;
  const totalPublished = rows.length;
  const totalSettled = wins + losses + pushes + voids;
  const mainRows = rows.filter((p) => p.isMainPick);
  const coreRows = rows.filter((p) => isCoreProductLine(p.productLine));
  // Parlay record at TICKET level: collapse all legs of a ticket into one bet result so
  // a 4-leg parlay where 3 hit + 1 lost counts as a single TICKET LOSS (not "3W 1L").
  const parlayBets = aggregateToBetResults(rows.filter((p) => isParlayProductLine(p.productLine)));
  const parlayTicketWins = parlayBets.filter((b) => b.result === 'win').length;
  const parlayTicketLosses = parlayBets.filter((b) => b.result === 'loss').length;
  const parlayTicketPushes = parlayBets.filter((b) => b.result === 'push').length;

  const sportBreakdown: Record<string, { wins: number; losses: number; pushes: number; voids: number; pending: number }> = {};
  for (const row of rows) {
    const sport = row.sport || 'unknown';
    if (!sportBreakdown[sport]) {
      sportBreakdown[sport] = { wins: 0, losses: 0, pushes: 0, voids: 0, pending: 0 };
    }
    if (row.result === 'win') sportBreakdown[sport].wins += 1;
    else if (row.result === 'loss') sportBreakdown[sport].losses += 1;
    else if (row.result === 'push') sportBreakdown[sport].pushes += 1;
    else if (row.result === 'void') sportBreakdown[sport].voids += 1;
    else sportBreakdown[sport].pending += 1;
  }

  return {
    boardDate,
    wins,
    losses,
    pushes,
    voids,
    pendingCount,
    totalPublished,
    totalSettled,
    mainPickRecord: computeRecord(mainRows),
    coreRecord: computeRecord(coreRows),
    parlayRecord: toRecordString(parlayTicketWins, parlayTicketLosses, parlayTicketPushes),
    sportBreakdown,
  };
}

async function syncBoardRecord(boardDate: string) {
  const effectiveBoardDate = getOfficialBoardDate(boardDate);
  const rows = await getRegistryBoardPicks({ boardDate: effectiveBoardDate, includePrivate: false });
  const aggregate = toDailyAggregate(effectiveBoardDate, rows);

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO himothy_daily_board_records (
        board_date, wins, losses, pushes, voids, pending_count, total_published, total_settled,
        main_pick_record, core_record, parlay_record, sport_breakdown, finalized, finalized_at, updated_at
      ) VALUES (
        $1::date, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12::jsonb, FALSE, NULL, NOW()
      )
      ON CONFLICT (board_date) DO UPDATE
      SET wins = EXCLUDED.wins,
          losses = EXCLUDED.losses,
          pushes = EXCLUDED.pushes,
          voids = EXCLUDED.voids,
          pending_count = EXCLUDED.pending_count,
          total_published = EXCLUDED.total_published,
          total_settled = EXCLUDED.total_settled,
          main_pick_record = EXCLUDED.main_pick_record,
          core_record = EXCLUDED.core_record,
          parlay_record = EXCLUDED.parlay_record,
          sport_breakdown = EXCLUDED.sport_breakdown,
          finalized = CASE
            WHEN EXCLUDED.pending_count = 0 AND EXCLUDED.total_published > 0 THEN TRUE
            ELSE himothy_daily_board_records.finalized
          END,
          finalized_at = CASE
            WHEN EXCLUDED.pending_count = 0 AND EXCLUDED.total_published > 0 AND himothy_daily_board_records.finalized_at IS NULL THEN NOW()
            ELSE himothy_daily_board_records.finalized_at
          END,
          updated_at = NOW()
    `,
    effectiveBoardDate,
    aggregate.wins,
    aggregate.losses,
    aggregate.pushes,
    aggregate.voids,
    aggregate.pendingCount,
    aggregate.totalPublished,
    aggregate.totalSettled,
    aggregate.mainPickRecord,
    aggregate.coreRecord,
    aggregate.parlayRecord,
    JSON.stringify(aggregate.sportBreakdown)
  );

  await prisma.$executeRawUnsafe(
    `
      UPDATE himothy_pick_registry
      SET counted_in_daily_totals = CASE WHEN result = 'pending' THEN FALSE ELSE TRUE END,
          counted_in_lifetime_totals = CASE WHEN result = 'pending' THEN FALSE ELSE TRUE END,
          updated_at = NOW()
      WHERE board_date = $1::date
    `,
    effectiveBoardDate
  );

  return aggregate;
}

async function syncLifetimeTotals() {
  // Bet-level lifetime totals: singles count individually, parlay tickets collapse to one
  // outcome (any leg lost → loss; else any pending → pending; else all won → win; else
  // push). Counting legs would inflate the record — a losing 20-leg ticket is ONE loss.
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      WITH bets AS (
        SELECT result
        FROM himothy_pick_registry
        WHERE board_date >= $1::date
          AND is_public = TRUE
          AND status IN ('published','locked','graded','archived')
          AND parlay_ticket_id IS NULL
        UNION ALL
        SELECT CASE
                 WHEN bool_or(result = 'loss') THEN 'loss'
                 WHEN bool_or(result = 'pending') THEN 'pending'
                 WHEN bool_and(result = 'win') THEN 'win'
                 WHEN bool_and(result = 'void') THEN 'void'
                 ELSE 'push'
               END AS result
        FROM himothy_pick_registry
        WHERE board_date >= $1::date
          AND is_public = TRUE
          AND status IN ('published','locked','graded','archived')
          AND parlay_ticket_id IS NOT NULL
        GROUP BY parlay_ticket_id
      )
      SELECT
        COUNT(*) FILTER (WHERE result = 'win')::int AS wins,
        COUNT(*) FILTER (WHERE result = 'loss')::int AS losses,
        COUNT(*) FILTER (WHERE result = 'push')::int AS pushes,
        COUNT(*) FILTER (WHERE result = 'void')::int AS voids,
        COUNT(*)::int AS total_published,
        COUNT(*) FILTER (WHERE result IN ('win','loss','push','void'))::int AS total_settled
      FROM bets
    `,
    OFFICIAL_TRACKING_START_DATE
  );

  const totals = rows[0] || {
    wins: 0,
    losses: 0,
    pushes: 0,
    voids: 0,
    total_published: 0,
    total_settled: 0,
  };

  await prisma.$executeRawUnsafe(
    `
      UPDATE himothy_lifetime_stats
      SET total_wins = $1,
          total_losses = $2,
          total_pushes = $3,
          total_voids = $4,
          total_published = $5,
          total_settled = $6,
          updated_at = NOW()
      WHERE id = 'official'
    `,
    totals.wins,
    totals.losses,
    totals.pushes,
    totals.voids,
    totals.total_published,
    totals.total_settled
  );

  return {
    totalWins: Number(totals.wins || 0),
    totalLosses: Number(totals.losses || 0),
    totalPushes: Number(totals.pushes || 0),
    totalVoids: Number(totals.voids || 0),
    totalPublished: Number(totals.total_published || 0),
    totalSettled: Number(totals.total_settled || 0),
    officialStartDate: OFFICIAL_TRACKING_START_DATE,
  };
}

export async function publishRegistryPick(input: RegistryPickInput) {
  await ensureRegistrySchema();

  const status = input.status || 'published';
  const isLocked = status === 'locked' || status === 'graded' || status === 'archived';
  const now = new Date().toISOString();
  const boardDate = getOfficialBoardDate(input.boardDate);
  const id = randomUUID();

  const dailyRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT finalized FROM himothy_daily_board_records WHERE board_date = $1::date LIMIT 1`,
    boardDate
  );
  if (dailyRows[0]?.finalized === true && !input.allowFinalized) {
    throw new Error(`Publish blocked: board ${boardDate} is finalized and immutable.`);
  }

  // Dedup on the SAME bet for the day: same market + selection on the same game. We match
  // the game by event_id FIRST (reliable) and fall back to event_name — because the same
  // game can be recorded with slightly different name strings ("Rockies at Dodgers" vs
  // "Rockies @ Dodgers"), and name-only matching let an identical pick get logged twice under
  // two categories (the duplicate the archive showed). event_id closes that hole.
  const duplicateRows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT id, odds, line, sportsbook
      FROM himothy_pick_registry
      WHERE board_date = $1::date
        AND status IN ('published','locked','graded','archived')
        AND lower(market_type) = lower($3)
        AND lower(selection) = lower($4)
        AND ( ($5 <> '' AND event_id = $5) OR lower(event_name) = lower($2) )
      LIMIT 1
    `,
    boardDate,
    input.eventName,
    input.marketType,
    input.selection,
    String(input.eventId || '')
  );
  if (duplicateRows[0]?.id) {
    // Pick already exists. Check if the new offer has BETTER odds — if so, update the
    // row + log a LINE_UPDATED audit event. "Better" = higher decimal-odds value (less
    // juice on negatives, longer payouts on positives). Same/worse = skip.
    const existing = duplicateRows[0];
    const oldDecimal = americanToDecimal(existing.odds);
    const newDecimal = americanToDecimal(input.odds);
    const improvedEnough = oldDecimal != null && newDecimal != null && newDecimal > oldDecimal * 1.01;
    // Per-league line lock: once the first game of THIS league starts, no more updates
    // for that league. NBA picks freeze when first NBA game tips, NFL freezes when first
    // NFL game starts, etc. Non-NA leagues (soccer, tennis, etc.) skip this check.
    const lockCutoff = await getLineUpdateCutoff(boardDate, input.league);
    const linesLocked = lockCutoff != null && Date.now() > lockCutoff.getTime();
    if (improvedEnough && !linesLocked) {
      await prisma.$executeRawUnsafe(
        `UPDATE himothy_pick_registry
            SET odds = $1, sportsbook = COALESCE($2, sportsbook), line = COALESCE($3, line),
                updated_at = NOW()
          WHERE id = $4`,
        input.odds || existing.odds,
        input.sportsbook || existing.sportsbook,
        input.line || existing.line,
        existing.id,
      );
      try {
        const { logPickEvent } = await import('@/services/pickAuditLog');
        await logPickEvent({
          event: 'LINE_UPDATED',
          boardDate,
          pickKey: `${input.eventId || existing.id}|${input.selection}`,
          gameId: input.eventId || undefined,
          category: input.category,
          selection: input.selection,
          line: input.line || existing.line || undefined,
          odds: input.odds || existing.odds || undefined,
          status: 'published',
          notes: `Line update: ${existing.odds} → ${input.odds}${input.sportsbook && input.sportsbook !== existing.sportsbook ? ` (book ${existing.sportsbook} → ${input.sportsbook})` : ''}`,
          details: {
            oldOdds: existing.odds, newOdds: input.odds,
            oldDecimal, newDecimal,
            oldBook: existing.sportsbook, newBook: input.sportsbook,
            registryId: existing.id,
          },
        });
      } catch { /* audit failure must not break the update */ }
      // Treat as "duplicate" so caller knows we didn't insert — but we DID upgrade.
      throw new Error(`Duplicate pick blocked: existing registry id ${existing.id} (line updated)`);
    }
    throw new Error(`Duplicate pick blocked: existing registry id ${existing.id}`);
  }

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO himothy_pick_registry (
        id, board_date, publish_time, lock_time, status, result, category, product_line, sport, league, event_id,
        event_name, home_team, away_team, market_type, selection, line, odds, sportsbook, confidence_tier,
        reasoning_summary, risk_summary, research_payload, edge_score, edge_signals, market_open_odds,
        projected_closing_odds, clv_at_publish, is_main_pick, main_pick_reason,
        graded_at, is_public, is_locked, result_changed_at, counted_in_daily_totals, counted_in_lifetime_totals,
        version, replaced_by_id, source_tag, updated_at
      ) VALUES (
        $1, $2::date, $3::timestamptz, $4::timestamptz, $5, 'pending', $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22::jsonb, $23, $24::jsonb, $25,
        $26, $27, $28, $29, NULL, $30, $31, NULL, FALSE, FALSE, 1, NULL, 'registry', $32::timestamptz
      )
    `,
    id,
    boardDate,
    status === 'published' || status === 'locked' || status === 'graded' || status === 'archived' ? now : null,
    isLocked ? now : null,
    status,
    input.category,
    input.productLine,
    input.sport,
    input.league,
    input.eventId || null,
    input.eventName,
    input.homeTeam || null,
    input.awayTeam || null,
    input.marketType,
    input.selection,
    input.line || null,
    input.odds || null,
    input.sportsbook || null,
    input.confidenceTier || null,
    input.reasoningSummary || null,
    input.riskSummary || null,
    JSON.stringify(input.researchPayload || {}),
    input.edgeScore == null ? null : Number(input.edgeScore),
    JSON.stringify(input.edgeSignals || {}),
    input.marketOpenOdds || null,
    input.projectedClosingOdds || null,
    input.clvAtPublish == null ? null : Number(input.clvAtPublish),
    input.isMainPick === true,
    input.mainPickReason || null,
    input.isPublic !== false,
    isLocked,
    now
  );

  // Populate the Tier-1 capture-at-publish columns via a follow-up UPDATE — keeps the
  // main INSERT signature stable while we capture everything that matters at pick time.
  await prisma.$executeRawUnsafe(
    `
      UPDATE himothy_pick_registry SET
        best_odds_at_publish = $2,
        best_book_at_publish = $3,
        fair_prob_at_publish = $4,
        value_edge_at_publish = $5,
        book_count = $6,
        sharp_pct = $7,
        public_pct = $8,
        rest_diff_days = $9,
        weather_json = $10::jsonb,
        starter_home = $11,
        starter_away = $12,
        odds_bucket = $13,
        parlay_ticket_id = $14,
        parlay_leg_position = $15,
        parlay_leg_count = $16,
        parlay_estimated_odds = $17,
        sgp_theme = $18
      WHERE id = $1
    `,
    id,
    input.bestOddsAtPublish == null ? null : Number(input.bestOddsAtPublish),
    input.bestBookAtPublish || null,
    input.fairProbAtPublish == null ? null : Number(input.fairProbAtPublish),
    input.valueEdgeAtPublish == null ? null : Number(input.valueEdgeAtPublish),
    input.bookCount == null ? null : Number(input.bookCount),
    input.sharpPct == null ? null : Number(input.sharpPct),
    input.publicPct == null ? null : Number(input.publicPct),
    input.restDiffDays == null ? null : Number(input.restDiffDays),
    JSON.stringify(input.weatherJson ?? null),
    input.starterHome || null,
    input.starterAway || null,
    input.oddsBucket || null,
    input.parlayTicketId || null,
    input.parlayLegPosition == null ? null : Number(input.parlayLegPosition),
    input.parlayLegCount == null ? null : Number(input.parlayLegCount),
    input.parlayEstimatedOdds || null,
    input.sgpTheme || null
  );

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM himothy_pick_registry WHERE id = $1 LIMIT 1`,
    id
  );

  await syncBoardRecord(boardDate);
  await syncLifetimeTotals();

  return rows[0] ? formatRow(rows[0]) : null;
}

export async function getRegistryBoardPicks({
  boardDate,
  category,
  sport,
  includePrivate = false,
}: {
  boardDate?: string;
  category?: string;
  sport?: string;
  includePrivate?: boolean;
}) {
  await ensureRegistrySchema();

  const date = getOfficialBoardDate(boardDate);
  const values: any[] = [date];
  let idx = 2;
  let where = `board_date = $1::date AND status IN ('published','locked','graded','archived')`;

  if (!includePrivate) {
    where += ` AND is_public = TRUE`;
  }
  if (category) {
    where += ` AND category = $${idx++}`;
    values.push(category);
  }
  if (sport) {
    where += ` AND lower(sport) = lower($${idx++})`;
    values.push(sport);
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT *
      FROM himothy_pick_registry
      WHERE ${where}
      ORDER BY publish_time ASC NULLS LAST, created_at ASC
    `,
    ...values
  );

  return rows.map(formatRow);
}

// Wipe every recorded pick for one ET board date. Used ONLY by the admin reconcile, which
// then re-records the exact frozen slate so the official record matches what customers saw.
// Returns the number of rows removed.
export async function deleteBoardPicks(boardDate?: string): Promise<number> {
  await ensureRegistrySchema();
  const date = getOfficialBoardDate(boardDate);
  const res: any = await prisma.$executeRawUnsafe(
    `DELETE FROM himothy_pick_registry WHERE board_date = $1::date`,
    date,
  );
  return typeof res === 'number' ? res : 0;
}

// Remove duplicate straight picks: the SAME bet (event_id + market + selection) recorded
// more than once for a day — e.g. the Dodgers -1.5 that landed under both GRAND_SLAM and
// PRESSURE_PACK because old dedup keyed on the event-name string. Keeps ONE row per bet,
// preferring the higher tier (Grand Slam > Pressure > VIP > Marquee) then the earliest entry.
// Scoped to straight categories only — never touches PARLAY_PLAN legs or NRFI (removing a
// leg would corrupt a parlay ticket). Pass a boardDate to limit to one day, omit for all.
export async function dedupeRegistry(boardDate?: string): Promise<number> {
  await ensureRegistrySchema();
  const params: any[] = [];
  let scope = '';
  if (boardDate) { params.push(getOfficialBoardDate(boardDate)); scope = 'AND board_date = $1::date'; }
  const res: any = await prisma.$executeRawUnsafe(
    `DELETE FROM himothy_pick_registry t
     USING (
       SELECT id, ROW_NUMBER() OVER (
         PARTITION BY board_date, event_id, lower(market_type), lower(selection)
         ORDER BY CASE category
           WHEN 'GRAND_SLAM' THEN 1 WHEN 'PRESSURE_PACK' THEN 2
           WHEN 'VIP_4_PACK' THEN 3 WHEN 'MARQUEE' THEN 4 ELSE 5 END,
           created_at ASC
       ) AS rn
       FROM himothy_pick_registry
       WHERE event_id IS NOT NULL AND event_id <> ''
         AND category IN ('GRAND_SLAM','PRESSURE_PACK','VIP_4_PACK','MARQUEE')
         ${scope}
     ) d
     WHERE t.id = d.id AND d.rn > 1`,
    ...params,
  );
  return typeof res === 'number' ? res : 0;
}

export async function getBoardMainPick(boardDate?: string) {
  await ensureRegistrySchema();
  const date = getOfficialBoardDate(boardDate);
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT *
      FROM himothy_pick_registry
      WHERE board_date = $1::date
        AND is_main_pick = TRUE
        AND status IN ('published','locked','graded','archived')
      ORDER BY publish_time ASC NULLS LAST, created_at ASC
      LIMIT 1
    `,
    date
  );
  return rows[0] ? formatRow(rows[0]) : null;
}

export async function lockRegistryBoard(boardDate?: string) {
  await ensureRegistrySchema();
  const date = getOfficialBoardDate(boardDate);

  await prisma.$executeRawUnsafe(
    `
      UPDATE himothy_pick_registry
      SET status = CASE
            WHEN status = 'published' THEN 'locked'
            ELSE status
          END,
          is_locked = TRUE,
          lock_time = COALESCE(lock_time, NOW()),
          updated_at = NOW()
      WHERE board_date = $1::date
        AND status IN ('published','locked')
    `,
    date
  );
}

export async function archiveClosedBoards(currentBoardDate?: string) {
  await ensureRegistrySchema();
  const date = getOfficialBoardDate(currentBoardDate);

  // Only archive picks that have a real settled result. A pending pick getting archived
  // would freeze it as "pending" forever in the registry — that hides ungraded games and
  // skews lifetime counts. Leave pending picks in their current status so the grader (or a
  // human via /audit) can settle them later. We DO still mark the row locked so it can't be
  // edited in the meantime.
  await prisma.$executeRawUnsafe(
    `
      UPDATE himothy_pick_registry
      SET status = 'archived',
          is_locked = TRUE,
          lock_time = COALESCE(lock_time, NOW()),
          updated_at = NOW()
      WHERE board_date < $1::date
        AND board_date >= $2::date
        AND status IN ('published','locked','graded')
        AND result <> 'pending'
    `,
    date,
    OFFICIAL_TRACKING_START_DATE
  );

  // Lock (but do NOT archive) any pending picks from prior boards, so they remain visible
  // for grading/investigation but can't be silently mutated.
  await prisma.$executeRawUnsafe(
    `
      UPDATE himothy_pick_registry
      SET is_locked = TRUE,
          lock_time = COALESCE(lock_time, NOW()),
          updated_at = NOW()
      WHERE board_date < $1::date
        AND board_date >= $2::date
        AND status IN ('published','locked','graded')
        AND result = 'pending'
        AND is_locked = FALSE
    `,
    date,
    OFFICIAL_TRACKING_START_DATE
  );
}

function chooseWinningSide(event: any) {
  const comp = event.competitions?.[0];
  const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
  const homeScore = Number.parseInt(home?.score || '0', 10);
  const awayScore = Number.parseInt(away?.score || '0', 10);
  if (homeScore === awayScore) return 'draw';
  return homeScore > awayScore ? 'home' : 'away';
}

function parseAmerican(odds?: string | null) {
  if (!odds) return NaN;
  const m = String(odds).match(/[+-]?\d{3,4}/);
  if (!m) return NaN;
  const n = Number.parseInt(m[0], 10);
  return Number.isFinite(n) ? n : NaN;
}

function extractClosingOdds(event: any) {
  const comp = event?.competitions?.[0];
  const details = comp?.odds?.[0]?.details;
  if (typeof details === 'string') return details;
  return null;
}

function calculateClvDelta(openOdds: string | null, closeOdds: string | null) {
  const o = parseAmerican(openOdds);
  const c = parseAmerican(closeOdds);
  if (!Number.isFinite(o) || !Number.isFinite(c)) return null;
  return Number((c - o).toFixed(1));
}

function gradeResultFromEvent(pick: RegistryPickRow, event: any): RegistryResult {
  const state = event?.status?.type?.state;
  const completed = state === 'post' || Boolean(event?.status?.type?.completed);
  if (!completed) return 'pending';

  const comp = event.competitions?.[0];
  const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');

  if (!home || !away) return 'void';

  const homeScore = Number.parseInt(home.score || '0', 10);
  const awayScore = Number.parseInt(away.score || '0', 10);
  const total = homeScore + awayScore;
  const sel = pick.selection.toLowerCase();
  const market = pick.marketType.toLowerCase();
  const line = parseNumeric(pick.line);

  // NRFI (No Runs First Inning) — settle from each side's 1st-inning linescore. Won if
  // zero combined runs scored in the 1st; lost otherwise. If the inning-by-inning data
  // isn't present we void rather than guess (so it never shows a fabricated W/L).
  if (market === 'special' || /\bnrfi\b/i.test(sel) || /no runs first inning/i.test(sel)) {
    const firstInningRuns = (c: any): number | null => {
      const ls = c?.linescores;
      if (!Array.isArray(ls) || ls.length === 0) return null;
      const v = ls[0]?.value ?? ls[0]?.displayValue;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const h1 = firstInningRuns(home);
    const a1 = firstInningRuns(away);
    if (h1 == null || a1 == null) return 'void';
    return h1 + a1 === 0 ? 'win' : 'loss';
  }

  // TEAM TOTAL — "Team Over/Under N": that team's final score vs the line.
  if (market === 'team_total' || /team total/i.test(pick.selection)) {
    if (!Number.isFinite(line)) return 'void';
    const isHomeTeam = !!pick.homeTeam && sel.includes((pick.homeTeam || '').toLowerCase());
    const teamScore = isHomeTeam ? homeScore : awayScore;
    const over = /\bover\b/i.test(pick.selection);
    if (teamScore > line) return over ? 'win' : 'loss';
    if (teamScore < line) return over ? 'loss' : 'win';
    return 'push';
  }

  // PERIOD / F5 TOTALS — sum the relevant linescore segments (both teams) vs the line.
  // 1H = first half, 2H = second half, Q1-Q4 = quarters, P1-P3 = hockey periods,
  // F5 = first 5 innings (MLB). Settle Over/Under against that summed segment total.
  const periodCode = (market.match(/^(1h|2h|q[1-4]|p[1-3]|f5)_total$/)?.[1])
    || (/(^|[^a-z])(1h|2h|q[1-4]|p[1-3]|f5)([^a-z]|$)/i.exec(pick.selection)?.[2]?.toLowerCase());
  if (periodCode) {
    if (!Number.isFinite(line)) return 'void';
    const idxFor = (code: string): number[] => {
      switch (code) {
        case '1h': return [0, 1];
        case '2h': return [2, 3];
        case 'q1': return [0]; case 'q2': return [1]; case 'q3': return [2]; case 'q4': return [3];
        case 'p1': return [0]; case 'p2': return [1]; case 'p3': return [2];
        case 'f5': return [0, 1, 2, 3, 4];
        default: return [];
      }
    };
    const idxs = idxFor(periodCode);
    if (idxs.length === 0) return 'void';
    const sumSeg = (c: any): number | null => {
      const ls = c?.linescores;
      if (!Array.isArray(ls) || ls.length === 0) return null;
      let s = 0;
      for (const i of idxs) {
        const v = ls[i]?.value ?? ls[i]?.displayValue;
        const n = Number(v);
        if (!Number.isFinite(n)) return null;   // missing segment → can't settle honestly
        s += n;
      }
      return s;
    };
    const hs = sumSeg(home), as = sumSeg(away);
    if (hs == null || as == null) return 'void';
    const segTotal = hs + as;
    const over = /\bover\b/i.test(pick.selection);
    if (segTotal > line) return over ? 'win' : 'loss';
    if (segTotal < line) return over ? 'loss' : 'win';
    return 'push';
  }

  if (market.includes('moneyline') || sel.includes(' ml')) {
    const winner = chooseWinningSide(event);
    if (winner === 'draw') return 'push';
    if (winner === 'home' && (sel.includes((pick.homeTeam || '').toLowerCase()) || sel.includes('home'))) return 'win';
    if (winner === 'away' && (sel.includes((pick.awayTeam || '').toLowerCase()) || sel.includes('away'))) return 'win';
    return 'loss';
  }

  // Totals: market type set explicitly OR selection contains the WORD over/under
  // (word-boundary so "Thunder" doesn't accidentally match "under").
  if (market.includes('total') || market === 'over' || market === 'under' || /\b(over|under)\b/i.test(pick.selection)) {
    if (!Number.isFinite(line)) return 'void';
    if (/\bover\b/i.test(pick.selection)) {
      if (total > line) return 'win';
      if (total < line) return 'loss';
      return 'push';
    }
    if (/\bunder\b/i.test(pick.selection)) {
      if (total < line) return 'win';
      if (total > line) return 'loss';
      return 'push';
    }
  }

  if (market.includes('spread') || market.includes('handicap')) {
    if (!Number.isFinite(line)) return 'void';
    const isHomeSel = sel.includes((pick.homeTeam || '').toLowerCase()) || sel.includes('home');
    const teamScore = isHomeSel ? homeScore : awayScore;
    const oppScore = isHomeSel ? awayScore : homeScore;
    const adjusted = teamScore + line;
    if (adjusted > oppScore) return 'win';
    if (adjusted < oppScore) return 'loss';
    return 'push';
  }

  return 'void';
}

// Resolve a player-prop stat label → the ESPN box-score column abbreviation. Only the
// UNAMBIGUOUS stats (a single box-score category owns them) are supported; anything else
// returns null so the grader VOIDS rather than risk reading the wrong column.
function propStatAbbrev(statLabel: string): string | null {
  const s = statLabel.toLowerCase();
  if (s.includes('point')) return 'PTS';
  if (s.includes('rebound')) return 'REB';
  if (s.includes('assist')) return 'AST';
  if (s.includes('steal')) return 'STL';
  if (s.includes('block')) return 'BLK';
  if (s.includes('three') || s.includes('3-point') || s.includes('3pt')) return '3PT';
  return null; // unsupported (e.g. yards/strikeouts are ambiguous across categories) → void
}

function normPlayer(n: string): string {
  return String(n || '').toLowerCase().replace(/[^a-z]/g, '');
}

// Read a player's final stat from the ESPN summary box score. Returns null if anything is
// uncertain (player not found, column not found, value unparseable) so the grader voids.
function readBoxscoreStat(summary: any, playerName: string, abbrev: string): number | null {
  const teams = summary?.boxscore?.players;
  if (!Array.isArray(teams)) return null;
  const target = normPlayer(playerName);
  for (const t of teams) {
    for (const cat of (t.statistics || [])) {
      const names: string[] = (cat.names || cat.keys || cat.labels || []).map((x: any) => String(x).toUpperCase());
      const idx = names.findIndex((n) => n === abbrev);
      if (idx < 0) continue;
      for (const a of (cat.athletes || [])) {
        if (normPlayer(a?.athlete?.displayName || '') !== target) continue;
        const raw = a?.stats?.[idx];
        if (raw == null) return null;
        // "3PT" is "made-attempted" (e.g. "5-11") — take makes.
        const v = String(raw).includes('-') ? Number(String(raw).split('-')[0]) : Number(raw);
        return Number.isFinite(v) ? v : null;
      }
    }
  }
  return null;
}

// Grade a player prop ("{Player} Over/Under {line} {Stat}") from the box score. Void on ANY
// uncertainty — never a fabricated prop W/L. Supports the unambiguous basketball stats today;
// other stats void until their box-score columns are wired in.
async function gradePlayerProp(pick: RegistryPickRow, event: any): Promise<RegistryResult> {
  const state = event?.status?.type?.state;
  const completed = state === 'post' || Boolean(event?.status?.type?.completed);
  if (!completed) return 'pending';
  const m = String(pick.selection || '').match(/^(.*?)\s+(over|under)\s+([\d.]+)\s+(.+)$/i);
  if (!m) return 'void';
  const player = m[1];
  const over = /over/i.test(m[2]);
  const line = Number(m[3]);
  if (!Number.isFinite(line)) return 'void';
  const abbrev = propStatAbbrev(m[4]);
  if (!abbrev) return 'void';
  const base = LEAGUE_URLS[pick.league] || LEAGUE_URLS[pick.sport];
  if (!base || !pick.eventId) return 'void';
  let summary: any = null;
  try {
    const res = await fetchWithTimeout(`${base}/summary?event=${pick.eventId}`, { cache: 'no-store', timeoutMs: 8000 });
    if (res.ok) summary = await res.json();
  } catch { return 'void'; }
  const val = readBoxscoreStat(summary, player, abbrev);
  if (val == null) return 'void';
  if (val === line) return 'push';
  return over === (val > line) ? 'win' : 'loss';
}

async function fetchEventForPick(pick: RegistryPickRow) {
  const base = LEAGUE_URLS[pick.league] || LEAGUE_URLS[pick.sport] || LEAGUE_URLS['NBA'];
  const dateStr = toLeagueDate(pick.boardDate);

  try {
    const res = await fetchWithTimeout(`${base}/scoreboard?dates=${dateStr}`, { cache: 'no-store', timeoutMs: 7000 });
    if (!res.ok) return null;
    const data = await res.json();
    const events = data.events || [];

    if (pick.eventId) {
      const byId = events.find((e: any) => String(e.id) === String(pick.eventId));
      if (byId) return byId;
    }

    return events.find((e: any) => {
      const comp = e.competitions?.[0];
      const home = comp?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.displayName?.toLowerCase() || '';
      const away = comp?.competitors?.find((c: any) => c.homeAway === 'away')?.team?.displayName?.toLowerCase() || '';
      const eventName = (e.name || '').toLowerCase();
      return (
        (pick.homeTeam && home.includes(pick.homeTeam.toLowerCase())) ||
        (pick.awayTeam && away.includes(pick.awayTeam.toLowerCase())) ||
        eventName.includes((pick.eventName || '').toLowerCase())
      );
    }) || null;
  } catch {
    return null;
  }
}

export async function gradeRegistryBoard(boardDate?: string) {
  await ensureRegistrySchema();
  const date = getOfficialBoardDate(boardDate);

  // Grade EVERY pending pick from the official start date up to and including `date`
  // (today) — not just one board date. The old single-date filter meant that once the
  // day rolled over, the prior day's finished games stayed "pending" forever and never
  // showed up as wins or losses. That's why the record looked empty after game day.
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT * FROM himothy_pick_registry
      WHERE board_date >= $2::date
        AND board_date <= $1::date
        AND status IN ('published','locked','graded','archived')
        AND result = 'pending'
      ORDER BY created_at ASC
    `,
    date,
    OFFICIAL_TRACKING_START_DATE
  );

  const picks = rows.map(formatRow);
  let gradedCount = 0;
  const affectedBoards = new Set<string>([date]);

  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];
    const bdForAudit = (() => {
      const bd = rows[i]?.board_date;
      if (!bd) return date;
      return typeof bd === 'string' ? bd.slice(0, 10) : new Date(bd).toISOString().slice(0, 10);
    })();
    const pickKey = `${pick.eventId || pick.id}|${pick.selection || ''}`;

    const event = await fetchEventForPick(pick);
    if (!event) {
      await logPickEvent({
        event: 'ERROR',
        boardDate: bdForAudit,
        pickKey,
        gameId: pick.eventId || undefined,
        category: pick.category,
        selection: pick.selection,
        odds: pick.odds ?? undefined,
        status: pick.status,
        notes: 'grading skipped: could not resolve ESPN event for this pick (still pending)',
      });
      continue;
    }

    const result = (pick.marketType || '').toLowerCase() === 'player_prop'
      ? await gradePlayerProp(pick, event)
      : gradeResultFromEvent(pick, event);
    if (result === 'pending') {
      await logPickEvent({
        event: 'ERROR',
        boardDate: bdForAudit,
        pickKey,
        gameId: pick.eventId || undefined,
        category: pick.category,
        selection: pick.selection,
        odds: pick.odds ?? undefined,
        status: pick.status,
        notes: 'grading skipped: game not yet final or result not determinable',
      });
      continue;
    }
    const closingOdds = extractClosingOdds(event);
    const clvDelta = calculateClvDelta(pick.odds, closingOdds);

    // Extract final scores + cover margin (positive = covered by N, negative = missed by N).
    // This is the diagnostic that tells us "won by exactly 1" vs "covered by 5" — critical
    // for understanding WHY a pick won or lost vs just W/L.
    const comp = event.competitions?.[0];
    const homeRaw = comp?.competitors?.find((c: any) => c.homeAway === 'home');
    const awayRaw = comp?.competitors?.find((c: any) => c.homeAway === 'away');
    const finalHome = Number.parseInt(homeRaw?.score || '0', 10);
    const finalAway = Number.parseInt(awayRaw?.score || '0', 10);
    const market = (pick.marketType || '').toLowerCase();
    const sel = (pick.selection || '').toLowerCase();
    const line = parseNumeric(pick.line);
    let coverMargin: number | null = null;
    const isHomeSel = sel.includes((pick.homeTeam || '').toLowerCase()) || sel.includes('home');
    const isTotalBet = market.includes('total') || /\b(over|under)\b/i.test(pick.selection);
    if (market.includes('moneyline') || / ml\b/i.test(pick.selection)) {
      coverMargin = (isHomeSel ? finalHome : finalAway) - (isHomeSel ? finalAway : finalHome);
    } else if (isTotalBet && Number.isFinite(line)) {
      const total = finalHome + finalAway;
      coverMargin = /\bunder\b/i.test(pick.selection) ? line - total : total - line;
    } else if ((market.includes('spread') || market.includes('handicap') || market.includes('run line')) && Number.isFinite(line)) {
      const teamScore = isHomeSel ? finalHome : finalAway;
      const oppScore = isHomeSel ? finalAway : finalHome;
      coverMargin = teamScore + line - oppScore;
    }

    await prisma.$executeRawUnsafe(
      `
        UPDATE himothy_pick_registry
        SET result = $2,
            status = 'graded',
            graded_at = NOW(),
          result_changed_at = NOW(),
            closing_odds = $3,
            clv_delta = $4,
            cover_margin = $5,
            final_home_score = $6,
            final_away_score = $7,
            is_locked = TRUE,
          counted_in_daily_totals = TRUE,
          counted_in_lifetime_totals = TRUE,
            lock_time = COALESCE(lock_time, NOW()),
            updated_at = NOW()
        WHERE id = $1
      `,
      pick.id,
      result,
      closingOdds,
      clvDelta,
      coverMargin == null ? null : Math.round(coverMargin * 10) / 10,
      finalHome,
      finalAway
    );
    const bd = rows[i]?.board_date;
    if (bd) affectedBoards.add(typeof bd === 'string' ? bd.slice(0, 10) : new Date(bd).toISOString().slice(0, 10));
    gradedCount += 1;

    await logPickEvent({
      event: 'GRADED',
      boardDate: bdForAudit,
      pickKey,
      gameId: pick.eventId || undefined,
      category: pick.category,
      selection: pick.selection,
      line: pick.line ?? undefined,
      odds: pick.odds ?? undefined,
      result,
      status: 'graded',
      notes: `final ${finalAway}-${finalHome}${coverMargin != null ? `, cover margin ${coverMargin}` : ''}${clvDelta != null ? `, CLV ${clvDelta > 0 ? '+' : ''}${clvDelta}` : ''}`,
      details: { closingOdds, finalHome, finalAway, coverMargin, clvDelta },
    });
  }

  for (const b of Array.from(affectedBoards)) await syncBoardRecord(b);
  await syncLifetimeTotals();

  return { gradedCount };
}

function safePct(wins: number, losses: number) {
  const total = wins + losses;
  if (total <= 0) return '0.0%';
  return `${((wins / total) * 100).toFixed(1)}%`;
}

function asUnits(result: RegistryResult, odds?: string | null) {
  if (result === 'win') {
    const o = parseNumeric(odds);
    if (!Number.isFinite(o) || o === 0) return 1;
    if (o > 0) return o / 100;
    return 100 / Math.abs(o);
  }
  if (result === 'loss') return -1;
  return 0;
}

export async function getRegistrySummary({
  from,
  to,
}: {
  from?: string;
  to?: string;
} = {}) {
  await ensureRegistrySchema();

  const clauses = [`is_public = TRUE`, `status IN ('published','locked','graded','archived')`, `board_date >= $1::date`];
  const values: any[] = [];
  values.push(OFFICIAL_TRACKING_START_DATE);
  let idx = 2;

  if (from) {
    clauses.push(`board_date >= $${idx++}::date`);
    values.push(clampToOfficialStartDate(from));
  }
  if (to) {
    clauses.push(`board_date <= $${idx++}::date`);
    values.push(to);
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM himothy_pick_registry WHERE ${clauses.join(' AND ')}`,
    ...values
  );

  const picks = rows.map(formatRow);

  // Category-perfect-day streak. Per user: "to have us streak, that whole category has
  // to be on this streak." A day only counts as a W if EVERY pick in that product line
  // for that boardDate won. Any losing leg = day is a loss. Pending or push (with no
  // outright losses) = day is neutral, doesn't break or extend. Streak walks newest →
  // oldest and counts consecutive same-result days.
  //
  // Why this matters: previously a 2-pick Pressure Pack day going 1W+1L counted as
  // "1 win + 1 loss" toward the streak, which is wrong. From a customer's view, that's
  // a break-even day, not a streak day.
  const computeStreak = (productPicks: typeof picks): { type: 'W' | 'L' | null; count: number } => {
    if (productPicks.length === 0) return { type: null, count: 0 };
    const byDay: Record<string, typeof productPicks> = {};
    for (const p of productPicks) {
      const day = String(p.boardDate || '');
      if (!day) continue;
      (byDay[day] ||= []).push(p);
    }
    const days: Array<{ date: string; result: 'win' | 'loss' | 'neutral' }> = [];
    for (const [date, legs] of Object.entries(byDay)) {
      let anyLost = false; let allWon = true;
      for (const leg of legs) {
        if (leg.result === 'loss') { anyLost = true; allWon = false; }
        else if (leg.result !== 'win') { allWon = false; }
      }
      days.push({ date, result: anyLost ? 'loss' : allWon ? 'win' : 'neutral' });
    }
    const settled = days
      .filter((d) => d.result !== 'neutral')
      .sort((a, b) => b.date.localeCompare(a.date));
    if (settled.length === 0) return { type: null, count: 0 };
    const first: 'W' | 'L' = settled[0].result === 'win' ? 'W' : 'L';
    let count = 0;
    for (const d of settled) {
      const t = d.result === 'win' ? 'W' : 'L';
      if (t === first) count++;
      else break;
    }
    return { type: first, count };
  };

  const totals = {
    totalPicks: picks.length,
    wins: 0,
    losses: 0,
    pushes: 0,
    voids: 0,
    pending: 0,
    units: 0,
    avgEdgeScore: 0,
    clvTracked: 0,
    clvBeatCount: 0,
  };

  const byCategory: Record<string, any> = {};
  const byProductLine: Record<string, any> = {};
  const bySport: Record<string, any> = {};
  const byMarketType: Record<string, any> = {};

  const add = (bucket: Record<string, any>, key: string, pick: RegistryPickRow) => {
    if (!bucket[key]) {
      bucket[key] = {
        wins: 0,
        losses: 0,
        pushes: 0,
        voids: 0,
        pending: 0,
        totalPicks: 0,
        units: 0,
        winRate: '0.0%',
        avgEdgeScore: 0,
        clvTracked: 0,
        clvBeatCount: 0,
      };
    }
    bucket[key].totalPicks += 1;
    if (pick.result === 'win') bucket[key].wins += 1;
    else if (pick.result === 'loss') bucket[key].losses += 1;
    else if (pick.result === 'push') bucket[key].pushes += 1;
    else if (pick.result === 'void') bucket[key].voids += 1;
    else bucket[key].pending += 1;
    bucket[key].units += asUnits(pick.result, pick.odds);
    if (pick.edgeScore != null) {
      bucket[key].avgEdgeScore += pick.edgeScore;
    }
    if (pick.clvDelta != null) {
      bucket[key].clvTracked += 1;
      if (pick.clvDelta < 0) bucket[key].clvBeatCount += 1;
    }
  };

  // Headline record is BET-level, not leg-level. Parlay legs collapse into one ticket
  // outcome (any leg lost → one ticket loss; all legs won → one ticket win); singles
  // count individually. Without this a losing 20-leg Power parlay added ~19 fake wins to
  // the top-line record while the parlay section correctly showed 0-1.
  const headlineBets = aggregateToBetResults(picks);
  for (const b of headlineBets) {
    if (b.result === 'win') totals.wins += 1;
    else if (b.result === 'loss') totals.losses += 1;
    else if (b.result === 'push') totals.pushes += 1;
    else if (b.result === 'void') totals.voids += 1;
    else totals.pending += 1;
    totals.units += asUnits(b.result, b.odds);
  }
  totals.totalPicks = headlineBets.length;

  // Per-bucket accumulation stays per-leg (the parlay product lines + categories get a
  // ticket-level overwrite further down). Edge/CLV averages are leg-level informational.
  let edgeCount = 0;
  for (const pick of picks) {
    if (pick.edgeScore != null) { totals.avgEdgeScore += pick.edgeScore; edgeCount += 1; }
    if (pick.clvDelta != null) {
      totals.clvTracked += 1;
      if (pick.clvDelta < 0) totals.clvBeatCount += 1;
    }
    add(byCategory, pick.category, pick);
    add(byProductLine, pick.productLine, pick);
    add(bySport, pick.sport, pick);
    add(byMarketType, pick.marketType, pick);
  }

  Object.keys(byCategory).forEach((k) => {
    byCategory[k].winRate = safePct(byCategory[k].wins, byCategory[k].losses);
    byCategory[k].avgEdgeScore = byCategory[k].totalPicks
      ? Number((byCategory[k].avgEdgeScore / byCategory[k].totalPicks).toFixed(1))
      : 0;
    byCategory[k].clvBeatRate = byCategory[k].clvTracked
      ? `${((byCategory[k].clvBeatCount / byCategory[k].clvTracked) * 100).toFixed(1)}%`
      : '0.0%';
  });
  // Group picks by category and product line so streaks can be computed per slice.
  const picksByProductLine: Record<string, typeof picks> = {};
  const picksByCategory: Record<string, typeof picks> = {};
  for (const p of picks) {
    (picksByProductLine[p.productLine] ||= []).push(p);
    (picksByCategory[p.category] ||= []).push(p);
  }
  Object.keys(byProductLine).forEach((k) => {
    byProductLine[k].winRate = safePct(byProductLine[k].wins, byProductLine[k].losses);
    byProductLine[k].avgEdgeScore = byProductLine[k].totalPicks
      ? Number((byProductLine[k].avgEdgeScore / byProductLine[k].totalPicks).toFixed(1))
      : 0;
    byProductLine[k].clvBeatRate = byProductLine[k].clvTracked
      ? `${((byProductLine[k].clvBeatCount / byProductLine[k].clvTracked) * 100).toFixed(1)}%`
      : '0.0%';
    byProductLine[k].streak = computeStreak(picksByProductLine[k] || []);
  });
  Object.keys(byCategory).forEach((k) => {
    byCategory[k].streak = computeStreak(picksByCategory[k] || []);
  });

  // Mirror the parlay ticket-level overwrite onto byCategory too. The product pages
  // (e.g., /parlay-plan) read `category_stats[meta.category]` which is built from
  // byCategory — same bug as byProductLine until this loop runs.
  for (const category of Object.keys(byCategory)) {
    if (!isParlayProductLine(category)) continue;
    const catPicks = picksByCategory[category] || [];
    const ticketBets = aggregateToBetResults(catPicks);
    const wins = ticketBets.filter((b) => b.result === 'win').length;
    const losses = ticketBets.filter((b) => b.result === 'loss').length;
    const pushes = ticketBets.filter((b) => b.result === 'push').length;
    const pending = ticketBets.filter((b) => b.result === 'pending').length;
    const totalUnits = ticketBets.reduce((s, t) => s + asUnits(t.result, t.odds), 0);
    const bucket = byCategory[category];
    bucket.wins = wins;
    bucket.losses = losses;
    bucket.pushes = pushes;
    bucket.pending = pending;
    bucket.totalPicks = ticketBets.length;
    bucket.units = totalUnits;
    bucket.winRate = safePct(wins, losses);
    // Re-compute streak at the ticket level using gradedAt ordering.
    const settled = ticketBets
      .filter((b) => b.result === 'win' || b.result === 'loss')
      .sort((a, b) => {
        const at = a.gradedAt ? new Date(a.gradedAt).getTime() : 0;
        const bt = b.gradedAt ? new Date(b.gradedAt).getTime() : 0;
        return bt - at;
      });
    if (settled.length === 0) {
      bucket.streak = { type: null, count: 0 };
    } else {
      const first: 'W' | 'L' = settled[0].result === 'win' ? 'W' : 'L';
      let count = 0;
      for (const s of settled) {
        const t = s.result === 'win' ? 'W' : 'L';
        if (t === first) count++; else break;
      }
      bucket.streak = { type: first, count };
    }
  }

  // TICKET-LEVEL aggregation for parlay product lines. By default the bucket counts each
  // pick row as one win or loss — but parlay legs are NOT independent bets. A 4-leg
  // ticket where 3 legs won + 1 lost is ONE ticket loss, not 3 leg wins. Customers were
  // seeing "Parlay Center 10-9-2 · 4W streak" while no parlay ticket had actually hit —
  // because legs from a losing 6-leg ticket still showed individually as W or L. We fix
  // it by grouping picks under parlayTicketId, evaluating each ticket as a single
  // outcome (any leg lost → ticket lost, all legs won → ticket won), then overwriting
  // the bucket's wins/losses/streak.
  for (const productLine of Object.keys(byProductLine)) {
    if (!isParlayProductLine(productLine)) continue;
    const linePicks = picksByProductLine[productLine] || [];
    const tickets = new Map<string, typeof linePicks>();
    for (const p of linePicks) {
      const ticketId = p.parlayTicketId || `${p.boardDate}-${productLine}`;
      (tickets.get(ticketId) || tickets.set(ticketId, []).get(ticketId)!).push(p);
    }
    const ticketResults: Array<{ result: 'win' | 'loss' | 'push' | 'pending'; units: number; gradedAtMs: number }> = [];
    for (const legs of Array.from(tickets.values())) {
      let anyLost = false; let anyPending = false; let allWon = true; let hasPush = false;
      for (const leg of legs) {
        if (leg.result === 'loss') { anyLost = true; allWon = false; }
        else if (leg.result === 'pending') { anyPending = true; allWon = false; }
        else if (leg.result === 'push') { hasPush = true; allWon = false; }
      }
      const result: 'win' | 'loss' | 'push' | 'pending' =
        anyLost ? 'loss' : anyPending ? 'pending' : allWon ? 'win' : 'push';
      // Use parlayEstimatedOdds for unit calc (same across all legs of a ticket).
      const combinedOdds = legs[0]?.parlayEstimatedOdds || null;
      const units = result === 'win' ? asUnits('win', combinedOdds) : result === 'loss' ? -1 : 0;
      const gradedAtMs = legs.reduce((max, l) => {
        const t = l.gradedAt ? new Date(l.gradedAt).getTime() : new Date(l.boardDate || 0).getTime();
        return t > max ? t : max;
      }, 0);
      ticketResults.push({ result, units, gradedAtMs });
    }
    const wins = ticketResults.filter((t) => t.result === 'win').length;
    const losses = ticketResults.filter((t) => t.result === 'loss').length;
    const pushes = ticketResults.filter((t) => t.result === 'push').length;
    const pending = ticketResults.filter((t) => t.result === 'pending').length;
    const totalUnits = ticketResults.reduce((s, t) => s + t.units, 0);
    const bucket = byProductLine[productLine];
    bucket.wins = wins;
    bucket.losses = losses;
    bucket.pushes = pushes;
    bucket.pending = pending;
    bucket.totalPicks = ticketResults.length;
    bucket.units = totalUnits;
    bucket.winRate = safePct(wins, losses);
    // Ticket-level streak
    const settled = ticketResults
      .filter((t) => t.result === 'win' || t.result === 'loss')
      .sort((a, b) => b.gradedAtMs - a.gradedAtMs);
    if (settled.length === 0) {
      bucket.streak = { type: null, count: 0 };
    } else {
      const first: 'W' | 'L' = settled[0].result === 'win' ? 'W' : 'L';
      let count = 0;
      for (const s of settled) {
        const t = s.result === 'win' ? 'W' : 'L';
        if (t === first) count++;
        else break;
      }
      bucket.streak = { type: first, count };
    }
  }
  Object.keys(bySport).forEach((k) => {
    bySport[k].winRate = safePct(bySport[k].wins, bySport[k].losses);
    bySport[k].avgEdgeScore = bySport[k].totalPicks
      ? Number((bySport[k].avgEdgeScore / bySport[k].totalPicks).toFixed(1))
      : 0;
    bySport[k].clvBeatRate = bySport[k].clvTracked
      ? `${((bySport[k].clvBeatCount / bySport[k].clvTracked) * 100).toFixed(1)}%`
      : '0.0%';
  });
  Object.keys(byMarketType).forEach((k) => {
    byMarketType[k].winRate = safePct(byMarketType[k].wins, byMarketType[k].losses);
    byMarketType[k].avgEdgeScore = byMarketType[k].totalPicks
      ? Number((byMarketType[k].avgEdgeScore / byMarketType[k].totalPicks).toFixed(1))
      : 0;
    byMarketType[k].clvBeatRate = byMarketType[k].clvTracked
      ? `${((byMarketType[k].clvBeatCount / byMarketType[k].clvTracked) * 100).toFixed(1)}%`
      : '0.0%';
  });

  return {
    totals: {
      ...totals,
      winRate: safePct(totals.wins, totals.losses),
      units: Number(totals.units.toFixed(2)),
      avgEdgeScore: edgeCount ? Number((totals.avgEdgeScore / edgeCount).toFixed(1)) : 0,
      clvBeatRate: totals.clvTracked ? `${((totals.clvBeatCount / totals.clvTracked) * 100).toFixed(1)}%` : '0.0%',
    },
    byCategory,
    byProductLine,
    bySport,
    byMarketType,
  };
}

export async function getRegistryHistoryDay(date?: string) {
  await ensureRegistrySchema();
  const boardDate = getOfficialBoardDate(date);
  const picks = await getRegistryBoardPicks({ boardDate, includePrivate: false });

  // Bet-level (not leg-level) aggregation. Parlay legs collapse into one ticket result,
  // so a 4-leg parlay where 3 hit + 1 lost shows as ONE LOSS, not 3W + 1L. Same goes
  // for units — the ticket's combined odds drive the unit calc.
  const bets = aggregateToBetResults(picks);
  const wins = bets.filter((b) => b.result === 'win').length;
  const losses = bets.filter((b) => b.result === 'loss').length;
  const pushes = bets.filter((b) => b.result === 'push').length;
  const voids = bets.filter((b) => b.result === 'void').length;
  const pending = bets.filter((b) => b.result === 'pending').length;
  const units = bets.reduce((sum, b) => sum + asUnits(b.result, b.odds), 0);

  return {
    boardDate,
    dailyRecord: {
      wins,
      losses,
      pushes,
      voids,
      pending,
      units: Number(units.toFixed(2)),
      winRate: safePct(wins, losses),
    },
    picks,
  };
}

export async function getRegistryArchive({
  page = 1,
  pageSize = 20,
  category,
  productLine,
  from,
  to,
}: {
  page?: number;
  pageSize?: number;
  category?: string;
  productLine?: string;
  from?: string;
  to?: string;
} = {}) {
  await ensureRegistrySchema();

  const limit = Math.min(Math.max(pageSize, 1), 100);
  const offset = Math.max(page - 1, 0) * limit;
  const clauses = [`status IN ('graded','archived')`, `is_public = TRUE`, `board_date >= $1::date`];
  const values: any[] = [];
  values.push(OFFICIAL_TRACKING_START_DATE);
  let idx = 2;

  if (category) {
    clauses.push(`category = $${idx++}`);
    values.push(category);
  }
  if (productLine) {
    clauses.push(`product_line = $${idx++}`);
    values.push(productLine);
  }
  if (from) {
    clauses.push(`board_date >= $${idx++}::date`);
    values.push(clampToOfficialStartDate(from));
  }
  if (to) {
    clauses.push(`board_date <= $${idx++}::date`);
    values.push(to);
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT *
      FROM himothy_pick_registry
      WHERE ${clauses.join(' AND ')}
      ORDER BY board_date DESC, publish_time DESC NULLS LAST, created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    ...values
  );

  const countRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS total FROM himothy_pick_registry WHERE ${clauses.join(' AND ')}`,
    ...values
  );

  const picks = rows.map(formatRow);
  const total = countRows[0]?.total || 0;

  return {
    picks,
    pagination: {
      page,
      pageSize: limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getDailyBoardRecords({
  from,
  to,
  page = 1,
  pageSize = 30,
}: {
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  await ensureRegistrySchema();

  const limit = Math.min(Math.max(pageSize, 1), 100);
  const offset = Math.max(page - 1, 0) * limit;
  const clauses = [`board_date >= $1::date`];
  const values: any[] = [OFFICIAL_TRACKING_START_DATE];
  let idx = 2;

  if (from) {
    clauses.push(`board_date >= $${idx++}::date`);
    values.push(clampToOfficialStartDate(from));
  }
  if (to) {
    clauses.push(`board_date <= $${idx++}::date`);
    values.push(to);
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT *
      FROM himothy_daily_board_records
      WHERE ${clauses.join(' AND ')}
      ORDER BY board_date DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    ...values
  );

  return rows.map((row) => ({
    boardDate: new Date(row.board_date).toISOString().slice(0, 10),
    wins: Number(row.wins || 0),
    losses: Number(row.losses || 0),
    pushes: Number(row.pushes || 0),
    voids: Number(row.voids || 0),
    pendingCount: Number(row.pending_count || 0),
    totalPublished: Number(row.total_published || 0),
    totalSettled: Number(row.total_settled || 0),
    mainPickRecord: row.main_pick_record || '0-0',
    coreRecord: row.core_record || '0-0',
    parlayRecord: row.parlay_record || '0-0',
    sportBreakdown: row.sport_breakdown || {},
    finalized: Boolean(row.finalized),
    finalizedAt: row.finalized_at ? new Date(row.finalized_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }));
}

export async function getOfficialTrackingSnapshot(boardDate?: string) {
  await ensureRegistrySchema();

  const effectiveBoardDate = getOfficialBoardDate(boardDate);
  await syncBoardRecord(effectiveBoardDate);
  const lifetime = await syncLifetimeTotals();

  const todayRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM himothy_daily_board_records WHERE board_date = $1::date LIMIT 1`,
    effectiveBoardDate
  );

  const today = todayRows[0]
    ? {
        boardDate: new Date(todayRows[0].board_date).toISOString().slice(0, 10),
        wins: Number(todayRows[0].wins || 0),
        losses: Number(todayRows[0].losses || 0),
        pushes: Number(todayRows[0].pushes || 0),
        voids: Number(todayRows[0].voids || 0),
        pendingCount: Number(todayRows[0].pending_count || 0),
        totalPublished: Number(todayRows[0].total_published || 0),
        totalSettled: Number(todayRows[0].total_settled || 0),
        mainPickRecord: todayRows[0].main_pick_record || '0-0',
        coreRecord: todayRows[0].core_record || '0-0',
        parlayRecord: todayRows[0].parlay_record || '0-0',
        sportBreakdown: todayRows[0].sport_breakdown || {},
        finalized: Boolean(todayRows[0].finalized),
        finalizedAt: todayRows[0].finalized_at ? new Date(todayRows[0].finalized_at).toISOString() : null,
      }
    : {
        boardDate: effectiveBoardDate,
        wins: 0,
        losses: 0,
        pushes: 0,
        voids: 0,
        pendingCount: 0,
        totalPublished: 0,
        totalSettled: 0,
        mainPickRecord: '0-0',
        coreRecord: '0-0',
        parlayRecord: '0-0',
        sportBreakdown: {},
        finalized: false,
        finalizedAt: null,
      };

  return {
    officialStartDate: OFFICIAL_TRACKING_START_DATE,
    boardDate: effectiveBoardDate,
    liveNightly: {
      winsTonight: today.wins,
      lossesTonight: today.losses,
      pushesTonight: today.pushes,
      voidsTonight: today.voids,
      pendingTonight: today.pendingCount,
      totalSettledTonight: today.totalSettled,
      liveNightRecordDisplay: toRecordString(today.wins, today.losses, today.pushes),
    },
    dailyRecord: today,
    lifetimeRecord: lifetime,
  };
}

// Aggregates every parlay ticket in the registry — grouping legs by parlay_ticket_id
// and computing per-ticket result (any leg lost = ticket lost), then rolling up by leg
// count and SGP theme so we can see which parlay structures actually hit.
export async function getParlayStats(): Promise<{
  byTicket: Array<{ ticketId: string; legCount: number; estimatedOdds: string | null; sgpTheme: string | null; result: 'win' | 'loss' | 'pending' | 'push'; boardDate: string; legs: Array<{ selection: string; result: string; position: number | null; odds: string | null }> }>;
  byLegCount: Record<string, { tickets: number; wins: number; losses: number; pending: number; winRate: string }>;
  bySgpTheme: Record<string, { wins: number; losses: number; total: number; winRate: string }>;
  overall: { tickets: number; wins: number; losses: number; pending: number; winRate: string };
}> {
  await ensureRegistrySchema();
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT parlay_ticket_id, parlay_leg_count, parlay_leg_position, parlay_estimated_odds,
             sgp_theme, selection, result, odds, board_date
      FROM himothy_pick_registry
      WHERE parlay_ticket_id IS NOT NULL
      ORDER BY board_date DESC, parlay_ticket_id, parlay_leg_position
    `
  );
  const tickets: Record<string, any> = {};
  for (const r of rows) {
    const id = String(r.parlay_ticket_id);
    if (!tickets[id]) {
      tickets[id] = {
        ticketId: id,
        legCount: Number(r.parlay_leg_count) || 0,
        estimatedOdds: r.parlay_estimated_odds || null,
        sgpTheme: r.sgp_theme || null,
        boardDate: typeof r.board_date === 'string' ? r.board_date.slice(0, 10) : new Date(r.board_date).toISOString().slice(0, 10),
        legs: [],
      };
    }
    tickets[id].legs.push({ selection: r.selection, result: r.result, position: r.parlay_leg_position, odds: r.odds });
  }
  const byTicket = Object.values(tickets).map((t: any) => {
    const hasLoss = t.legs.some((l: any) => l.result === 'loss');
    const hasPending = t.legs.some((l: any) => l.result === 'pending');
    const allWin = t.legs.length > 0 && t.legs.every((l: any) => l.result === 'win');
    const result: 'win' | 'loss' | 'pending' | 'push' = hasLoss ? 'loss' : hasPending ? 'pending' : allWin ? 'win' : 'push';
    return { ...t, result };
  });
  const byLegCount: Record<string, { tickets: number; wins: number; losses: number; pending: number; winRate: string }> = {};
  const bySgpTheme: Record<string, { wins: number; losses: number; total: number; winRate: string }> = {};
  let overall = { tickets: 0, wins: 0, losses: 0, pending: 0 };
  for (const t of byTicket) {
    const lcKey = `${t.legCount}-leg`;
    byLegCount[lcKey] = byLegCount[lcKey] || { tickets: 0, wins: 0, losses: 0, pending: 0, winRate: '0.0%' };
    byLegCount[lcKey].tickets++;
    if (t.result === 'win') byLegCount[lcKey].wins++;
    else if (t.result === 'loss') byLegCount[lcKey].losses++;
    else if (t.result === 'pending') byLegCount[lcKey].pending++;
    if (t.sgpTheme) {
      bySgpTheme[t.sgpTheme] = bySgpTheme[t.sgpTheme] || { wins: 0, losses: 0, total: 0, winRate: '0.0%' };
      if (t.result === 'win') bySgpTheme[t.sgpTheme].wins++;
      else if (t.result === 'loss') bySgpTheme[t.sgpTheme].losses++;
    }
    overall.tickets++;
    if (t.result === 'win') overall.wins++;
    else if (t.result === 'loss') overall.losses++;
    else if (t.result === 'pending') overall.pending++;
  }
  for (const k of Object.keys(byLegCount)) {
    const v = byLegCount[k];
    const tot = v.wins + v.losses;
    v.winRate = tot > 0 ? `${((v.wins / tot) * 100).toFixed(1)}%` : '0.0%';
  }
  for (const k of Object.keys(bySgpTheme)) {
    const v = bySgpTheme[k];
    v.total = v.wins + v.losses;
    v.winRate = v.total > 0 ? `${((v.wins / v.total) * 100).toFixed(1)}%` : '0.0%';
  }
  const oTot = overall.wins + overall.losses;
  return { byTicket, byLegCount, bySgpTheme, overall: { ...overall, winRate: oTot > 0 ? `${((overall.wins / oTot) * 100).toFixed(1)}%` : '0.0%' } };
}

// Aggregate every settled pick in the registry by its odds price band — so we can
// surface "picks priced -130 to -149 are 8-2 lately" on each new pick. Built entirely
// from our OWN verified record, no fake history.
export async function getOddsBucketStats(): Promise<Record<string, { wins: number; losses: number; pushes: number; total: number; winRate: string }>> {
  await ensureRegistrySchema();
  // EXCLUDE parlay legs from odds-bucket analytics. The bucket represents "how single
  // bets at this price perform" — a -110 parlay leg is NOT an independent -110 bet; its
  // outcome is tied to the rest of the ticket. Including them would tell us a -110 bucket
  // "is 8-2" when those wins came from losing parlay tickets. Singles only.
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT odds, result, product_line
      FROM himothy_pick_registry
      WHERE board_date >= $1::date
        AND result IN ('win','loss','push')
    `,
    OFFICIAL_TRACKING_START_DATE
  );
  const { oddsBucket } = await import('@/lib/oddsBucket');
  const stats: Record<string, { wins: number; losses: number; pushes: number }> = {};
  for (const r of rows) {
    const pl = String(r.product_line || '');
    if (isParlayProductLine(pl)) continue; // skip parlay legs
    const bucket = oddsBucket(r.odds);
    if (!bucket) continue;
    stats[bucket] = stats[bucket] || { wins: 0, losses: 0, pushes: 0 };
    if (r.result === 'win') stats[bucket].wins++;
    else if (r.result === 'loss') stats[bucket].losses++;
    else if (r.result === 'push') stats[bucket].pushes++;
  }
  const out: Record<string, { wins: number; losses: number; pushes: number; total: number; winRate: string }> = {};
  for (const [k, v] of Object.entries(stats)) {
    const total = v.wins + v.losses;
    out[k] = { ...v, total, winRate: total > 0 ? `${((v.wins / total) * 100).toFixed(0)}%` : '0%' };
  }
  return out;
}
