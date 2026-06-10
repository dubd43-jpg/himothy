// Manual injury input — owner directive 2026-06-02: "we need an API for every sport,"
// but the honest reality is no free injury feed exists for NCAA Baseball, KBO, AFL,
// most lower-tier soccer, etc. So this gives the owner a path to type in injuries
// they hear about (news, Twitter, team beat reporter) and have the engine consume
// them the same way ESPN/statsapi data is consumed. Practical answer to "API doesn't
// exist for this league" — owner becomes the source.
//
// Storage: ManualInjury table. Each entry has expiresAt so stale info auto-clears.

import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady || !hasDatabase()) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ManualInjury" (
        "id" TEXT PRIMARY KEY,
        "teamName" TEXT NOT NULL,
        "league" TEXT NOT NULL,
        "playerName" TEXT NOT NULL,
        "position" TEXT,
        "status" TEXT NOT NULL,
        "note" TEXT,
        "addedBy" TEXT NOT NULL DEFAULT 'admin',
        "addedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManualInjury_team_idx" ON "ManualInjury" ("teamName")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManualInjury_expires_idx" ON "ManualInjury" ("expiresAt")`);
    _schemaReady = true;
  } catch (err) {
    console.error('[manualInjury] schema bootstrap failed', err);
  }
}

export type ManualInjuryStatus = 'OUT' | 'DOUBTFUL' | 'QUESTIONABLE';

export interface ManualInjuryEntry {
  id: string;
  teamName: string;
  league: string;
  playerName: string;
  position: string | null;
  status: ManualInjuryStatus;
  note: string | null;
  addedBy: string;
  addedAt: Date;
  expiresAt: Date;
}

export async function addManualInjury(input: {
  teamName: string; league: string; playerName: string;
  status: ManualInjuryStatus; position?: string; note?: string;
  hoursValid?: number; addedBy?: string;
}): Promise<string | null> {
  if (!hasDatabase()) return null;
  await ensureSchema();
  const id = `inj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = new Date(Date.now() + (input.hoursValid || 24) * 60 * 60 * 1000);
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ManualInjury" ("id","teamName","league","playerName","position","status","note","addedBy","expiresAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      id, input.teamName, input.league, input.playerName,
      input.position || null, input.status, input.note || null,
      input.addedBy || 'admin', expiresAt,
    );
    return id;
  } catch (err) {
    console.error('[manualInjury] insert failed', err);
    return null;
  }
}

export async function deleteManualInjury(id: string): Promise<boolean> {
  if (!hasDatabase()) return false;
  await ensureSchema();
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "ManualInjury" WHERE "id" = $1`, id);
    return true;
  } catch {
    return false;
  }
}

// Pull active (non-expired) manual injuries for a team. Auto-prunes stale rows.
export async function getActiveManualInjuriesForTeam(teamName: string, league: string): Promise<ManualInjuryEntry[]> {
  if (!hasDatabase()) return [];
  await ensureSchema();
  try {
    // Cheap garbage collection inline — expired rows auto-disappear
    await prisma.$executeRawUnsafe(`DELETE FROM "ManualInjury" WHERE "expiresAt" < NOW()`);
    const rows = await prisma.$queryRawUnsafe<ManualInjuryEntry[]>(
      `SELECT "id","teamName","league","playerName","position","status","note","addedBy","addedAt","expiresAt"
       FROM "ManualInjury" WHERE LOWER("teamName") = LOWER($1) AND LOWER("league") = LOWER($2)
       ORDER BY "addedAt" DESC`,
      teamName, league,
    );
    return rows;
  } catch {
    return [];
  }
}

export async function listAllActiveManualInjuries(): Promise<ManualInjuryEntry[]> {
  if (!hasDatabase()) return [];
  await ensureSchema();
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "ManualInjury" WHERE "expiresAt" < NOW()`);
    return await prisma.$queryRawUnsafe<ManualInjuryEntry[]>(
      `SELECT "id","teamName","league","playerName","position","status","note","addedBy","addedAt","expiresAt"
       FROM "ManualInjury" WHERE "expiresAt" > NOW() ORDER BY "addedAt" DESC LIMIT 500`,
    );
  } catch {
    return [];
  }
}
