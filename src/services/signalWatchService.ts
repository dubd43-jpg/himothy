// SIGNAL CHANGE WATCHER
//
// Continuously monitors EVERY active pre-game pick for material signal changes
// vs the snapshot at publish time. Triggers when ANY of these fires:
//
//   1. LINE MOVEMENT against us (100¢ yellow / 150¢ red)
//   2. PROBABLE PITCHER SWAP — team changed who's pitching (MLB)
//   3. KEY PLAYER NEWLY RULED OUT — a flagged star (homeKeyPlayers / awayKeyPlayers)
//      moved from active/Q to OUT since publish
//   4. SHARP MONEY FLIP — VSiN consensus switched sides with confidence
//   5. PROBABLE STATUS CONFIRMED → flag positively (we WANT to know lineups are locked)
//
// On any flag, applies a confidence cap and writes the change to ActionLog.
// Customer board reflects the downgrade immediately. Admin sees the diff on
// /admin/line-alerts.

import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';
import { logAction } from './actionLogService';
import { getVsinSplit, deriveSharpSideFromVsin } from './vsinBettingService';

const LEAGUE_TO_SPORT: Record<string, string> = {
  'MLB': 'baseball_mlb', 'NBA': 'basketball_nba', 'WNBA': 'basketball_wnba',
  'NHL': 'icehockey_nhl', 'NFL': 'americanfootball_nfl',
  'NCAA Basketball': 'basketball_ncaab', 'College Football': 'americanfootball_ncaaf',
};

const YELLOW_CAP = 82;
const RED_CAP = 75;

interface RegistryRow {
  id: string; event_id: string | null; league: string; market_type: string;
  selection: string; odds: string | null; edge_score: number | null;
  research_payload: any;
  category: string | null;
  event_name: string | null;
  line_alert_level: string | null;
  line_move_cents: number | null;
  pre_alert_edge_score: number | null;
}

