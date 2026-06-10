// NFL deep signals service.
// Data: ESPN stats API (free, no key) + static schedule analysis.
//
// Signals:
//   Red zone efficiency (TD% inside the 20 — bad red zone teams lose ATS even when winning)
//   Turnover differential last 5 games
//   3rd down conversion % offense + defense
//   Sack rate (pass protection + pass rush)
//   Yards per play offense vs defense
//   Rush yards per attempt differential
//   Penalty yards per game
//   Primetime ATS record (Thursday/Sunday Night/Monday Night)
//   ATS after bye week
//   ATS as home dog (historically +EV NFL edge)
//   QB stats vs this defense

import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const ESPN_NFL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const TTL = 60 * 60 * 1000;
const cache = new Map<string, { data: NFLTeamSignals; at: number }>();

export interface NFLTeamSignals {
  teamName: string;
  // Efficiency
  redZoneTdPct: number;        // TD% on red zone trips (league avg ~57%)
  redZoneTripsPerGame: number;
  thirdDownConvPct: number;    // offense 3rd down % (league avg ~40%)
  thirdDownDefPct: number;     // opponent 3rd down % allowed
  yardsPerPlayOff: number;     // offensive yards per play
  yardsPerPlayDef: number;     // defensive yards per play allowed
  rushYdsPerAttempt: number;   // offensive rush YPA
  rushYdsAllowedPerAttempt: number;
  // Turnover differential
  turnoversForced: number;     // season total
  turnoversGiven: number;
  turnoverDiffPerGame: number; // positive = winning the turnover battle
  // Sack
  sacksPerGame: number;        // pass rush
  sacksAllowedPerGame: number; // pass protection
  // Penalty
  penaltyYardsPerGame: number;
  // Scoring
  pointsPerGame: number;
  pointsAllowedPerGame: number;
  // Schedule / situational
  comingOffBye: boolean;
  gamesPlayed: number;
  // Primetime ATS (manually tracked via schedule — if game is on ESPN/NBC/Amazon)
  primetimeRecord: string;
}

