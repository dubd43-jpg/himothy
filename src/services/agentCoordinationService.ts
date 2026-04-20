import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { refreshLiveOpsSnapshot } from '@/services/liveOpsService';
import { getOfficialTrackingSnapshot, getRegistryBoardPicks, getRegistrySummary } from '@/services/pickRegistryService';
import { getOfficialBoardDate } from '@/lib/officialTracking';

export interface CoordinationActionOptions {
  action: string;
  boardDate?: string;
  reason: string;
  agent: string;
}

interface BoardStateSummary {
  boardDate: string;
  totalPicks: number;
  published: number;
  locked: number;
  graded: number;
  archived: number;
  pending: number;
  finalized: boolean;
  finalizedAt: string | null;
}

let schemaReady = false;

async function ensureCoordinationSchema() {
  if (schemaReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS himothy_agent_change_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      board_date DATE,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      agent_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      before_state JSONB,
      after_state JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_himo_agent_change_log_board_date ON himothy_agent_change_log(board_date);
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS himothy_agent_coordination_rules (
      id TEXT PRIMARY KEY,
      rules_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO himothy_agent_coordination_rules (id, rules_json)
      VALUES ('default', $1::jsonb)
      ON CONFLICT (id) DO NOTHING
    `,
    JSON.stringify({
      readBeforeWrite: true,
      noOverwriteLocked: true,
      noDeleteHistory: true,
      noDuplicateActions: true,
      immutableStatuses: ['locked', 'graded', 'archived'],
    })
  );

  schemaReady = true;
}

async function getBoardStateSummary(boardDate: string): Promise<BoardStateSummary> {
  const picks = await getRegistryBoardPicks({ boardDate, includePrivate: true });
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT finalized, finalized_at FROM himothy_daily_board_records WHERE board_date = $1::date LIMIT 1`,
    boardDate
  );

  const daily = rows[0] || {};

  return {
    boardDate,
    totalPicks: picks.length,
    published: picks.filter((p) => p.status === 'published').length,
    locked: picks.filter((p) => p.status === 'locked').length,
    graded: picks.filter((p) => p.status === 'graded').length,
    archived: picks.filter((p) => p.status === 'archived').length,
    pending: picks.filter((p) => p.result === 'pending').length,
    finalized: Boolean(daily.finalized),
    finalizedAt: daily.finalized_at ? new Date(daily.finalized_at).toISOString() : null,
  };
}

async function acquireActionLock(lockKey: string) {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT pg_try_advisory_lock(hashtext($1)) AS locked`,
    lockKey
  );
  return Boolean(rows[0]?.locked);
}

async function releaseActionLock(lockKey: string) {
  await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(hashtext($1))`, lockKey);
}

async function writeChangeLog(input: {
  action: string;
  boardDate?: string;
  entityType: string;
  entityId?: string | null;
  agent: string;
  reason: string;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
}) {
  await ensureCoordinationSchema();

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO himothy_agent_change_log (
        id, action, board_date, entity_type, entity_id, agent_name, reason, before_state, after_state
      ) VALUES (
        $1, $2, $3::date, $4, $5, $6, $7, $8::jsonb, $9::jsonb
      )
    `,
    randomUUID(),
    input.action,
    input.boardDate || null,
    input.entityType,
    input.entityId || null,
    input.agent,
    input.reason,
    JSON.stringify(input.beforeState || {}),
    JSON.stringify(input.afterState || {})
  );
}

export async function getUnifiedSystemState(boardDate?: string) {
  await ensureCoordinationSchema();
  const date = getOfficialBoardDate(boardDate);

  const [tracking, todayPicks, summary, liveOps, rulesRows] = await Promise.all([
    getOfficialTrackingSnapshot(date),
    getRegistryBoardPicks({ boardDate: date, includePrivate: true }),
    getRegistrySummary(),
    refreshLiveOpsSnapshot({ reason: 'coordination-read', maxStaleSeconds: 120 }),
    prisma.$queryRawUnsafe<any[]>(`SELECT rules_json, updated_at FROM himothy_agent_coordination_rules WHERE id = 'default' LIMIT 1`),
  ]);

  return {
    boardDate: date,
    activeBoard: {
      totalPicks: todayPicks.length,
      picks: todayPicks,
    },
    pickRegistryTotals: summary.totals,
    liveResults: {
      gamesMonitored: liveOps.games.length,
      researchReady: liveOps.researchReadyCount,
      lineChanges: liveOps.lineChangeCount,
      generatedAt: liveOps.generatedAt,
      refreshAgeSeconds: liveOps.ageSeconds,
    },
    dailyRecord: tracking.dailyRecord,
    lifetimeRecord: tracking.lifetimeRecord,
    systemRules: rulesRows[0]?.rules_json || {},
    configurationState: {
      runCount: liveOps.runCount,
      lastReason: liveOps.reason,
    },
    lastUpdates: {
      trackingGeneratedAt: liveOps.generatedAt,
      snapshotAt: new Date().toISOString(),
    },
  };
}

export async function runCoordinatedBoardAction<T>(
  options: CoordinationActionOptions,
  executor: (context: { boardDate: string; before: BoardStateSummary }) => Promise<T>
) {
  await ensureCoordinationSchema();

  const boardDate = getOfficialBoardDate(options.boardDate);
  const lockKey = `himo:${options.action}:${boardDate}`;

  const locked = await acquireActionLock(lockKey);
  if (!locked) {
    throw new Error(`COORDINATION_CONFLICT: another action is already processing ${options.action} for ${boardDate}`);
  }

  try {
    const before = await getBoardStateSummary(boardDate);

    if (options.action === 'publish' && before.finalized) {
      throw new Error(`COORDINATION_BLOCKED: board ${boardDate} is finalized and cannot accept new picks`);
    }

    const result = await executor({ boardDate, before });
    const after = await getBoardStateSummary(boardDate);
    const beforeStatePayload = before as unknown as Record<string, unknown>;
    const afterStatePayload = after as unknown as Record<string, unknown>;

    await writeChangeLog({
      action: options.action,
      boardDate,
      entityType: 'board',
      entityId: boardDate,
      agent: options.agent,
      reason: options.reason,
      beforeState: beforeStatePayload,
      afterState: afterStatePayload,
    });

    return { result, boardDate, before, after };
  } finally {
    await releaseActionLock(lockKey);
  }
}

export async function getRecentCoordinationChanges(limit = 50) {
  await ensureCoordinationSchema();

  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT id, action, board_date, entity_type, entity_id, agent_name, reason, before_state, after_state, created_at
      FROM himothy_agent_change_log
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
    `
  );

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    boardDate: row.board_date ? new Date(row.board_date).toISOString().slice(0, 10) : null,
    entityType: row.entity_type,
    entityId: row.entity_id,
    agent: row.agent_name,
    reason: row.reason,
    beforeState: row.before_state,
    afterState: row.after_state,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}
