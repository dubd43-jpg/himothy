// Slate snapshot log — owner directive 2026-06-02: "make a log of what you put out."
// Captures the EXACT customer-facing slate every time it changes. Immutable rows; never
// updated or deleted. Anyone can query "what was on the board at time T?" and get the
// authoritative answer. This is the missing piece that made me keep losing track of
// what was actually displayed vs what's in the (mutable) cache or registry.
//
// Triggered automatically from dailyBoardCache whenever getOrComputeBoard finishes.

import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady || !hasDatabase()) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SlateSnapshot" (
        "id" TEXT PRIMARY KEY,
        "takenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "etDate" TEXT NOT NULL,
        "board" TEXT NOT NULL,
        "trigger" TEXT NOT NULL,
        "grandSlam" JSONB,
        "pressurePack" JSONB,
        "vip4Pack" JSONB,
        "parlayPlan" JSONB,
        "marquee" JSONB,
        "asleepPicks" JSONB,
        "nrfi" JSONB,
        "rawData" JSONB,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SlateSnapshot_etDate_idx" ON "SlateSnapshot" ("etDate")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SlateSnapshot_takenAt_idx" ON "SlateSnapshot" ("takenAt" DESC)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SlateSnapshot_board_idx" ON "SlateSnapshot" ("board")`);
    _schemaReady = true;
  } catch (err) {
    console.error('[slateSnapshot] schema bootstrap failed', err);
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

function stripForSnapshot(p: any): any {
  if (!p) return null;
  return {
    gameId: p.gameId,
    eventName: p.eventName,
    league: p.league,
    sport: p.sport,
    startTime: p.startTime,
    selection: p.selection,
    selectionSide: p.selectionSide,
    marketType: p.marketType,
    line: p.line,
    odds: p.odds,
    tier: p.tier,
    confidenceScore: p.confidenceScore,
    reasonsFor: p.reasonsFor,
    reasonsAgainst: p.reasonsAgainst,
  };
}

export type SnapshotTrigger =
  | 'morning-cron'         // 8am ET cron writing the day's slate
  | 'live-compute'         // first hit of the day computed the slate
  | 'manual-regen'         // admin /api/admin/slate/regenerate
  | 'manual-regen-force'   // admin /api/admin/slate/regenerate with force: true
  | 'reconcile'            // admin /api/admin/reconcile-board
  | 'edit'                 // single-pick edit via picks-editor
  | 'unknown';

// Capture EVERYTHING the slate had at this moment. Called automatically after the
// slate is finalized. Never errors loudly — snapshot failures must not break slate
// generation (the log is best-effort but the user-facing slate is critical).
export async function captureSnapshot(data: any, board: string, trigger: SnapshotTrigger = 'unknown'): Promise<string | null> {
  if (!hasDatabase() || !data) return null;
  await ensureSchema();
  const id = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const etDate = data?.boardDate || etDateKey();
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SlateSnapshot"
        ("id","takenAt","etDate","board","trigger","grandSlam","pressurePack","vip4Pack","parlayPlan","marquee","asleepPicks","nrfi","rawData")
       VALUES ($1, NOW(), $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb)`,
      id, etDate, board, trigger,
      JSON.stringify(stripForSnapshot(data.grandSlam)),
      JSON.stringify((data.pressurePack || []).map(stripForSnapshot)),
      JSON.stringify((data.vip4Pack || []).map(stripForSnapshot)),
      JSON.stringify((data.parlayPlan || []).map(stripForSnapshot)),
      JSON.stringify((data.marquee || []).map(stripForSnapshot)),
      JSON.stringify((data.asleepPicks || []).map(stripForSnapshot)),
      JSON.stringify((data.nrfi || []).map(stripForSnapshot)),
      JSON.stringify(data),
    );
    return id;
  } catch (err) {
    console.error('[slateSnapshot] capture failed', err);
    return null;
  }
}

// What was on the board at time T? Returns the most recent snapshot AT OR BEFORE T.
export async function getSnapshotAt(timestamp: Date | string, board: string): Promise<any | null> {
  if (!hasDatabase()) return null;
  await ensureSchema();
  const t = timestamp instanceof Date ? timestamp : new Date(timestamp);
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id","takenAt","etDate","board","trigger","grandSlam","pressurePack","vip4Pack","parlayPlan","marquee","asleepPicks","nrfi"
       FROM "SlateSnapshot" WHERE "board" = $1 AND "takenAt" <= $2 ORDER BY "takenAt" DESC LIMIT 1`,
      board, t,
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

// All snapshots for a given ET date (chronological order).
export async function getSnapshotsForDate(etDate: string, board?: string): Promise<any[]> {
  if (!hasDatabase()) return [];
  await ensureSchema();
  try {
    if (board) {
      return await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id","takenAt","etDate","board","trigger","grandSlam","pressurePack","vip4Pack","parlayPlan","marquee","asleepPicks","nrfi"
         FROM "SlateSnapshot" WHERE "etDate" = $1 AND "board" = $2 ORDER BY "takenAt" ASC`,
        etDate, board,
      );
    }
    return await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id","takenAt","etDate","board","trigger","grandSlam","pressurePack","vip4Pack","parlayPlan","marquee","asleepPicks","nrfi"
       FROM "SlateSnapshot" WHERE "etDate" = $1 ORDER BY "takenAt" ASC`,
      etDate,
    );
  } catch {
    return [];
  }
}