async function ensureSchema(): Promise<void> {
  if (!hasDatabase()) return;
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE himothy_pick_registry
        ADD COLUMN IF NOT EXISTS line_alert_level TEXT,
        ADD COLUMN IF NOT EXISTS line_move_cents NUMERIC,
        ADD COLUMN IF NOT EXISTS line_alert_flagged_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS pre_alert_edge_score NUMERIC,
        ADD COLUMN IF NOT EXISTS signal_alert_reasons JSONB
    `);
  } catch (err) {
    console.error('[signalWatch] schema bootstrap failed', err);
  }
}

// Customer-facing pages read from /api/board/structured which sources the
// REGISTRY (not the slate cache). Signal-watch updates the registry directly,
// so the cap is already visible. No cache invalidation needed — that would
// only trigger an expensive full-engine regen with a high chance of producing
// a different slate than what's published, breaking the customer view.

// 2026-06-05: signal-watch transition emails. Every email maps 1:1 to a
// customer-visible change on the board. WATCH-tier transitions (single signal,
// no cap) deliberately do NOT email — there's nothing to see on the customer
// site for those.
async function emailTransition(
  row: RegistryRow, newLevel: string, reasons: string[],
  cap: number | null, newScore: number | null,
): Promise<void> {
  try {
    const { notifyPickChange } = await import('./pickChangeNotifier');
    const levelLabel = newLevel.toUpperCase();
    const reasonText = reasons.join(' · ');
    await notifyPickChange({
      kind: 'UPDATED',
      category: (row as any).category || 'PICK',
      gameId: row.event_id || '',
      eventName: (row.research_payload?.eventName) || row.selection,
      selection: row.selection,
      odds: row.odds,
      reason: `${levelLabel} alert — confidence capped at ${cap} (was ${(row as any).pre_alert_edge_score ?? row.edge_score}). Reasons: ${reasonText}`,
      triggeredBy: `signal-watch (${levelLabel})`,
    });
  } catch { /* mailer optional */ }
}

async function emailRestoration(row: RegistryRow, prevLevel: string): Promise<void> {
  try {
    const { notifyPickChange } = await import('./pickChangeNotifier');
    await notifyPickChange({
      kind: 'UPDATED',
      category: (row as any).category || 'PICK',
      gameId: row.event_id || '',
      eventName: (row.research_payload?.eventName) || row.selection,
      selection: row.selection,
      odds: row.odds,
      reason: `${prevLevel.toUpperCase()} alert recovered — signals returned to consensus. Original confidence restored.`,
      triggeredBy: 'signal-watch (recovered)',
    });
  } catch { /* mailer optional */ }
}

function parseAmericanOdds(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/[+-]?\d{2,4}/);
  if (!m) return null;
  const n = Number(m[0]);
  return isFinite(n) && n !== 0 ? n : null;
}

function lineMoveCents(entry: number, current: number): number {
  if (entry < 0 && current < 0) return Math.abs(current) - Math.abs(entry);
  if (entry > 0 && current > 0) return entry - current;
  const eImp = entry > 0 ? 100 / (entry + 100) : Math.abs(entry) / (Math.abs(entry) + 100);
  const cImp = current > 0 ? 100 / (current + 100) : Math.abs(current) / (Math.abs(current) + 100);
  return Math.round((cImp - eImp) * 400);
}

// ─── Per-signal checkers ────────────────────────────────────────────────────

async function checkLineMove(row: RegistryRow): Promise<{ moveCents: number | null; signalChanged: boolean; reason: string | null }> {
  if (row.market_type !== 'moneyline') return { moveCents: null, signalChanged: false, reason: null };
  const payload = row.research_payload || {};
  const homeTeam = payload.homeTeam?.name;
  const awayTeam = payload.awayTeam?.name;
  const pickedSide: 'home' | 'away' = payload.selectionSide === 'away' ? 'away' : 'home';
  if (!homeTeam || !awayTeam) return { moveCents: null, signalChanged: false, reason: null };
  const entry = parseAmericanOdds(row.odds);
  if (entry == null) return { moveCents: null, signalChanged: false, reason: null };

  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) return { moveCents: null, signalChanged: false, reason: null };
  const sport = LEAGUE_TO_SPORT[row.league];
  if (!sport) return { moveCents: null, signalChanged: false, reason: null };
  try {
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american`,
      { cache: 'no-store' },
    );
    if (!res.ok) return { moveCents: null, signalChanged: false, reason: null };
    const events: any[] = await res.json();
    const matches = (a: string, b: string) => a && b && (a.toLowerCase() === b.toLowerCase() || a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase()));
    const ev = events.find((e) => matches(e.home_team, homeTeam) && matches(e.away_team, awayTeam));
    if (!ev) return { moveCents: null, signalChanged: false, reason: null };
    const SHARP = ['draftkings', 'fanduel', 'betmgm', 'caesars', 'pointsbetus', 'fanatics'];
    const prices: number[] = [];
    for (const bk of ev.bookmakers || []) {
      if (!SHARP.includes(bk.key)) continue;
      const h2h = (bk.markets || []).find((m: any) => m.key === 'h2h');
      if (!h2h) continue;
      const o = (h2h.outcomes || []).find((x: any) => pickedSide === 'home' ? matches(x.name, homeTeam) : matches(x.name, awayTeam));
      if (o?.price != null) prices.push(Number(o.price));
    }
    if (prices.length === 0) return { moveCents: null, signalChanged: false, reason: null };
    const avg = prices.reduce((s, p) => s + (p > 0 ? 100 / (p + 100) : Math.abs(p) / (Math.abs(p) + 100)), 0) / prices.length;
    const current = avg >= 0.5 ? -Math.round(avg / (1 - avg) * 100) : Math.round((1 - avg) / avg * 100);
    const move = lineMoveCents(entry, current);
    if (move >= 100) return { moveCents: move, signalChanged: true, reason: `Line moved ${move}¢ against us (entry ${entry}, current ${current}).` };
    return { moveCents: move, signalChanged: false, reason: null };
  } catch {
    return { moveCents: null, signalChanged: false, reason: null };
  }
}

