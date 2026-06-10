// Tennis deep signals service.
// Tennis is uniquely surface-dependent — a player who is 60% overall can be 80% on clay.
// H2H on THIS surface often predicts better than overall H2H.
//
// Data: ESPN tennis API (free) + static surface-performance enrichment.
//
// Signals:
//   Surface win rate: clay, grass, hard court, indoor hard
//   H2H record on this specific surface
//   Serve dominance: 1st serve %, aces per match, break points faced
//   Break point conversion % (both ways)
//   Fatigue: sets/games played last 3 days (deep tournament run)
//   Performance in tiebreaks
//   Match length tendency (some players win short, lose long)
//   Indoor vs outdoor win rate

import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const ESPN_TENNIS_ATP = 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp';
const ESPN_TENNIS_WTA = 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta';
const TTL = 2 * 60 * 60 * 1000; // 2h — tennis schedules are tournament-specific

const cache = new Map<string, { data: TennisPlayerSignals; at: number }>();
const matchupCache = new Map<string, { data: TennisMatchupSignals; at: number }>();

export type TennisSurface = 'clay' | 'grass' | 'hard' | 'indoor_hard' | 'carpet' | 'unknown';

// Major tournament surface lookup
const TOURNAMENT_SURFACE: Record<string, TennisSurface> = {
  // Hard
  'Australian Open': 'hard', 'US Open': 'hard', 'Indian Wells': 'hard',
  'Miami': 'hard', 'Cincinnati': 'hard', 'Montreal': 'hard', 'Toronto': 'hard',
  'Shanghai': 'hard', 'Beijing': 'indoor_hard', 'Vienna': 'indoor_hard',
  'Paris': 'indoor_hard', 'Basel': 'indoor_hard', 'Rotterdam': 'indoor_hard',
  // Clay
  'French Open': 'clay', 'Roland Garros': 'clay', 'Monte Carlo': 'clay',
  'Madrid': 'clay', 'Rome': 'clay', 'Barcelona': 'clay', 'Hamburg': 'clay',
  'Geneva': 'clay', 'Lyon': 'clay', 'Estoril': 'clay',
  // Grass
  'Wimbledon': 'grass', 'Queens': 'grass', 'Halle': 'grass',
  "Eastbourne": 'grass', 'Mallorca': 'grass', 'Newport': 'grass',
};

function detectSurface(tournamentName: string): TennisSurface {
  for (const [k, v] of Object.entries(TOURNAMENT_SURFACE)) {
    if (tournamentName.includes(k)) return v;
  }
  return 'unknown';
}

export interface TennisPlayerSignals {
  playerName: string;
  tour: 'atp' | 'wta';
  // Overall win rates
  overallWinPct: number;
  // Surface splits — the MOST important tennis signal
  clayWinPct: number;
  grassWinPct: number;
  hardWinPct: number;
  indoorHardWinPct: number;
  claySample: number;
  grassSample: number;
  hardSample: number;
  indoorHardSample: number;
  // Best and worst surface differential
  bestSurface: TennisSurface;
  worstSurface: TennisSurface;
  surfaceDifferential: number; // best surface win% - worst surface win%
  // Recent form
  last5Form: string;          // "W W L W W"
  last5Wins: number;
  currentTournamentRound: number; // 1=R128, 2=R64, 3=R32, 4=R16, 5=QF, 6=SF, 7=F
  setsPlayedLast3Days: number;    // fatigue proxy
  // Serve stats (if available from ESPN stats)
  firstServePct: number;
  acesPerMatch: number;
  doubleFaultsPerMatch: number;
  breakPointsSavedPct: number;  // serve holds under pressure
  // Return stats
  breakPointsWonPct: number;    // converts break chances
  returnGamesWonPct: number;
  // Tiebreak record
  tiebreaksWon: number;
  tiebreaksLost: number;
  tiebreakWinPct: number;
  // Match length
  avgMatchDuration: number | null; // minutes, null if unavailable
  tendencyDecidingSets: number;    // % of matches going to deciding set
}

