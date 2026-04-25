/**
 * H2H Service — Head-to-head history, recent form, player vs team
 *
 * Uses ESPN public APIs to pull three categories of data:
 *
 * 1. H2H Games — last N meetings between these two teams, with:
 *    - Score, margin, winner
 *    - Spread and whether the picked team covered
 *    - Trend: is one team dominating the series?
 *
 * 2. Recent Form — each team's last 5 completed games:
 *    - W/L, margin, home/away
 *    - ATS result for each game (if spread available)
 *    - Totals result (over/under) for each game
 *    - Streak labels: "Won 4 straight ATS" etc.
 *
 * 3. Player vs Team — target player's last N games against this opponent:
 *    - Per-game stat line
 *    - Average in those matchups vs season average
 *    - Trend: "averaging 28pts in last 3 vs HOU"
 *
 * All ESPN data. Zero third-party API cost.
 */

import { LEAGUE_URLS } from '@/lib/validation';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface H2HGame {
  gameId: string;
  date: string;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  homeScore: number;
  awayScore: number;
  winner: 'home' | 'away';
  margin: number;
  spread: number | null;
  homeTeamCovered: boolean | null;
  totalLine: number | null;
  totalResult: 'over' | 'under' | 'push' | null;
  isPlayoffs: boolean;
}

export interface RecentGame {
  gameId: string;
  date: string;
  opponent: string;
  isHome: boolean;
  teamScore: number;
  oppScore: number;
  won: boolean;
  margin: number;
  spread: number | null;
  covered: boolean | null;
  totalLine: number | null;
  totalResult: 'over' | 'under' | 'push' | null;
}

export interface PlayerGameLine {
  gameId: string;
  date: string;
  opponent: string;
  stats: Record<string, number>;
  statLabels: string[];
  won: boolean;
}

export interface PlayerVsTeam {
  playerId: string;
  playerName: string;
  vsTeamAbbr: string;
  games: PlayerGameLine[];
  avgStats: Record<string, number>;
  seasonAvgStats: Record<string, number>;
  trend: string | null;
}

export interface RecentStreak {
  wins: number;
  losses: number;
  winStreak: number;
  lossStreak: number;
  atsWins: number;
  atsLosses: number;
  atsPush: number;
  atsCoverStreak: number;
  overCount: number;
  underCount: number;
  avgMargin: number;
  streakLabel: string;
  atsStreakLabel: string;
  totalsLabel: string;
}

export interface H2HResult {
  league: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  h2hGames: H2HGame[];
  homeRecent: RecentGame[];
  awayRecent: RecentGame[];
  homeStreak: RecentStreak;
  awayStreak: RecentStreak;
  playerLines: PlayerVsTeam[];
  seriesSummary: string | null;
  generatedAt: string;
}

// ─── ESPN Fetch Helpers ───────────────────────────────────────────────────────

const summaryCache = new Map<string, { data: any; ts: number }>();
const SUMMARY_TTL = 30 * 60 * 1000; // 30 min

async function fetchSummary(league: string, gameId: string): Promise<any | null> {
  const cacheKey = `${league}:${gameId}`;
  const cached = summaryCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SUMMARY_TTL) return cached.data;

  const baseUrl = LEAGUE_URLS[league];
  if (!baseUrl) return null;

  try {
    const res = await fetch(`${baseUrl}/summary?event=${gameId}`, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const data = await res.json();
    summaryCache.set(cacheKey, { data, ts: Date.now() });
    return data;
  } catch {
    return null;
  }
}

const scheduleCache = new Map<string, { data: any[]; ts: number }>();
const SCHEDULE_TTL = 30 * 60 * 1000;

async function fetchTeamSchedule(league: string, teamId: string): Promise<any[]> {
  const cacheKey = `schedule:${league}:${teamId}`;
  const cached = scheduleCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SCHEDULE_TTL) return cached.data;

  const baseUrl = LEAGUE_URLS[league];
  if (!baseUrl) return [];

  try {
    const year = new Date().getFullYear();
    const res = await fetch(`${baseUrl}/teams/${teamId}/schedule?season=${year}`, { next: { revalidate: 1800 } });
    if (!res.ok) return [];
    const data = await res.json();
    const events: any[] = data.events || [];
    scheduleCache.set(cacheKey, { data: events, ts: Date.now() });
    return events;
  } catch {
    return [];
  }
}

