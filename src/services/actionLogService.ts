// Universal action log — owner directive 2026-06-02: "save everything, log everything,
// make documents and notes of everything we do, so we never lose track again."
//
// Anything that changes state — pick recommendations made in chat, slate regenerations,
// admin pick edits, manual graderuns, registry inserts — writes a row here. Searchable
// by date, action type, free-text. Owner can browse /admin/actions to see exactly what
// happened any given day.

import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady || !hasDatabase()) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ActionLog" (
        "id" TEXT PRIMARY KEY,
        "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "etDate" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "actor" TEXT NOT NULL,
        "subject" TEXT,
        "summary" TEXT NOT NULL,
        "details" JSONB,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ActionLog_etDate_idx" ON "ActionLog" ("etDate")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ActionLog_action_idx" ON "ActionLog" ("action")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ActionLog_occurredAt_idx" ON "ActionLog" ("occurredAt" DESC)`);
    _schemaReady = true;
  } catch (err) {
    console.error('[actionLog] schema bootstrap failed', err);
  }
}

function etDateKey(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value || '1970';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}-${m}-${day}`;
}

export type ActionType =
  | 'CHAT_PICK_RECOMMENDED'      // Claude recommended a pick in chat
  | 'CHAT_PICK_AUTO_RECORDED'    // Conf 96+ chat pick auto-pushed to registry
  | 'SLATE_REGENERATED'          // Mid-day regen happened (force-override only after 2026-06-02 lock)
  | 'SLATE_LOCK_REJECTED'        // Regen blocked by hard-lock
  | 'PICK_MANUALLY_EDITED'       // Admin used picks-editor
  | 'PICK_MANUALLY_DELETED'      // Admin removed a pick
  | 'GRADING_RUN'                // Grader ran (cron or manual)
  | 'BACKFILL_TRIGGERED'         // Reconcile-board or recoverMissed ran
  | 'SESSION_NOTE'               // Free-form developer/session note
  | 'ENGINE_DEPLOYED'            // Build + deploy completed
  | 'DATA_SOURCE_ADDED'          // New API/service wired into engine
  | 'BUG_FIXED'                  // Bug fix shipped
  | 'PRODUCT_CHANGED'            // Customer-facing product behavior changed
  | 'FLIP_CONSENSUS_FIRED'       // FlipConsensus decided to swap a pick (LIVE mode)
  | 'FLIP_CONSENSUS_WATCH';      // FlipConsensus would have flipped but blocked, or partial signal

export interface LogActionInput {
  action: ActionType;
  actor: string;              // 'claude' | 'cron' | 'admin' | 'system'
  summary: string;            // One-line human-readable description
  subject?: string;           // Optional secondary key (pick id, board, date)
  details?: any;              // JSON blob for anything else
  at?: Date;                  // Override timestamp (defaults to now)
}

export async function logAction(input: LogActionInput): Promise<string | null> {
  if (!hasDatabase()) return null;
  await ensureSchema();
  const id = `act_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const at = input.at || new Date();
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ActionLog" ("id", "occurredAt", "etDate", "action", "actor", "subject", "summary", "details")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      id, at, etDateKey(at), input.action, input.actor,
      input.subject || null, input.summary, JSON.stringify(input.details || {}),
    );
    return id;
  } catch (err) {
    console.error('[actionLog] insert failed', err, input);
    return null;
  }
}

export async function getActionsForDate(etDate: string, limit = 500): Promise<any[]> {
  if (!hasDatabase()) return [];
  await ensureSchema();
  try {
    return await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id", "occurredAt", "etDate", "action", "actor", "subject", "summary", "details"
       FROM "ActionLog" WHERE "etDate" = $1 ORDER BY "occurredAt" DESC LIMIT $2`,
      etDate, limit,
    );
  } catch {
    return [];
  }
}

export async function getRecentActions(limit = 200): Promise<any[]> {
  if (!hasDatabase()) return [];
  await ensureSchema();
  try {
    return await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id", "occurredAt", "etDate", "action", "actor", "subject", "summary", "details"
       FROM "ActionLog" ORDER BY "occurredAt" DESC LIMIT $1`,
      limit,
    );
  } catch {
    return [];
  }
}

export async function searchActions(query: string, limit = 200): Promise<any[]> {
  if (!hasDatabase()) return [];
  await ensureSchema();
  try {
    return await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id", "occurredAt", "etDate", "action", "actor", "subject", "summary", "details"
       FROM "ActionLog"
       WHERE "summary" ILIKE $1 OR "subject" ILIKE $1 OR "action" ILIKE $1
       ORDER BY "occurredAt" DESC LIMIT $2`,
      `%${query}%`, limit,
    );
  } catch {
    return [];
  }
}
