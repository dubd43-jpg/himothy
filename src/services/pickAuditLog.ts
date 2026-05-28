// Comprehensive pick lifecycle logging. Every pick that touches the system writes a
// row here — generated, recorded, locked, graded, archived. NO row is ever deleted or
// updated; this is append-only audit trail so we can always reconstruct what happened.
//
// Purpose: when the user asks "what happened to the Cleveland win" we can run a SQL
// query to see every event for that pick, including when it was first generated, when
// it was recorded, when the slate regenerated and dropped it (if applicable), etc.
//
// Use the `logPickEvent()` function below at every point a pick changes state.

import { prisma } from '@/lib/prisma';

export type PickAuditEvent =
  | 'GENERATED'        // Engine produced the pick (first time it appeared)
  | 'RECORDED'         // Written to himothy_pick_registry by the cron
  | 'SLATE_REPLACED'   // Pick was on the slate but got swapped out by a regeneration
  | 'LOCKED'           // Pick locked at slate-publish time
  | 'GRADED'           // Result computed from game outcome (WIN/LOSS/PUSH)
  | 'ARCHIVED'         // Day closed, pick frozen into permanent record
  | 'LINE_UPDATED'     // Existing pick had its odds/line/book updated to a better price
  | 'ERROR';           // Something went wrong (grading failed, etc.)

let _schemaEnsured = false;

async function ensureAuditSchema() {
  if (_schemaEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PickAuditLog" (
        "id" TEXT PRIMARY KEY,
        "occurredAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "boardDate" DATE NOT NULL,
        "event" TEXT NOT NULL,
        "pickKey" TEXT,
        "gameId" TEXT,
        "category" TEXT,
        "selection" TEXT,
        "line" TEXT,
        "odds" TEXT,
        "result" TEXT,
        "status" TEXT,
        "notes" TEXT,
        "details" JSONB
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PickAuditLog_boardDate_idx" ON "PickAuditLog"("boardDate")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PickAuditLog_event_idx" ON "PickAuditLog"("event")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PickAuditLog_pickKey_idx" ON "PickAuditLog"("pickKey")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PickAuditLog_gameId_idx" ON "PickAuditLog"("gameId")`);
    _schemaEnsured = true;
  } catch (err) {
    console.error('ensureAuditSchema failed', err);
  }
}

// Log a single pick lifecycle event. Non-blocking — failures are swallowed so audit
// errors never break the main pick flow. We accept partial data so any caller can use
// this without having to look up every optional field.
export async function logPickEvent(args: {
  event: PickAuditEvent;
  boardDate: string | Date;   // ISO date or string like "2026-05-27"
  pickKey?: string;            // Stable identifier for the pick, e.g., `${gameId}|${selection}`
  gameId?: string;
  category?: string;
  selection?: string;
  line?: string;
  odds?: string;
  result?: string;
  status?: string;
  notes?: string;
  details?: any;
}) {
  try {
    await ensureAuditSchema();
    const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const boardDateValue = typeof args.boardDate === 'string' ? args.boardDate : args.boardDate.toISOString().slice(0, 10);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PickAuditLog" (
         "id", "occurredAt", "boardDate", "event", "pickKey", "gameId",
         "category", "selection", "line", "odds", "result", "status", "notes", "details"
       ) VALUES ($1, NOW(), $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      id, boardDateValue, args.event, args.pickKey || null, args.gameId || null,
      args.category || null, args.selection || null, args.line || null, args.odds || null,
      args.result || null, args.status || null, args.notes || null,
      args.details ? JSON.stringify(args.details) : null,
    );
  } catch (err) {
    // Audit failures must never break the main flow
    console.error('logPickEvent failed', { event: args.event, err });
  }
}

// Bulk-log multiple events in a single round-trip. Used by the recording cron.
export async function logPickEvents(events: Parameters<typeof logPickEvent>[0][]) {
  for (const e of events) await logPickEvent(e);
}

// Query helpers for the admin UI:

export async function getAuditLogForPick(pickKey: string) {
  await ensureAuditSchema();
  return prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "PickAuditLog" WHERE "pickKey" = $1 ORDER BY "occurredAt" ASC`,
    pickKey,
  );
}

export async function getAuditLogForBoardDate(boardDate: string) {
  await ensureAuditSchema();
  return prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "PickAuditLog" WHERE "boardDate" = $1::date ORDER BY "occurredAt" ASC`,
    boardDate,
  );
}

export async function getRecentAuditLog(limit = 100) {
  await ensureAuditSchema();
  return prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "PickAuditLog" ORDER BY "occurredAt" DESC LIMIT $1`,
    limit,
  );
}
