// HIMOTHY Personal Pick — single highest-edge player prop across EVERY sport's slate.
//
// User's spec: "It should always look for the best prop in all the games. Over and under
// any basketball, NBA props, any NFL, any college, any NHL, just the best prop of all.
// One pick."
//
// How it works:
//   1. Pull each league's scoreboard for today (MLB / NBA / WNBA / NHL / NFL / NCAA*).
//   2. For every game on every league, build pre-game props (preGamePropsService).
//   3. Aggregate every PropEdge, sort by edgeScore desc, return the single top one.
//   4. Cache the result per ET-day in Postgres so it stays frozen all day (same model as
//      the daily slate).
//
// This is the engine behind the standalone HIMOTHY Personal Pick product (not bundled
// with subscriptions; pay-per-pick). It runs in parallel to the team-pick engine.

import { LEAGUE_URLS } from '@/lib/validation';
import { buildPreGameProps, type PreGamePropEdge } from '@/services/preGamePropsService';
import { hasDatabase } from '@/lib/hasDatabase';
import { prisma } from '@/lib/prisma';

const SCAN_LEAGUES = ['MLB', 'NBA', 'WNBA', 'NHL', 'NFL', 'NCAA Basketball'];

function todayEtKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === 'year')?.value}${parts.find((p) => p.type === 'month')?.value}${parts.find((p) => p.type === 'day')?.value}`;
}

function isTodayEt(iso?: string | null): boolean {
  if (!iso) return false;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(iso));
    const key = `${parts.find((p) => p.type === 'year')?.value}${parts.find((p) => p.type === 'month')?.value}${parts.find((p) => p.type === 'day')?.value}`;
    return key === todayEtKey();
  } catch { return false; }
}

let _schemaReady = false;
async function ensurePersonalPickSchema() {
  if (_schemaReady || !hasDatabase()) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PersonalPickCache" (
        "etDate" TEXT NOT NULL PRIMARY KEY,
        "data" JSONB NOT NULL,
        "generatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    _schemaReady = true;
  } catch (err) {
    console.error('[personalPickService] ensure schema failed', err);
  }
}

async function readCachedPersonalPick(etDate: string): Promise<any | null> {
  if (!hasDatabase()) return null;
  await ensurePersonalPickSchema();
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "data" FROM "PersonalPickCache" WHERE "etDate" = $1`, etDate,
    );
    return rows[0]?.data ?? null;
  } catch (err) {
    console.error('[personalPickService] read failed', err);
    return null;
  }
}

async function writeCachedPersonalPick(etDate: string, data: any) {
  if (!hasDatabase()) return;
  await ensurePersonalPickSchema();
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PersonalPickCache" ("etDate", "data", "generatedAt")
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT ("etDate") DO UPDATE SET "data" = EXCLUDED."data", "generatedAt" = NOW()`,
      etDate, JSON.stringify(data),
    );
  } catch (err) {
    console.error('[personalPickService] write failed', err);
  }
}

export async function invalidatePersonalPick() {
  if (!hasDatabase()) return;
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "PersonalPickCache" WHERE "etDate" = $1`, todayEtKey());
  } catch (err) {
    console.error('[personalPickService] invalidate failed', err);
  }
}

async function fetchTodaysEvents(league: string): Promise<Array<{ gameId: string; eventName: string; competition: any }>> {
  const baseUrl = LEAGUE_URLS[league];
  if (!baseUrl) return [];
  const out: Array<{ gameId: string; eventName: string; competition: any }> = [];
  try {
    // Today + yesterday (catch late-running games still bookable for live props once live).
    const fmt = (offset: number) => {
      const d = new Date(); d.setDate(d.getDate() + offset);
      return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    };
    const dates = [fmt(0)];
    for (const dateStr of dates) {
      const r = await fetch(`${baseUrl}/scoreboard?dates=${dateStr}`, { cache: 'no-store' });
      if (!r.ok) continue;
      const data = await r.json();
      for (const ev of data?.events || []) {
        if (!isTodayEt(ev?.date)) continue;
        // Skip post-state games — they can't be bet on for props anymore.
        const state = ev?.status?.type?.state;
        if (state === 'post' || ev?.status?.type?.completed) continue;
        const competition = ev?.competitions?.[0];
        if (!competition) continue;
        out.push({ gameId: String(ev.id), eventName: ev.name || ev.shortName || '', competition });
      }
    }
  } catch (err) {
    console.error(`[personalPickService] fetch ${league} events failed`, err);
  }
  return out;
}

export interface PersonalPickResult {
  generatedAt: string;
  boardDate: string;
  topPick: PreGamePropEdge & { gameId: string; eventName: string } | null;
  runnerUps: Array<PreGamePropEdge & { gameId: string; eventName: string }>;
  totalGamesScanned: number;
  totalPropsEvaluated: number;
  emptyReason?: string;
}

export async function getPersonalPick(forceRefresh = false): Promise<PersonalPickResult> {
  const etDate = todayEtKey();
  if (!forceRefresh) {
    const cached = await readCachedPersonalPick(etDate);
    if (cached) return cached;
  }

  let totalGames = 0;
  let totalProps = 0;
  const allEdges: Array<PreGamePropEdge & { gameId: string; eventName: string }> = [];

  // Scan each league sequentially (rate-friendly) — could parallelize per-league later
  // once we confirm ESPN doesn't rate-limit us.
  for (const league of SCAN_LEAGUES) {
    const games = await fetchTodaysEvents(league);
    totalGames += games.length;
    for (const game of games) {
      try {
        const propsResult = await buildPreGameProps(game.gameId, game.eventName, league, game.competition);
        totalProps += propsResult.propEdges.length;
        for (const edge of propsResult.propEdges) {
          allEdges.push({ ...edge, gameId: game.gameId, eventName: game.eventName });
        }
      } catch (err) {
        console.error(`[personalPickService] buildPreGameProps failed for ${game.eventName}`, err);
      }
    }
  }

  allEdges.sort((a, b) => b.edgeScore - a.edgeScore);
  const topPick = allEdges[0] || null;
  const runnerUps = allEdges.slice(1, 6); // next 5 for context / fallback display

  const result: PersonalPickResult = {
    generatedAt: new Date().toISOString(),
    boardDate: etDate,
    topPick,
    runnerUps,
    totalGamesScanned: totalGames,
    totalPropsEvaluated: totalProps,
    emptyReason: topPick ? undefined : (
      totalGames === 0 ? 'No games found across scanned leagues for today.' :
      totalProps === 0 ? 'No qualifying player-prop projections produced today (likely Odds API quota exhausted or low-sample players).' :
      undefined
    ),
  };
  await writeCachedPersonalPick(etDate, result);
  return result;
}