async function checkProbablePitcherSwap(row: RegistryRow): Promise<{ signalChanged: boolean; reason: string | null }> {
  if (row.league !== 'MLB') return { signalChanged: false, reason: null };
  if (!row.event_id) return { signalChanged: false, reason: null };
  const payload = row.research_payload || {};
  const pickedSide: 'home' | 'away' = payload.selectionSide === 'away' ? 'away' : 'home';
  const stored = pickedSide === 'home'
    ? payload.homeTeam?.probablePitcherName
    : payload.awayTeam?.probablePitcherName;
  if (!stored) return { signalChanged: false, reason: null };

  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${row.event_id}`, { cache: 'no-store' });
    if (!res.ok) return { signalChanged: false, reason: null };
    const data: any = await res.json();
    const comp = (data.header?.competitions || [])[0];
    if (!comp) return { signalChanged: false, reason: null };
    const competitor = (comp.competitors || []).find((c: any) => c.homeAway === pickedSide);
    if (!competitor) return { signalChanged: false, reason: null };
    const current = competitor.probables?.[0]?.athlete?.displayName;
    if (current && stored && current.toLowerCase().trim() !== stored.toLowerCase().trim()) {
      return { signalChanged: true, reason: `Probable pitcher swap on our side: was ${stored}, now ${current}.` };
    }
    return { signalChanged: false, reason: null };
  } catch {
    return { signalChanged: false, reason: null };
  }
}

async function checkKeyPlayerOut(row: RegistryRow): Promise<{ signalChanged: boolean; reason: string | null }> {
  if (!row.event_id) return { signalChanged: false, reason: null };
  const payload = row.research_payload || {};
  const pickedSide: 'home' | 'away' = payload.selectionSide === 'away' ? 'away' : 'home';
  const pickedKeyPlayers: string[] = pickedSide === 'home'
    ? (payload.homeTeam?.keyPlayers || [])
    : (payload.awayTeam?.keyPlayers || []);
  if (pickedKeyPlayers.length === 0) return { signalChanged: false, reason: null };

  const sportPath: Record<string, string> = {
    'MLB': 'baseball/mlb', 'NBA': 'basketball/nba', 'WNBA': 'basketball/wnba',
    'NHL': 'hockey/nhl', 'NFL': 'football/nfl',
  };
  const path = sportPath[row.league];
  if (!path) return { signalChanged: false, reason: null };

  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${row.event_id}`, { cache: 'no-store' });
    if (!res.ok) return { signalChanged: false, reason: null };
    const data: any = await res.json();
    // ESPN exposes injuries at data.injuries[].injuries — each entry has athlete.displayName + status.
    const teamInjuries = (data.injuries || []).find((t: any) => {
      const compId = t.team?.id;
      const compTeams = (data.header?.competitions?.[0]?.competitors || []);
      const sidedCompetitor = compTeams.find((c: any) => c.homeAway === pickedSide);
      return compId && sidedCompetitor?.team?.id && String(compId) === String(sidedCompetitor.team.id);
    });
    if (!teamInjuries) return { signalChanged: false, reason: null };
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    const keyNamesNorm = pickedKeyPlayers.map(normalize);
    for (const inj of (teamInjuries.injuries || [])) {
      const name = inj.athlete?.displayName || '';
      const status = inj.status || inj.type?.description || '';
      const n = normalize(name);
      if (keyNamesNorm.some((k) => n.includes(k) || k.includes(n))) {
        const s = String(status).toLowerCase();
        if (s.includes('out') || s.includes('inactive') || s.includes('doubtful')) {
          return { signalChanged: true, reason: `Star player ${name} now listed ${status} on our side.` };
        }
      }
    }
    return { signalChanged: false, reason: null };
  } catch {
    return { signalChanged: false, reason: null };
  }
}

