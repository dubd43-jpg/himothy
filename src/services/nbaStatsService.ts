// NBA / basketball stats — pulled from ESPN's public team JSON, which already
// drives team logos on the site. Free, no key, but rate-limit friendly. We pull:
//   - pace (possessions per 48)
//   - days rest / back-to-back flag
//   - L5 offensive rating, L5 3PT%
// These map directly to the basketball KEY FACTORS the user asked about
// (PACE, REST, 3PT%, Off/Def matchup).

const TTL_MS = 60 * 60 * 1000;
const _teamCache: Map<string, { data: BasketballTeamProfile; at: number }> = new Map();

export interface BasketballTeamProfile {
  teamId: string;
  abbrev: string;
  // Season averages
  pace: number | null;
  offRating: number | null;
  defRating: number | null;
  threePctSeason: number | null;
  // Recency
  l5OffRating: number | null;
  l5ThreePct: number | null;
  l5OppOffRating: number | null;   // how well opponents scored against us last 5 = defensive form proxy
  lastGameDate: string | null;     // ISO
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'himothypicks.com/1.0' },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// league: 'nba' | 'wnba' | 'mens-college-basketball' | 'womens-college-basketball'
export async function getBasketballTeamProfile(league: string, teamId: string): Promise<BasketballTeamProfile | null> {
  const key = `${league}|${teamId}`;
  const hit = _teamCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  // ESPN team stats endpoint
  const statsUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/${league}/teams/${teamId}/statistics`;
  const scheduleUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/${league}/teams/${teamId}/schedule`;
  const [statsRes, scheduleRes] = await Promise.all([fetchJson(statsUrl), fetchJson(scheduleUrl)]);

  let pace: number | null = null;
  let offRating: number | null = null;
  let defRating: number | null = null;
  let threePctSeason: number | null = null;
  let abbrev = '';

  const stats = statsRes?.results?.stats?.categories || statsRes?.team?.statistics || [];
  abbrev = statsRes?.team?.abbreviation || statsRes?.results?.team?.abbreviation || '';

  const flatStats = Array.isArray(stats)
    ? stats.flatMap((c: any) => c.stats || [])
    : [];
  for (const s of flatStats) {
    const n = (s.name || s.displayName || '').toLowerCase();
    const v = s.value != null ? Number(s.value) : null;
    if (v == null || !isFinite(v)) continue;
    if (n.includes('pace')) pace = v;
    else if (n === 'offensiverating' || n.includes('offensive rating')) offRating = v;
    else if (n === 'defensiverating' || n.includes('defensive rating')) defRating = v;
    else if (n === 'threepointfieldgoalpct' || n === 'threepointpct' || n.includes('three point percentage')) threePctSeason = v;
  }

  // L5 from schedule — pull completed games, sum offense / opp offense / 3PM/3PA across last 5
  const events = (scheduleRes?.events || []).filter((e: any) => e.competitions?.[0]?.status?.type?.completed);
  events.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const last5 = events.slice(0, 5);

  let l5Off = 0, l5OppOff = 0, l5_3M = 0, l5_3A = 0, lastDate: string | null = null;
  let n5 = 0;
  for (const ev of last5) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const us = comp.competitors?.find((c: any) => String(c.team?.id) === String(teamId));
    const them = comp.competitors?.find((c: any) => String(c.team?.id) !== String(teamId));
    if (!us || !them) continue;
    const ourScore = Number(us.score);
    const theirScore = Number(them.score);
    if (!isFinite(ourScore) || !isFinite(theirScore)) continue;
    l5Off += ourScore;
    l5OppOff += theirScore;
    n5++;
    if (!lastDate) lastDate = ev.date;
    // 3PT line items if present
    const stats3 = (us.statistics || []).find((s: any) => (s.name || '').toLowerCase().includes('threepoint'));
    if (stats3?.displayValue) {
      const m = String(stats3.displayValue).match(/(\d+)-(\d+)/);
      if (m) { l5_3M += Number(m[1]); l5_3A += Number(m[2]); }
    }
  }

  const profile: BasketballTeamProfile = {
    teamId, abbrev,
    pace, offRating, defRating, threePctSeason,
    l5OffRating: n5 > 0 ? Number((l5Off / n5).toFixed(1)) : null,
    l5OppOffRating: n5 > 0 ? Number((l5OppOff / n5).toFixed(1)) : null,
    l5ThreePct: l5_3A > 0 ? Number((l5_3M / l5_3A).toFixed(3)) : null,
    lastGameDate: lastDate,
  };
  _teamCache.set(key, { data: profile, at: Date.now() });
  return profile;
}

// Days rest helper — call after getting lastGameDate.
export function daysRest(lastGameDate: string | null, gameDate: string | Date): number | null {
  if (!lastGameDate) return null;
  const last = new Date(lastGameDate).getTime();
  const next = (gameDate instanceof Date ? gameDate : new Date(gameDate)).getTime();
  if (!isFinite(last) || !isFinite(next)) return null;
  const diffMs = next - last;
  return Math.max(0, Math.round(diffMs / (24 * 60 * 60 * 1000)));
}

// Pair-wise pace projection for the game's total: average both teams' season pace.
// Higher pace = more possessions = leans Over.
export function projectGamePace(homeProfile: BasketballTeamProfile | null, awayProfile: BasketballTeamProfile | null): number | null {
  if (!homeProfile?.pace && !awayProfile?.pace) return null;
  const vals = [homeProfile?.pace, awayProfile?.pace].filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
}

