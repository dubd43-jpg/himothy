// NHL goaltender matchup service — completely free via api-web.nhle.com.
//
// In hockey the starting goaltender is the pitcher equivalent. Recent save % is
// the closest analog to ERA L5. This service mirrors pitcherMatchupService so the
// engine can use one consistent pattern across MLB and NHL: fetch the probable
// starter, compute recent form, score the matchup.

const TTL_MS = 60 * 60 * 1000;
const _cache: Map<string, { data: GoaltenderProfile; at: number }> = new Map();

export interface GoaltenderProfile {
  id: string;
  name: string;
  team: string | null;
  // Last 5 starts — close analog to "pitcher L5 ERA"
  l5GoalsAgainst: number | null;
  l5ShotsAgainst: number | null;
  l5SavePct: number | null;          // 0.000-1.000
  l5GAA: number | null;              // goals against per 60 min
  // Season totals
  seasonSavePct: number | null;
  seasonGAA: number | null;
  startsAnalyzed: number;
}

export interface GameGoalies {
  homeGoalie: GoaltenderProfile | null;
  awayGoalie: GoaltenderProfile | null;
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Pull today's slate with projected starters.
export async function getNhlScheduleWithProbables(yyyymmdd: string): Promise<Array<{
  gameId: string; awayTeam: string; homeTeam: string;
  homeGoalieId: string | null; awayGoalieId: string | null;
}>> {
  const d = await fetchJson(`https://api-web.nhle.com/v1/schedule/${yyyymmdd}`);
  if (!d) return [];
  const out: any[] = [];
  for (const week of d.gameWeek || []) {
    for (const g of week.games || []) {
      const home = g.homeTeam || {};
      const away = g.awayTeam || {};
      out.push({
        gameId: String(g.id),
        awayTeam: away.placeName?.default || away.abbrev || '?',
        homeTeam: home.placeName?.default || home.abbrev || '?',
        // The schedule endpoint doesn't carry projected goalies; need the boxscore for that.
        homeGoalieId: null,
        awayGoalieId: null,
      });
    }
  }
  return out;
}

// Pull projected starters for a specific game.
export async function getGameProbableGoalies(gameId: string): Promise<GameGoalies> {
  const empty: GameGoalies = { homeGoalie: null, awayGoalie: null };
  const d = await fetchJson(`https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`);
  if (!d) return empty;
  // The boxscore in pregame mode has a "summary.threeStars" + sometimes "projectedStarters"
  // depending on game state. Easiest reliable read: look at gameStartDate when "started"
  // game has actual goalie stats in the playerByGameStats block.
  const home = d.homeTeam || {};
  const away = d.awayTeam || {};
  // Pull projected goalies from the game's projectedStarters field if present.
  const hgId = d.summary?.projectedStarters?.home?.playerId || null;
  const agId = d.summary?.projectedStarters?.away?.playerId || null;

  const [hg, ag] = await Promise.all([
    hgId ? getGoaltenderProfile(String(hgId)) : Promise.resolve(null),
    agId ? getGoaltenderProfile(String(agId)) : Promise.resolve(null),
  ]);
  return { homeGoalie: hg, awayGoalie: ag };
}

export async function getGoaltenderProfile(playerId: string): Promise<GoaltenderProfile | null> {
  const hit = _cache.get(playerId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  // Player landing has season stats + recent games
  const d = await fetchJson(`https://api-web.nhle.com/v1/player/${playerId}/landing`);
  if (!d) return null;
  const name = `${d.firstName?.default || ''} ${d.lastName?.default || ''}`.trim() || 'Unknown';
  const team = d.fullTeamName?.default || null;
  const season = d.seasonTotals?.find((s: any) => s.leagueAbbrev === 'NHL' && s.gameTypeId === 2) || null;
  const seasonSavePct = season?.savePctg != null ? Number(season.savePctg) : null;
  const seasonGAA = season?.goalsAgainstAverage != null ? Number(season.goalsAgainstAverage) : null;

  // Recent games — sum L5
  const last5 = (d.last5Games || []).slice(0, 5);
  let totalGoals = 0, totalShots = 0, totalSec = 0;
  for (const g of last5) {
    totalGoals += g.goalsAgainst || 0;
    totalShots += g.shotsAgainst || 0;
    // toi format is "MM:SS"
    if (typeof g.toi === 'string') {
      const [mm, ss] = g.toi.split(':').map(Number);
      totalSec += (mm || 0) * 60 + (ss || 0);
    }
  }
  const l5Saves = totalShots - totalGoals;
  const l5SavePct = totalShots > 0 ? Number((l5Saves / totalShots).toFixed(4)) : null;
  const l5Minutes = totalSec / 60;
  const l5GAA = l5Minutes > 0 ? Number(((totalGoals * 60) / l5Minutes).toFixed(2)) : null;

  const profile: GoaltenderProfile = {
    id: playerId, name, team,
    l5GoalsAgainst: last5.length ? totalGoals : null,
    l5ShotsAgainst: last5.length ? totalShots : null,
    l5SavePct, l5GAA,
    seasonSavePct, seasonGAA,
    startsAnalyzed: last5.length,
  };
  _cache.set(playerId, { data: profile, at: Date.now() });
  return profile;
}
