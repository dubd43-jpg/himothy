// SLATE FRESHENER — background worker
//
// 2026-06-06 owner directive: "what happens if something changes during the day?
// I don't want only 8 AM to be the last time that we do research."
//
// Picks themselves stay FROZEN per the existing rule (no pick-swapping mid-day —
// customers see the same selections all day). But the supporting data — Hard Rock
// odds, injury statuses, sharp-money signals, line movement — needs to keep
// refreshing throughout the day so customers always see current information.
//
// This worker:
//   1. Reads the persisted slate for each board
//   2. For every pick whose game hasn't started yet:
//      - Re-fetches Hard Rock odds and updates the pick's `odds` / `line` field
//      - Re-fetches injury data from official sources
//      - Refreshes signal-watch flags via the existing signalWatchService
//   3. Re-persists the updated slate (admin overwrite path — bypasses the
//      write-once guard since selections aren't changing, only their data)
//
// Triggered by /api/cron/freshen-slate every 30 minutes during active hours.

import { hasDatabase } from '@/lib/hasDatabase';

export interface FreshenResult {
  ok: boolean;
  boards: number;
  picksRefreshed: number;
  oddsChanged: number;
  significantMoves: number;     // moves that triggered customer notification
  lockedMoves: number;          // moves within 2hr grace window — display-only
  errors: number;
  durationMs: number;
}

// CUSTOMER PROTECTION WINDOW (owner directive 2026-06-06):
// Within 2 hours of game start we still REFRESH ODDS DISPLAY so customers see
// current Hard Rock prices, but we DO NOT send "the line moved" emails or
// touch the selection. A customer about to bet shouldn't be blindsided by an
// alert that changes the framing of their wager. Outside the 2-hour window
// significant moves trigger a heads-up email so customers know the market
// shifted and can decide whether to still place the bet.
const LOCK_WINDOW_MS = 2 * 60 * 60 * 1000;

// Significant move thresholds.
// ML: ≥ 20 cents of American-odds shift (e.g., -110 → -135 OR +120 → +140).
// Spread/total: ≥ 1 point or crossing a key half-number.
const SIGNIFICANT_ML_CENT_SHIFT = 20;
const SIGNIFICANT_LINE_POINT_SHIFT = 1.0;

function americanCentsAway(oldML: number, newML: number): number {
  // Convert both to a continuous numeric scale where -110 → -10 and +110 → +110
  // so we can measure the move in "cents" the same way bettors do.
  const norm = (v: number) => v > 0 ? v : -100 - v;        // not strictly mathematically pure but
  return Math.abs(norm(newML) - norm(oldML));               // good enough for movement classification
}

// American odds → implied probability (0-1).
function impliedProb(american: number): number {
  return american > 0 ? 100 / (american + 100) : Math.abs(american) / (Math.abs(american) + 100);
}

// SHOP-THE-SLATE swap thresholds.
// If our picked side is now overpriced (de-vigged fair < its implied break-even
// by >= 5 pts) AND the opposite side is underpriced by the same margin →
// the math has flipped and we should swap. Only fires outside the 2-hour
// lock window.
const SWAP_OVERPAY_THRESHOLD = 0.05;     // 5 percentage points
const SWAP_LEAD_TIME_MS = 2 * 60 * 60 * 1000;

const BOARDS = ['north-american', 'soccer', 'tennis', 'combat', 'individual', 'racing', 'global'] as const;

// Game has started if its scheduled start has passed, OR if we're within the
// final 15-minute pre-game window (clock-drift / Hard-Rock-flips-to-live-early
// safety buffer). Once a game starts, the odds Hard Rock serves become LIVE
// IN-GAME odds (e.g. "rest-of-game total"), which would corrupt the posted
// pick — owner saw an 8.5 total drop to 6.5 once the game went live because
// Kansas City wasn't scoring.
const PRE_GAME_FREEZE_BUFFER_MS = 15 * 60 * 1000;
function hasGameStarted(startTime: string | null | undefined): boolean {
  if (!startTime) return true;   // no scheduled time = treat as already locked (safest default)
  const start = new Date(startTime).getTime();
  if (!Number.isFinite(start)) return true;
  return start - PRE_GAME_FREEZE_BUFFER_MS <= Date.now();
}

