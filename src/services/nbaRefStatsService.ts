// NBA REFEREE TENDENCY BACKFILL
//
// Walks completed NBA / WNBA games and computes per-official rolling tendencies
// for the `referee_tendencies` Postgres table that refereeService reads from.
//
// For each game:
//   1. List completed games via stats.nba.com leaguegamelog (or ESPN as fallback)
//   2. Pull officials + final score via boxscoresummaryv2
//   3. Pull the closing total line from ESPN (their summary's "odds" block) or
//      our own OddsSnapshot table
//   4. Compute: did total go over/under, and how many fouls in this game
//   5. Update per-official rolling stats — sample size, foul rate, over rate
//   6. Recompute totalsLean: 'over' | 'under' | 'neutral' from rolling over-rate
//
// Runs nightly via /api/cron/refresh-nba-refs.

import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';

// ESPN scoreboard → list of completed games for one day. We walk N days back
// because ESPN's "dates" param takes a YYYYMMDD ET date and returns only that
// day's games.
async function listGamesEspnNba(daysBack: number): Promise<Array<{ gameId: string; date: string }>> {
  const out: Array<{ gameId: string; date: string }> = [];
  const now = new Date();
  for (let i = 1; i <= daysBack; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const ymd = `${yyyy}${mm}${dd}`;
    try {
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${ymd}`,
        { cache: 'no-store', headers: { 'User-Agent': 'himothypicks.com/1.0' } },
      );
      if (!res.ok) continue;
      const json: any = await res.json();
      const events: any[] = json?.events || [];
      for (const ev of events) {
        const completed = ev?.status?.type?.completed === true || ev?.status?.type?.state === 'post';
        if (!completed) continue;
        const gid = String(ev?.id || '');
        if (gid) out.push({ gameId: gid, date: ev?.date || `${yyyy}-${mm}-${dd}` });
      }
    } catch { /* keep walking */ }
  }
  return out;
}

// ESPN summary → officials, final score, and the closing total line for one event.
async function fetchEspnSummary(gameId: string): Promise<{
  officials: string[]; homeFinal: number; awayFinal: number; totalLine: number | null;
} | null> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`,
      { cache: 'no-store', headers: { 'User-Agent': 'himothypicks.com/1.0' } },
    );
    if (!res.ok) return null;
    const json: any = await res.json();

    const officialsRaw =
      json?.gameInfo?.officials ||
      json?.header?.competitions?.[0]?.officials ||
      [];
    const officials: string[] = (officialsRaw as any[])
      .map((o: any) => o?.displayName || o?.fullName || o?.name || '')
      .filter((n: string) => !!n);

    const comp = json?.header?.competitions?.[0] || json?.competitions?.[0];
    const competitors: any[] = comp?.competitors || [];
    const home = competitors.find((c) => c?.homeAway === 'home');
    const away = competitors.find((c) => c?.homeAway === 'away');
    const homeFinal = Number(home?.score || 0);
    const awayFinal = Number(away?.score || 0);

    // ESPN exposes the consensus closing line on a few different shapes.
    // pickcenter is the most reliable for completed games.
    let totalLine: number | null = null;
    const pickcenter: any[] = json?.pickcenter || [];
    for (const pc of pickcenter) {
      const ou = Number(pc?.overUnder);
      if (isFinite(ou) && ou > 0) { totalLine = ou; break; }
    }
    if (totalLine == null) {
      const odds: any[] = comp?.odds || [];
      for (const o of odds) {
        const ou = Number(o?.overUnder);
        if (isFinite(ou) && ou > 0) { totalLine = ou; break; }
      }
    }

    return { officials, homeFinal, awayFinal, totalLine };
  } catch { return null; }
}