// 5. REVERSE LINE MOVEMENT — sharp money confirmed by line moving AGAINST
// public bets. When VSiN public bets % > 55% on one side but our line move
// went the OTHER way, that's classic sharp action against us.
async function checkReverseLineMovement(row: RegistryRow, moveCents: number | null): Promise<{ signalChanged: boolean; reason: string | null }> {
  if (moveCents == null || moveCents < 20) return { signalChanged: false, reason: null };
  const payload = row.research_payload || {};
  const homeTeam = payload.homeTeam?.name;
  const awayTeam = payload.awayTeam?.name;
  const pickedSide: 'home' | 'away' = payload.selectionSide === 'away' ? 'away' : 'home';
  if (!homeTeam || !awayTeam) return { signalChanged: false, reason: null };
  try {
    const split = await getVsinSplit(row.league, homeTeam, awayTeam);
    if (!split) return { signalChanged: false, reason: null };
    const publicBetsOnPicked = pickedSide === 'home' ? split.homeMlBetsPct : split.awayMlBetsPct;
    if (publicBetsOnPicked == null) return { signalChanged: false, reason: null };
    // RLM signature: public is heavily on our side (60%+) but the line moved AGAINST us.
    if (publicBetsOnPicked >= 60 && moveCents >= 25) {
      return {
        signalChanged: true,
        reason: `Reverse line movement: ${publicBetsOnPicked}% of public bets are on us but the line moved ${moveCents}¢ against — sharps are fading us.`,
      };
    }
    return { signalChanged: false, reason: null };
  } catch {
    return { signalChanged: false, reason: null };
  }
}

// 6. DEVIG FAIR-VALUE DRIFT — has the devigged true market probability drifted
// materially since we published? If we're now 3pt+ worse than the devigged
// fair (across multiple sharp books), our edge has eroded.
async function checkDevigDrift(row: RegistryRow): Promise<{ signalChanged: boolean; reason: string | null }> {
  if (row.market_type !== 'moneyline') return { signalChanged: false, reason: null };
  const payload = row.research_payload || {};
  const homeTeam = payload.homeTeam?.name;
  const awayTeam = payload.awayTeam?.name;
  const pickedSide: 'home' | 'away' = payload.selectionSide === 'away' ? 'away' : 'home';
  if (!homeTeam || !awayTeam) return { signalChanged: false, reason: null };
  try {
    const { getDevigForGame } = await import('./devigService');
    const devig = await getDevigForGame(row.league, homeTeam, awayTeam);
    if (!devig) return { signalChanged: false, reason: null };
    const entry = parseAmericanOdds(row.odds);
    if (entry == null) return { signalChanged: false, reason: null };
    const entryImplied = entry > 0 ? 100 / (entry + 100) : Math.abs(entry) / (Math.abs(entry) + 100);
    const fair = pickedSide === 'home' ? devig.homeFair : devig.awayFair;
    const driftPct = (fair - entryImplied) * 100;
    // Drift > 3pt means devig says we should have entered at a LONGER price —
    // i.e., the market has hardened against us by 3+ percentage points.
    if (driftPct >= 3) {
      return {
        signalChanged: true,
        reason: `Devig fair value drifted ${driftPct.toFixed(1)}pt against us since publish (${devig.bookCount} sharp books) — edge eroding.`,
      };
    }
    return { signalChanged: false, reason: null };
  } catch {
    return { signalChanged: false, reason: null };
  }
}

