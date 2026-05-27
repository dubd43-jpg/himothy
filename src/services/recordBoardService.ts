// Records each day's picks into the permanent registry so we keep a real, verified
// win/loss record. HONEST BY DESIGN: a pick is only logged while its game is still
// PREGAME (start time in the future), so we can never log a play after we already know
// the result. The grader (gradeRegistryBoard) settles them against the real final score.
//
// Only spread / total / moneyline are recorded — those are what the grader can settle
// cleanly. NRFI / props are tracked separately (they need first-inning data to grade).

import { runDailyDeepResearch, type BoardType } from '@/services/deepResearchService';
import { publishRegistryPick } from '@/services/pickRegistryService';
import { hasDatabase } from '@/lib/hasDatabase';
import { getOddsInsightForPick } from '@/services/oddsApiService';
import { oddsBucket } from '@/lib/oddsBucket';

function americanToDecimal(american: number): number {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}
function combineParlayOdds(legs: any[]): string | null {
  const decs = legs
    .map((l) => Number.parseFloat(String(l?.odds || '').replace(/[^-+0-9.]/g, '')))
    .filter((o) => Number.isFinite(o) && o !== 0)
    .map(americanToDecimal);
  if (decs.length === 0) return null;
  const total = decs.reduce((a, d) => a * d, 1);
  return total >= 2 ? `+${Math.round((total - 1) * 100)}` : `-${Math.round(100 / (total - 1))}`;
}
function newTicketId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

const PRODUCT_LINE: Record<string, string> = {
  GRAND_SLAM: 'HIMOTHY Grand Slam',
  PRESSURE_PACK: 'Pressure Pack',
  VIP_4_PACK: 'VIP 4-Pack',
  PARLAY_PLAN: 'Parlay Center',
  MARQUEE: 'Big Games',
};

function isPregame(startTime?: string): boolean {
  if (!startTime) return false;
  const t = new Date(startTime).getTime();
  return Number.isFinite(t) && t > Date.now();
}

// Only record games that belong to TODAY's Eastern-time slate, so tomorrow's games (which
// the engine also returns) get logged on their own board date, not bunched into today.
function etDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}
function isTodayEt(startTime?: string): boolean {
  if (!startTime) return false;
  const t = new Date(startTime);
  if (!Number.isFinite(t.getTime())) return false;
  return etDate(t) === etDate(new Date());
}

// Derive the market + the line value the grader expects, straight from the selection text
// so it matches exactly what the customer saw.
function marketAndLine(p: any): { marketType: string; line: string | null } {
  const sel = String(p.selection || '');
  const low = sel.toLowerCase();
  const mt = String(p.marketType || '').toLowerCase();
  // Trust the engine's marketType when set; otherwise detect — using WORD BOUNDARIES so
  // team names containing "under" (e.g. "Thunder") aren't misclassified as totals.
  if (mt === 'total' || /\b(over|under)\b/i.test(sel)) {
    const n = sel.match(/(\d+(?:\.\d+)?)/)?.[1] ?? (p.total != null ? String(p.total) : null);
    return { marketType: 'total', line: n };
  }
  if (mt === 'moneyline' || /\bml\b/.test(low) || mt.includes('moneyline')) {
    return { marketType: 'moneyline', line: null };
  }
  const m = sel.match(/([+-]\d+(?:\.\d+)?)\s*$/);
  return { marketType: 'spread', line: m ? m[1] : (p.line ?? null) };
}

