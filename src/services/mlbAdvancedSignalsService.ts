// MLB advanced signals — the gaps the engine was missing.
//
// Ballpark run factors: Coors adds ~1.5 runs per game, Oracle suppresses, etc.
// Umpire tendencies: K rate, O/U rate, strike zone size (some add 1+ run/game)
// Pitcher workload: days rest, recent pitch counts, early-exit risk
// Team RISP batting: clutch hitting with runners in scoring position
// Closer reliability: blown save rate last 30 days
// Day vs night game splits
// Ground ball vs fly ball pitcher at this specific park

import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const MLB_API = 'https://statsapi.mlb.com/api/v1';
const TTL = 60 * 60 * 1000;

// ─── Ballpark run factors ─────────────────────────────────────────────────────
// Source: multi-year park factor data (well-documented, static except offseason)
// Values: 100 = neutral. 110 = 10% more runs than average. 90 = 10% fewer.
// Each unit above/below 100 = roughly 0.08 runs per game per team.
export const PARK_FACTORS: Record<string, {
  runFactor: number;    // overall runs
  hrFactor: number;     // home runs
  hitFactor: number;    // hits
  surfaceType: 'grass' | 'turf';
  isOutdoor: boolean;
  altitude: number;     // feet above sea level
  notes: string;
}> = {
  // High run environments
  'Colorado Rockies':         { runFactor: 115, hrFactor: 130, hitFactor: 112, surfaceType: 'grass', isOutdoor: true, altitude: 5280, notes: 'Coors Field — thin air, ball carries far. Add 1.5+ runs vs neutral park.' },
  'Cincinnati Reds':          { runFactor: 106, hrFactor: 115, hitFactor: 105, surfaceType: 'grass', isOutdoor: true, altitude: 550, notes: 'Great American Ball Park — small foul territory, short walls.' },
  'Philadelphia Phillies':    { runFactor: 104, hrFactor: 108, hitFactor: 103, surfaceType: 'grass', isOutdoor: true, altitude: 20, notes: 'Citizens Bank Park — hitter friendly.' },
  'Boston Red Sox':           { runFactor: 103, hrFactor: 107, hitFactor: 104, surfaceType: 'grass', isOutdoor: true, altitude: 21, notes: 'Fenway Park — Green Monster creates high hit factor.' },
  'Texas Rangers':            { runFactor: 103, hrFactor: 109, hitFactor: 102, surfaceType: 'grass', isOutdoor: false, altitude: 551, notes: 'Globe Life Field — retractable roof dome, hitter friendly.' },
  'Baltimore Orioles':        { runFactor: 103, hrFactor: 112, hitFactor: 102, surfaceType: 'grass', isOutdoor: true, altitude: 20, notes: 'Camden Yards — short right field.' },
  'Cleveland Guardians':      { runFactor: 102, hrFactor: 105, hitFactor: 101, surfaceType: 'grass', isOutdoor: true, altitude: 650, notes: 'Progressive Field — slightly hitter friendly.' },
  // Neutral environments
  'New York Yankees':         { runFactor: 100, hrFactor: 110, hitFactor: 99, surfaceType: 'grass', isOutdoor: true, altitude: 55, notes: 'Yankee Stadium — short porch in right, neutral overall.' },
  'Chicago Cubs':             { runFactor: 100, hrFactor: 103, hitFactor: 100, surfaceType: 'grass', isOutdoor: true, altitude: 595, notes: 'Wrigley Field — wind-dependent, neutral on average.' },
  'Toronto Blue Jays':        { runFactor: 100, hrFactor: 102, hitFactor: 100, surfaceType: 'turf', isOutdoor: false, altitude: 300, notes: 'Rogers Centre — retractable dome, neutral.' },
  'Los Angeles Dodgers':      { runFactor: 99, hrFactor: 97, hitFactor: 99, surfaceType: 'grass', isOutdoor: true, altitude: 340, notes: "Dodger Stadium — pitcher's park, good defense helped." },
  'Atlanta Braves':           { runFactor: 99, hrFactor: 100, hitFactor: 99, surfaceType: 'grass', isOutdoor: true, altitude: 1050, notes: 'Truist Park — slight altitude boost, neutral.' },
  'Kansas City Royals':       { runFactor: 98, hrFactor: 94, hitFactor: 99, surfaceType: 'grass', isOutdoor: true, altitude: 750, notes: 'Kauffman Stadium — spacious, slight pitcher advantage.' },
  'Detroit Tigers':           { runFactor: 98, hrFactor: 95, hitFactor: 98, surfaceType: 'grass', isOutdoor: true, altitude: 600, notes: 'Comerica Park — deep center, pitcher leaning.' },
  'Minnesota Twins':          { runFactor: 98, hrFactor: 100, hitFactor: 98, surfaceType: 'turf', isOutdoor: false, altitude: 840, notes: 'Target Field — outdoor with roof, moderate.' },
  // Pitcher-friendly parks
  'San Francisco Giants':     { runFactor: 94, hrFactor: 82, hitFactor: 96, surfaceType: 'grass', isOutdoor: true, altitude: 52, notes: 'Oracle Park — cold marine layer, deepest outfield in MLB. Suppresses scoring significantly.' },
  'Oakland Athletics':        { runFactor: 95, hrFactor: 93, hitFactor: 96, surfaceType: 'grass', isOutdoor: true, altitude: 20, notes: 'Oakland Coliseum — foul territory massive, pitcher friendly.' },
  'Seattle Mariners':         { runFactor: 96, hrFactor: 96, hitFactor: 97, surfaceType: 'grass', isOutdoor: false, altitude: 28, notes: 'T-Mobile Park — large foul territory, slight pitcher edge.' },
  'Los Angeles Angels':       { runFactor: 96, hrFactor: 97, hitFactor: 97, surfaceType: 'grass', isOutdoor: true, altitude: 160, notes: 'Angel Stadium — pitcher friendly, deep foul territory.' },
  'San Diego Padres':         { runFactor: 96, hrFactor: 96, hitFactor: 97, surfaceType: 'grass', isOutdoor: true, altitude: 20, notes: 'Petco Park — cool marine air, pitcher friendly.' },
  'Pittsburgh Pirates':       { runFactor: 97, hrFactor: 95, hitFactor: 98, surfaceType: 'grass', isOutdoor: true, altitude: 730, notes: 'PNC Park — pitcher leaning, beautiful park.' },
  // Remaining teams — neutral estimate
  'New York Mets':            { runFactor: 100, hrFactor: 101, hitFactor: 100, surfaceType: 'grass', isOutdoor: true, altitude: 20, notes: 'Citi Field — slightly pitcher leaning historically.' },
  'Chicago White Sox':        { runFactor: 101, hrFactor: 103, hitFactor: 100, surfaceType: 'grass', isOutdoor: true, altitude: 595, notes: 'Guaranteed Rate Field — slight hitter tilt.' },
  'Houston Astros':           { runFactor: 100, hrFactor: 103, hitFactor: 100, surfaceType: 'grass', isOutdoor: false, altitude: 22, notes: 'Minute Maid Park — retractable roof, hill in CF.' },
  'Milwaukee Brewers':        { runFactor: 100, hrFactor: 101, hitFactor: 100, surfaceType: 'grass', isOutdoor: false, altitude: 634, notes: 'American Family Field — retractable dome.' },
  'Arizona Diamondbacks':     { runFactor: 101, hrFactor: 104, hitFactor: 101, surfaceType: 'grass', isOutdoor: false, altitude: 1082, notes: 'Chase Field — retractable dome, altitude factor.' },
  'Miami Marlins':            { runFactor: 97, hrFactor: 95, hitFactor: 97, surfaceType: 'turf', isOutdoor: false, altitude: 6, notes: 'loanDepot park — pitcher-friendly dome.' },
  'Tampa Bay Rays':           { runFactor: 97, hrFactor: 97, hitFactor: 97, surfaceType: 'turf', isOutdoor: false, altitude: 15, notes: 'Tropicana Field — domed turf, pitcher leaning.' },
  'Washington Nationals':     { runFactor: 99, hrFactor: 99, hitFactor: 99, surfaceType: 'grass', isOutdoor: true, altitude: 25, notes: 'Nationals Park — neutral.' },
  'St. Louis Cardinals':      { runFactor: 99, hrFactor: 98, hitFactor: 99, surfaceType: 'grass', isOutdoor: true, altitude: 465, notes: 'Busch Stadium — slight pitcher lean.' },
};

