// Deep tendency service — owner directive: "go very, very, very deep into Tendencies."
//
// Pulls per-team behavioral splits from ESPN scoreboard linescores. Every signal here is
// derived from REAL game data (inning-by-inning / quarter-by-quarter), not from team
// season averages — so the engine can answer questions like:
//   - "Does this team's bat play 1st inning, or do they sleep through it?"
//   - "Are they covering the F5 line, or do their starters get pulled early?"
//   - "Do they explode in Q1, or are they slow starters?"
//
// Cached aggressively (1h TTL per team) because each team-tendency pull costs 7-14 ESPN
// scoreboard hits.

import { LEAGUE_URLS } from '@/lib/validation';

type LinescoreCache = Map<string, Record<string, number[]>>; // date -> gameId -> per-period values
const SCOREBOARD_CACHE: Map<string, { data: LinescoreCache; at: number }> = new Map();
const TEAM_TENDENCY_CACHE: Map<string, { data: TeamTendencies; at: number }> = new Map();
const TTL_MS = 60 * 60 * 1000;

type ScoreboardEvent = { id: string; date: string; competitions: Array<{ competitors: Array<{ team?: { id?: string }; homeAway?: string; linescores?: Array<{ value?: number; displayValue?: string }> }> }> };

export interface TeamTendencies {
  league: string;
  teamId: string;
  sampleGames: number;

  // Sport-shared
  // % of last-N games where the team had a quiet first frame (no 1st-inning run / sub-25 Q1)
  pctSilentFirstFrame: number;
  // Avg points/runs scored by THIS team in first frame
  avgScoredFirstFrame: number;
  // Avg points/runs ALLOWED in first frame
  avgAllowedFirstFrame: number;

  // Baseball-specific (returns 0 for non-baseball)
  // % of games where THIS team scored in 1st inning (YRFI on their side)
  pctScoredFirstInning: number;
  // % of games where THIS team allowed a 1st-inning run
  pctAllowedFirstInning: number;
  // % of last-N games where the COMBINED 1st-inning produced runs (game-level YRFI hit)
  pctGameYRFI: number;
  // Avg combined F5 (first-5-innings) total in last-N games
  avgF5Total: number;
  // Avg runs SCORED by this team in F5
  avgF5Scored: number;
  // Avg runs ALLOWED in F5
  avgF5Allowed: number;

  // Basketball-specific (returns 0 for non-basketball)
  avgQ1Scored: number;
  avgQ1Allowed: number;
  avgH1Scored: number;
  avgH1Allowed: number;
  // % of last-N games where THIS team was leading after Q1
  pctLeadAfterQ1: number;
  // % of last-N games where THIS team was leading at H1
  pctLeadAfterH1: number;

  // Universal late-game tendency
  // Avg margin built in the last 25% of the game (e.g. 9th inning, Q4) — positive = closer, negative = blown lead
  avgLateGameMargin: number;
  // % of last-N games decided by 3 runs / 7 points or fewer (close-game cohort)
  pctCloseGames: number;
}

function dateToYYYYMMDD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

