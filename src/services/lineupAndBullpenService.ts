// MLB LINEUP-POSTED DETECTION + BULLPEN USAGE
//
// Two MLB-specific signals the engine has been missing:
//
//   1. CONFIRMED LINEUP: ESPN's `probables.status === "Confirmed"` confirms
//      only the starting pitcher. The actual batting order posts ~90-120
//      minutes before first pitch via the MLB Stats API. The 8-hole hitter
//      vs leadoff is a 40-point OPS gap; F5 / NRFI / team-total bets depend
//      on who's at the top.
//
//   2. BULLPEN EXHAUSTION: A closer who's pitched 3 days in a row is
//      functionally unavailable. We currently use bullpen ERA L5 / L10 but
//      not who's GASSED tonight. MLB Stats API exposes per-pitcher pitch
//      counts in the gamelog for each completed game; we sum the last 3 days
//      of work per reliever, then flag any team whose top-3 relievers are
//      collectively over the workload threshold.

const MLB_API = 'https://statsapi.mlb.com/api/v1';
const CACHE_TTL_MS = 30 * 60 * 1000;

interface LineupSlot {
  battingOrder: number;       // 1-9
  playerId: number;
  playerName: string;
  position: string;
  // Season hitting line for context (when available)
  ops: number | null;
  obp: number | null;
}

export interface PostedLineup {
  teamId: number;
  teamName: string;
  posted: boolean;
  lineup: LineupSlot[];
  leadoffOps: number | null;
  topThreeAvgOps: number | null;
  // Compared to the team's typical batting-order strength: did the manager
  // shuffle? (e.g. dropping a slumping star, batting a hot bench bat 2nd).
  shuffled: boolean | null;
}

const lineupCache = new Map<string, { data: PostedLineup; at: number }>();

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Helper: today's date for the MLB Stats API. They want YYYY-MM-DD ET.
function etDateStr(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  return `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}-${parts.find((p) => p.type === 'day')?.value}`;
}

// Pull today's posted lineups for an MLB game. Identifies the game via the
// MLB Stats API gamePk (different from ESPN event ID — caller must look up).
// Returns posted: false when the lineup hasn't been published yet.
export async function getPostedLineup(gamePk: number, teamSide: 'home' | 'away'): Promise<PostedLineup | null> {
  const key = `${gamePk}|${teamSide}`;
  const cached = lineupCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const data = await fetchJson(`${MLB_API}/game/${gamePk}/boxscore`);
  if (!data) return null;

  const team = teamSide === 'home' ? data.teams?.home : data.teams?.away;
  if (!team) return null;

  const battingOrder: number[] = team.battingOrder || [];
  // Empty battingOrder = lineup not posted yet.
  if (battingOrder.length === 0) {
    const empty: PostedLineup = {
      teamId: team.team?.id || 0,
      teamName: team.team?.name || '',
      posted: false,
      lineup: [],
      leadoffOps: null,
      topThreeAvgOps: null,
      shuffled: null,
    };
    lineupCache.set(key, { data: empty, at: Date.now() });
    return empty;
  }

  // The boxscore's `batters` array is the IDs that played; `players` map has
  // names + positions. battingOrder gives position values like '100', '200',
  // '300' etc. — divide by 100 to get the slot.
  const players: any = team.players || {};
  const slots: LineupSlot[] = [];
  for (let i = 0; i < battingOrder.length && i < 9; i++) {
    const playerId = battingOrder[i];
    const pKey = `ID${playerId}`;
    const p = players[pKey];
    if (!p) continue;
    const seasonStats = p.seasonStats?.batting || {};
    const ops = seasonStats.ops != null ? Number(seasonStats.ops) : null;
    const obp = seasonStats.obp != null ? Number(seasonStats.obp) : null;
    slots.push({
      battingOrder: i + 1,
      playerId,
      playerName: p.person?.fullName || '',
      position: p.position?.abbreviation || '',
      ops: isFinite(ops as number) ? ops : null,
      obp: isFinite(obp as number) ? obp : null,
    });
  }

  const leadoff = slots[0];
  const top3Ops = slots.slice(0, 3).map((s) => s.ops).filter((v): v is number => v != null);
  const topThreeAvgOps = top3Ops.length > 0 ? Number((top3Ops.reduce((a, b) => a + b, 0) / top3Ops.length).toFixed(3)) : null;

  const result: PostedLineup = {
    teamId: team.team?.id || 0,
    teamName: team.team?.name || '',
    posted: slots.length >= 8,    // lineup is "posted" once we have 8+ confirmed slots
    lineup: slots,
    leadoffOps: leadoff?.ops ?? null,
    topThreeAvgOps,
    shuffled: null,    // would need season-long lineup history; left null for now
  };
  lineupCache.set(key, { data: result, at: Date.now() });
  return result;
}

// ─── Bullpen exhaustion ──────────────────────────────────────────────────