// 7. WEATHER DETERIORATION — for outdoor MLB / NFL totals. If wind/precip
// changed materially since publish, flag it.
async function checkWeatherChange(row: RegistryRow): Promise<{ signalChanged: boolean; reason: string | null }> {
  if (!row.event_id) return { signalChanged: false, reason: null };
  if (row.league !== 'MLB' && row.league !== 'NFL') return { signalChanged: false, reason: null };
  const isTotal = /\b(over|under)\b/i.test(row.selection || '');
  if (!isTotal) return { signalChanged: false, reason: null };
  try {
    const sportPath = row.league === 'MLB' ? 'baseball/mlb' : 'football/nfl';
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sportPath}/summary?event=${row.event_id}`, { cache: 'no-store' });
    if (!res.ok) return { signalChanged: false, reason: null };
    const data: any = await res.json();
    const w = data?.weather || data?.gameInfo?.weather;
    if (!w) return { signalChanged: false, reason: null };
    const wind = Number(w.windSpeed || w.windSpeedMph || 0);
    const precip = Number(w.precipitation || 0);
    const isOver = /\bover\b/i.test(row.selection || '');
    // Heavy wind suppresses scoring. If we're on Over and wind > 18, flag.
    // If precip > 50% and we're on Over, flag.
    if (isOver && wind >= 18) {
      return { signalChanged: true, reason: `Wind picked up to ${wind} mph — suppresses scoring against our Over.` };
    }
    if (isOver && precip >= 60) {
      return { signalChanged: true, reason: `${precip}% precipitation forecast — suppresses scoring against our Over.` };
    }
    return { signalChanged: false, reason: null };
  } catch {
    return { signalChanged: false, reason: null };
  }
}

// 8. KEY PLAYER QUESTIONABLE → OUT downgrade. We already catch outright OUT,
// but a star moving Q → Doubtful is a leading indicator before they're ruled
// OUT. Specifically flag transitions that happened post-publish.
async function checkInjuryStatusDowngrade(row: RegistryRow): Promise<{ signalChanged: boolean; reason: string | null }> {
  if (!row.event_id) return { signalChanged: false, reason: null };
  const payload = row.research_payload || {};
  const pickedSide: 'home' | 'away' = payload.selectionSide === 'away' ? 'away' : 'home';
  const pickedKeyPlayers: string[] = pickedSide === 'home'
    ? (payload.homeTeam?.keyPlayers || [])
    : (payload.awayTeam?.keyPlayers || []);
  if (pickedKeyPlayers.length === 0) return { signalChanged: false, reason: null };

  // Snapshot of injury list AT PUBLISH (stored in payload). Compare to current.
  const publishedQ: string[] = (payload.homeTeam || {}).injuredQuestionable || [];
  const publishedQ2: string[] = (payload.awayTeam || {}).injuredQuestionable || [];
  const publishedStatusByName = new Map<string, string>();
  for (const n of publishedQ) publishedStatusByName.set(n.toLowerCase().trim(), 'questionable');
  for (const n of publishedQ2) publishedStatusByName.set(n.toLowerCase().trim(), 'questionable');

  const sportPath: Record<string, string> = {
    'MLB': 'baseball/mlb', 'NBA': 'basketball/nba', 'WNBA': 'basketball/wnba',
    'NHL': 'hockey/nhl', 'NFL': 'football/nfl',
  };
  const path = sportPath[row.league];
  if (!path) return { signalChanged: false, reason: null };
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${row.event_id}`, { cache: 'no-store' });
    if (!res.ok) return { signalChanged: false, reason: null };
    const data: any = await res.json();
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    for (const t of (data.injuries || [])) {
      for (const inj of (t.injuries || [])) {
        const name = inj.athlete?.displayName || '';
        const status = String(inj.status || '').toLowerCase();
        const wasQ = publishedStatusByName.get(normalize(name)) === 'questionable';
        const nowDoubtfulOrOut = status.includes('doubtful') || status.includes('out');
        if (wasQ && nowDoubtfulOrOut) {
          // Check if this player is a flagged key player on our side
          if (pickedKeyPlayers.some((kp) => normalize(kp).includes(normalize(name)) || normalize(name).includes(normalize(kp)))) {
            return {
              signalChanged: true,
              reason: `${name} downgraded from Questionable → ${status.toUpperCase()} since we published.`,
            };
          }
        }
      }
    }
    return { signalChanged: false, reason: null };
  } catch {
    return { signalChanged: false, reason: null };
  }
}

