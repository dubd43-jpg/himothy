// MLB pitcher matchup service — owner directive: real deep tendencies.
//
// The single most predictive MLB factor for a side bet: who's pitching, how good
// they've been lately, and how the opposing lineup plays vs that handedness.
// A team on a 5-game streak can lose if their starter has been getting hit; a
// team in a losing skid can roll if their ace is on the mound.
//
// Pulls from ESPN's public endpoints (no auth, free):
//   - Probable starters: ESPN game summary (header.competitions[].competitors[].probables)
//   - Pitcher throw hand: sports.core athlete endpoint
//   - Last 5 starts: site.web athlete gamelog endpoint
//
// Cached 1h per pitcher. Total API cost for an MLB slate: 4 calls per game × 15 games
// = 60 calls, all cached. Tomorrow's slate gen runs in <30s with this added.

const PITCHER_CACHE: Map<string, { data: PitcherProfile; at: number }> = new Map();
const GAME_PROBABLE_CACHE: Map<string, { data: GameProbables; at: number }> = new Map();
const TTL_MS = 60 * 60 * 1000;

export interface PitcherProfile {
  id: string;
  name: string;
  throws: 'L' | 'R' | null;
  startsAnalyzed: number;
  eraL5: number | null;          // ERA across last 5 starts (or fewer if newer SP)
  whipL5: number | null;          // (H+BB) per IP
  kPer9L5: number | null;         // K/9
  hitsPerStart: number | null;
  // Most recent start was rough? Some indicator the SP is in a slump.
  lastStartER: number | null;
  lastStartIP: number | null;
}