export interface BullpenExhaustion {
  teamId: number;
  teamName: string;
  // Total pitches the top-3 high-leverage relievers have thrown in the last
  // 3 days. League average is roughly 40-50 pitches over a 3-day window.
  // >80 means the pen is gassed.
  pitchesLast3Days: number;
  // Specific guys flagged as unavailable.
  unavailableRelievers: Array<{ name: string; pitchesLast3: number; reason: string }>;
  // Overall exhaustion tier
  exhaustion: 'rested' | 'normal' | 'tired' | 'gassed';
  reason: string | null;
}

const bullpenCache = new Map<string, { data: BullpenExhaustion; at: number }>();

// Pulls last 3 days of MLB games for the team, walks each game's pitcher
// stats, and sums pitches per reliever. Relievers are anyone NOT marked as
// the starter (positionType 'Pitcher' AND `gameStatus.isCurrentBatter === false`
// is approximation; in practice use IP < 4 to identify reliever).
export async function getBullpenExhaustion(teamId: number): Promise<BullpenExhaustion | null> {
  if (!teamId) return null;
  const key = `${teamId}|${etDateStr()}`;
  const cached = bullpenCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  // Pull the team's last 5 games (we'll filter to last 3 days).
  const now = new Date();
  const since = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
  const url = `${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${etDateStr(since)}&endDate=${etDateStr(now)}&hydrate=team(roster(person)),probablePitcher`;
  const sched = await fetchJson(url);
  if (!sched) return null;

  const gamePks: number[] = [];
  for (const day of sched.dates || []) {
    for (const game of day.games || []) {
      // Skip non-final games (today's may not have played yet, day-game-after-night possibly in progress)
      if (game.status?.codedGameState !== 'F') continue;
      gamePks.push(game.gamePk);
    }
  }

  const pitcherWork: Record<string, { name: string; pitches: number; gamesPitched: number; ip: number }> = {};
  for (const gamePk of gamePks) {
    const box = await fetchJson(`${MLB_API}/game/${gamePk}/boxscore`);
    if (!box) continue;
    const teams = [box.teams?.home, box.teams?.away];
    for (const t of teams) {
      if (!t || t.team?.id !== teamId) continue;
      const players = t.players || {};
      for (const key of Object.keys(players)) {
        const p = players[key];
        if (p.position?.abbreviation !== 'P') continue;
        const stat = p.stats?.pitching;
        if (!stat || stat.pitchesThrown == null) continue;
        const ip = parseFloat(stat.inningsPitched || '0');
        // Skip starters (4+ IP). Reliever cutoff.
        if (ip >= 4) continue;
        const pid = String(p.person?.id || key);
        if (!pitcherWork[pid]) {
          pitcherWork[pid] = { name: p.person?.fullName || '?', pitches: 0, gamesPitched: 0, ip: 0 };
        }
        pitcherWork[pid].pitches += Number(stat.pitchesThrown || 0);
        pitcherWork[pid].ip += ip;
        pitcherWork[pid].gamesPitched += 1;
      }
    }
  }

  // Sort relievers by pitches thrown in last 3 days; top 3 = high-leverage proxy.
  const sorted = Object.values(pitcherWork).sort((a, b) => b.pitches - a.pitches);
  const top3 = sorted.slice(0, 3);
  const pitchesLast3Days = top3.reduce((s, p) => s + p.pitches, 0);

  // Unavailable: thrown 35+ pitches in last 3 days = limited; 50+ = clearly unavailable
  const unavailable: BullpenExhaustion['unavailableRelievers'] = [];
  for (const p of sorted) {
    if (p.pitches >= 50) unavailable.push({ name: p.name, pitchesLast3: p.pitches, reason: 'pitched 50+ pitches over the last 3 days' });
    else if (p.pitches >= 35 && p.gamesPitched >= 3) unavailable.push({ name: p.name, pitchesLast3: p.pitches, reason: 'pitched 3 days in a row' });
  }

  // Overall tier
  let exhaustion: BullpenExhaustion['exhaustion'] = 'normal';
  let reason: string | null = null;
  if (pitchesLast3Days >= 110) { exhaustion = 'gassed'; reason = `Top-3 relievers have thrown ${pitchesLast3Days} pitches in last 3 days — pen is gassed.`; }
  else if (pitchesLast3Days >= 80) { exhaustion = 'tired'; reason = `Top-3 relievers have ${pitchesLast3Days} pitches over last 3 days — bullpen showing fatigue.`; }
  else if (pitchesLast3Days < 30 && gamePks.length >= 2) { exhaustion = 'rested'; reason = `Pen is fresh — only ${pitchesLast3Days} pitches over last 3 days.`; }

  // Look up team name from any pulled boxscore (or fall back).
  let teamName = '';
  for (const day of sched.dates || []) {
    for (const game of day.games || []) {
      if (game.teams?.home?.team?.id === teamId) { teamName = game.teams.home.team.name; break; }
      if (game.teams?.away?.team?.id === teamId) { teamName = game.teams.away.team.name; break; }
    }
    if (teamName) break;
  }

  const data: BullpenExhaustion = {
    teamId, teamName, pitchesLast3Days, unavailableRelievers: unavailable, exhaustion, reason,
  };
  bullpenCache.set(key, { data, at: Date.now() });
  return data;
}
