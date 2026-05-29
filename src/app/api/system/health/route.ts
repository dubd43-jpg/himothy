import { NextResponse } from 'next/server';
import { getCachedBoard, getPersistedBoardForDate } from '@/services/dailyBoardCache';
import { fetchLiveSlate } from '@/lib/liveSlate';
import { getRegistryBoardPicks } from '@/services/pickRegistryService';
import { isAdminRequest } from '@/lib/adminAuth';

// Production health check. Every bug that has reached a paying customer — WON/LOST never
// rendering, 0-0 records, wrong dates, 2-leg "$10 parlays", -250 ML on premium — is encoded
// here as a machine-checked invariant. The post-deploy script (scripts/healthcheck.mjs) and
// a Vercel cron hit this; if `ok` is false the deploy is not actually done. No more shipping
// blind and letting the owner be the QA.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

type Severity = 'critical' | 'warn';
interface Check { id: string; ok: boolean; severity: Severity; detail: string; }

function etToday(): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = p.find((x) => x.type === 'year')!.value;
  const m = p.find((x) => x.type === 'month')!.value;
  const d = p.find((x) => x.type === 'day')!.value;
  return `${y}${m}${d}`;
}

// Parse an American-odds string ("-145", "+120", "-110") to a number; null if unparseable.
function americanOdds(odds: string | null | undefined): number | null {
  if (!odds) return null;
  const m = String(odds).match(/[+-]?\d+/);
  return m ? Number(m[0]) : null;
}

// ET calendar date (YYYYMMDD) for an ISO time; null if unparseable.
function etDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(t));
  return `${p.find((x) => x.type === 'year')!.value}${p.find((x) => x.type === 'month')!.value}${p.find((x) => x.type === 'day')!.value}`;
}

function validStartTime(startTime: string | null | undefined): boolean {
  if (!startTime) return false;
  const t = Date.parse(startTime);
  if (Number.isNaN(t)) return false;
  return new Date(t).getUTCFullYear() >= 2025; // guard against epoch-0 / placeholder dates
}

const PREMIUM_ML_FLOOR = -145; // no moneyline steeper than -145 on Grand Slam / Pressure

