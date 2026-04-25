import { prisma } from '@/lib/prisma';
import { fetchLiveSlate, LiveSlateGame } from '@/lib/liveSlate';
import { EdgeScanCandidate, scanAllResearchLanes } from '@/services/edgeDetectionEngine';

interface LiveOpsStoredPayload {
  generatedAt: string;
  games: LiveSlateGame[];
  upcomingGameCount: number;
  researchReadyCount: number;
  lineChangeCount: number;
  topCandidates: EdgeScanCandidate[];
}

export interface LiveOpsSnapshot extends LiveOpsStoredPayload {
  refreshed: boolean;
  ageSeconds: number;
  runCount: number;
  reason: string;
}

const STATE_ID = 'global';
const DEFAULT_STALE_SECONDS = 120;
let schemaReady = false;

function flattenCandidates(lanes: Record<string, { candidates: EdgeScanCandidate[] }>) {
  return Object.values(lanes).flatMap((lane) => lane.candidates || []);
}

function nowIso() {
  return new Date().toISOString();
}

function isUpcoming(game: LiveSlateGame, now: Date) {
  if (!game.startTime) return false;
  const ts = new Date(game.startTime).getTime();
  return Number.isFinite(ts) && ts > now.getTime();
}

function fingerprintFromGame(game: LiveSlateGame) {
  return `${game.odds || 'NA'}|${game.line || 'NA'}|${game.lineTimestampUtc || 'NA'}`;
}

function lineChangeCount(previousGames: LiveSlateGame[], nextGames: LiveSlateGame[]) {
  if (previousGames.length === 0 || nextGames.length === 0) return 0;
  const prev = new Map(previousGames.map((g) => [g.id, fingerprintFromGame(g)]));
  let changed = 0;
  for (const game of nextGames) {
    const oldVal = prev.get(game.id);
    if (oldVal && oldVal !== fingerprintFromGame(game)) changed += 1;
  }
  return changed;
}