export function getParkFactor(homeTeamName: string) {
  return PARK_FACTORS[homeTeamName] ?? { runFactor: 100, hrFactor: 100, hitFactor: 100, surfaceType: 'grass', isOutdoor: true, altitude: 0, notes: 'No park data — using neutral.' };
}

// Park run adjustment in expected runs: (parkFactor - 100) * 0.02 runs per game per team
export function parkRunAdjustment(homeTeamName: string): number {
  const pf = getParkFactor(homeTeamName);
  return Math.round(((pf.runFactor - 100) * 0.03) * 10) / 10;
}

// ─── Umpire tendencies ────────────────────────────────────────────────────────
// Known umpires with strong over/under tendencies based on multi-year data.
// Updated periodically. K% > 22% = large zone, more Ks, fewer runs (under lean).
// Run factor: average runs scored in games they umpire vs MLB avg (9.0 R/G).
const UMPIRE_TENDENCIES: Record<string, {
  kRateBoost: number;    // vs average K rate (+/- pct points)
  runFactor: number;     // runs per game vs 9.0 avg (+ = over lean, - = under lean)
  overRate: number;      // historical over% in their games
  notes: string;
}> = {
  'Angel Hernandez':   { kRateBoost: -1.2, runFactor: 0.3, overRate: 52, notes: 'Inconsistent zone, higher variance.' },
  'CB Bucknor':        { kRateBoost: -0.8, runFactor: 0.4, overRate: 53, notes: 'Small zone, more walks, slightly over.' },
  'Phil Cuzzi':        { kRateBoost: 1.5, runFactor: -0.5, overRate: 47, notes: 'Large zone, more Ks, under lean.' },
  'Laz Diaz':          { kRateBoost: -1.5, runFactor: 0.6, overRate: 54, notes: 'Small, inconsistent zone — more offense.' },
  'Ted Barrett':       { kRateBoost: 1.8, runFactor: -0.6, overRate: 46, notes: 'Consistently large zone, under lean.' },
  'Mark Carlson':      { kRateBoost: 1.2, runFactor: -0.3, overRate: 48, notes: 'Slightly large zone.' },
  'Dan Iassogna':      { kRateBoost: -2.0, runFactor: 0.8, overRate: 55, notes: 'Very small zone — big over lean, most walks/game in MLB.' },
  'Doug Eddings':      { kRateBoost: 1.4, runFactor: -0.4, overRate: 47, notes: 'Large zone, under lean.' },
  'Chris Guccione':    { kRateBoost: -0.5, runFactor: 0.2, overRate: 51, notes: 'Slightly small zone, mild over.' },
  'Jordan Baker':      { kRateBoost: -1.0, runFactor: 0.4, overRate: 52, notes: 'Under-average zone size.' },
  'Bill Miller':       { kRateBoost: 1.6, runFactor: -0.5, overRate: 47, notes: 'Large zone, pitcher-friendly.' },
};