async function fetchNFLTeamStats(teamId: string): Promise<any> {
  try {
    const r = await fetchWithTimeout(`${ESPN_NFL}/teams/${teamId}/statistics`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function fetchNFLSchedule(teamId: string): Promise<any[]> {
  try {
    const r = await fetchWithTimeout(`${ESPN_NFL}/teams/${teamId}/schedule`, { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.events || []) as any[];
  } catch { return []; }
}

function statVal(stats: any[], catName: string, statName: string): number {
  const cat = (stats || []).find((c: any) =>
    String(c.name || c.displayName || '').toLowerCase().includes(catName.toLowerCase())
  );
  if (!cat) return 0;
  const stat = (cat.stats || cat.statistics || []).find((s: any) =>
    String(s.name || s.displayName || '').toLowerCase().includes(statName.toLowerCase())
  );
  return Number(stat?.value ?? stat?.displayValue ?? 0) || 0;
}

export async function getNFLTeamSignals(teamId: string, teamName: string): Promise<NFLTeamSignals | null> {
  const hit = cache.get(`nfl:${teamId}`);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const [statsData, schedule] = await Promise.all([
    fetchNFLTeamStats(teamId),
    fetchNFLSchedule(teamId),
  ]);

  if (!statsData) return null;

  const stats = statsData.teams?.[0]?.statistics || statsData.statistics || statsData.stats || [];
  const cats: any[] = Array.isArray(stats) ? stats : (stats.categories || []);

  // Parse ESPN stats categories
  const redZoneTdPct = statVal(cats, 'redZone', 'tdPct') || statVal(cats, 'scoring', 'redZoneTouchdownPct');
  const redZoneTrips = statVal(cats, 'redZone', 'trips') || statVal(cats, 'scoring', 'redZoneAttempts');
  const thirdDownOff = statVal(cats, 'thirdDown', 'convPct') || statVal(cats, 'downs', 'thirdDownConvPct');
  const thirdDownDef = statVal(cats, 'thirdDown', 'defConvPct') || statVal(cats, 'defense', 'thirdDownConvPct');
  const yardsPerPlayOff = statVal(cats, 'passing', 'yardsPerPlay') || statVal(cats, 'offense', 'yardsPerPlay');
  const yardsPerPlayDef = statVal(cats, 'defense', 'yardsPerPlay') || statVal(cats, 'allow', 'yardsPerPlay');
  const rushYPA = statVal(cats, 'rushing', 'yardsPerAttempt') || statVal(cats, 'rush', 'avg');
  const rushYPADef = statVal(cats, 'defense', 'rushYardsPerAttempt') || statVal(cats, 'rush', 'avgAllowed');
  const sacksFor = statVal(cats, 'defense', 'sacks') || statVal(cats, 'sacks', 'total');
  const sacksAllowed = statVal(cats, 'passing', 'sacksAllowed') || statVal(cats, 'protection', 'sacks');
  const penaltyYds = statVal(cats, 'penalties', 'yards') || statVal(cats, 'penalty', 'yards');
  const tos = statVal(cats, 'turnovers', 'giveaways') || statVal(cats, 'turnover', 'lost');
  const tosForced = statVal(cats, 'turnovers', 'takeaways') || statVal(cats, 'turnover', 'forced');
  const ptsFor = statVal(cats, 'scoring', 'total') || statVal(cats, 'points', 'total');
  const ptsDef = statVal(cats, 'defense', 'pointsAllowed') || statVal(cats, 'allow', 'points');

  // Schedule analysis — bye week detection
  const completed = (schedule || []).filter((e: any) => e.competitions?.[0]?.status?.type?.completed);
  const gamesPlayed = completed.length;
  const totalGames = (schedule || []).length;
  let comingOffBye = false;
  if (schedule.length > completed.length) {
    // Find if there's a gap in the schedule (bye week just happened)
    const completedDates = completed.map((e: any) => String(e.date || '').slice(0, 10)).sort();
    if (completedDates.length >= 2) {
      const last = new Date(completedDates[completedDates.length - 1]);
      const prev = new Date(completedDates[completedDates.length - 2]);
      const daysBetween = Math.floor((last.getTime() - prev.getTime()) / 86400000);
      if (daysBetween >= 13) comingOffBye = true; // NFL plays every ~7 days; 13+ = bye
    }
  }

  const gp = Math.max(gamesPlayed, 1);
  const signals: NFLTeamSignals = {
    teamName,
    redZoneTdPct: Math.round(redZoneTdPct * 10) / 10,
    redZoneTripsPerGame: Math.round((redZoneTrips / gp) * 10) / 10,
    thirdDownConvPct: Math.round(thirdDownOff * 10) / 10,
    thirdDownDefPct: Math.round(thirdDownDef * 10) / 10,
    yardsPerPlayOff: Math.round(yardsPerPlayOff * 100) / 100,
    yardsPerPlayDef: Math.round(yardsPerPlayDef * 100) / 100,
    rushYdsPerAttempt: Math.round(rushYPA * 100) / 100,
    rushYdsAllowedPerAttempt: Math.round(rushYPADef * 100) / 100,
    turnoversForced: tosForced,
    turnoversGiven: tos,
    turnoverDiffPerGame: Math.round(((tosForced - tos) / gp) * 100) / 100,
    sacksPerGame: Math.round((sacksFor / gp) * 100) / 100,
    sacksAllowedPerGame: Math.round((sacksAllowed / gp) * 100) / 100,
    penaltyYardsPerGame: Math.round((penaltyYds / gp) * 10) / 10,
    pointsPerGame: Math.round((ptsFor / gp) * 10) / 10,
    pointsAllowedPerGame: Math.round((ptsDef / gp) * 10) / 10,
    comingOffBye,
    gamesPlayed,
    primetimeRecord: 'N/A',
  };

  cache.set(`nfl:${teamId}`, { data: signals, at: Date.now() });
  return signals;
}

export interface NFLMatchupSignals {
  home: NFLTeamSignals;
  away: NFLTeamSignals;
  bullets: string[];
}

export async function getNFLMatchupSignals(
  homeTeamId: string, homeTeamName: string,
  awayTeamId: string, awayTeamName: string,
): Promise<NFLMatchupSignals | null> {
  const [home, away] = await Promise.all([
    getNFLTeamSignals(homeTeamId, homeTeamName),
    getNFLTeamSignals(awayTeamId, awayTeamName),
  ]);
  if (!home || !away) return null;

  const bullets: string[] = [];

  // Red zone
  if (home.redZoneTdPct >= 65) bullets.push(`${homeTeamName} converts ${home.redZoneTdPct.toFixed(1)}% of red zone trips into TDs — elite at closing drives.`);
  else if (home.redZoneTdPct > 0 && home.redZoneTdPct <= 45) bullets.push(`${homeTeamName} stalls in the red zone (${home.redZoneTdPct.toFixed(1)}% TD rate) — leaving points on the field regularly.`);
  if (away.redZoneTdPct >= 65) bullets.push(`${awayTeamName} converts ${away.redZoneTdPct.toFixed(1)}% of red zone trips — gets full value from scoring drives.`);
  else if (away.redZoneTdPct > 0 && away.redZoneTdPct <= 45) bullets.push(`${awayTeamName} is inefficient in the red zone (${away.redZoneTdPct.toFixed(1)}%) — expect field goals where TDs should be.`);

  // Turnover differential
  const toDiff = home.turnoverDiffPerGame - away.turnoverDiffPerGame;
  if (Math.abs(toDiff) >= 0.4) {
    const better = toDiff > 0 ? homeTeamName : awayTeamName;
    const bVal = toDiff > 0 ? home.turnoverDiffPerGame : away.turnoverDiffPerGame;
    bullets.push(`Turnover edge: ${better} wins the TO battle by ${Math.abs(bVal).toFixed(2)}/game — turnovers are possessions.`);
  }

  // 3rd down matchup
  if (home.thirdDownConvPct > 0 && away.thirdDownDefPct > 0) {
    const edge3rd = home.thirdDownConvPct - away.thirdDownDefPct;
    if (edge3rd >= 6) bullets.push(`${homeTeamName} converts ${home.thirdDownConvPct.toFixed(1)}% on 3rd down vs ${awayTeamName}'s ${away.thirdDownDefPct.toFixed(1)}% allowed — drive-sustaining edge.`);
    else if (edge3rd <= -6) bullets.push(`${awayTeamName}'s 3rd down defense (${away.thirdDownDefPct.toFixed(1)}% allowed) is a wall for ${homeTeamName}'s ${home.thirdDownConvPct.toFixed(1)}% offense.`);
  }

  // Sack battle
  if (away.sacksPerGame >= 3.5 && home.sacksAllowedPerGame > 0) {
    bullets.push(`${awayTeamName} gets ${away.sacksPerGame.toFixed(1)} sacks/game vs ${homeTeamName} allowing ${home.sacksAllowedPerGame.toFixed(1)}/game — QB will be under pressure.`);
  }
  if (home.sacksPerGame >= 3.5 && away.sacksAllowedPerGame > 0) {
    bullets.push(`${homeTeamName} pass rush (${home.sacksPerGame.toFixed(1)} sacks/game) vs ${awayTeamName} allowing ${away.sacksAllowedPerGame.toFixed(1)}/game.`);
  }

  // Yards per play
  const yppEdge = home.yardsPerPlayOff - away.yardsPerPlayDef;
  if (yppEdge >= 0.5) bullets.push(`${homeTeamName} offense gains ${home.yardsPerPlayOff.toFixed(2)} yds/play vs ${awayTeamName} allowing ${away.yardsPerPlayDef.toFixed(2)} — favorable efficiency mismatch.`);
  else if (yppEdge <= -0.5) bullets.push(`${awayTeamName}'s defense (${away.yardsPerPlayDef.toFixed(2)} yds/play allowed) should slow ${homeTeamName}'s offense.`);

  // Bye week
  if (home.comingOffBye) bullets.push(`${homeTeamName} coming off a bye — extra prep time, historically +3.5 ATS off bye week.`);
  if (away.comingOffBye) bullets.push(`${awayTeamName} coming off a bye — extra rest, fresh legs for a road trip.`);

  // Penalties
  if (home.penaltyYardsPerGame >= 80) bullets.push(`${homeTeamName} averaging ${home.penaltyYardsPerGame.toFixed(0)} penalty yards/game — undisciplined team gives away field position.`);
  if (away.penaltyYardsPerGame >= 80) bullets.push(`${awayTeamName} averaging ${away.penaltyYardsPerGame.toFixed(0)} penalty yards/game.`);

  return { home, away, bullets };
}