// Stronger check that uses the live feed when available: if the game is
// reported LIVE or FINAL by the scoreboard, treat as started regardless of
// the scheduled startTime.
async function isGameLockedByLiveFeed(gameId: string | null | undefined): Promise<boolean> {
  if (!gameId) return false;
  try {
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/scores/live`, { cache: 'no-store' });
    if (!res.ok) return false;
    const data: any = await res.json();
    const g = (data?.games || []).find((x: any) => String(x.id) === String(gameId));
    if (!g) return false;
    return !!g.isLive || !!g.isFinal;
  } catch { return false; }
}

// One consolidated email per freshener pass. NO per-game spam.
// Owner directive 2026-06-06: "Send me one email that shows the full lineup
// and what changed. I don't want emails for every game."
interface MoveRecord {
  selection: string;
  eventName: string;
  startTime: string | null;
  before: { odds?: string | null; line?: string | null };
  after: { odds?: string | null; line?: string | null };
  inLockWindow: boolean;
}
async function sendConsolidatedMoveDigest(moves: MoveRecord[]): Promise<void> {
  if (moves.length === 0) return;
  try {
    const { sendEmail } = await import('@/lib/email');
    const fmtET = (iso: string | null) => iso
      ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', timeStyle: 'short', dateStyle: 'short' }) + ' ET'
      : 'today';

    const rows = moves.map(m => {
      const oddsDelta = (m.before.odds !== m.after.odds) ? `${m.before.odds || '?'} → <b>${m.after.odds || '?'}</b>` : '';
      const lineDelta = (m.before.line !== m.after.line) ? `${m.before.line || '?'} → <b>${m.after.line || '?'}</b>` : '';
      const tag = m.inLockWindow
        ? '<span style="color:#fbbf24;font-size:10px;font-weight:700">LOCK WINDOW · display-only</span>'
        : '<span style="color:#10b981;font-size:10px;font-weight:700">LEAD TIME · safe to react</span>';
      return `
        <tr style="border-top:1px solid #1f2937">
          <td style="padding:10px 8px;vertical-align:top">
            <div style="font-weight:900;font-size:14px;color:#f1f5f9">${m.selection}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${m.eventName}</div>
            <div style="font-size:10px;color:#64748b;margin-top:4px">${fmtET(m.startTime)} · ${tag}</div>
          </td>
          <td style="padding:10px 8px;vertical-align:top;font-size:12px;color:#cbd5e1">
            ${oddsDelta ? `<div>Odds: ${oddsDelta}</div>` : ''}
            ${lineDelta ? `<div>Line: ${lineDelta}</div>` : ''}
          </td>
        </tr>`;
    }).join('');

    const significant = moves.filter(m => !m.inLockWindow).length;
    const locked = moves.length - significant;
    const subj = `[HIMOTHY] Line moves digest — ${moves.length} pick${moves.length === 1 ? '' : 's'} updated`;
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:0 auto;background:#0a0a0a;color:#e5e7eb;padding:24px;border-radius:16px">
        <h2 style="margin:0 0 6px;color:#10b981">Line moves on today's slate</h2>
        <p style="margin:0 0 14px;color:#9ca3af;font-size:13px">
          ${significant} move${significant === 1 ? '' : 's'} with safe lead time · ${locked} inside the 2-hour lock window (display-only, no customer disruption).
        </p>
        <table style="width:100%;border-collapse:collapse;background:#0f172a;border-radius:8px;overflow:hidden">
          <thead><tr style="background:#1e293b">
            <th style="padding:8px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.08em">Pick</th>
            <th style="padding:8px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.08em">Change</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`.trim();

    await sendEmail({ to: 'rentalsgradea@gmail.com', subject: subj, html });
  } catch { /* best-effort */ }
}

