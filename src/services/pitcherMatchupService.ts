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
  // MLB Stats API enrichment (populated when the cross-reference succeeds):
  // OPS allowed to lefty / righty batters this season — the matchup math the
  // Tampa-TT-Under loss exposed we needed.
  vsLOpsAllowed: number | null;
  vsROpsAllowed: number | null;
  seasonERA: number | null;
  mlbStatsApiId: string | null;   // statsapi.mlb.com person ID
}

// Team-level vs-handedness batting profile (separate from pitcher above so we can
// fetch them in parallel). Populated by MLB Stats API.
export interface TeamHandednessProfile {
  vsLhpOps: number | null;
  vsRhpOps: number | null;
  vsLhpKRate: number | null;
  vsRhpKRate: number | null;
  mlbTeamId: string | null;
}

export interface GameProbables {
  home: PitcherProfile | null;
  away: PitcherProfile | null;
  // 2026-06-04 — late-scratch protection. ESPN's competitor.probables[] entries
  // carry a `status` field. "Confirmed" means the team has officially announced
  // this starter; otherwise it's a projection that can change up until first pitch.
  // Late scratches are the single biggest cause of MLB ML losses, so the engine
  // caps confidence on un-confirmed starts as game time approaches.
  homeConfirmed: boolean;
  awayConfirmed: boolean;
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
    vsLOpsAllowed: null,
    vsROpsAllowed: null,
    seasonERA: null,
    mlbStatsApiId: null,
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
  const empty: GameProbables = { home: null, away: null, homeConfirmed: false, awayConfirmed: false };
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
  let homeConfirmed = false;
  let awayConfirmed = false;
  for (const c of comp.competitors || []) {
    const probs = c.probables || [];
    const p0 = probs[0] || null;
    const aid = p0?.athlete?.id ? String(p0.athlete.id) : null;
    // ESPN populates probables[].status when the team formally announces.
    // status.name === "Confirmed" or status.type === "starting-pitcher" both
    // indicate locked-in; absence of status (or "Probable") = projection only.
    const statusName = String(p0?.status?.name || p0?.status?.type || '').toLowerCase();
    const confirmed = statusName.includes('confirm') || statusName === 'starter' || statusName === 'starting-pitcher';
    if (c.homeAway === 'home') { homeId = aid; homeConfirmed = confirmed; }
    else if (c.homeAway === 'away') { awayId = aid; awayConfirmed = confirmed; }
  }

  const [home, away] = await Promise.all([
    homeId ? getPitcherProfile(homeId, season) : Promise.resolve(null),
    awayId ? getPitcherProfile(awayId, season) : Promise.resolve(null),
  ]);

  const out: GameProbables = { home, away, homeConfirmed, awayConfirmed };
  GAME_PROBABLE_CACHE.set(cacheKey, { data: out, at: Date.now() });
  return out;
}

// Cross-reference an ESPN pitcher to the MLB Stats API by name (statsapi.mlb.com
// uses different IDs). When found, merge the enriched per-handedness OPS-allowed
// splits onto the profile. Silent fail when not found — engine just falls back to
// ERA-only matchup logic.
const NAME_TO_MLB_ID: Map<string, string | null> = new Map();
async function resolveMlbStatsApiId(name: string): Promise<string | null> {
  const key = name.toLowerCase().trim();
  if (NAME_TO_MLB_ID.has(key)) return NAME_TO_MLB_ID.get(key) || null;
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(name)}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) { NAME_TO_MLB_ID.set(key, null); return null; }
    const d: any = await r.json();
    const id = d?.people?.[0]?.id != null ? String(d.people[0].id) : null;
    NAME_TO_MLB_ID.set(key, id);
    return id;
  } catch {
    NAME_TO_MLB_ID.set(key, null);
    return null;
  }
}

// Enrich an existing PitcherProfile in-place with MLB Stats API per-handedness OPS.
// Safe to call repeatedly — uses caching from mlbStatsService.
export async function enrichPitcherWithMlbStats(profile: PitcherProfile): Promise<PitcherProfile> {
  if (profile.vsLOpsAllowed != null || profile.vsROpsAllowed != null) return profile;
  const { getPitcherEnhancedStats } = await import('./mlbStatsService');
  const id = await resolveMlbStatsApiId(profile.name);
  if (!id) return profile;
  const enh = await getPitcherEnhancedStats(id);
  if (!enh) return profile;
  profile.mlbStatsApiId = id;
  profile.vsLOpsAllowed = enh.vsLHB?.ops ?? null;
  profile.vsROpsAllowed = enh.vsRHB?.ops ?? null;
  profile.seasonERA = enh.seasonERA;
  if (!profile.throws && enh.throwsHand) profile.throws = enh.throwsHand;
  return profile;
}