async function checkSharpMoneyFlip(row: RegistryRow): Promise<{ signalChanged: boolean; reason: string | null }> {
  const payload = row.research_payload || {};
  const homeTeam = payload.homeTeam?.name;
  const awayTeam = payload.awayTeam?.name;
  const pickedSide: 'home' | 'away' = payload.selectionSide === 'away' ? 'away' : 'home';
  if (!homeTeam || !awayTeam) return { signalChanged: false, reason: null };

  try {
    const split = await getVsinSplit(row.league, homeTeam, awayTeam);
    if (!split) return { signalChanged: false, reason: null };
    const sharp = deriveSharpSideFromVsin(split);
    if (!sharp.mlSharp) return { signalChanged: false, reason: null };
    if (sharp.mlSharp !== pickedSide && sharp.mlConfidence >= 65) {
      return {
        signalChanged: true,
        reason: `Sharp money has flipped to the opposite side (${sharp.mlSharp}, conf ${sharp.mlConfidence.toFixed(0)}%).`,
      };
    }
    return { signalChanged: false, reason: null };
  } catch {
    return { signalChanged: false, reason: null };
  }
}

// ─── Main cycle ──────────────────────────────────────────────────────────────

export interface SignalWatchCycleResult {
  scanned: number;
  flagged: number;
  cleared: number;
  errors: number;
  transitions: Array<{
    id: string; selection: string;
    from: string | null; to: string | null;
    reasons: string[]; moveCents: number | null;
  }>;
}