// ─── Parse Helpers ────────────────────────────────────────────────────────────

function parseSpreadFromSummary(summary: any): { spread: number | null; total: number | null } {
  const pc: any[] = Array.isArray(summary?.pickcenter) ? summary.pickcenter : [];
  if (pc.length === 0) return { spread: null, total: null };
  const entry = pc[0];
  const spread = typeof entry.spread === 'number' ? entry.spread : null;
  const total = typeof entry.overUnder === 'number' ? entry.overUnder : null;
  return { spread, total };
}

function parseBoxscoreLabels(summary: any): { labels: string[]; byTeam: Record<string, Array<{ id: string; name: string; stats: Record<string, number> }>> } {
  const result: Record<string, Array<{ id: string; name: string; stats: Record<string, number> }>> = {};
  let labels: string[] = [];

  const players: any[] = summary?.boxscore?.players || [];
  for (const playerGroup of players) {
    const teamAbbr: string = playerGroup?.team?.abbreviation || 'UNK';
    const stats: any[] = playerGroup?.statistics || [];
    if (stats.length === 0) continue;

    // Labels come from the first stats entry
    if (labels.length === 0) labels = stats[0]?.labels || [];

    const athletes: any[] = stats[0]?.athletes || [];
    const teamPlayers: Array<{ id: string; name: string; stats: Record<string, number> }> = [];

    for (const ath of athletes) {
      const athlete = ath?.athlete || {};
      const rawStats: string[] = ath?.stats || [];
      const statMap: Record<string, number> = {};
      for (let i = 0; i < labels.length; i++) {
        const val = parseFloat(rawStats[i] ?? '');
        if (!isNaN(val)) statMap[labels[i]] = val;
      }
      teamPlayers.push({ id: String(athlete.id || ''), name: athlete.displayName || '', stats: statMap });
    }
    result[teamAbbr] = teamPlayers;
  }

  return { labels, byTeam: result };
}

// ─── H2H Games ────────────────────────────────────────────────────────────────

async function buildH2HGames(
  league: string,
  gameId: string,
  homeTeamId: string,
  awayTeamId: string,
): Promise<{ games: H2HGame[]; seriesSummary: string | null }> {
  const currentSummary = await fetchSummary(league, gameId);
  if (!currentSummary) return { games: [], seriesSummary: null };

  const allSeriesEvents: Array<{ id: string; date: string; status: string; homeScore: number; awayScore: number; homeWon: boolean; isPlayoffs: boolean }> = [];
  let seriesSummary: string | null = null;

  const seasonseries: any[] = Array.isArray(currentSummary.seasonseries) ? currentSummary.seasonseries : [];
  for (const series of seasonseries) {
    const isPlayoffs = String(series.type || '').toLowerCase().includes('playoff');
    if (series.summary && !seriesSummary) seriesSummary = series.summary;
    for (const ev of (series.events || [])) {
      if (ev.status !== 'post') continue;
      const comps: any[] = ev.competitors || [];
      const home = comps.find((c: any) => c.homeAway === 'home');
      const away = comps.find((c: any) => c.homeAway === 'away');
      if (!home || !away) continue;
      allSeriesEvents.push({
        id: String(ev.id),
        date: ev.date,
        status: ev.status,
        homeScore: Number(home.score || 0),
        awayScore: Number(away.score || 0),
        homeWon: Boolean(home.winner),
        isPlayoffs,
      });
    }
  }

  // Fetch spread data for each H2H game (batch, last 5 only)
  const last5 = allSeriesEvents.filter((e) => e.id !== gameId).reverse().slice(0, 5);
  last5.unshift(...allSeriesEvents.filter((e) => e.id === gameId));
  const uniqueEvents = Array.from(new Map(last5.map((e) => [e.id, e])).values());

  const summaries = await Promise.allSettled(
    uniqueEvents.map((ev) => fetchSummary(league, ev.id))
  );

  // Get team abbrs from current summary
  const header = currentSummary?.header?.competitions?.[0];
  const homeAbbr = header?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.abbreviation || 'HOME';
  const awayAbbr = header?.competitors?.find((c: any) => c.homeAway === 'away')?.team?.abbreviation || 'AWAY';

  const h2hGames: H2HGame[] = [];
  for (let i = 0; i < uniqueEvents.length; i++) {
    const ev = uniqueEvents[i];
    const summary = summaries[i].status === 'fulfilled' ? summaries[i].value : null;
    const { spread, total } = summary ? parseSpreadFromSummary(summary) : { spread: null, total: null };

    const totalScore = ev.homeScore + ev.awayScore;
    const totalResult: H2HGame['totalResult'] = total !== null
      ? totalScore > total ? 'over' : totalScore < total ? 'under' : 'push'
      : null;

    let homeTeamCovered: boolean | null = null;
    if (spread !== null) {
      // spread is from home team's perspective (negative = home favored)
      const homeScoreWithSpread = ev.homeScore + spread;
      homeTeamCovered = homeScoreWithSpread > ev.awayScore ? true : homeScoreWithSpread < ev.awayScore ? false : null;
    }

    h2hGames.push({
      gameId: ev.id,
      date: ev.date,
      homeTeamAbbr: homeAbbr,
      awayTeamAbbr: awayAbbr,
      homeScore: ev.homeScore,
      awayScore: ev.awayScore,
      winner: ev.homeWon ? 'home' : 'away',
      margin: Math.abs(ev.homeScore - ev.awayScore),
      spread,
      homeTeamCovered,
      totalLine: total,
      totalResult,
      isPlayoffs: ev.isPlayoffs,
    });
  }

  return { games: h2hGames.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), seriesSummary };
}

