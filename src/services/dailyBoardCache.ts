// Shared cache + compute path for the daily-picks board. Lives here (not in route.ts)
// because Next.js disallows arbitrary exports from route files.

import { runDailyDeepResearch, type BoardType } from '@/services/deepResearchService';
import { getOddsInsightForPick, getTotalsInsightForPick, hasOddsApi } from '@/services/oddsApiService';
import { getOddsBucketStats } from '@/services/pickRegistryService';
import { oddsBucket } from '@/lib/oddsBucket';
import { hasDatabase } from '@/lib/hasDatabase';

export const boardCache = new Map<string, { data: any; generatedAt: number }>();
// CACHE_TTL_MS kept for back-compat (some callers still reference it) but no longer used
// to expire entries mid-day — see slateVersionKey below for the freeze model.
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Bump this when the slate-selection rules change (e.g., today-only filter) so any cached
// board from a previous algorithm doesn't survive.
const SLATE_RULES_VERSION = 'frozen-v1';

// ET-anchored date string in YYYYMMDD form. Each ET-day gets its own cache entry so the
// slate snapshot from the morning's 8am ET cron lives ALL DAY until the next ET-day's
// cron generates a fresh one. Mid-day requests always read the frozen snapshot — never
// re-generate — which means finished games stay on the slate exactly as published.
function todayEtKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === 'year')?.value}${parts.find((p) => p.type === 'month')?.value}${parts.find((p) => p.type === 'day')?.value}`;
}

function slateVersionKey(board: string) {
  return `${SLATE_RULES_VERSION}|${todayEtKey()}|${board}`;
}

async function enrichWithBucketStats(result: any) {
  if (!hasDatabase() || !result) return result;
  try {
    const stats = await getOddsBucketStats();
    const tag = (p: any) => {
      if (!p?.odds) return;
      const bucket = oddsBucket(p.odds);
      if (!bucket) return;
      const s = stats[bucket];
      p.bucketStats = { bucket, ...(s || { wins: 0, losses: 0, pushes: 0, total: 0, winRate: '0%' }) };
    };
    if (result.grandSlam) tag(result.grandSlam);
    for (const key of ['pressurePack', 'vip4Pack', 'parlayPlan', 'marquee']) {
      for (const p of result[key] || []) tag(p);
    }
  } catch { /* non-blocking */ }
  return result;
}

async function enrichWithOdds(result: any) {
  if (!hasOddsApi() || !result) return result;
  const one = async (p: any) => {
    if (!p?.league || !p?.homeTeam?.name || !p?.awayTeam?.name || !p?.selectionSide) return;
    try {
      p.oddsInsight = await getOddsInsightForPick(p.league, p.awayTeam.name, p.homeTeam.name, p.selectionSide);
    } catch { /* non-blocking */ }
    if (p.marketType === 'total') {
      try {
        p.totalsInsight = await getTotalsInsightForPick(p.league, p.awayTeam.name, p.homeTeam.name);
      } catch { /* non-blocking */ }
    }
  };
  if (result.grandSlam) await one(result.grandSlam);
  for (const key of ['pressurePack', 'vip4Pack', 'parlayPlan', 'marquee']) {
    for (const p of result[key] || []) await one(p);
  }
  return result;
}

function flattenBoardPicks(data: any): any[] {
  const arr: any[] = [];
  if (!data) return arr;
  if (data.grandSlam) arr.push(data.grandSlam);
  for (const k of ['pressurePack', 'vip4Pack', 'parlayPlan', 'marquee', 'nrfi']) {
    for (const p of data[k] || []) arr.push(p);
  }
  return arr;
}

export function getCachedBoardPicks(board: string): any[] {
  const c = boardCache.get(slateVersionKey(board));
  return c ? flattenBoardPicks(c.data) : [];
}

export function invalidateBoardCache(board: string) {
  boardCache.delete(slateVersionKey(board));
}

export function getCachedBoard(board: string) {
  return boardCache.get(slateVersionKey(board));
}

export async function getOrComputeBoard(board: BoardType): Promise<any> {
  const key = slateVersionKey(board);
  const cached = boardCache.get(key);
  // FROZEN SLATE: once today's snapshot exists, return it every time for the rest of the
  // ET-day. The cache key includes the ET date so tomorrow's first request misses cache
  // and triggers a fresh research scan. No TTL expiration mid-day.
  if (cached) return cached.data;
  const result = await runDailyDeepResearch(board);
  await enrichWithOdds(result);
  await enrichWithBucketStats(result);
  const valuePool: any[] = [result.grandSlam, ...(result.pressurePack || []), ...(result.vip4Pack || []), ...(result.parlayPlan || []), ...(result.marquee || [])].filter(Boolean);
  (result as any).valuePlays = valuePool
    .filter((p: any) => p.marketType === 'moneyline' && p.oddsInsight && typeof p.oddsInsight.valueEdge === 'number' && p.oddsInsight.valueEdge > 0)
    .sort((a: any, b: any) => b.oddsInsight.valueEdge - a.oddsInsight.valueEdge);
  boardCache.set(key, { data: result, generatedAt: Date.now() });
  return result;
}