async function fetchPlayerSchedule(tour: 'atp' | 'wta', playerId: string): Promise<any[]> {
  const base = tour === 'atp' ? ESPN_TENNIS_ATP : ESPN_TENNIS_WTA;
  try {
    const r = await fetchWithTimeout(`${base}/athletes/${playerId}/eventlog`, { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return j.events?.events || j.events || [];
  } catch { return []; }
}

async function fetchPlayerStats(tour: 'atp' | 'wta', playerId: string): Promise<any> {
  const base = tour === 'atp' ? ESPN_TENNIS_ATP : ESPN_TENNIS_WTA;
  try {
    const r = await fetchWithTimeout(`${base}/athletes/${playerId}/statistics`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export async function getTennisPlayerSignals(
  tour: 'atp' | 'wta', playerId: string, playerName: string,
  currentTournament: string,
): Promise<TennisPlayerSignals | null> {
  const cacheKey = `tennis:${tour}|${playerId}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  try {
    const [events, statsData] = await Promise.all([
      fetchPlayerSchedule(tour, playerId),
      fetchPlayerStats(tour, playerId),
    ]);

    const currentSurface = detectSurface(currentTournament);

    // Surface win rate buckets
    const surfaceBuckets: Record<TennisSurface, { w: number; l: number }> = {
      clay: { w: 0, l: 0 }, grass: { w: 0, l: 0 },
      hard: { w: 0, l: 0 }, indoor_hard: { w: 0, l: 0 },
      carpet: { w: 0, l: 0 }, unknown: { w: 0, l: 0 },
    };

    let totalW = 0, totalL = 0;
    const last5: string[] = [];
    let setsLast3Days = 0;
    let tiebreaksW = 0, tiebreaksL = 0;
    let decidingSets = 0, totalMatches = 0;
    let roundInTournament = 0;
    const now = Date.now();
    const threeDaysAgo = now - 3 * 86400000;

    for (const ev of (events || [])) {
      const comp = ev.competitions?.[0];
      if (!comp?.status?.type?.completed) continue;
      const competitors: any[] = comp.competitors || [];
      const me = competitors.find((c: any) => String(c.athlete?.id || c.id || '') === String(playerId));
      const opp = competitors.find((c: any) => String(c.athlete?.id || c.id || '') !== String(playerId));
      if (!me || !opp) continue;

      const won = me.winner === true;
      const tournament = String(ev.tournament?.name || ev.name || comp.venue?.fullName || '');
      const surface = detectSurface(tournament);
      const eventDate = new Date(String(ev.date || '').slice(0, 10));

      if (won) { totalW++; surfaceBuckets[surface].w++; }
      else { totalL++; surfaceBuckets[surface].l++; }

      totalMatches++;

      // Last 5 form
      if (last5.length < 5) last5.unshift(won ? 'W' : 'L');

      // Sets fatigue
      const sets = comp.linescores?.length || 0;
      if (eventDate.getTime() >= threeDaysAgo) setsLast3Days += sets;

      // Deciding set
      if (sets >= 3) decidingSets++;

      // Current tournament round
      if (tournament.includes(currentTournament) || currentTournament.includes(tournament)) {
        const round = comp.round?.number || 0;
        if (round > roundInTournament) roundInTournament = round;
      }

      // Tiebreaks (from set scores)
      for (const ls of comp.linescores || []) {
        const myGames = Number(ls.value ?? 0);
        const oppGames = Number((comp.linescores || [])[comp.linescores.indexOf(ls)]?.value ?? 0);
        if (myGames === 7 || oppGames === 7) {
          if (won) tiebreaksW++; else tiebreaksL++;
        }
      }
    }

    const pct = (w: number, l: number) => (w + l) > 0 ? Math.round((w / (w + l)) * 100) : 0;
    const clayPct = pct(surfaceBuckets.clay.w, surfaceBuckets.clay.l);
    const grassPct = pct(surfaceBuckets.grass.w, surfaceBuckets.grass.l);
    const hardPct = pct(surfaceBuckets.hard.w, surfaceBuckets.hard.l);
    const indoorPct = pct(surfaceBuckets.indoor_hard.w, surfaceBuckets.indoor_hard.l);

    const surfaceRates: [TennisSurface, number, number][] = [
      ['clay', clayPct, surfaceBuckets.clay.w + surfaceBuckets.clay.l],
      ['grass', grassPct, surfaceBuckets.grass.w + surfaceBuckets.grass.l],
      ['hard', hardPct, surfaceBuckets.hard.w + surfaceBuckets.hard.l],
      ['indoor_hard', indoorPct, surfaceBuckets.indoor_hard.w + surfaceBuckets.indoor_hard.l],
    ].filter(([, , s]) => (s as number) >= 5) as [TennisSurface, number, number][];

    surfaceRates.sort(([, a], [, b]) => b - a);
    const bestSurface = surfaceRates[0]?.[0] ?? 'hard';
    const worstSurface = surfaceRates[surfaceRates.length - 1]?.[0] ?? 'clay';
    const surfaceDiff = surfaceRates.length >= 2
      ? (surfaceRates[0]?.[1] ?? 0) - (surfaceRates[surfaceRates.length - 1]?.[1] ?? 0) : 0;

    // Parse serve stats from ESPN stats endpoint
    let firstServePct = 0, acesPerMatch = 0, dfPerMatch = 0, bpSavedPct = 0, bpWonPct = 0, retGamesWonPct = 0;
    if (statsData) {
      const cats: any[] = statsData.athletes?.[0]?.statistics?.[0]?.splits?.categories || [];
      for (const cat of cats) {
        const name = String(cat.name || '').toLowerCase();
        for (const s of cat.stats || []) {
          const sn = String(s.name || '').toLowerCase();
          const val = Number(s.value ?? 0);
          if (name.includes('serve') || sn.includes('firstserv')) {
            if (sn.includes('firstservepct') || sn.includes('first serve')) firstServePct = val;
            if (sn.includes('ace')) acesPerMatch = val;
            if (sn.includes('double')) dfPerMatch = val;
            if (sn.includes('breakpointsaved')) bpSavedPct = val;
          }
          if (sn.includes('breakpointwon') || sn.includes('break point won')) bpWonPct = val;
          if (sn.includes('returngame')) retGamesWonPct = val;
        }
      }
    }

    const signals: TennisPlayerSignals = {
      playerName, tour,
      overallWinPct: pct(totalW, totalL),
      clayWinPct: clayPct, grassWinPct: grassPct,
      hardWinPct: hardPct, indoorHardWinPct: indoorPct,
      claySample: surfaceBuckets.clay.w + surfaceBuckets.clay.l,
      grassSample: surfaceBuckets.grass.w + surfaceBuckets.grass.l,
      hardSample: surfaceBuckets.hard.w + surfaceBuckets.hard.l,
      indoorHardSample: surfaceBuckets.indoor_hard.w + surfaceBuckets.indoor_hard.l,
      bestSurface, worstSurface, surfaceDifferential: surfaceDiff,
      last5Form: last5.join(' '), last5Wins: last5.filter((r) => r === 'W').length,
      currentTournamentRound: roundInTournament,
      setsPlayedLast3Days: setsLast3Days,
      firstServePct, acesPerMatch, doubleFaultsPerMatch: dfPerMatch,
      breakPointsSavedPct: bpSavedPct, breakPointsWonPct: bpWonPct,
      returnGamesWonPct: retGamesWonPct,
      tiebreaksWon: tiebreaksW, tiebreaksLost: tiebreaksL,
      tiebreakWinPct: pct(tiebreaksW, tiebreaksL),
      avgMatchDuration: null,
      tendencyDecidingSets: totalMatches > 0 ? Math.round((decidingSets / totalMatches) * 100) : 0,
    };

    cache.set(cacheKey, { data: signals, at: Date.now() });
    return signals;
  } catch (err) {
    console.error('[tennisSignalsService] error', err);
    return null;
  }
}

export interface TennisMatchupSignals {
  playerA: TennisPlayerSignals;
  playerB: TennisPlayerSignals;
  surface: TennisSurface;
  surfaceEdge: { player: string; differential: number } | null;
  bullets: string[];
}

export async function getTennisMatchupSignals(
  tour: 'atp' | 'wta',
  playerAId: string, playerAName: string,
  playerBId: string, playerBName: string,
  tournament: string,
): Promise<TennisMatchupSignals | null> {
  const surface = detectSurface(tournament);
  const [a, b] = await Promise.all([
    getTennisPlayerSignals(tour, playerAId, playerAName, tournament),
    getTennisPlayerSignals(tour, playerBId, playerBName, tournament),
  ]);
  if (!a || !b) return null;

  const bullets: string[] = [];

  // Surface performance comparison
  const aOnSurface = surface === 'clay' ? a.clayWinPct : surface === 'grass' ? a.grassWinPct : surface === 'indoor_hard' ? a.indoorHardWinPct : a.hardWinPct;
  const bOnSurface = surface === 'clay' ? b.clayWinPct : surface === 'grass' ? b.grassWinPct : surface === 'indoor_hard' ? b.indoorHardWinPct : b.hardWinPct;
  const surfaceDiff = aOnSurface - bOnSurface;

  const surfaceLabel = surface === 'indoor_hard' ? 'indoor hard' : surface;
  if (surface !== 'unknown') {
    bullets.push(`On ${surfaceLabel}: ${playerAName} ${aOnSurface}% win rate vs ${playerBName} ${bOnSurface}%.`);
  }
  if (Math.abs(surfaceDiff) >= 15) {
    const better = surfaceDiff > 0 ? playerAName : playerBName;
    bullets.push(`${better} has a ${Math.abs(surfaceDiff)}-point surface advantage on ${surfaceLabel} — this is their court.`);
  }

  // Fatigue
  if (a.setsPlayedLast3Days >= 9) bullets.push(`⚠️ ${playerAName} has played ${a.setsPlayedLast3Days} sets in the last 3 days — significant fatigue entering this match.`);
  if (b.setsPlayedLast3Days >= 9) bullets.push(`⚠️ ${playerBName} has played ${b.setsPlayedLast3Days} sets in the last 3 days — leg fatigue risk.`);

  // Tiebreaks
  if (a.tiebreakWinPct >= 60 && a.tiebreaksWon + a.tiebreaksLost >= 5) bullets.push(`${playerAName} wins ${a.tiebreakWinPct}% of tiebreaks — clutch in tight sets.`);
  if (b.tiebreakWinPct >= 60 && b.tiebreaksWon + b.tiebreaksLost >= 5) bullets.push(`${playerBName} wins ${b.tiebreakWinPct}% of tiebreaks.`);

  // Serve dominance
  if (a.breakPointsSavedPct >= 70) bullets.push(`${playerAName} saves ${a.breakPointsSavedPct.toFixed(0)}% of break points — nearly unbreakable on serve.`);
  if (b.breakPointsSavedPct >= 70) bullets.push(`${playerBName} saves ${b.breakPointsSavedPct.toFixed(0)}% of break points.`);

  // Break point conversion
  if (a.breakPointsWonPct >= 45 && b.breakPointsSavedPct <= 55) bullets.push(`${playerAName} converts ${a.breakPointsWonPct.toFixed(0)}% of break points vs ${playerBName}'s ${b.breakPointsSavedPct.toFixed(0)}% break point save rate — return game edge.`);

  // Recent form
  if (a.last5Wins >= 4) bullets.push(`${playerAName} in form — ${a.last5Wins} wins in last 5 (${a.last5Form}).`);
  else if (a.last5Wins <= 1) bullets.push(`${playerAName} out of form — only ${a.last5Wins} wins in last 5.`);
  if (b.last5Wins >= 4) bullets.push(`${playerBName} in form — ${b.last5Wins} wins in last 5 (${b.last5Form}).`);
  else if (b.last5Wins <= 1) bullets.push(`${playerBName} out of form.`);

  const surfaceEdge = Math.abs(surfaceDiff) >= 10
    ? { player: surfaceDiff > 0 ? playerAName : playerBName, differential: Math.abs(surfaceDiff) }
    : null;

  return { playerA: a, playerB: b, surface, surfaceEdge, bullets };
}