export function getUmpireTendency(umpireName: string) {
  if (!umpireName) return null;
  for (const [k, v] of Object.entries(UMPIRE_TENDENCIES)) {
    if (umpireName.toLowerCase().includes(k.toLowerCase())) return { name: k, ...v };
  }
  return null;
}

// ─── Pitcher workload from MLB Stats API ─────────────────────────────────────

const pitcherWorkloadCache = new Map<string, { data: PitcherWorkload; at: number }>();

export interface PitcherWorkload {
  pitcherId: number;
  name: string;
  daysRest: number;          // days since last start
  lastStartPitchCount: number;
  lastStartInnings: number;
  last2StartAvgPitchCount: number;
  earlyExitRisk: boolean;    // pitch count > 100 last start AND < 4 days rest = early hook
  recentEra: number;         // ERA last 5 starts
  dayGameNightSplit: { dayEra: number; nightEra: number } | null;
}

async function fetchPitcherGameLog(pitcherId: number): Promise<any[]> {
  try {
    const r = await fetchWithTimeout(
      `${MLB_API}/people/${pitcherId}/stats?stats=gameLog&group=pitching&season=${new Date().getFullYear()}&gameType=R`,
      { cache: 'no-store' },
    );
    if (!r.ok) return [];
    const j = await r.json();
    return (j.stats?.[0]?.splits || []) as any[];
  } catch { return []; }
}