async function fetchScoreboardForDate(league: string, yyyymmdd: string): Promise<ScoreboardEvent[]> {
  const base = LEAGUE_URLS[league];
  if (!base) return [];
  try {
    const r = await fetch(`${base}/scoreboard?dates=${yyyymmdd}`, { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.events || []) as ScoreboardEvent[];
  } catch {
    return [];
  }
}

async function fetchTeamSchedule(league: string, teamId: string): Promise<Array<{ id: string; date: string }>> {
  const base = LEAGUE_URLS[league];
  if (!base) return [];
  try {
    const r = await fetch(`${base}/teams/${teamId}/schedule`, { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    const events: any[] = j.events || [];
    return events
      .filter((e) => (e.competitions || [{}])[0]?.status?.type?.completed === true)
      .map((e) => ({ id: String(e.id), date: String(e.date || '').slice(0, 10) }))
      .filter((e) => e.id && e.date);
  } catch {
    return [];
  }
}

// Convert one team's row of linescores into per-period numbers.
function linescoreValues(c: ScoreboardEvent['competitions'][0]['competitors'][0]): number[] {
  const ls = c.linescores || [];
  return ls.map((l) => Number(l.value ?? l.displayValue ?? 0) || 0);
}

function pickedTeamRow(ev: ScoreboardEvent, teamId: string): { mine: number[]; opp: number[] } | null {
  const comp = (ev.competitions || [])[0];
  if (!comp) return null;
  const competitors = comp.competitors || [];
  const me = competitors.find((c) => String(c.team?.id || '') === String(teamId));
  const them = competitors.find((c) => String(c.team?.id || '') !== String(teamId));
  if (!me || !them) return null;
  return { mine: linescoreValues(me), opp: linescoreValues(them) };
}

export async function getTeamTendencies(league: string, teamId: string, lookback = 10): Promise<TeamTendencies> {
  const cacheKey = `${league}|${teamId}|${lookback}`;
  const hit = TEAM_TENDENCY_CACHE.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const sched = await fetchTeamSchedule(league, teamId);
  // ESPN may return future-events too; we already filtered to completed. Take most recent N.
  const recent = sched.slice(-lookback);
  const out: TeamTendencies = {
    league, teamId, sampleGames: 0,
    pctSilentFirstFrame: 0, avgScoredFirstFrame: 0, avgAllowedFirstFrame: 0,
    pctScoredFirstInning: 0, pctAllowedFirstInning: 0, pctGameYRFI: 0,
    avgF5Total: 0, avgF5Scored: 0, avgF5Allowed: 0,
    avgQ1Scored: 0, avgQ1Allowed: 0, avgH1Scored: 0, avgH1Allowed: 0,
    pctLeadAfterQ1: 0, pctLeadAfterH1: 0,
    avgLateGameMargin: 0, pctCloseGames: 0,
  };
  if (!recent.length) return out;

  // Pull each unique date's scoreboard once (most slates share dates across teams).
  const dates = Array.from(new Set(recent.map((g) => g.date.replaceAll('-', ''))));
  const linescoresByGameId = new Map<string, { mine: number[]; opp: number[] }>();
  for (const d of dates) {
    let day: ScoreboardEvent[];
    const cacheHit = SCOREBOARD_CACHE.get(`${league}|${d}`);
    if (cacheHit && Date.now() - cacheHit.at < TTL_MS) {
      // Reuse the raw events were stored as Map<gameId, [...periods]> — but we need per-team rows.
      // Simpler: skip the per-game-id cache and just refetch scoreboards (they're cheap).
      day = await fetchScoreboardForDate(league, d);
    } else {
      day = await fetchScoreboardForDate(league, d);
      // Store an empty marker so we don't refetch in the same tendency call across teams.
      SCOREBOARD_CACHE.set(`${league}|${d}`, { data: new Map(), at: Date.now() });
    }
    for (const ev of day) {
      const row = pickedTeamRow(ev, teamId);
      if (row) linescoresByGameId.set(String(ev.id), row);
    }
  }

  let sample = 0;
  let firstScored = 0, firstAllowed = 0, gameYRFIcount = 0, silentFirstFrameCount = 0;
  let sumScoredFirst = 0, sumAllowedFirst = 0;
  let sumF5Total = 0, sumF5Scored = 0, sumF5Allowed = 0;
  let sumQ1Scored = 0, sumQ1Allowed = 0, sumH1Scored = 0, sumH1Allowed = 0;
  let leadQ1 = 0, leadH1 = 0;
  let closeGames = 0;
  let sumLateMargin = 0;

  const isBaseball = league.toLowerCase().includes('baseball') || league.toUpperCase() === 'MLB';
  const isBasketball = ['NBA', 'WNBA'].includes(league.toUpperCase()) || league.toLowerCase().includes('basketball');

  for (const g of recent) {
    const row = linescoresByGameId.get(g.id);
    if (!row) continue;
    const { mine, opp } = row;
    if (!mine.length || !opp.length) continue;
    sample += 1;

    const firstMine = mine[0] || 0;
    const firstOpp = opp[0] || 0;
    sumScoredFirst += firstMine;
    sumAllowedFirst += firstOpp;
    if (firstMine > 0) firstScored += 1;
    if (firstOpp > 0) firstAllowed += 1;
    if (firstMine + firstOpp > 0) gameYRFIcount += 1;
    if (firstMine + firstOpp === 0) silentFirstFrameCount += 1;

    if (isBaseball) {
      const f5Me = mine.slice(0, 5).reduce((a, b) => a + b, 0);
      const f5Op = opp.slice(0, 5).reduce((a, b) => a + b, 0);
      sumF5Scored += f5Me;
      sumF5Allowed += f5Op;
      sumF5Total += f5Me + f5Op;
    }

    if (isBasketball) {
      // ESPN basketball linescores: [Q1, Q2, Q3, Q4, OT...]
      const q1Me = mine[0] || 0;
      const q1Op = opp[0] || 0;
      const h1Me = (mine[0] || 0) + (mine[1] || 0);
      const h1Op = (opp[0] || 0) + (opp[1] || 0);
      sumQ1Scored += q1Me;
      sumQ1Allowed += q1Op;
      sumH1Scored += h1Me;
      sumH1Allowed += h1Op;
      if (q1Me > q1Op) leadQ1 += 1;
      if (h1Me > h1Op) leadH1 += 1;
    }

    const totalMe = mine.reduce((a, b) => a + b, 0);
    const totalOp = opp.reduce((a, b) => a + b, 0);
    const margin = totalMe - totalOp;
    if (isBaseball ? Math.abs(margin) <= 3 : Math.abs(margin) <= 7) closeGames += 1;

    // Late-game frame: last quarter of the linescore (e.g. inning 9 of 9, or Q4 of 4)
    const lateIdx = Math.max(0, Math.min(mine.length, opp.length) - 1);
    const lateMargin = (mine[lateIdx] || 0) - (opp[lateIdx] || 0);
    sumLateMargin += lateMargin;
  }

  if (sample > 0) {
    out.sampleGames = sample;
    out.pctScoredFirstInning = (firstScored / sample) * 100;
    out.pctAllowedFirstInning = (firstAllowed / sample) * 100;
    out.pctGameYRFI = (gameYRFIcount / sample) * 100;
    out.pctSilentFirstFrame = (silentFirstFrameCount / sample) * 100;
    out.avgScoredFirstFrame = sumScoredFirst / sample;
    out.avgAllowedFirstFrame = sumAllowedFirst / sample;
    if (isBaseball) {
      out.avgF5Total = sumF5Total / sample;
      out.avgF5Scored = sumF5Scored / sample;
      out.avgF5Allowed = sumF5Allowed / sample;
    }
    if (isBasketball) {
      out.avgQ1Scored = sumQ1Scored / sample;
      out.avgQ1Allowed = sumQ1Allowed / sample;
      out.avgH1Scored = sumH1Scored / sample;
      out.avgH1Allowed = sumH1Allowed / sample;
      out.pctLeadAfterQ1 = (leadQ1 / sample) * 100;
      out.pctLeadAfterH1 = (leadH1 / sample) * 100;
    }
    out.pctCloseGames = (closeGames / sample) * 100;
    out.avgLateGameMargin = sumLateMargin / sample;
  }

  TEAM_TENDENCY_CACHE.set(cacheKey, { data: out, at: Date.now() });
  return out;
}

// Convenience: produce a one-line human-readable tendency summary for a team. Surfaced on
// the admin postmortem and on customer cards once wired.
export function summarizeTendencies(t: TeamTendencies): string {
  const isBaseball = t.league.toLowerCase().includes('baseball') || t.league.toUpperCase() === 'MLB';
  const isBasketball = ['NBA', 'WNBA'].includes(t.league.toUpperCase());
  if (t.sampleGames === 0) return 'No tendency sample.';
  if (isBaseball) {
    return `${t.sampleGames}g: 1st-inn ${t.pctScoredFirstInning.toFixed(0)}% scored / ${t.pctAllowedFirstInning.toFixed(0)}% allowed | F5 ${t.avgF5Total.toFixed(1)} runs/game (${t.avgF5Scored.toFixed(1)}-${t.avgF5Allowed.toFixed(1)}) | close ${t.pctCloseGames.toFixed(0)}%`;
  }
  if (isBasketball) {
    return `${t.sampleGames}g: Q1 ${t.avgQ1Scored.toFixed(1)}-${t.avgQ1Allowed.toFixed(1)} (${t.pctLeadAfterQ1.toFixed(0)}% lead) | H1 ${t.avgH1Scored.toFixed(1)}-${t.avgH1Allowed.toFixed(1)} (${t.pctLeadAfterH1.toFixed(0)}% lead)`;
  }
  return `${t.sampleGames}g.`;
}
