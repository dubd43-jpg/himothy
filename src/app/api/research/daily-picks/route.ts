import { NextResponse } from 'next/server';
import { type BoardType } from '@/services/deepResearchService';
import { CACHE_TTL_MS, getOrComputeBoard, getCachedBoard, invalidateBoardCache } from '@/services/dailyBoardCache';
import { isAdminRequest } from '@/lib/adminAuth';
import { getUserEntitlements } from '@/lib/entitlements';
import type { ProductKey } from '@/lib/products';

// Slate field → ProductKey gate. When UNLOCK_ALL_PRODUCTS=false flips on, this
// table drives which sections of the slate response each viewer can see.
const FIELD_PRODUCT_KEY: Record<string, ProductKey> = {
  grandSlam: 'grand_slam',
  pressurePack: 'pressure_pack',
  vip4Pack: 'vip_4_pack',
  parlayPlan: 'parlay_plan',
  marquee: 'big_games',
  asleepPicks: 'sleeper_picks',
  nrfi: 'nrfi',
  valuePlays: 'value_plays',
};

async function getViewerProductKeys(req: Request): Promise<Set<ProductKey>> {
  const cookie = req.headers.get('cookie') || '';
  const uid = cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('himothy_uid='))?.slice('himothy_uid='.length) || '';
  // Pass uid (or empty string) — getUserEntitlements short-circuits and returns
  // ALL product keys when UNLOCK_ALL_PRODUCTS is true (current default), so
  // anonymous visitors still see the slate. Only when paywalls flip on does
  // the empty-uid case actually return zero keys.
  try {
    const ent = await getUserEntitlements(uid);
    return ent.productKeys;
  } catch { return new Set(); }
}

function filterSlateByAccess(slate: any, keys: Set<ProductKey>): any {
  const out: any = { ...slate };
  const locked: string[] = [];
  for (const [field, productKey] of Object.entries(FIELD_PRODUCT_KEY)) {
    if (keys.has(productKey)) continue;
    locked.push(field);
    if (Array.isArray(out[field])) out[field] = [];
    else if (out[field]) out[field] = null;
  }
  out.lockedFields = locked;
  return out;
}

// Strip NRFI selections from main-board buckets (grandSlam/pressurePack/vip4Pack/
// parlayPlan/marquee/asleepPicks). Owner directive 2026-06-03: NRFI has its own
// area, never in the main bets. The frozen slate baked NRFI into other buckets
// this morning; this filter cleans the response without needing a regen.
function isNrfiSelection(pick: any): boolean {
  return typeof pick?.selection === 'string' && /^\s*NRFI\b/i.test(pick.selection);
}
function stripNrfiFromMainBets(slate: any): any {
  const out: any = { ...slate };
  if (out.grandSlam && isNrfiSelection(out.grandSlam)) out.grandSlam = null;
  for (const field of ['pressurePack', 'vip4Pack', 'parlayPlan', 'marquee', 'asleepPicks', 'valuePlays']) {
    if (Array.isArray(out[field])) {
      out[field] = out[field].filter((p: any) => !isNrfiSelection(p));
    }
  }
  return out;
}

// Hard -300 odds cap on every customer-facing pick. Owner directive 2026-06-04:
// "no pick on my site will be more than -300." Picks with American odds worse
// than -300 (e.g. -350, -400) get stripped at the API layer regardless of what
// the engine produced. Power 20 / Power 10 products stay on their own -450
// floor since they're explicit moonshot parlays.
function parseOddsNum(odds: string | null | undefined): number | null {
  if (odds == null) return null;
  const m = String(odds).match(/[+-]?\d{2,4}/);
  if (!m) return null;
  return Number(m[0]);
}
const HARD_ODDS_FLOOR = -300;
function stripHeavyChalk(slate: any): any {
  const out: any = { ...slate };
  const isHeavyChalk = (p: any) => {
    const n = parseOddsNum(p?.odds);
    return n != null && n < HARD_ODDS_FLOOR;
  };
  if (out.grandSlam && isHeavyChalk(out.grandSlam)) out.grandSlam = null;
  for (const field of ['pressurePack', 'vip4Pack', 'parlayPlan', 'marquee', 'asleepPicks', 'valuePlays']) {
    if (Array.isArray(out[field])) {
      out[field] = out[field].filter((p: any) => !isHeavyChalk(p));
    }
  }
  return out;
}