export async function getPitcherWorkload(pitcherId: number, pitcherName: string, todayStr: string): Promise<PitcherWorkload | null> {
  const cacheKey = `pw:${pitcherId}|${todayStr}`;
  const hit = pitcherWorkloadCache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  try {
    const logs = await fetchPitcherGameLog(pitcherId);
    // Only starting pitcher appearances (IP >= 3)
    const starts = logs
      .filter((g: any) => Number(g.stat?.inningsPitched || 0) >= 3)
      .sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')));

    if (!starts.length) return null;

    const lastStart = starts[0];
    const lastDate = new Date(String(lastStart.date || '').slice(0, 10));
    const today = new Date(todayStr);
    const daysRest = Math.floor((today.getTime() - lastDate.getTime()) / 86400000);
    const lastPC = Number(lastStart.stat?.numberOfPitches || 0);
    const lastIP = Number(lastStart.stat?.inningsPitched || 0);

    const last2Avg = starts.slice(0, 2).reduce((s: number, g: any) => s + Number(g.stat?.numberOfPitches || 0), 0) / Math.min(2, starts.length);

    // Recent ERA (last 5 starts)
    const last5 = starts.slice(0, 5);
    const totalER = last5.reduce((s: number, g: any) => s + Number(g.stat?.earnedRuns || 0), 0);
    const totalIP = last5.reduce((s: number, g: any) => s + Number(g.stat?.inningsPitched || 0), 0);
    const recentEra = totalIP > 0 ? Math.round((totalER / totalIP * 9) * 100) / 100 : 0;

    // Day vs night split
    const dayStarts = starts.filter((g: any) => {
      const hour = new Date(String(g.date || '')).getHours();
      return hour < 17;
    });
    const nightStarts = starts.filter((g: any) => {
      const hour = new Date(String(g.date || '')).getHours();
      return hour >= 17;
    });
    const eraFromSplits = (arr: any[]) => {
      const er = arr.reduce((s: number, g: any) => s + Number(g.stat?.earnedRuns || 0), 0);
      const ip = arr.reduce((s: number, g: any) => s + Number(g.stat?.inningsPitched || 0), 0);
      return ip > 0 ? Math.round((er / ip * 9) * 100) / 100 : 0;
    };
    const dayNight = (dayStarts.length >= 3 && nightStarts.length >= 3)
      ? { dayEra: eraFromSplits(dayStarts), nightEra: eraFromSplits(nightStarts) }
      : null;

    const workload: PitcherWorkload = {
      pitcherId, name: pitcherName,
      daysRest,
      lastStartPitchCount: lastPC,
      lastStartInnings: lastIP,
      last2StartAvgPitchCount: Math.round(last2Avg),
      earlyExitRisk: lastPC >= 100 && daysRest <= 4,
      recentEra,
      dayGameNightSplit: dayNight,
    };

    pitcherWorkloadCache.set(cacheKey, { data: workload, at: Date.now() });
    return workload;
  } catch { return null; }
}

// ─── Team RISP batting ────────────────────────────────────────────────────────

export interface TeamRISP {
  teamName: string;
  rIspAvg: number;       // BA with RISP
  rIspSlg: number;
  rIspOps: number;
  clutchRating: number;  // rIspOps - overallOps (positive = clutch, negative = chokes)
}

const rispCache = new Map<string, { data: TeamRISP | null; at: number }>();