export interface GameProbables {
  home: PitcherProfile | null;
  away: PitcherProfile | null;
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

// Pull throw hand + basic info for one pitcher from sports.core endpoint.
async function fetchPitcherInfo(athleteId: string): Promise<{ name: string; throws: 'L' | 'R' | null } | null> {
  const d = await fetchJson(`https://sports.core.api.espn.com/v3/sports/baseball/mlb/athletes/${athleteId}?lang=en&region=us`);
  if (!d) return null;
  const t = d.throws?.abbreviation;
  return {
    name: String(d.displayName || 'Unknown'),
    throws: t === 'L' ? 'L' : (t === 'R' ? 'R' : null),
  };
}

// Pull last N starts from the gamelog endpoint. Labels per start (positional):
// [IP, H, R, ER, HR, BB, K, GB, FB, P, TBF, GSC, Dec, Rel, ERA]
async function fetchPitcherGamelog(athleteId: string, season: number, limit = 5): Promise<Array<{ ip: number; h: number; er: number; bb: number; k: number }>> {
  const d = await fetchJson(`https://site.web.api.espn.com/apis/common/v3/sports/baseball/mlb/athletes/${athleteId}/gamelog?season=${season}`);
  if (!d) return [];
  const all: Array<{ ip: number; h: number; er: number; bb: number; k: number; date: string }> = [];
  for (const s of (d.seasonTypes || [])) {
    for (const cat of (s.categories || [])) {
      for (const e of (cat.events || [])) {
        const st = e.stats || [];
        if (st.length < 7) continue;
        const ipStr = String(st[0]);
        const ipWhole = Number(ipStr.split('.')[0] || 0);
        const ipFrac = Number(ipStr.split('.')[1] || 0); // ESPN uses .1 = 1/3 of an inning, .2 = 2/3
        const ip = ipWhole + (ipFrac === 1 ? 1/3 : ipFrac === 2 ? 2/3 : 0);
        all.push({
          ip,
          h: Number(st[1] || 0),
          er: Number(st[3] || 0),
          bb: Number(st[5] || 0),
          k: Number(st[6] || 0),
          date: e.gameDate || '',
        });
      }
    }
  }
  // Sort newest first by gameDate then return first N
  all.sort((a, b) => (a.date < b.date ? 1 : -1));
  return all.slice(0, limit);
}

export async function getPitcherProfile(athleteId: string, season = new Date().getFullYear()): Promise<PitcherProfile | null> {
  const cacheKey = `${athleteId}|${season}`;
  const hit = PITCHER_CACHE.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const [info, log] = await Promise.all([
    fetchPitcherInfo(athleteId),
    fetchPitcherGamelog(athleteId, season, 5),
  ]);
  if (!info) return null;

  const profile: PitcherProfile = {
    id: athleteId,
    name: info.name,
    throws: info.throws,
    startsAnalyzed: log.length,
    eraL5: null,
    whipL5: null,
    kPer9L5: null,
    hitsPerStart: null,
    lastStartER: log[0]?.er ?? null,
    lastStartIP: log[0]?.ip ?? null,
  };

  if (log.length > 0) {
    const totalIP = log.reduce((s, g) => s + g.ip, 0);
    const totalER = log.reduce((s, g) => s + g.er, 0);
    const totalH = log.reduce((s, g) => s + g.h, 0);
    const totalBB = log.reduce((s, g) => s + g.bb, 0);
    const totalK = log.reduce((s, g) => s + g.k, 0);
    if (totalIP > 0) {
      profile.eraL5 = Number(((totalER * 9) / totalIP).toFixed(2));
      profile.whipL5 = Number(((totalH + totalBB) / totalIP).toFixed(2));
      profile.kPer9L5 = Number(((totalK * 9) / totalIP).toFixed(2));
    }
    profile.hitsPerStart = Number((totalH / log.length).toFixed(1));
  }

  PITCHER_CACHE.set(cacheKey, { data: profile, at: Date.now() });
  return profile;
}

// Given an MLB game's event ID, fetch BOTH probable starters' full profiles. Returns
// {home, away} or {home:null, away:null} if probables aren't published yet (early posts).
export async function getGameProbables(eventId: string, season = new Date().getFullYear()): Promise<GameProbables> {
  const cacheKey = `${eventId}|${season}`;
  const hit = GAME_PROBABLE_CACHE.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const summary = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${eventId}`);
  const empty: GameProbables = { home: null, away: null };
  if (!summary) {
    GAME_PROBABLE_CACHE.set(cacheKey, { data: empty, at: Date.now() });
    return empty;
  }
  const comp = (summary.header?.competitions || [])[0];
  if (!comp) {
    GAME_PROBABLE_CACHE.set(cacheKey, { data: empty, at: Date.now() });
    return empty;
  }

  let homeId: string | null = null;
  let awayId: string | null = null;
  for (const c of comp.competitors || []) {
    const probs = c.probables || [];
    const aid = probs[0]?.athlete?.id ? String(probs[0].athlete.id) : null;
    if (c.homeAway === 'home') homeId = aid;
    else if (c.homeAway === 'away') awayId = aid;
  }

  const [home, away] = await Promise.all([
    homeId ? getPitcherProfile(homeId, season) : Promise.resolve(null),
    awayId ? getPitcherProfile(awayId, season) : Promise.resolve(null),
  ]);

  const out: GameProbables = { home, away };
  GAME_PROBABLE_CACHE.set(cacheKey, { data: out, at: Date.now() });
  return out;
}

// Human-readable pitcher snapshot for postmortem / admin display.
export function summarizePitcher(p: PitcherProfile | null): string {
  if (!p) return 'No probable starter posted.';
  const era = p.eraL5 != null ? `${p.eraL5} ERA` : 'no ERA';
  const whip = p.whipL5 != null ? `${p.whipL5} WHIP` : 'no WHIP';
  const k = p.kPer9L5 != null ? `${p.kPer9L5} K/9` : 'no K/9';
  const lastBlurb = p.lastStartER != null && p.lastStartIP != null ? ` | last: ${p.lastStartER} ER / ${p.lastStartIP} IP` : '';
  return `${p.name} (${p.throws ?? '?'}HP, ${p.startsAnalyzed} starts): ${era}, ${whip}, ${k}${lastBlurb}`;
}