async function ensureSchema() {
  if (schemaReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS himothy_live_ops_state (
      id TEXT PRIMARY KEY,
      last_run TIMESTAMPTZ,
      last_reason TEXT,
      run_count INTEGER NOT NULL DEFAULT 0,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO himothy_live_ops_state (id, last_run, last_reason, run_count, payload)
      VALUES ($1, NULL, 'bootstrap', 0, '{}'::jsonb)
      ON CONFLICT (id) DO NOTHING
    `,
    STATE_ID
  );

  schemaReady = true;
}

async function getStateRow() {
  await ensureSchema();
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM himothy_live_ops_state WHERE id = $1 LIMIT 1`,
    STATE_ID
  );
  return rows[0] || null;
}

async function runRefresh(reason: string): Promise<LiveOpsSnapshot> {
  const state = await getStateRow();
  const prevPayload = (state?.payload || {}) as Partial<LiveOpsStoredPayload>;
  const previousGames = Array.isArray(prevPayload.games) ? prevPayload.games : [];

  const [games, lanes] = await Promise.all([
    fetchLiveSlate({ maxGames: 80 }),
    scanAllResearchLanes(),
  ]);

  const verifiedActiveGames = games.filter((game) => game.verified && !game.isFinal);
  const now = new Date();
  const upcomingGames = verifiedActiveGames.filter((game) => isUpcoming(game, now));

  const allCandidates = flattenCandidates(lanes);
  const candidatesByGame = new Map<string, EdgeScanCandidate>();
  for (const candidate of allCandidates) {
    const existing = candidatesByGame.get(candidate.gameId);
    if (!existing || candidate.edge.edgeScore > existing.edge.edgeScore) {
      candidatesByGame.set(candidate.gameId, candidate);
    }
  }

  const researchReadyCount = upcomingGames.filter((game) => candidatesByGame.has(game.id)).length;
  const changed = lineChangeCount(previousGames, verifiedActiveGames);

  const payload: LiveOpsStoredPayload = {
    generatedAt: nowIso(),
    games: verifiedActiveGames,
    upcomingGameCount: upcomingGames.length,
    researchReadyCount,
    lineChangeCount: changed,
    topCandidates: allCandidates.sort((a, b) => b.edge.edgeScore - a.edge.edgeScore).slice(0, 40),
  };

  const nextRunCount = Number(state?.run_count || 0) + 1;

  await prisma.$executeRawUnsafe(
    `
      UPDATE himothy_live_ops_state
      SET last_run = NOW(),
          last_reason = $2,
          run_count = $3,
          payload = $4::jsonb,
          updated_at = NOW()
      WHERE id = $1
    `,
    STATE_ID,
    reason,
    nextRunCount,
    JSON.stringify(payload)
  );

  return {
    ...payload,
    refreshed: true,
    ageSeconds: 0,
    runCount: nextRunCount,
    reason,
  };
}

function snapshotFromState(state: any): LiveOpsSnapshot | null {
  if (!state || !state.payload) return null;
  const payload = state.payload as Partial<LiveOpsStoredPayload>;
  if (!payload.generatedAt || !Array.isArray(payload.games)) return null;

  const generatedTs = new Date(payload.generatedAt).getTime();
  const ageSeconds = Number.isFinite(generatedTs) ? Math.max(0, Math.floor((Date.now() - generatedTs) / 1000)) : 999999;

  return {
    generatedAt: payload.generatedAt,
    games: payload.games,
    upcomingGameCount: Number(payload.upcomingGameCount || 0),
    researchReadyCount: Number(payload.researchReadyCount || 0),
    lineChangeCount: Number(payload.lineChangeCount || 0),
    topCandidates: Array.isArray(payload.topCandidates) ? payload.topCandidates : [],
    refreshed: false,
    ageSeconds,
    runCount: Number(state.run_count || 0),
    reason: state.last_reason || 'cached',
  };
}

async function runRefreshNoDB(reason: string): Promise<LiveOpsSnapshot> {
  const [games, lanes] = await Promise.all([
    fetchLiveSlate({ maxGames: 80 }),
    scanAllResearchLanes(),
  ]);

  const verifiedActiveGames = games.filter((game) => game.verified && !game.isFinal);
  const now = new Date();
  const upcomingGames = verifiedActiveGames.filter((game) => isUpcoming(game, now));

  const allCandidates = flattenCandidates(lanes);
  const candidatesByGame = new Map<string, EdgeScanCandidate>();
  for (const candidate of allCandidates) {
    const existing = candidatesByGame.get(candidate.gameId);
    if (!existing || candidate.edge.edgeScore > existing.edge.edgeScore) {
      candidatesByGame.set(candidate.gameId, candidate);
    }
  }

  const researchReadyCount = upcomingGames.filter((game) => candidatesByGame.has(game.id)).length;

  return {
    generatedAt: new Date().toISOString(),
    games: verifiedActiveGames,
    upcomingGameCount: upcomingGames.length,
    researchReadyCount,
    lineChangeCount: 0,
    topCandidates: allCandidates.sort((a, b) => b.edge.edgeScore - a.edge.edgeScore).slice(0, 40),
    refreshed: true,
    ageSeconds: 0,
    runCount: 1,
    reason,
  };
}

export async function refreshLiveOpsSnapshot(options?: {
  force?: boolean;
  reason?: string;
  maxStaleSeconds?: number;
}) {
  const force = options?.force === true;
  const reason = options?.reason || 'manual';
  const maxStaleSeconds = Number.isFinite(Number(options?.maxStaleSeconds))
    ? Number(options?.maxStaleSeconds)
    : DEFAULT_STALE_SECONDS;

  if (!process.env.DATABASE_URL) {
    return runRefreshNoDB(reason);
  }

  const state = await getStateRow();
  const cached = snapshotFromState(state);

  if (!force && cached && cached.ageSeconds <= maxStaleSeconds) {
    return cached;
  }

  return runRefresh(reason);
}