async function recordPick(
  p: any,
  category: string,
  ticketCtx?: { ticketId: string; legPosition: number; legCount: number; estimatedOdds: string | null }
): Promise<'recorded' | 'dupe' | 'error'> {
  const { marketType, line } = marketAndLine(p);
  const bucket = oddsBucket(p.odds);

  // Capture the real multi-book line + best price + true probability AT PUBLISH —
  // this data is irreplaceable once the game starts. Best-effort, non-blocking.
  let bestOddsAtPublish: number | null = null;
  let bestBookAtPublish: string | null = null;
  let fairProbAtPublish: number | null = null;
  let valueEdgeAtPublish: number | null = null;
  try {
    if (p.homeTeam?.name && p.awayTeam?.name && p.selectionSide) {
      const oi = await getOddsInsightForPick(p.league, p.awayTeam.name, p.homeTeam.name, p.selectionSide);
      if (oi) {
        bestOddsAtPublish = oi.bestOdds;
        bestBookAtPublish = oi.bestBook;
        fairProbAtPublish = oi.fairProb;
        valueEdgeAtPublish = oi.valueEdge;
      }
    }
  } catch { /* non-blocking */ }

  // Pull the sharp/public/rest/weather context from sharpIntel (the engine attaches it).
  // From the PICKED SIDE's perspective (so positive rest_diff = our team rested longer).
  const si: any = p.sharpIntel || {};
  const side = p.selectionSide;
  const sharpPct = side === 'home'
    ? (typeof si?.betting?.homeMoneyPct === 'number' ? si.betting.homeMoneyPct : null)
    : (typeof si?.betting?.awayMoneyPct === 'number' ? si.betting.awayMoneyPct : null);
  const publicPct = side === 'home'
    ? (typeof si?.betting?.homeBetPct === 'number' ? si.betting.homeBetPct : null)
    : (typeof si?.betting?.awayBetPct === 'number' ? si.betting.awayBetPct : null);
  const rawRestDiff = typeof si?.rest?.restDiff === 'number' ? si.rest.restDiff : null;
  const restDiffDays = rawRestDiff == null ? null : (side === 'home' ? rawRestDiff : -rawRestDiff);
  const weatherJson = si?.weather && si.weather.available ? si.weather : null;

  try {
    await publishRegistryPick({
      category,
      productLine: PRODUCT_LINE[category] || 'HIMOTHY CORE',
      sport: p.sport || 'Unknown',
      league: p.league || 'Unknown',
      eventId: String(p.gameId),
      eventName: p.eventName || `${p.awayTeam?.name ?? ''} @ ${p.homeTeam?.name ?? ''}`.trim(),
      homeTeam: p.homeTeam?.name ?? null,
      awayTeam: p.awayTeam?.name ?? null,
      marketType,
      selection: p.selection,
      line,
      odds: p.odds ?? null,
      confidenceTier: p.tier ?? null,
      reasoningSummary: p.aiExplanation?.shortReason || p.reasonsFor?.[0] || null,
      riskSummary: p.reasonsAgainst?.[0] || null,
      edgeScore: typeof p.confidenceScore === 'number' ? p.confidenceScore : null,
      status: 'published',
      // Capture-at-publish (Tier 1):
      bestOddsAtPublish,
      bestBookAtPublish,
      fairProbAtPublish,
      valueEdgeAtPublish,
      oddsBucket: bucket,
      sharpPct,
      publicPct,
      restDiffDays,
      weatherJson,
      // Parlay ticket grouping (set by caller for PARLAY_PLAN):
      parlayTicketId: ticketCtx?.ticketId ?? null,
      parlayLegPosition: ticketCtx?.legPosition ?? null,
      parlayLegCount: ticketCtx?.legCount ?? null,
      parlayEstimatedOdds: ticketCtx?.estimatedOdds ?? null,
    });
    return 'recorded';
  } catch (e: any) {
    return String(e?.message || '').includes('Duplicate') ? 'dupe' : 'error';
  }
}