// ─── Recent Form ──────────────────────────────────────────────────────────────

async function buildRecentForm(
  league: string,
  teamId: string,
  teamAbbr: string,
  n = 6,
): Promise<RecentGame[]> {
  const events = await fetchTeamSchedule(league, teamId);
  const completed = events.filter((ev) => {
    const state = ev.competitions?.[0]?.status?.type?.state;
    return state === 'post';
  }).slice(-n).reverse(); // most recent first

  const games: RecentGame[] = [];

  for (const ev of completed) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;

    const comps: any[] = comp.competitors || [];
    const myTeam = comps.find((c: any) => {
      const tId = String(c.team?.id || c.id || '');
      const tAbbr = String(c.team?.abbreviation || '');
      return tId === teamId || tAbbr === teamAbbr;
    });
    const oppTeam = comps.find((c: any) => {
      const tId = String(c.team?.id || c.id || '');
      return tId !== teamId;
    });

    if (!myTeam || !oppTeam) continue;

    const myScore = Number(myTeam.score?.value ?? myTeam.score ?? 0);
    const oppScore = Number(oppTeam.score?.value ?? oppTeam.score ?? 0);
    const isHome = myTeam.homeAway === 'home';
    const won = Boolean(myTeam.winner);
    const oppAbbr = oppTeam.team?.abbreviation || 'OPP';

    // Fetch spread for this game
    const gameId = String(ev.id);
    const summary = await fetchSummary(league, gameId);
    const { spread, total } = summary ? parseSpreadFromSummary(summary) : { spread: null, total: null };

    let covered: boolean | null = null;
    if (spread !== null) {
      // From home team perspective
      const adjustedHomeScore = isHome ? myScore + spread : oppScore + spread;
      const adjustedAwayScore = isHome ? oppScore : myScore;
      // Actually: home spread covers if homeScore + spread > awayScore
      if (isHome) {
        covered = myScore + spread > oppScore ? true : myScore + spread < oppScore ? false : null;
      } else {
        // away team covers if awayScore > homeScore + spread
        covered = myScore > oppScore + spread ? true : myScore < oppScore + spread ? false : null;
      }
    }

    const totalScore = myScore + oppScore;
    const totalResult: RecentGame['totalResult'] = total !== null
      ? totalScore > total ? 'over' : totalScore < total ? 'under' : 'push'
      : null;

    games.push({
      gameId,
      date: ev.date || comp.date || '',
      opponent: oppAbbr,
      isHome,
      teamScore: myScore,
      oppScore: oppScore,
      won,
      margin: Math.abs(myScore - oppScore),
      spread,
      covered,
      totalLine: total,
      totalResult,
    });
  }

  return games;
}