// Filter MLB player props out of main customer-facing products. Owner directive
// 2026-06-04: "I don't like the baseball props." MLB props can still exist (in
// allScored, in Power 20) but never on Grand Slam / Pressure / VIP / Parlay /
// Marquee. Only NBA / WNBA / NFL / NHL / NCAA props are allowed in the main
// products.
function isMlbProp(p: any): boolean {
  if (!p) return false;
  const isProp = String(p?.marketType || '').toLowerCase().includes('prop') || String(p?.marketType || '') === 'player_prop';
  const league = String(p?.league || '').toUpperCase();
  return isProp && (league === 'MLB' || league.includes('BASEBALL'));
}
function stripMlbProps(slate: any): any {
  const out: any = { ...slate };
  if (out.grandSlam && isMlbProp(out.grandSlam)) out.grandSlam = null;
  for (const field of ['pressurePack', 'vip4Pack', 'parlayPlan', 'marquee', 'asleepPicks', 'valuePlays']) {
    if (Array.isArray(out[field])) {
      out[field] = out[field].filter((p: any) => !isMlbProp(p));
    }
  }
  return out;
}

// Targets per product. VIP must hit 4 if the engine has enough candidates;
// Pressure Pack 2; Parlay Plan up to 4. Owner directive 2026-06-03: "You should
// always have a 4 pack. Push stuff up." When a stripped bucket falls short, pull
// the next-best candidates from allScored to backfill.
const PRODUCT_TARGETS: Record<string, number> = {
  vip4Pack: 4,
  pressurePack: 2,
  parlayPlan: 4,
};

function backfillProducts(slate: any): any {
  const out: any = { ...slate };
  const allScored: any[] = Array.isArray(out.allScored) ? out.allScored.slice() : [];
  if (allScored.length === 0) return out;

  // Games already committed to a product slot — they don't backfill themselves.
  const usedGameIds = new Set<string>();
  const collect = (p: any) => { if (p?.gameId) usedGameIds.add(String(p.gameId)); };
  if (out.grandSlam) collect(out.grandSlam);
  for (const f of ['pressurePack', 'vip4Pack', 'parlayPlan', 'marquee', 'asleepPicks']) {
    for (const p of (out[f] || [])) collect(p);
  }

  // Sort candidates by confidence — strongest first — and apply the same filters
  // the customer-facing strips already enforce so backfill doesn't undo them:
  //   - no NRFI selections (those live on /nrfi only)
  //   - no MLB props (owner directive 2026-06-04)
  //   - no odds steeper than -300 (HARD_ODDS_FLOOR)
  const candidates = allScored
    .filter((p) => p && p.confidenceScore != null)
    .filter((p) => !isNrfiSelection(p))
    .filter((p) => !isMlbProp(p))
    .filter((p) => {
      const n = parseOddsNum(p?.odds);
      return n == null || n >= HARD_ODDS_FLOOR;
    })
    .sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

  for (const [field, target] of Object.entries(PRODUCT_TARGETS)) {
    if (!Array.isArray(out[field])) continue;
    const have = out[field].length;
    const need = target - have;
    if (need <= 0) continue;
    let added = 0;
    for (const c of candidates) {
      if (added >= need) break;
      const gid = String(c.gameId || '');
      if (!gid || usedGameIds.has(gid)) continue;
      out[field] = [...out[field], c];
      usedGameIds.add(gid);
      added++;
    }
  }
  return out;
}

// Heavy multi-league research scan + per-pick best-market enrichment (totals/team-totals/
// halves/F5 fetches). Give it room so the first cold compute of the day doesn't get killed.
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const VALID_BOARDS: BoardType[] = ['north-american', 'soccer', 'tennis', 'combat', 'individual', 'racing', 'global', 'overseas'];