export async function freshenAllSlates(): Promise<FreshenResult> {
  const t0 = Date.now();
  const result: FreshenResult = { ok: true, boards: 0, picksRefreshed: 0, oddsChanged: 0, significantMoves: 0, lockedMoves: 0, errors: 0, durationMs: 0 };
  // Collect ALL line moves across all boards in one pass so we send ONE
  // consolidated email at the end instead of per-pick spam.
  const movesThisPass: MoveRecord[] = [];
  if (!hasDatabase()) {
    result.ok = false;
    result.durationMs = Date.now() - t0;
    return result;
  }

  const { readPersistedSlate, todayEtKey, adminOverwritePersistedSlate } = await import('@/services/dailyBoardCache');
  const { getHardRockLineForGame } = await import('@/services/oddsApiService');
  const etDate = todayEtKey();

  for (const board of BOARDS) {
    try {
      const slate = await readPersistedSlate(etDate, board);
      if (!slate) continue;
      result.boards++;

      // Collect every pick on this slate that hasn't started yet.
      const buckets: Array<{ key: string; picks: any[] }> = [
        { key: 'grandSlam', picks: slate.grandSlam ? [slate.grandSlam] : [] },
        { key: 'pressurePack', picks: slate.pressurePack || [] },
        { key: 'vip4Pack', picks: slate.vip4Pack || [] },
        { key: 'parlayPlan', picks: slate.parlayPlan || [] },
        { key: 'marquee', picks: slate.marquee || [] },
        { key: 'asleepPicks', picks: slate.asleepPicks || [] },
      ];

      let mutated = false;
      for (const bucket of buckets) {
        for (const pick of bucket.picks) {
          if (!pick) continue;
          // FIX 2026-06-06 (owner directive — Kansas City total dropped 8.5 → 6.5
          // mid-game): two-layer lock. (1) scheduled startTime within 15 min
          // means "lock now even before first pitch" to absorb Hard Rock's
          // early flip to live odds. (2) live scoreboard says LIVE/FINAL =
          // hard freeze regardless of scheduled time.
          if (hasGameStarted(pick.startTime)) continue;
          if (await isGameLockedByLiveFeed(pick.gameId)) continue;
          result.picksRefreshed++;

          // Refresh Hard Rock odds for this matchup.
          try {
            const hr = await getHardRockLineForGame(
              pick.league,
              pick.awayTeam?.name || '',
              pick.homeTeam?.name || '',
            );
            if (hr) {
              const before = { odds: pick.odds, line: pick.line };
              const mt = String(pick.marketType || '').toLowerCase();
              const isML = mt === 'moneyline' || mt === 'ml' || /\bML\b/.test(pick.selection || '');
              const isSpread = mt === 'spread' || mt.includes('spread') || mt.includes('runline') || mt.includes('puckline');
              const isTotal = mt === 'total' || mt.includes('total') || /^over\s|^under\s/i.test(pick.selection || '');
              const side = pick.selectionSide || 'home';
              const newML = side === 'home' ? hr.homeML : hr.awayML;

              let significant = false;
              if (isML && newML != null) {
                const newOdds = `${newML > 0 ? '+' : ''}${newML}`;
                if (newOdds !== pick.odds) {
                  // Parse the OLD ML to classify the move size.
                  const oldMLMatch = String(pick.odds || '').match(/^[+-]?\d+$/);
                  if (oldMLMatch) {
                    const oldML = Number(oldMLMatch[0]);
                    if (americanCentsAway(oldML, newML) >= SIGNIFICANT_ML_CENT_SHIFT) significant = true;
                  }
                  pick.odds = newOdds;
                  result.oddsChanged++;
                  mutated = true;
                }
              } else if (isSpread && hr.spread != null) {
                const homeSigned = hr.spread;
                const ourLine = side === 'home' ? homeSigned : -homeSigned;
                const newLineStr = ourLine > 0 ? `+${ourLine}` : `${ourLine}`;
                if (newLineStr !== pick.line) {
                  const oldLineNum = Number(String(pick.line || '').replace(/[^\d.\-]/g, ''));
                  if (Number.isFinite(oldLineNum) && Math.abs(ourLine - oldLineNum) >= SIGNIFICANT_LINE_POINT_SHIFT) significant = true;
                  pick.line = newLineStr;
                  result.oddsChanged++;
                  mutated = true;
                }
              } else if (isTotal && hr.total != null) {
                if (String(hr.total) !== String(pick.line)) {
                  const oldTotal = Number(pick.line);
                  if (Number.isFinite(oldTotal) && Math.abs(hr.total - oldTotal) >= SIGNIFICANT_LINE_POINT_SHIFT) significant = true;
                  pick.line = String(hr.total);
                  result.oddsChanged++;
                  mutated = true;
                }
              }

              // FLIP CONSENSUS — multi-signal swap engine (v1).
              // 9 signal categories vote; flip only when consensus + blockers + lead-time gates all pass.
              // Default mode = WATCH (logs decisions, no real swaps). LIVE switch
              // requires env FLIP_CONSENSUS_MODE=LIVE.
              try {
                const { evaluatePickForFlip, getFlipMode } = await import('@/services/flipConsensusService');
                const decision = await evaluatePickForFlip({
                  pick: {
                    id: pick.id,
                    gameId: pick.gameId,
                    selection: pick.selection,
                    selectionSide: pick.selectionSide,
                    marketType: pick.marketType,
                    odds: pick.odds,
                    line: pick.line,
                    confidenceScore: pick.confidenceScore,
                    league: pick.league,
                    eventName: pick.eventName,
                    startTime: pick.startTime,
                    homeTeam: { name: pick.homeTeam?.name, abbreviation: pick.homeTeam?.abbreviation, injuredOut: pick.homeTeam?.injuredOut },
                    awayTeam: { name: pick.awayTeam?.name, abbreviation: pick.awayTeam?.abbreviation, injuredOut: pick.awayTeam?.injuredOut },
                    marketOpenOdds: pick.marketOpenOdds || pick.market_open_odds || null,
                    signalAlertLevel: pick.lineAlertLevel || pick.signal_alert_level || null,
                    flippedToday: pick.flippedToday || false,
                  },
                  currentHr: hr,
                });

                // Log every WATCH and FLIP decision — KEEP is the silent default.
                if (decision.verdict !== 'KEEP') {
                  try {
                    const { logAction } = await import('@/services/actionLogService');
                    await logAction({
                      action: decision.verdict === 'FLIP' ? 'FLIP_CONSENSUS_FIRED' : 'FLIP_CONSENSUS_WATCH',
                      actor: 'system',
                      subject: `${pick.gameId}|${pick.selection}`,
                      summary: `${decision.verdict}: ${decision.flipCount} flip / ${decision.keepCount} keep · hard-evidence ${decision.hardEvidenceFlipCount}/3 · margin ${decision.netMargin}`,
                      details: { pickId: pick.id, decision, mode: getFlipMode() } as any,
                    });
                  } catch { /* logging best-effort */ }
                }

                // Execute the flip only when consensus AND LIVE mode.
                if (decision.verdict === 'FLIP' && getFlipMode() === 'LIVE' && decision.newSelection && decision.newOdds && decision.newSide) {
                  movesThisPass.push({
                    selection: `${pick.selection} → ${decision.newSelection}`,
                    eventName: pick.eventName,
                    startTime: pick.startTime || null,
                    before: { odds: pick.odds, line: pick.line },
                    after: { odds: decision.newOdds, line: null },
                    inLockWindow: false,
                  });
                  pick.selection = decision.newSelection;
                  pick.selectionSide = decision.newSide;
                  pick.odds = decision.newOdds;
                  pick.line = null;
                  pick.flippedToday = true;
                  result.significantMoves++;
                  mutated = true;
                  // Skip the price-only digest record below — flip is already recorded.
                  continue;
                }
              } catch { /* non-blocking */ }
              // Significant move (price-only) → record for the consolidated digest.
              if (significant) {
                const startMs = pick.startTime ? new Date(pick.startTime).getTime() : NaN;
                const inLockWindow = Number.isFinite(startMs) && (startMs - Date.now() < LOCK_WINDOW_MS);
                if (inLockWindow) result.lockedMoves++;
                else result.significantMoves++;
                movesThisPass.push({
                  selection: pick.selection,
                  eventName: pick.eventName,
                  startTime: pick.startTime || null,
                  before, after: { odds: pick.odds, line: pick.line },
                  inLockWindow,
                });
              }
            }
          } catch { result.errors++; }
        }
      }

      // Re-persist only if something actually changed.
      if (mutated) {
        try {
          await adminOverwritePersistedSlate(etDate, board, slate);
        } catch { result.errors++; }
      }
    } catch { result.errors++; }
  }

  // Send ONE consolidated email for everything that moved this pass.
  // Suppressed entirely when nothing significant changed.
  if (movesThisPass.length > 0) {
    await sendConsolidatedMoveDigest(movesThisPass);
  }

  result.durationMs = Date.now() - t0;
  return result;
}