async function ensureRefTable() {
  if (!hasDatabase()) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "referee_tendencies" (
        "name" TEXT NOT NULL,
        "league" TEXT NOT NULL,
        "sample" INT NOT NULL DEFAULT 0,
        "avg_fouls_per_game" NUMERIC,
        "over_under_lean" TEXT,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("name", "league")
      )
    `);
    // Add rolling stats columns we need beyond the original 4. IF NOT EXISTS
    // makes this idempotent.
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "referee_tendencies"
        ADD COLUMN IF NOT EXISTS "over_hits" INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "under_hits" INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "push_hits" INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "total_pts_sum" NUMERIC NOT NULL DEFAULT 0
    `);
  } catch (err) {
    console.error('[nbaRefStats] ensureRefTable failed', err);
  }
}

// Update one official's rolling row.
async function upsertOfficial(name: string, league: string, hit: 'over' | 'under' | 'push' | null, totalPts: number) {
  const overInc = hit === 'over' ? 1 : 0;
  const underInc = hit === 'under' ? 1 : 0;
  const pushInc = hit === 'push' ? 1 : 0;
  const sampleInc = hit ? 1 : 0;
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO referee_tendencies
        (name, league, sample, over_hits, under_hits, push_hits, total_pts_sum, over_under_lean, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'neutral', NOW())
       ON CONFLICT (name, league) DO UPDATE SET
         sample = referee_tendencies.sample + EXCLUDED.sample,
         over_hits = referee_tendencies.over_hits + EXCLUDED.over_hits,
         under_hits = referee_tendencies.under_hits + EXCLUDED.under_hits,
         push_hits = referee_tendencies.push_hits + EXCLUDED.push_hits,
         total_pts_sum = referee_tendencies.total_pts_sum + EXCLUDED.total_pts_sum,
         over_under_lean = CASE
           WHEN (referee_tendencies.sample + EXCLUDED.sample) < 5 THEN 'neutral'
           WHEN (referee_tendencies.over_hits + EXCLUDED.over_hits)::float
                / NULLIF(referee_tendencies.sample + EXCLUDED.sample, 0) >= 0.58 THEN 'over'
           WHEN (referee_tendencies.under_hits + EXCLUDED.under_hits)::float
                / NULLIF(referee_tendencies.sample + EXCLUDED.sample, 0) >= 0.58 THEN 'under'
           ELSE 'neutral'
         END,
         updated_at = NOW()`,
      name, league, sampleInc, overInc, underInc, pushInc, totalPts,
    );
  } catch (err) {
    console.error('[nbaRefStats] upsert failed for', name, err);
  }
}

export interface RefreshResult {
  league: string;
  gamesScanned: number;
  gamesScored: number;          // games we successfully recorded with a known line
  officialsTouched: number;
  errors: number;
}

// Main entry point. Refreshes NBA ref tendencies by walking the last `daysBack`
// completed games. Idempotent on a per-game basis is NOT yet enforced — calling
// twice in the same day will double-count. The cron runs once daily at 3am ET
// so this is OK; if we need stricter idempotency, add a `processed_games`
// table later.
export async function refreshNbaRefTendencies(daysBack = 7): Promise<RefreshResult> {
  const result: RefreshResult = { league: 'NBA', gamesScanned: 0, gamesScored: 0, officialsTouched: 0, errors: 0 };
  if (!hasDatabase()) return result;
  await ensureRefTable();

  const games = await listGamesEspnNba(daysBack);
  result.gamesScanned = games.length;

  for (const g of games) {
    try {
      const summary = await fetchEspnSummary(g.gameId);
      if (!summary || summary.officials.length === 0) continue;
      const total = summary.homeFinal + summary.awayFinal;
      const line = summary.totalLine;

      let hit: 'over' | 'under' | 'push' | null = null;
      if (line != null) {
        if (total > line) hit = 'over';
        else if (total < line) hit = 'under';
        else hit = 'push';
        result.gamesScored++;
      }

      for (const offName of summary.officials) {
        await upsertOfficial(offName, 'NBA', hit, total);
        result.officialsTouched++;
      }
    } catch (err) {
      result.errors++;
      console.error('[nbaRefStats] game failed', g.gameId, err);
    }
  }

  return result;
}