// stats.nba.com SECONDARY SOURCE
//
// stats.nba.com publishes richer team-level advanced stats (pace, offRtg, defRtg,
// netRtg, eFG%, TS%, TOV%, OREB%) but is notoriously hostile to anonymous fetches.
// Their endpoints require specific headers and rotate rate limits aggressively;
// we use it as a best-effort enhancement layered on top of the ESPN profile.
//
// Cache aggressively (12h) since these advanced stats are season-to-date and
// change only on a per-game cadence.

interface NbaAdvancedTeamStats {
  teamId: string;
  pace: number | null;
  offRating: number | null;
  defRating: number | null;
  netRating: number | null;
  eFGPct: number | null;
  tsPct: number | null;
  tovPct: number | null;
  orebPct: number | null;
  source: 'stats.nba.com';
}

const _advancedCache: Map<string, { data: NbaAdvancedTeamStats | null; at: number }> = new Map();
const ADV_TTL_MS = 12 * 60 * 60 * 1000;

function currentNbaSeasonStr(): string {
  // stats.nba.com uses "YYYY-YY" format. NBA season starts October.
  const d = new Date();
  const m = d.getUTCMonth() + 1;
  const y = m >= 10 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  const next = (y + 1) % 100;
  return `${y}-${next.toString().padStart(2, '0')}`;
}

export async function getNbaAdvancedTeamStats(teamId: string): Promise<NbaAdvancedTeamStats | null> {
  const cached = _advancedCache.get(teamId);
  if (cached && Date.now() - cached.at < ADV_TTL_MS) return cached.data;

  const season = currentNbaSeasonStr();
  // teamdashboardbygeneralsplits with MeasureType=Advanced returns season-to-date.
  const url = new URL('https://stats.nba.com/stats/teamdashboardbygeneralsplits');
  url.searchParams.set('TeamID', teamId);
  url.searchParams.set('Season', season);
  url.searchParams.set('SeasonType', 'Regular Season');
  url.searchParams.set('MeasureType', 'Advanced');
  url.searchParams.set('PerMode', 'Per100Possessions');
  url.searchParams.set('LastNGames', '0');
  url.searchParams.set('Month', '0');
  url.searchParams.set('OpponentTeamID', '0');
  url.searchParams.set('PaceAdjust', 'N');
  url.searchParams.set('Period', '0');
  url.searchParams.set('PlusMinus', 'N');
  url.searchParams.set('Rank', 'N');
  url.searchParams.set('GameSegment', '');
  url.searchParams.set('DateFrom', '');
  url.searchParams.set('DateTo', '');
  url.searchParams.set('Outcome', '');
  url.searchParams.set('Location', '');
  url.searchParams.set('VsConference', '');
  url.searchParams.set('VsDivision', '');
  url.searchParams.set('LeagueID', '00');
  url.searchParams.set('SeasonSegment', '');
  url.searchParams.set('ShotClockRange', '');
  url.searchParams.set('PORound', '0');

  try {
    const res = await fetch(url.toString(), {
      cache: 'no-store',
      headers: {
        // stats.nba.com 403s without these exact headers from a browser-like UA.
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Referer': 'https://www.nba.com/',
        'Origin': 'https://www.nba.com',
        'x-nba-stoken': 'true',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) {
      _advancedCache.set(teamId, { data: null, at: Date.now() });
      return null;
    }
    const json = await res.json();
    // Response shape: resultSets[0].headers (array) + resultSets[0].rowSet[0] (array).
    const headers: string[] = json?.resultSets?.[0]?.headers || [];
    const row: any[] = json?.resultSets?.[0]?.rowSet?.[0] || [];
    if (!row.length) {
      _advancedCache.set(teamId, { data: null, at: Date.now() });
      return null;
    }
    const idx = (name: string): number => headers.findIndex((h) => h.toUpperCase() === name.toUpperCase());
    const num = (name: string): number | null => {
      const i = idx(name);
      if (i < 0) return null;
      const v = Number(row[i]);
      return isFinite(v) ? v : null;
    };
    const data: NbaAdvancedTeamStats = {
      teamId,
      pace: num('PACE'),
      offRating: num('OFF_RATING'),
      defRating: num('DEF_RATING'),
      netRating: num('NET_RATING'),
      eFGPct: num('EFG_PCT'),
      tsPct: num('TS_PCT'),
      tovPct: num('TM_TOV_PCT'),
      orebPct: num('OREB_PCT'),
      source: 'stats.nba.com',
    };
    _advancedCache.set(teamId, { data, at: Date.now() });
    return data;
  } catch {
    _advancedCache.set(teamId, { data: null, at: Date.now() });
    return null;
  }
}

// Merge ESPN baseline + stats.nba.com advanced. stats.nba.com values win when
// both sources have a number; ESPN is the fallback for offline/blocked cases.
export async function getEnrichedBasketballProfile(league: string, teamId: string): Promise<BasketballTeamProfile | null> {
  const base = await getBasketballTeamProfile(league, teamId);
  if (!base) return null;
  if (league !== 'nba') return base;
  const adv = await getNbaAdvancedTeamStats(teamId);
  if (!adv) return base;
  return {
    ...base,
    pace: adv.pace ?? base.pace,
    offRating: adv.offRating ?? base.offRating,
    defRating: adv.defRating ?? base.defRating,
  };
}