export async function runSignalWatchCycle(): Promise<SignalWatchCycleResult> {
  const out: SignalWatchCycleResult = { scanned: 0, flagged: 0, cleared: 0, errors: 0, transitions: [] };
  if (!hasDatabase()) return out;
  await ensureSchema();

  const rows = await prisma.$queryRawUnsafe<RegistryRow[]>(
    `SELECT id, event_id, league, market_type, selection, odds, edge_score,
            research_payload, category, event_name,
            line_alert_level, line_move_cents, pre_alert_edge_score
       FROM himothy_pick_registry
      WHERE status IN ('published','locked')
        AND result = 'pending'
        AND research_payload ? 'startTime'
        AND (research_payload->>'startTime')::timestamptz > NOW()`,
  ).catch(() => []);

  out.scanned = rows.length;

  // 2026-06-05 LOCK WINDOW per owner directive. Big-cap industry standard:
  // do NOT auto-change picks within 2 hours of game time. Customers need a
  // grace period to act on what was posted. Inside the window the signal
  // watcher still LOGS what it sees (for admin postmortem) but does not
  // mutate the registry. Outside the window it acts normally — confidence
  // caps + emails fire as designed.
  const LOCK_WINDOW_MS = 2 * 60 * 60 * 1000;

  for (const row of rows) {
    try {
      const startMs = (() => {
        const s = row.research_payload?.startTime || row.research_payload?.startTimeUtc;
        if (!s) return null;
        const t = new Date(s).getTime();
        return isFinite(t) ? t : null;
      })();
      const insideLockWindow = startMs != null && (startMs - Date.now()) < LOCK_WINDOW_MS && startMs > Date.now();

      const [line, pitcher, injury, sharp] = await Promise.all([
        checkLineMove(row),
        checkProbablePitcherSwap(row),
        checkKeyPlayerOut(row),
        checkSharpMoneyFlip(row),
      ]);
      // Deeper second-pass checks. These depend on the first pass (e.g., RLM
      // needs the line move number) so they run after the parallel batch.
      const [rlm, devig, weather, injStatus] = await Promise.all([
        checkReverseLineMovement(row, line.moveCents),
        checkDevigDrift(row),
        checkWeatherChange(row),
        checkInjuryStatusDowngrade(row),
      ]);

      const reasons: string[] = [];
      if (line.reason) reasons.push(line.reason);
      if (pitcher.reason) reasons.push(pitcher.reason);
      if (injury.reason) reasons.push(injury.reason);
      if (sharp.reason) reasons.push(sharp.reason);
      if (rlm.reason) reasons.push(rlm.reason);
      if (devig.reason) reasons.push(devig.reason);
      if (weather.reason) reasons.push(weather.reason);
      if (injStatus.reason) reasons.push(injStatus.reason);

      // 2026-06-05 CONSENSUS RULE per owner directive: "the only time a change
      // is made is when all engines agree." Critical single-signal events
      // (star ruled OUT, probable pitcher swapped to a different name) are
      // unambiguous facts — they stay single-trigger. Everything else needs
      // confirmation from at least one other signal before we cap confidence.
      //
      // Three tiers now:
      //   WATCH  — 1 non-critical signal flagged. Logged for admin visibility
      //            but conf is NOT capped. "Worth watching, not actionable yet."
      //   YELLOW — 2 signals agree (excluding criticals which jump straight to red).
      //            Confidence capped at 82, drops out of Pressure Pack / Grand Slam.
      //   RED    — critical single signal OR 3+ signals agree. Cap at 75.
      const flaggedCount = [
        line.signalChanged, pitcher.signalChanged, injury.signalChanged, sharp.signalChanged,
        rlm.signalChanged, devig.signalChanged, weather.signalChanged, injStatus.signalChanged,
      ].filter(Boolean).length;
      // Critical signals fire single-trigger to RED. Pitcher swap, key player
      // outright OUT, and (new) any key player Q→Doubtful/Out downgrade.
      const criticalFired = pitcher.signalChanged || injury.signalChanged || injStatus.signalChanged;
      const lineSevere = line.moveCents != null && line.moveCents >= 150;

      let nextLevel: string | null = null;
      let cap: number | null = null;
      if (criticalFired) {
        nextLevel = 'red'; cap = RED_CAP;
      } else if (lineSevere && flaggedCount >= 2) {
        nextLevel = 'red'; cap = RED_CAP;
      } else if (flaggedCount >= 3) {
        nextLevel = 'red'; cap = RED_CAP;
      } else if (flaggedCount >= 2) {
        nextLevel = 'yellow'; cap = YELLOW_CAP;
      } else if (flaggedCount >= 1) {
        nextLevel = 'watch'; cap = null;  // informational only, no cap applied
      }

      const prevLevel = row.line_alert_level;

      // 2026-06-05 GRACE PERIOD: if the game tips off within 2 hours, no auto
      // changes. The watcher still logs what it detected (so admin can see
      // every signal that fired) but the registry stays untouched. This gives
      // customers a window to act on what was posted without the system
      // flipping picks under them at the last minute.
      if (insideLockWindow && nextLevel !== prevLevel) {
        await logAction({
          action: 'PICK_MANUALLY_EDITED',
          actor: 'cron',
          subject: row.id,
          summary: `Signal change suppressed by 2h lock window: would have moved ${prevLevel || 'OK'} → ${nextLevel || 'OK'}`,
          details: { selection: row.selection, reasons, prevLevel, suppressedTo: nextLevel, lockWindow: '2h' },
        }).catch(() => null);
        continue;
      }

      if (nextLevel !== prevLevel) {
        if (nextLevel) {
          // Pick the effective score to write back:
          //   - WATCH: restore original (or keep current if no pre_alert_edge_score saved)
          //   - YELLOW/RED: cap the ORIGINAL preserved score (pre_alert_edge_score), not the
          //     currently-capped one — otherwise a yellow → red transition would
          //     re-cap an already-capped number.
          const wasPreviouslyCapped = prevLevel === 'yellow' || prevLevel === 'red';
          const originalScore = wasPreviouslyCapped
            ? (row as any).pre_alert_edge_score ?? row.edge_score
            : row.edge_score;
          const newScore = cap != null && originalScore != null
            ? Math.min(Number(originalScore), cap)
            : originalScore;
          await prisma.$executeRawUnsafe(
            `UPDATE himothy_pick_registry
                SET line_alert_level = $1,
                    line_move_cents = $2,
                    line_alert_flagged_at = NOW(),
                    pre_alert_edge_score = CASE
                      WHEN $1::text IN ('yellow','red') THEN COALESCE(pre_alert_edge_score, edge_score)
                      WHEN $1::text = 'watch' THEN NULL
                      ELSE pre_alert_edge_score
                    END,
                    edge_score = $3,
                    signal_alert_reasons = $4::jsonb,
                    updated_at = NOW()
              WHERE id = $5`,
            nextLevel, line.moveCents, newScore, JSON.stringify(reasons), row.id,
          );
          out.flagged++;
          out.transitions.push({
            id: row.id, selection: row.selection, from: prevLevel, to: nextLevel,
            reasons, moveCents: line.moveCents,
          });
          await logAction({
            action: 'PICK_MANUALLY_EDITED',
            actor: 'cron',
            subject: row.id,
            summary: `Signal change ${prevLevel || 'OK'} → ${nextLevel.toUpperCase()}: ${reasons[0]}`,
            details: { selection: row.selection, reasons, moveCents: line.moveCents, prevLevel, nextLevel },
          }).catch(() => null);
          // 2026-06-05: send a transition email ONLY when the change is
          // customer-visible (YELLOW or RED — confidence dropped). WATCH
          // transitions are informational and don't change anything on the
          // board, so no email — that prevents the "I got an email but the
          // pick is the same" confusion.
          if (nextLevel === 'yellow' || nextLevel === 'red') {
            await emailTransition(row, nextLevel, reasons, cap, newScore).catch(() => null);
          }
        } else {
          await prisma.$executeRawUnsafe(
            `UPDATE himothy_pick_registry
                SET line_alert_level = NULL,
                    line_move_cents = $1,
                    edge_score = COALESCE(pre_alert_edge_score, edge_score),
                    pre_alert_edge_score = NULL,
                    signal_alert_reasons = NULL,
                    updated_at = NOW()
              WHERE id = $2`,
            line.moveCents, row.id,
          );
          out.cleared++;
          out.transitions.push({ id: row.id, selection: row.selection, from: prevLevel, to: null, reasons: [], moveCents: line.moveCents });
          await logAction({
            action: 'PICK_MANUALLY_EDITED',
            actor: 'cron',
            subject: row.id,
            summary: `Signal change recovered; ${prevLevel} alert cleared, original conf restored`,
            details: { selection: row.selection, prevLevel, moveCents: line.moveCents },
          }).catch(() => null);
          // Restoration from a YELLOW or RED cap means the customer's conf
          // just went UP back to the original. Send a recovery email so the
          // user sees: "Hey, that earlier downgrade reverted, the pick is
          // back to its original conviction."
          if (prevLevel === 'yellow' || prevLevel === 'red') {
            await emailRestoration(row, prevLevel).catch(() => null);
          }
        }
      } else if (nextLevel) {
        // Still flagged — refresh stored fields so admin sees current numbers.
        await prisma.$executeRawUnsafe(
          `UPDATE himothy_pick_registry
              SET line_move_cents = $1, signal_alert_reasons = $2::jsonb, updated_at = NOW()
            WHERE id = $3`,
          line.moveCents, JSON.stringify(reasons), row.id,
        );
      }
    } catch (err) {
      out.errors++;
      console.error('[signalWatch] row failed', row.id, err);
    }
  }

  return out;
}