export async function recordTodaysBoard(): Promise<{ recorded: number; skipped: number; dupes: number; errors: number }> {
  const out = { recorded: 0, skipped: 0, dupes: 0, errors: 0 };
  if (!hasDatabase()) return out;

  const boards: BoardType[] = ['north-american', 'soccer', 'overseas'];
  for (const board of boards) {
    let res: any;
    try {
      res = await runDailyDeepResearch(board);
    } catch {
      continue;
    }
    // Every bucket on the live slate gets persisted to the registry. The original cron
    // only recorded the 4 "headline" tiers — NRFI, valuePlays, and asleepPicks were
    // surfaced on the site but dropped from the official record (silent data loss).
    // Fix: route every bucket through the registry so what shows on the slate matches
    // what gets graded into the verified record.
    const groups: Array<[string, any[]]> = [
      ['GRAND_SLAM', res.grandSlam ? [res.grandSlam] : []],
      ['PRESSURE_PACK', res.pressurePack || []],
      ['VIP_4_PACK', res.vip4Pack || []],
      ['PARLAY_PLAN', res.parlayPlan || []],
      ['MARQUEE', res.marquee || []],
      ['ASLEEP_PICKS', res.asleepPicks || []],
      ['VALUE_PLAYS', res.valuePlays || []],
      // NRFI plays have a different shape (no marketType=spread/moneyline/total) so they
      // need their own recording path — see NRFI handling below this loop.
    ];
    for (const [category, picks] of groups) {
      // For PARLAY_PLAN: tag every leg with a shared ticket id, position, count, and
      // combined odds — so the day's parlay can be queried as ONE ticket later.
      const isParlay = category === 'PARLAY_PLAN';
      const eligible = picks.filter((p) => p?.selection && p?.gameId && isTodayEt(p.startTime) && isPregame(p.startTime));
      const ticketCtx = isParlay && eligible.length > 1
        ? { ticketId: newTicketId('parlay'), legCount: eligible.length, estimatedOdds: combineParlayOdds(eligible) }
        : null;
      let legPos = 0;
      for (const p of picks) {
        // ET-anchored boardDate for audit logs (was UTC slice — that drifted late-night
        // ET games into the next day's audit, confusing the trail).
        const etBoardDate = p?.startTime
          ? (() => {
              try {
                const parts = new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
                }).formatToParts(new Date(p.startTime));
                return `${parts.find((x) => x.type === 'year')?.value}-${parts.find((x) => x.type === 'month')?.value}-${parts.find((x) => x.type === 'day')?.value}`;
              } catch { return new Date().toISOString().slice(0, 10); }
            })()
          : new Date().toISOString().slice(0, 10);

        // Build a stable pickKey for the audit trail, regardless of whether we end up
        // recording the pick. This is how we trace "where did Cleveland go" after the fact.
        const pickKey = p?.gameId && p?.selection ? `${p.gameId}|${p.selection}` : `unknown_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const auditBase = {
          boardDate: etBoardDate,
          pickKey,
          gameId: p?.gameId ? String(p.gameId) : undefined,
          category,
          selection: p?.selection || undefined,
          line: p?.line || undefined,
          odds: p?.odds || undefined,
        };
        const audit = async (event: 'RECORDED' | 'ERROR' | 'SLATE_REPLACED', notes: string, extra?: any) => {
          try {
            const { logPickEvent } = await import('@/services/pickAuditLog');
            await logPickEvent({ event, ...auditBase, notes, status: extra?.status || 'published', details: extra?.details });
          } catch { /* never break main loop */ }
        };

        // Filter guards — each one now logs the reason for the skip so nothing
        // disappears silently (the Cleveland-gap fix).
        if (!p?.selection || !p?.gameId) {
          out.errors++;
          await audit('ERROR', 'missing selection or gameId — engine produced malformed pick');
          continue;
        }
        if (!isTodayEt(p.startTime)) {
          out.skipped++;
          await audit('ERROR', `skipped: pick startTime is not today (ET) — was ${p.startTime}`);
          continue;
        }
        if (!isPregame(p.startTime)) {
          out.skipped++;
          // The Cleveland scenario: game started before the cron got to it. Logged so we
          // can see exactly which picks were lost and when — instead of silent skip.
          await audit('ERROR', `skipped: game already in progress at record time — would dishonestly post-record. Pick was visible on the slate but never made it into the official registry.`);
          continue;
        }

        legPos++;
        const ctx = ticketCtx ? { ticketId: ticketCtx.ticketId, legPosition: legPos, legCount: ticketCtx.legCount, estimatedOdds: ticketCtx.estimatedOdds } : undefined;
        const r = await recordPick(p, category, ctx);
        if (r === 'recorded') out.recorded++;
        else if (r === 'dupe') out.dupes++;
        else out.errors++;

        await audit(
          r === 'error' ? 'ERROR' : 'RECORDED',
          r === 'dupe' ? 'dedup: pick already exists in registry'
            : r === 'error' ? 'recording error during DB insert'
            : 'recorded to registry',
          { details: ctx ? { parlayCtx: ctx } : undefined },
        );
      }
    }

    // NRFI picks have a different shape (no marketType) so they need their own pass.
    // The fix for the gap Agent 2 flagged: NRFI was on the live slate every day but
    // never written to the registry, so wins/losses on NRFI plays were invisible to /stats.
    const nrfiPlays = res.nrfi || [];
    for (const n of nrfiPlays) {
      if (!n?.gameId) { out.errors++; continue; }
      if (!isTodayEt(n.startTime)) { out.skipped++; continue; }
      if (!isPregame(n.startTime)) { out.skipped++; continue; }
      // Shape NRFI as a recordable pick. Selection text is consistent so the grader can
      // settle by checking actual 1st-inning runs after the game.
      const nrfiPick = {
        gameId: n.gameId,
        eventName: n.eventName,
        league: n.league || 'MLB',
        sport: 'MLB',
        startTime: n.startTime,
        homeTeam: { name: n.homeTeam, abbreviation: '', moneyline: null, winProbability: null },
        awayTeam: { name: n.awayTeam, abbreviation: '', moneyline: null, winProbability: null },
        selection: 'NRFI — No Runs First Inning',
        selectionSide: 'home' as const,
        marketType: 'special',
        line: null,
        odds: n.odds || null,
        confidenceScore: n.nrfiScore || 0,
        tier: 'NRFI',
        reasoningShort: n.reason || 'Both starters have strong 1st-inning ERAs',
      } as any;
      const r = await recordPick(nrfiPick, 'NRFI');
      if (r === 'recorded') out.recorded++;
      else if (r === 'dupe') out.dupes++;
      else out.errors++;
      try {
        const { logPickEvent } = await import('@/services/pickAuditLog');
        await logPickEvent({
          event: r === 'error' ? 'ERROR' : 'RECORDED',
          boardDate: new Date(n.startTime).toISOString().slice(0, 10),
          pickKey: `${n.gameId}|NRFI`,
          gameId: String(n.gameId),
          category: 'NRFI',
          selection: 'NRFI — No Runs First Inning',
          odds: n.odds || undefined,
          status: 'published',
          notes: r === 'dupe' ? 'NRFI already in registry'
            : r === 'error' ? 'NRFI recording error'
            : 'NRFI recorded to registry',
        });
      } catch { /* swallow */ }
    }
  }
  return out;
}