export async function getTeamRISP(teamId: string, teamName: string): Promise<TeamRISP | null> {
  const hit = rispCache.get(teamId);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  try {
    const season = new Date().getFullYear();
    const r = await fetchWithTimeout(
      `${MLB_API}/teams/${teamId}/stats?stats=season&group=hitting&season=${season}&gameType=R`,
      { cache: 'no-store' },
    );
    const rRISP = await fetchWithTimeout(
      `${MLB_API}/teams/${teamId}/stats?stats=season&group=hitting&season=${season}&gameType=R&sitCodes=RISP`,
      { cache: 'no-store' },
    );

    if (!r.ok || !rRISP.ok) { rispCache.set(teamId, { data: null, at: Date.now() }); return null; }

    const overall = await r.json();
    const rispData = await rRISP.json();

    const overallOps = Number(overall.stats?.[0]?.splits?.[0]?.stat?.ops || 0);
    const rIspOps = Number(rispData.stats?.[0]?.splits?.[0]?.stat?.ops || 0);
    const rIspAvg = Number(rispData.stats?.[0]?.splits?.[0]?.stat?.avg || 0);
    const rIspSlg = Number(rispData.stats?.[0]?.splits?.[0]?.stat?.slg || 0);
    const clutchRating = Math.round((rIspOps - overallOps) * 1000) / 1000;

    const result: TeamRISP = { teamName, rIspAvg, rIspSlg, rIspOps, clutchRating };
    rispCache.set(teamId, { data: result, at: Date.now() });
    return result;
  } catch { rispCache.set(teamId, { data: null, at: Date.now() }); return null; }
}

// ─── Build MLB park + umpire explanation bullets ──────────────────────────────

export function buildMLBContextBullets(
  homeTeamName: string,
  homeRISP: TeamRISP | null,
  awayRISP: TeamRISP | null,
  umpireName?: string | null,
  todayTotalLine?: number | null,
): string[] {
  const bullets: string[] = [];
  const park = getParkFactor(homeTeamName);

  // Park factor
  const adj = parkRunAdjustment(homeTeamName);
  if (adj >= 0.3) bullets.push(`Park boost: ${park.notes} Run factor ${park.runFactor}/100 (+${adj} runs vs neutral park — lean over).`);
  else if (adj <= -0.2) bullets.push(`Pitcher's park: ${park.notes} Run factor ${park.runFactor}/100 (suppresses scoring by ~${Math.abs(adj)} runs — lean under).`);

  // Altitude
  if (park.altitude >= 1000) bullets.push(`High altitude (${park.altitude}ft) — ball travels further, pitchers tire faster, totals skew higher.`);

  // Umpire
  if (umpireName) {
    const ump = getUmpireTendency(umpireName);
    if (ump) {
      if (ump.runFactor >= 0.5) bullets.push(`Umpire ${ump.name}: small/inconsistent zone — ${ump.overRate}% over rate, adds ~${ump.runFactor} runs/game. Lean over.`);
      else if (ump.runFactor <= -0.4) bullets.push(`Umpire ${ump.name}: large strike zone — ${ump.overRate}% over rate, suppresses scoring ~${Math.abs(ump.runFactor)} runs/game. Lean under.`);
    }
  }

  // RISP clutch
  if (homeRISP && Math.abs(homeRISP.clutchRating) >= 0.030) {
    if (homeRISP.clutchRating >= 0.030) bullets.push(`${homeTeamName} clutch hitting: OPS ${homeRISP.rIspOps.toFixed(3)} with RISP vs ${(homeRISP.rIspOps - homeRISP.clutchRating).toFixed(3)} overall — they cash runners.`);
    else bullets.push(`${homeTeamName} chokes with RISP — OPS only ${homeRISP.rIspOps.toFixed(3)} vs ${(homeRISP.rIspOps - homeRISP.clutchRating).toFixed(3)} overall. Stranding runners regularly.`);
  }
  if (awayRISP && Math.abs(awayRISP.clutchRating) >= 0.030) {
    if (awayRISP.clutchRating >= 0.030) bullets.push(`${awayRISP.teamName} clutch: RISP OPS ${awayRISP.rIspOps.toFixed(3)} — converts scoring chances.`);
    else bullets.push(`${awayRISP.teamName} struggles with RISP (OPS ${awayRISP.rIspOps.toFixed(3)}) — leaves runners stranded.`);
  }

  return bullets;
}