function calcStreak(games: RecentGame[]): RecentStreak {
  const n = games.length;
  if (n === 0) {
    return { wins: 0, losses: 0, winStreak: 0, lossStreak: 0, atsWins: 0, atsLosses: 0, atsPush: 0, atsCoverStreak: 0, overCount: 0, underCount: 0, avgMargin: 0, streakLabel: '', atsStreakLabel: '', totalsLabel: '' };
  }

  let wins = 0, losses = 0;
  let atsWins = 0, atsLosses = 0, atsPush = 0;
  let overCount = 0, underCount = 0;
  let totalMargin = 0;

  for (const g of games) {
    if (g.won) wins++; else losses++;
    if (g.covered === true) atsWins++; else if (g.covered === false) atsLosses++; else if (g.covered === null && g.spread !== null) atsPush++;
    if (g.totalResult === 'over') overCount++; else if (g.totalResult === 'under') underCount++;
    totalMargin += g.margin;
  }

  // Current streak
  let winStreak = 0, lossStreak = 0;
  for (const g of games) {
    if (g.won) { if (lossStreak === 0) winStreak++; else break; }
    else { if (winStreak === 0) lossStreak++; else break; }
  }

  // ATS cover streak
  let atsCoverStreak = 0;
  for (const g of games) {
    if (g.covered === true) { atsCoverStreak++; }
    else if (g.covered === false) { atsCoverStreak--; break; }
    else break;
  }

  const avgMargin = Math.round(totalMargin / n * 10) / 10;

  const streakLabel = winStreak >= 3 ? `🔥 ${winStreak}-game win streak`
    : lossStreak >= 3 ? `❄️ ${lossStreak}-game losing streak`
    : `${wins}-${losses} last ${n}`;

  const atsTracked = atsWins + atsLosses;
  const atsStreakLabel = atsTracked === 0 ? 'No ATS data'
    : atsCoverStreak >= 3 ? `⚡ Covering ${atsCoverStreak} straight`
    : atsCoverStreak <= -3 ? `💔 Failing to cover ${Math.abs(atsCoverStreak)} straight`
    : `${atsWins}-${atsLosses} ATS last ${atsTracked}`;

  const totalsLabel = overCount > 0 || underCount > 0
    ? overCount >= underCount + 2 ? `🔴 Over ${overCount} of last ${overCount + underCount}`
    : underCount >= overCount + 2 ? `🔵 Under ${underCount} of last ${overCount + underCount}`
    : `O/U split ${overCount}-${underCount}`
    : '';

  return { wins, losses, winStreak, lossStreak, atsWins, atsLosses, atsPush, atsCoverStreak, overCount, underCount, avgMargin, streakLabel, atsStreakLabel, totalsLabel };
}

// ─── Player vs Team ───────────────────────────────────────────────────────────

