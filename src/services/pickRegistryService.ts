import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { LEAGUE_URLS } from '@/lib/validation';
import {
  clampToOfficialStartDate,
  getEtDateKey,
  getOfficialBoardDate,
  OFFICIAL_TRACKING_START_DATE,
} from '@/lib/officialTracking';

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
  const parlayRows = rows.filter((p) => isParlayProductLine(p.productLine));

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
    parlayRecord: computeRecord(parlayRows),
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
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        COUNT(*) FILTER (WHERE result = 'win')::int AS wins,
        COUNT(*) FILTER (WHERE result = 'loss')::int AS losses,
        COUNT(*) FILTER (WHERE result = 'push')::int AS pushes,
        COUNT(*) FILTER (WHERE result = 'void')::int AS voids,
        COUNT(*)::int AS total_published,
        COUNT(*) FILTER (WHERE result IN ('win','loss','push','void'))::int AS total_settled
      FROM himothy_pick_registry
      WHERE board_date >= $1::date
        AND is_public = TRUE
        AND status IN ('published','locked','graded','archived')
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
  if (dailyRows[0]?.finalized === true) {
    throw new Error(`Publish blocked: board ${boardDate} is finalized and immutable.`);
  }

  const duplicateRows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT id
      FROM himothy_pick_registry
      WHERE board_date = $1::date
        AND status IN ('published','locked','graded','archived')
        AND lower(event_name) = lower($2)
        AND lower(market_type) = lower($3)
        AND lower(selection) = lower($4)
      LIMIT 1
    `,
    boardDate,
    input.eventName,
    input.marketType,
    input.selection
  );
  if (duplicateRows[0]?.id) {
    throw new Error(`Duplicate pick blocked: existing registry id ${duplicateRows[0].id}`);
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

  await prisma.$executeRawUnsafe(
    `
      UPDATE himothy_pick_registry
      SET status = CASE
            WHEN status IN ('graded', 'locked', 'published') THEN 'archived'
            ELSE status
          END,
          is_locked = TRUE,
          lock_time = COALESCE(lock_time, NOW()),
          updated_at = NOW()
      WHERE board_date < $1::date
        AND board_date >= $2::date
        AND status IN ('published','locked','graded')
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

  if (market.includes('moneyline') || sel.includes(' ml')) {
    const winner = chooseWinningSide(event);
    if (winner === 'draw') return 'push';
    if (winner === 'home' && (sel.includes((pick.homeTeam || '').toLowerCase()) || sel.includes('home'))) return 'win';
    if (winner === 'away' && (sel.includes((pick.awayTeam || '').toLowerCase()) || sel.includes('away'))) return 'win';
    return 'loss';
  }

  if (market.includes('over') || market.includes('under') || market.includes('total')) {
    if (!Number.isFinite(line)) return 'void';
    if (sel.includes('over')) {
      if (total > line) return 'win';
      if (total < line) return 'loss';
      return 'push';
    }
    if (sel.includes('under')) {
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

async function fetchEventForPick(pick: RegistryPickRow) {
  const base = LEAGUE_URLS[pick.league] || LEAGUE_URLS[pick.sport] || LEAGUE_URLS['NBA'];
  const dateStr = toLeagueDate(pick.boardDate);

  try {
    const res = await fetch(`${base}/scoreboard?dates=${dateStr}`, { cache: 'no-store' });
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

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT * FROM himothy_pick_registry
      WHERE board_date = $1::date
        AND board_date >= $2::date
        AND status IN ('published','locked','graded')
        AND result = 'pending'
      ORDER BY created_at ASC
    `,
    date,
    OFFICIAL_TRACKING_START_DATE
  );

  const picks = rows.map(formatRow);
  let gradedCount = 0;

  for (const pick of picks) {
    const event = await fetchEventForPick(pick);
    if (!event) continue;

    const result = gradeResultFromEvent(pick, event);
    if (result === 'pending') continue;
    const closingOdds = extractClosingOdds(event);
    const clvDelta = calculateClvDelta(pick.odds, closingOdds);

    await prisma.$executeRawUnsafe(
      `
        UPDATE himothy_pick_registry
        SET result = $2,
            status = 'graded',
            graded_at = NOW(),
          result_changed_at = NOW(),
            closing_odds = $3,
            clv_delta = $4,
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
      clvDelta
    );
    gradedCount += 1;
  }

  await syncBoardRecord(date);
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

  for (const pick of picks) {
    if (pick.result === 'win') totals.wins += 1;
    else if (pick.result === 'loss') totals.losses += 1;
    else if (pick.result === 'push') totals.pushes += 1;
    else if (pick.result === 'void') totals.voids += 1;
    else totals.pending += 1;

    totals.units += asUnits(pick.result, pick.odds);
    if (pick.edgeScore != null) totals.avgEdgeScore += pick.edgeScore;
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
  Object.keys(byProductLine).forEach((k) => {
    byProductLine[k].winRate = safePct(byProductLine[k].wins, byProductLine[k].losses);
    byProductLine[k].avgEdgeScore = byProductLine[k].totalPicks
      ? Number((byProductLine[k].avgEdgeScore / byProductLine[k].totalPicks).toFixed(1))
      : 0;
    byProductLine[k].clvBeatRate = byProductLine[k].clvTracked
      ? `${((byProductLine[k].clvBeatCount / byProductLine[k].clvTracked) * 100).toFixed(1)}%`
      : '0.0%';
  });
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
      avgEdgeScore: totals.totalPicks ? Number((totals.avgEdgeScore / totals.totalPicks).toFixed(1)) : 0,
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

  const wins = picks.filter((p) => p.result === 'win').length;
  const losses = picks.filter((p) => p.result === 'loss').length;
  const pushes = picks.filter((p) => p.result === 'push').length;
  const voids = picks.filter((p) => p.result === 'void').length;
  const pending = picks.filter((p) => p.result === 'pending').length;
  const units = picks.reduce((sum, p) => sum + asUnits(p.result, p.odds), 0);

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