function parseBoard(raw: string | null): BoardType {
  const lower = (raw || '').toLowerCase();
  if ((VALID_BOARDS as string[]).includes(lower)) return lower as BoardType;
  return 'north-american';
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const board = parseBoard(url.searchParams.get('board'));
    // ?refresh=true wipes + regenerates the FROZEN slate — restrict to admins so a random
    // visitor can't break the frozen-slate guarantee (or change posted picks) on demand.
    const forceRefresh = url.searchParams.get('refresh') === 'true' && isAdminRequest(req);
    // FIX 2026-06-06: admin can pass force=true to bypass the SLATE_LOCKED guard
    // when the existing slate has confirmed-wrong odds (e.g. ESPN ML side-swap).
    // Only honored before games start; once games are live, the registry overlay
    // path is the safer change-mechanism.
    const forceUnlock = url.searchParams.get('force') === 'true' && isAdminRequest(req);

    const viewerKeys = await getViewerProductKeys(req);

    // FIX 2026-06-06 (owner directive — kill the on-demand deep research):
    // Customer-facing requests used to fall through to getOrComputeBoard() on a
    // cache miss, which runs the full deep-research engine (5-10s). This made
    // every cold-start visitor wait for a fresh compute. Now the path is:
    //   1. In-memory cache → fast
    //   2. Postgres frozen slate (DailySlateCache) → fast (~50-150ms)
    //   3. If both miss AND not admin force → return empty with a clear status
    //   4. Only on admin ?refresh=true → run the engine
    const cached = getCachedBoard(board);
    const useCached = !forceRefresh && cached && Date.now() - cached.generatedAt < CACHE_TTL_MS;
    if (useCached) {
      const { applyRegistryOverlay } = await import('@/services/slateRegistryOverlay');
      const overlaid = await applyRegistryOverlay(cached.data);
      const cleaned = backfillProducts(stripMlbProps(stripHeavyChalk(stripNrfiFromMainBets(overlaid))));
      return NextResponse.json({ success: true, cached: true, ...filterSlateByAccess(cleaned, viewerKeys) });
    }

    // STEP 2 — try the persisted frozen slate from Postgres before recomputing.
    if (!forceRefresh) {
      try {
        const { readPersistedSlate, todayEtKey } = await import('@/services/dailyBoardCache');
        const persisted = await readPersistedSlate(todayEtKey(), board);
        if (persisted) {
          const { applyRegistryOverlay } = await import('@/services/slateRegistryOverlay');
          const overlaid = await applyRegistryOverlay(persisted);
          const cleaned = backfillProducts(stripMlbProps(stripHeavyChalk(stripNrfiFromMainBets(overlaid))));
          return NextResponse.json({ success: true, cached: true, source: 'persisted', ...filterSlateByAccess(cleaned, viewerKeys) });
        }
      } catch (e) { /* fall through */ }
      // STEP 3 — neither cache hit. The morning cron must have failed.
      // Fall back to computing on-demand so customers don't get a blank page.
      // This is intentionally re-enabled after the June 9 blackout — the "kill
      // on-demand compute" change from 2026-06-06 was too aggressive: one cron
      // failure meant zero picks all day. On-demand compute runs at most once
      // (getOrComputeBoard persists + caches the result so the next visitor is
      // served from Postgres, not the engine). Cost: one extra engine run on
      // cron-failure days, which is worth avoiding a customer-facing blackout.
      try {
        const computedResult = await getOrComputeBoard(board);
        const { applyRegistryOverlay } = await import('@/services/slateRegistryOverlay');
        const overlaid = await applyRegistryOverlay(computedResult);
        const cleaned = backfillProducts(stripMlbProps(stripHeavyChalk(stripNrfiFromMainBets(overlaid))));
        return NextResponse.json({ success: true, cached: false, source: 'cron-fallback', ...filterSlateByAccess(cleaned, viewerKeys) });
      } catch (computeErr) {
        console.error('[daily-picks] cron fallback compute failed', computeErr);
      }
      // Last resort: tell the UI the slate isn't ready (cron AND fallback both failed).
      return NextResponse.json({
        success: true, cached: false, slateNotReady: true,
        message: "Today's picks are still being prepared. Check back in a moment.",
        grandSlam: null, pressurePack: [], vip4Pack: [], parlayPlan: [],
        marquee: [], asleepPicks: [], parlayExtraLegs: [], outrights: [],
        nrfi: [], valuePlays: [], allScored: [],
      });
    }

    // STEP 4 — admin-only force path. Triggers the full engine.
    if (forceRefresh) await invalidateBoardCache(board, { force: forceUnlock });
    if (forceUnlock) {
      // Also wipe today's registry rows so the regen can re-publish without the
      // dedup guard rejecting "same gameId/selection" rows from the bad slate.
      try {
        const { prisma } = await import('@/lib/prisma');
        const today = new Date();
        const etDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today);
        await prisma.$executeRawUnsafe(
          `DELETE FROM himothy_pick_registry WHERE board_date = $1::date AND status IN ('published','locked')`,
          etDate,
        );
      } catch (e) { console.warn('[force-unlock] registry wipe failed', e); }
    }
    const result = await getOrComputeBoard(board);
    const { applyRegistryOverlay } = await import('@/services/slateRegistryOverlay');
    const overlaid = await applyRegistryOverlay(result);
    const cleaned = backfillProducts(stripMlbProps(stripHeavyChalk(stripNrfiFromMainBets(overlaid))));
    return NextResponse.json({ success: true, cached: false, ...filterSlateByAccess(cleaned, viewerKeys) });
  } catch (error) {
    console.error('Daily picks research failed', error);
    return NextResponse.json({ success: false, error: 'Research scan failed.' }, { status: 500 });
  }
}