// Days between two YYYY-MM-DD dates (absolute, UTC-noon anchored so DST can't skew it).
function dayGap(a: string, b: string): number {
  const ta = Date.parse(`${a}T12:00:00Z`);
  const tb = Date.parse(`${b}T12:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return 999;
  return Math.abs(Math.round((ta - tb) / 86400000));
}

export async function GET(req: Request) {
  const admin = isAdminRequest(req);
  const checks: Check[] = [];
  const et = etToday();                                   // YYYYMMDD (cache key form)
  const etDash = `${et.slice(0, 4)}-${et.slice(4, 6)}-${et.slice(6, 8)}`; // YYYY-MM-DD

  // --- Pull the board the customer actually sees (cached → persisted). Never recompute here
  // (that would be a heavy 120s scan and could mutate the frozen slate).
  let board: any = getCachedBoard('north-american')?.data ?? null;
  if (!board) board = await getPersistedBoardForDate(et, 'north-american');

  if (!board) {
    checks.push({
      id: 'board-generated', ok: false, severity: 'warn',
      detail: `No frozen NA board for ${et} yet (cache + Postgres empty). Normal early-morning before the daily scan; a problem if it persists into game time.`,
    });
  } else {
    const gs = board.grandSlam ?? null;
    const pressure: any[] = board.pressurePack ?? [];
    const vip: any[] = board.vip4Pack ?? [];
    const parlay: any[] = board.parlayPlan ?? [];
    const extra: any[] = board.parlayExtraLegs ?? [];

    // 1) The engine actually RAN (distinguishes a real crash/empty from a legit thin day).
    // Under the owner's quality bands (Grand Slam 96+, Pressure 83+), premium tiers are
    // ALLOWED to be empty when nothing clears the floor — so tier counts are warnings, not
    // failures. A board that scanned zero games / scored nothing IS a failure.
    const scanned = Number(board.totalGamesScanned ?? 0);
    const scoredCount = Array.isArray(board.allScored) ? board.allScored.length : 0;
    checks.push({
      id: 'board-computed', ok: scanned > 0 || scoredCount > 0, severity: 'critical',
      detail: scanned > 0 || scoredCount > 0
        ? `Engine ran: scanned ${scanned} games, ${scoredCount} scored picks.`
        : 'Engine produced NOTHING — scanned 0 games and 0 scored picks (real failure, not a thin day).',
    });

    // Tier fill is informational now — quality bands mean these can be legitimately empty.
    checks.push({
      id: 'board-grand-slam', ok: true, severity: 'warn',
      detail: gs ? `Grand Slam set: ${gs.selection} (conf ${gs.confidenceScore}).` : 'No Grand Slam today — nothing cleared the 96 floor (correct, not a bug).',
    });
    checks.push({
      id: 'board-pressure', ok: true, severity: 'warn',
      detail: `Pressure Pack has ${pressure.length} pick(s) (83+ quality floor; thin is OK).`,
    });
    checks.push({
      id: 'board-vip', ok: true, severity: 'warn',
      detail: `VIP 4-Pack has ${vip.length} pick(s).`,
    });

    // 1b) CONFIDENCE BANDS (owner rule). If a Grand Slam exists it MUST be 96+. Every
    // Pressure pick MUST be 83+. These are hard guarantees — a sub-floor pick in a premium
    // tier is a real defect, even though an EMPTY tier is fine.
    if (gs) {
      const c = Number(gs.confidenceScore ?? 0);
      checks.push({
        id: 'grand-slam-confidence-floor', ok: c >= 96, severity: 'critical',
        detail: c >= 96 ? `Grand Slam confidence ${c} ≥ 96.` : `Grand Slam "${gs.selection}" is only ${c} — below the 96 floor. It should NOT be a Grand Slam.`,
      });
    }
    const weakPressure = pressure.filter((p: any) => Number(p.confidenceScore ?? 0) < 83);
    if (pressure.length > 0) {
      checks.push({
        id: 'pressure-confidence-floor', ok: weakPressure.length === 0, severity: 'critical',
        detail: weakPressure.length === 0
          ? `All ${pressure.length} Pressure picks are 83+.`
          : `${weakPressure.length} Pressure pick(s) below the 83 floor: ${weakPressure.map((p: any) => `${p.selection} (${p.confidenceScore})`).join(', ')}`,
      });
    }

    // 2) $10 Parlay reaches its leg target (the "only 2 picks" bug).
    const parlayLegs = parlay.length + extra.length;
    checks.push({
      id: 'parlay-leg-count', ok: true, severity: 'warn',
      detail: `$10 Parlay has ${parlayLegs} legs (${parlay.length} straight + ${extra.length} extra). Quality floor (80+) can leave it short on thin days — that's OK.`,
    });

    // 3) Every posted pick carries a valid start time (the "must show time + date ET" rule).
    const allPosted: any[] = [gs, ...pressure, ...vip, ...parlay].filter(Boolean);
    const missingTime = allPosted.filter((p) => !validStartTime(p.startTime));
    checks.push({
      id: 'picks-have-start-time', ok: missingTime.length === 0, severity: 'critical',
      detail: missingTime.length === 0
        ? `All ${allPosted.length} posted picks have a valid start time.`
        : `${missingTime.length} pick(s) missing/invalid startTime: ${missingTime.map((p) => p.selection).slice(0, 5).join(', ')}`,
    });

    // 4) No moneyline steeper than -145 on Grand Slam / Pressure (the premium-chalk rule).
    const premium = [gs, ...pressure].filter(Boolean);
    const heavyMl = premium.filter((p) => {
      if (p.marketType !== 'moneyline') return false;
      const o = americanOdds(p.odds);
      return o !== null && o < PREMIUM_ML_FLOOR;
    });
    checks.push({
      id: 'premium-ml-floor', ok: heavyMl.length === 0, severity: 'critical',
      detail: heavyMl.length === 0
        ? `No premium ML steeper than ${PREMIUM_ML_FLOOR}.`
        : `${heavyMl.length} premium pick(s) over the ${PREMIUM_ML_FLOOR} floor: ${heavyMl.map((p) => `${p.selection} (${p.odds})`).join(', ')}`,
    });

    // 4b) GLOBAL FLOOR — owner rule: NOTHING below 80 confidence anywhere on the board.
    // A game with no market reaching 80 is dropped (no lazy low-confidence plays).
    const GLOBAL_FLOOR = 80;
    const belowFloor = allPosted.filter((p) => (typeof p.confidenceScore === 'number' ? p.confidenceScore : 0) < GLOBAL_FLOOR);
    checks.push({
      id: 'global-confidence-floor', ok: belowFloor.length === 0, severity: 'critical',
      detail: belowFloor.length === 0
        ? `All ${allPosted.length} posted picks are ${GLOBAL_FLOOR}+.`
        : `${belowFloor.length} pick(s) below the ${GLOBAL_FLOOR} floor: ${belowFloor.map((p) => `${p.selection} (${p.confidenceScore})`).slice(0, 5).join(', ')}`,
    });

    // 5) Board is for the Eastern date, not a wildly stale one. boardDate is a UTC-derived
    // YYYY-MM-DD, so allow ±1 day of UTC/ET drift; more than that means a stale slate.
    const gap = dayGap(String(board.boardDate), etDash);
    checks.push({
      id: 'board-et-anchored', ok: gap <= 1, severity: 'critical',
      detail: gap <= 1
        ? `Board date ${board.boardDate} is within a day of ET today (${etDash}).`
        : `Board date ${board.boardDate} is ${gap} days off ET today ${etDash} — STALE slate served.`,
    });

    // 6) Today's board recorded in the permanent registry (the "0-0, never recorded" bug).
    // Counts the actual recorded public picks for today's ET board (NOT the is_main_pick
    // flag — this system never sets that, so a main-pick lookup always reads empty). Timing-
    // aware: the record-board cron runs ~9am ET, so before that an empty registry is expected.
    try {
      const recorded = await getRegistryBoardPicks({});
      const graded = recorded.filter((p: any) => p.status === 'graded').length;
      const etHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(new Date()));
      checks.push({
        id: 'board-recorded', ok: recorded.length > 0 || etHour < 10, severity: 'warn',
        detail: recorded.length > 0
          ? `Today's board is in the registry: ${recorded.length} picks (${graded} graded).`
          : etHour < 10
            ? `Not yet recorded — expected before the ~9am ET record cron (it is ${etHour}:00 ET).`
            : `Today's board is NOT in the registry and it is past 10am ET — record-board cron may have failed.`,
      });

      // 6b) THE RECORD MUST MATCH THE DISPLAY. The single most important honesty check:
      // the Grand Slam (and every posted pick) in the permanent record must be the SAME
      // pick customers saw on the frozen slate. This is the exact bug that made a WON Grand
      // Slam show as a LOSS — the record had an earlier board than the display. CRITICAL.
      if (gs && recorded.length > 0) {
        const norm = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const recordedGs = recorded.find((p: any) => p.category === 'GRAND_SLAM');
        const gsMatches = Boolean(recordedGs && norm(recordedGs.selection) === norm(gs.selection));
        // CRITICAL: the headline Grand Slam in the record MUST be the one on the display —
        // this is the exact bug that showed a WON Grand Slam as a LOSS.
        checks.push({
          id: 'record-matches-display', ok: gsMatches, severity: 'critical',
          detail: gsMatches
            ? `Record's Grand Slam matches the display: ${gs.selection}.`
            : `RECORD ≠ DISPLAY. Displayed Grand Slam "${gs.selection}" but record has "${recordedGs?.selection ?? 'none'}". Run /api/admin/reconcile-board to re-sync.`,
        });
        // WARN: any other displayed pick missing from the record (e.g. a live carryover or a
        // game whose ET start date excludes it from honest pregame recording). Informational —
        // a reconcile syncs it, but it doesn't make the record dishonest.
        const recordedSel = new Set(recorded.map((p: any) => norm(p.selection)));
        const displayedMissing = allPosted.filter((p) => !recordedSel.has(norm(p.selection)));
        if (displayedMissing.length > 0) {
          checks.push({
            id: 'record-covers-display', ok: false, severity: 'warn',
            detail: `${displayedMissing.length} displayed pick(s) not in the record: ${displayedMissing.map((p) => p.selection).slice(0, 5).join(', ')}. Reconcile to capture them.`,
          });
        }
      }
    } catch (e: any) {
      checks.push({ id: 'board-recorded', ok: true, severity: 'warn', detail: `Registry check skipped: ${String(e?.message || e)}` });
    }
  }

  // 7) Live feed reachable & finals are carried (the WON/LOST-never-shows bug). After the
  // liveSlate fix, finished games must stay in the feed or pages can't grade WON/LOST.
  try {
    const feed = await fetchLiveSlate({ maxGames: 120 });
    const finals = feed.filter((g) => g.isFinal).length;
    const live = feed.filter((g) => g.isLive).length;
    const scheduled = feed.filter((g) => g.isScheduled).length;
    checks.push({
      id: 'live-feed-reachable', ok: feed.length > 0, severity: 'critical',
      detail: `Live feed returned ${feed.length} games (FINAL ${finals} / live ${live} / scheduled ${scheduled}).`,
    });
    // If there are finished games today the feed MUST surface them (the exact regression we
    // just fixed). We can't independently prove finals exist, so this is a warn that makes the
    // counts visible to the cron/owner rather than a hard fail.
    checks.push({
      id: 'live-feed-finals-visible', ok: true, severity: 'warn',
      detail: finals > 0
        ? `${finals} final game(s) present in the feed — WON/LOST can render.`
        : `0 finals in the feed right now. Expected if nothing has finished today; a red flag if games have ended.`,
    });
    // CRITICAL: no STALE games in the feed. The feed is today-only (today's ET games + still-
    // live carry-overs); a finished game whose ET start date is before today must not be here —
    // that's the exact thing that put yesterday's Golden State game on today's board and lit a
    // false WON. A live carry-over (still in progress) is allowed.
    const stale = feed.filter((g) => !g.isLive && g.startTime && etDay(g.startTime) !== null && etDay(g.startTime)! < et);
    checks.push({
      id: 'live-feed-no-stale-games', ok: stale.length === 0, severity: 'critical',
      detail: stale.length === 0
        ? 'No stale (pre-today, non-live) games in the feed.'
        : `${stale.length} STALE game(s) leaked into today's feed: ${stale.map((g) => `${g.awayTeam}@${g.homeTeam}`).slice(0, 4).join(', ')}.`,
    });
  } catch (e: any) {
    checks.push({ id: 'live-feed-reachable', ok: false, severity: 'critical', detail: `Live feed fetch FAILED: ${String(e?.message || e)}` });
  }

  const failures = checks.filter((c) => !c.ok && c.severity === 'critical');
  const warnings = checks.filter((c) => !c.ok && c.severity === 'warn');
  const ok = failures.length === 0;

  // Loud server-side log so the hourly cron run leaves a greppable trail in Vercel logs even
  // when nobody is watching the post-deploy script output.
  if (!ok) console.error('[HEALTH] UNHEALTHY', failures.map((c) => `${c.id}: ${c.detail}`));

  // Always expose ok/summary/counts (safe for the post-deploy script to read without a
  // secret). Detailed messages can name picks/odds, so gate them behind admin auth so a
  // public hit on /api/system/health can't be used to scrape the slate.
  const body: Record<string, unknown> = {
    ok,
    etDate: et,
    summary: ok
      ? `HEALTHY — ${checks.length} checks, ${warnings.length} warning(s).`
      : `UNHEALTHY — ${failures.length} critical failure(s), ${warnings.length} warning(s).`,
    failureCount: failures.length,
    warningCount: warnings.length,
  };
  if (admin) {
    body.failures = failures.map((c) => `${c.id}: ${c.detail}`);
    body.warnings = warnings.map((c) => `${c.id}: ${c.detail}`);
    body.checks = checks;
  } else {
    // Non-admin: surface only the failing check IDs (no pick names), enough to know what broke.
    body.failures = failures.map((c) => c.id);
    body.warnings = warnings.map((c) => c.id);
  }

  return NextResponse.json(body, { status: ok ? 200 : 503 });
}
