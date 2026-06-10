// REFEREE / UMPIRE TENDENCY SERVICE
//
// Pre-game ref crew → tendency adjustment fed into NBA / MLB total scoring.
// NBA crew impact on totals is 4-6 pts in either direction. MLB umpire impact is
// 0.5-1.5 runs depending on zone tightness.
//
// Data flow:
//   1. NBA: scrape officialnba.com referee assignments page (or fall back to ESPN
//      post-game data which exposes the crew once the game starts).
//   2. MLB: ESPN summary endpoint exposes plate umpire pre-game once probable
//      pitchers are confirmed.
//   3. Tendencies: rolling 30-game averages stored in `referee_tendencies`
//      Postgres table. Built from post-game box scores via a cron we add later.
//
// For SIGNALING right now (before tendency DB has data), the service returns a
// shape with `dataAvailable: false` and the engine falls back to its normal
// scoring. As tendencies populate, the engine starts boosting/penalizing totals
// based on the crew.

import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';
import { LEAGUE_URLS } from '@/lib/validation';

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady || !hasDatabase()) return;
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
    _schemaReady = true;
  } catch (err) {
    console.error('[referee] schema bootstrap failed', err);
  }
}

export interface RefereeCrew {
  league: string;
  officials: Array<{ name: string; position?: string; id?: string }>;
  source: 'espn-summary' | 'nba-assignments' | 'mlb-rotowire' | 'unavailable';
}

export interface RefereeTendencyResult {
  dataAvailable: boolean;
  crew: RefereeCrew | null;
  // Aggregate tendency across the crew (NBA = avg fouls/game above league norm;
  // MLB = avg runs over total above league norm). Positive = pushes totals UP.
  totalsAdjustment: number | null;
  // Per-official tendency rows so reasonsFor can attribute the lean to a name.
  perOfficial: Array<{ name: string; foulRatePerGame?: number; totalsLean?: 'over' | 'under' | 'neutral'; sample: number }>;
  reason: string | null;
}

const EMPTY_RESULT: RefereeTendencyResult = {
  dataAvailable: false, crew: null, totalsAdjustment: null, perOfficial: [], reason: null,
};

// In-memory cache. The post-game crew is the same across instances for that event.
const crewCache = new Map<string, { crew: RefereeCrew; at: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

async function fetchCrewFromEspn(gameId: string, league: string): Promise<RefereeCrew | null> {
  const baseUrl = LEAGUE_URLS[league];
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/summary?event=${gameId}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const officials =
      data?.gameInfo?.officials ||
      data?.header?.competitions?.[0]?.officials ||
      data?.competitions?.[0]?.officials ||
      [];
    if (!Array.isArray(officials) || officials.length === 0) return null;
    return {
      league,
      source: 'espn-summary',
      officials: officials.map((o: any) => ({
        name: o.displayName || o.fullName || o.name || '',
        position: o.position?.displayName || o.position?.name,
        id: o.athlete?.id || o.id,
      })).filter((o: any) => o.name),
    };
  } catch { return null; }
}

export async function getRefereeCrew(gameId: string, league: string): Promise<RefereeCrew | null> {
  const k = `${league}:${gameId}`;
  const cached = crewCache.get(k);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.crew;
  const crew = await fetchCrewFromEspn(gameId, league);
  if (crew) crewCache.set(k, { crew, at: Date.now() });
  return crew;
}

// Pulls rolling tendency rows from Postgres. Until the table fills (cron records
// crew + box-score totals after each game), this returns an empty array.
async function getTendencies(names: string[], league: string) {
  if (!hasDatabase() || names.length === 0) {
    return [] as Array<{ name: string; sample: number; foulRatePerGame?: number; totalsLean?: 'over' | 'under' | 'neutral' }>;
  }
  await ensureSchema();
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string; sample: any; avg_fouls_per_game: any; over_under_lean: string | null }>>(
      `SELECT name, sample, avg_fouls_per_game, over_under_lean
       FROM referee_tendencies
       WHERE league = $1 AND name = ANY($2::text[])`,
      league, names,
    );
    return rows.map((r) => ({
      name: r.name,
      sample: Number(r.sample) || 0,
      foulRatePerGame: r.avg_fouls_per_game != null ? Number(r.avg_fouls_per_game) : undefined,
      totalsLean: (r.over_under_lean === 'over' || r.over_under_lean === 'under' || r.over_under_lean === 'neutral')
        ? (r.over_under_lean as 'over' | 'under' | 'neutral')
        : 'neutral' as const,
    }));
  } catch { return []; }
}

export async function getRefereeTendency(gameId: string, league: string): Promise<RefereeTendencyResult> {
  if (league !== 'NBA' && league !== 'WNBA' && league !== 'MLB' && league !== 'NHL') {
    return EMPTY_RESULT;
  }
  const crew = await getRefereeCrew(gameId, league);
  if (!crew || crew.officials.length === 0) return EMPTY_RESULT;

  const names = crew.officials.map((o) => o.name);
  const tendencies = await getTendencies(names, league);
  if (tendencies.length === 0) {
    // Crew is known but tendency DB is empty for them — still useful so the breakdown
    // can show "Refs: <names>" without making any directional claim.
    return {
      dataAvailable: true,
      crew,
      totalsAdjustment: null,
      perOfficial: names.map((name) => ({ name, sample: 0, totalsLean: 'neutral' as const })),
      reason: null,
    };
  }

  // Crew-level adjustment: average of per-official totalsLean. Map over → +1, under → -1.
  const leanVotes: number[] = tendencies.map((t) => t.totalsLean === 'over' ? 1 : t.totalsLean === 'under' ? -1 : 0);
  const meanLean: number = leanVotes.reduce((a: number, b: number) => a + b, 0) / leanVotes.length;
  // Scale to roughly +/- 3 pts (NBA) or +/- 0.6 runs (MLB).
  const scale = league === 'MLB' ? 0.6 : 3;
  const totalsAdjustment = Number((meanLean * scale).toFixed(2));

  let reason: string | null = null;
  if (totalsAdjustment >= 1) {
    reason = `Crew leans toward the OVER historically (${tendencies.length}/${crew.officials.length} officials with over tendencies, avg sample ${Math.round(tendencies.reduce((a, b) => a + b.sample, 0) / tendencies.length)} games).`;
  } else if (totalsAdjustment <= -1) {
    reason = `Crew leans toward the UNDER historically (${tendencies.length}/${crew.officials.length} officials with under tendencies, avg sample ${Math.round(tendencies.reduce((a, b) => a + b.sample, 0) / tendencies.length)} games).`;
  }

  return {
    dataAvailable: true,
    crew,
    totalsAdjustment,
    perOfficial: names.map((name) => {
      const t = tendencies.find((x) => x.name === name);
      return { name, sample: t?.sample || 0, foulRatePerGame: t?.foulRatePerGame, totalsLean: (t?.totalsLean || 'neutral') as 'over' | 'under' | 'neutral' };
    }),
    reason,
  };
}