// Pull team-level vs-LHP/vs-RHP batting splits for ONE team. The team name is
// the ESPN name; we cross-reference to the MLB Stats API team ID by abbreviation.
const TEAM_HANDEDNESS_CACHE: Map<string, { data: TeamHandednessProfile; at: number }> = new Map();
const MLB_TEAM_NAME_TO_ID: Record<string, string> = {
  'angels': '108', 'astros': '117', 'athletics': '133', 'blue jays': '141',
  'braves': '144', 'brewers': '158', 'cardinals': '138', 'cubs': '112',
  'diamondbacks': '109', 'dodgers': '119', 'giants': '137', 'guardians': '114',
  'mariners': '136', 'marlins': '146', 'mets': '121', 'nationals': '120',
  'orioles': '110', 'padres': '135', 'phillies': '143', 'pirates': '134',
  'rangers': '140', 'rays': '139', 'red sox': '111', 'reds': '113',
  'rockies': '115', 'royals': '118', 'tigers': '116', 'twins': '142',
  'white sox': '145', 'yankees': '147',
};
function findMlbTeamId(teamName: string): string | null {
  const lower = teamName.toLowerCase();
  for (const k of Object.keys(MLB_TEAM_NAME_TO_ID)) {
    if (lower.includes(k)) return MLB_TEAM_NAME_TO_ID[k];
  }
  return null;
}
export async function getTeamHandednessProfile(teamName: string): Promise<TeamHandednessProfile> {
  const empty: TeamHandednessProfile = { vsLhpOps: null, vsRhpOps: null, vsLhpKRate: null, vsRhpKRate: null, mlbTeamId: null };
  const teamId = findMlbTeamId(teamName);
  if (!teamId) return empty;
  const cacheKey = teamId;
  const hit = TEAM_HANDEDNESS_CACHE.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const { getTeamBattingSplits } = await import('./mlbStatsService');
  const splits = await getTeamBattingSplits(teamId);
  const out: TeamHandednessProfile = {
    vsLhpOps: splits?.vsLHP?.ops ?? null,
    vsRhpOps: splits?.vsRHP?.ops ?? null,
    vsLhpKRate: splits?.vsLHP?.kRate ?? null,
    vsRhpKRate: splits?.vsRHP?.kRate ?? null,
    mlbTeamId: teamId,
  };
  TEAM_HANDEDNESS_CACHE.set(cacheKey, { data: out, at: Date.now() });
  return out;
}

// Compute lineup-vs-pitcher edge using the enriched data. Returns delta in OPS
// (positive = lineup likely to hit pitcher hard) plus a human label.
export function computeMatchupEdge(
  pitcher: PitcherProfile | null,
  opp: TeamHandednessProfile | null,
): { delta: number; lineupOps: number; pitcherOps: number; label: string } | null {
  if (!pitcher?.throws || !opp) return null;
  const lineupOps = pitcher.throws === 'L' ? opp.vsLhpOps : opp.vsRhpOps;
  // Use the AVERAGE of the pitcher's vs-L and vs-R OPS-allowed when both available
  const pL = pitcher.vsLOpsAllowed;
  const pR = pitcher.vsROpsAllowed;
  let pitcherOps: number | null = null;
  if (pL != null && pR != null) pitcherOps = (pL + pR) / 2;
  else if (pL != null) pitcherOps = pL;
  else if (pR != null) pitcherOps = pR;
  if (lineupOps == null || pitcherOps == null) return null;
  const delta = Number((lineupOps - pitcherOps).toFixed(3));
  const sign = delta > 0 ? '+' : '';
  const label = `Lineup vs ${pitcher.throws}HP: ${lineupOps.toFixed(3)} OPS vs ${pitcher.name} ${pitcherOps.toFixed(3)} OPS allowed (${sign}${delta.toFixed(3)})`;
  return { delta, lineupOps, pitcherOps, label };
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