async function buildPlayerVsTeam(
  league: string,
  h2hGameIds: string[],
  targetPlayerIds: string[],
  vsTeamAbbr: string,
): Promise<PlayerVsTeam[]> {
  if (h2hGameIds.length === 0 || targetPlayerIds.length === 0) return [];

  const relevantGames = h2hGameIds.slice(0, 5); // max 5 games
  const summaries = await Promise.allSettled(relevantGames.map((id) => fetchSummary(league, id)));

  const playerAccumulator: Map<string, { name: string; games: PlayerGameLine[]; statLabels: string[] }> = new Map();

  for (let i = 0; i < relevantGames.length; i++) {
    const gameId = relevantGames[i];
    const result = summaries[i];
    if (result.status !== 'fulfilled' || !result.value) continue;
    const summary = result.value;

    const { labels, byTeam } = parseBoxscoreLabels(summary);
    if (labels.length === 0) continue;

    const header = summary?.header?.competitions?.[0];
    const gameDate = summary?.header?.competitions?.[0]?.date || '';
    const homeComp = header?.competitors?.find((c: any) => c.homeAway === 'home');
    const awayComp = header?.competitors?.find((c: any) => c.homeAway === 'away');
    const homeAbbr = homeComp?.team?.abbreviation || '';
    const awayAbbr = awayComp?.team?.abbreviation || '';

    // Find the target players in both teams
    for (const [, athletes] of Object.entries(byTeam)) {
      for (const ath of athletes) {
        if (!targetPlayerIds.includes(ath.id)) continue;

        const acc = playerAccumulator.get(ath.id) || { name: ath.name, games: [], statLabels: labels };
        playerAccumulator.set(ath.id, acc);
        acc.statLabels = labels;

        // Who was the opponent? The team this player was NOT on.
        const homeAthletes = byTeam[homeAbbr] || [];
        const isHomeTeamPlayer = homeAthletes.some((a) => a.id === ath.id);
        const opponent = isHomeTeamPlayer ? awayAbbr : homeAbbr;
        const homeTeamWon = Boolean(homeComp?.winner);
        const playerTeamWon = isHomeTeamPlayer ? homeTeamWon : !homeTeamWon;

        acc.games.push({
          gameId,
          date: gameDate,
          opponent,
          stats: ath.stats,
          statLabels: labels,
          won: playerTeamWon,
        });
      }
    }
  }

  // Build PlayerVsTeam objects
  const results: PlayerVsTeam[] = [];
  for (const [playerId, acc] of Array.from(playerAccumulator.entries())) {
    const games = acc.games.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (games.length === 0) continue;

    // Calculate averages
    const avgStats: Record<string, number> = {};
    const statKeys = Object.keys(games[0].stats);
    for (const key of statKeys) {
      const vals = games.map((g) => g.stats[key]).filter((v) => !isNaN(v));
      if (vals.length > 0) avgStats[key] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    }

    // Build trend label from most impactful stat
    const primaryStat = acc.statLabels.includes('PTS') ? 'PTS' : acc.statLabels.includes('G') ? 'G' : acc.statLabels[1] || '';
    const primaryAvg = avgStats[primaryStat];
    const trend = primaryStat && primaryAvg !== undefined
      ? `Averaging ${primaryAvg} ${primaryStat.toLowerCase()} vs ${vsTeamAbbr} (last ${games.length})`
      : null;

    results.push({
      playerId,
      playerName: acc.name,
      vsTeamAbbr,
      games,
      avgStats,
      seasonAvgStats: {}, // filled by caller if needed
      trend,
    });
  }

  return results;
}

// ─── Main Entry ───────────────────────────────────────────────────────────────

const h2hCache = new Map<string, { data: H2HResult; ts: number }>();
const H2H_TTL = 20 * 60 * 1000; // 20 min

export async function getH2HData({
  league,
  gameId,
  homeTeamId,
  awayTeamId,
  targetPlayerIds = [],
}: {
  league: string;
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  targetPlayerIds?: string[];
}): Promise<H2HResult> {
  const cacheKey = `h2h:${league}:${homeTeamId}:${awayTeamId}`;
  const cached = h2hCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < H2H_TTL) return cached.data;

  // Get current game summary to extract team abbreviations
  const currentSummary = await fetchSummary(league, gameId);
  const header = currentSummary?.header?.competitions?.[0];
  const homeAbbr = header?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.abbreviation || 'HOME';
  const awayAbbr = header?.competitors?.find((c: any) => c.homeAway === 'away')?.team?.abbreviation || 'AWAY';

  // Run all fetches in parallel
  const [h2hResult, homeRecentGames, awayRecentGames] = await Promise.all([
    buildH2HGames(league, gameId, homeTeamId, awayTeamId),
    buildRecentForm(league, homeTeamId, homeAbbr, 6),
    buildRecentForm(league, awayTeamId, awayAbbr, 6),
  ]);

  const h2hGameIds = h2hResult.games.map((g) => g.gameId);

  const playerLines = targetPlayerIds.length > 0
    ? await buildPlayerVsTeam(league, h2hGameIds, targetPlayerIds, awayAbbr)
    : [];

  const result: H2HResult = {
    league,
    homeTeamId,
    awayTeamId,
    homeTeamAbbr: homeAbbr,
    awayTeamAbbr: awayAbbr,
    h2hGames: h2hResult.games,
    homeRecent: homeRecentGames,
    awayRecent: awayRecentGames,
    homeStreak: calcStreak(homeRecentGames),
    awayStreak: calcStreak(awayRecentGames),
    playerLines,
    seriesSummary: h2hResult.seriesSummary,
    generatedAt: new Date().toISOString(),
  };

  h2hCache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}
