// MONEYPUCK NHL ADVANCED-STATS INTEGRATION
//
// MoneyPuck publishes free team-level CSV exports of expected-goals (xG) and
// other puck-tracking advanced stats. We use the season-summary 5-on-5 file to
// pull each team's xGF%, xGF/60, xGA/60, high-danger chances for/against, and
// shooting/save% over/under expected. These map to NHL-side tendency signals
// the engine layers on top of season points and goaltender profiles.
//
// Source: moneypuck.com/moneypuck/playerData/seasonSummary/{year}/regular/teams.csv
// CSV-no-key, refreshed daily by them.
//
// Wired into extraSignalsService for NHL game enrichment.

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — they refresh daily
let _cache: { rowsByAbbrev: Map<string, MoneyPuckTeamStats>; at: number } | null = null;

export interface MoneyPuckTeamStats {
  teamAbbrev: string;
  situation: string;       // '5on5' typically
  gamesPlayed: number;
  xGoalsForPct: number;    // share of expected goals (.500 = neutral)
  xGoalsForPer60: number;
  xGoalsAgainstPer60: number;
  highDangerForPct: number;
  goalsForVsExpected: number;   // actual GF - xGF (positive = lucky/hot shooting)
  goalsAgainstVsExpected: number; // actual GA - xGA (positive = bad goalie luck)
}

// NHL season key — MoneyPuck uses the season-start year (e.g., 2025 = 2025-26).
// We compute from the current calendar date so the URL auto-rolls in October.
function currentNhlSeasonYear(): number {
  const now = new Date();
  const m = now.getUTCMonth() + 1; // 1-12
  // Oct (10) onward starts a new season
  return m >= 10 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((s) => s.trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = (cols[j] || '').trim();
    rows.push(row);
  }
  return rows;
}

async function loadCsv(): Promise<Map<string, MoneyPuckTeamStats>> {
  if (_cache && Date.now() - _cache.at < TTL_MS) return _cache.rowsByAbbrev;
  const year = currentNhlSeasonYear();
  const url = `https://moneypuck.com/moneypuck/playerData/seasonSummary/${year}/regular/teams.csv`;
  const out = new Map<string, MoneyPuckTeamStats>();
  try {
    const res = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'himothypicks.com/1.0' } });
    if (!res.ok) {
      _cache = { rowsByAbbrev: out, at: Date.now() };
      return out;
    }
    const csv = await res.text();
    const rows = parseCsv(csv);
    for (const r of rows) {
      // MoneyPuck team-level CSV exposes one row per (team, situation). We want
      // 5-on-5 for tendency reads — that's where xG correlates best to outcomes.
      if (r.situation !== '5on5') continue;
      const abbrev = (r.team || '').toUpperCase();
      if (!abbrev) continue;
      const gp = Number(r.games_played || r.gamesPlayed || 0);
      const xgf = Number(r.xGoalsFor || 0);
      const xga = Number(r.xGoalsAgainst || 0);
      const gf = Number(r.goalsFor || 0);
      const ga = Number(r.goalsAgainst || 0);
      const hdcf = Number(r.highDangerShotsFor || 0);
      const hdca = Number(r.highDangerShotsAgainst || 0);
      const iceTimeMin = Number(r.iceTime || 0) / 60; // seconds → minutes
      const minutesPer60 = iceTimeMin > 0 ? 60 / iceTimeMin : 0;

      out.set(abbrev, {
        teamAbbrev: abbrev,
        situation: '5on5',
        gamesPlayed: gp,
        xGoalsForPct: xgf + xga > 0 ? Number((xgf / (xgf + xga)).toFixed(3)) : 0.5,
        xGoalsForPer60: iceTimeMin > 0 ? Number((xgf * minutesPer60).toFixed(2)) : 0,
        xGoalsAgainstPer60: iceTimeMin > 0 ? Number((xga * minutesPer60).toFixed(2)) : 0,
        highDangerForPct: hdcf + hdca > 0 ? Number((hdcf / (hdcf + hdca)).toFixed(3)) : 0.5,
        goalsForVsExpected: Number((gf - xgf).toFixed(2)),
        goalsAgainstVsExpected: Number((ga - xga).toFixed(2)),
      });
    }
  } catch { /* network down / format change — return whatever we have */ }
  _cache = { rowsByAbbrev: out, at: Date.now() };
  return out;
}

// ESPN gives us full team names like "Toronto Maple Leafs" or "Boston Bruins";
// MoneyPuck CSVs key by 3-letter abbreviation. This map covers the 32 NHL clubs.
// If a new team is added we fall back to scanning the abbreviation directly.
const NHL_NAME_TO_ABBREV: Record<string, string> = {
  'anaheim ducks': 'ANA', 'arizona coyotes': 'ARI', 'utah hockey club': 'UTA', 'utah mammoth': 'UTA',
  'boston bruins': 'BOS', 'buffalo sabres': 'BUF', 'calgary flames': 'CGY',
  'carolina hurricanes': 'CAR', 'chicago blackhawks': 'CHI', 'colorado avalanche': 'COL',
  'columbus blue jackets': 'CBJ', 'dallas stars': 'DAL', 'detroit red wings': 'DET',
  'edmonton oilers': 'EDM', 'florida panthers': 'FLA', 'los angeles kings': 'LAK',
  'minnesota wild': 'MIN', 'montreal canadiens': 'MTL', 'montréal canadiens': 'MTL',
  'nashville predators': 'NSH', 'new jersey devils': 'NJD',
  'new york islanders': 'NYI', 'new york rangers': 'NYR', 'ottawa senators': 'OTT',
  'philadelphia flyers': 'PHI', 'pittsburgh penguins': 'PIT', 'san jose sharks': 'SJS',
  'seattle kraken': 'SEA', 'st. louis blues': 'STL', 'st louis blues': 'STL',
  'tampa bay lightning': 'TBL', 'toronto maple leafs': 'TOR', 'vancouver canucks': 'VAN',
  'vegas golden knights': 'VGK', 'washington capitals': 'WSH', 'winnipeg jets': 'WPG',
};

export function nhlNameToAbbrev(name: string | null | undefined): string | null {
  if (!name) return null;
  const k = name.toLowerCase().trim();
  if (NHL_NAME_TO_ABBREV[k]) return NHL_NAME_TO_ABBREV[k];
  // Fallback: if it's already a 2-4 letter abbreviation, use it as-is.
  if (/^[A-Za-z]{2,4}$/.test(name.trim())) return name.toUpperCase();
  return null;
}

export async function getMoneyPuckTeamStats(teamAbbrev: string): Promise<MoneyPuckTeamStats | null> {
  if (!teamAbbrev) return null;
  const map = await loadCsv();
  return map.get(teamAbbrev.toUpperCase()) || null;
}

// Pair comparison — returns the xG-share edge between two teams. Positive means
// homeAbbrev is the better underlying team. Used by extraSignalsService for NHL
// nudges. Returns null when either team is missing data.
export async function compareTeamsXG(homeAbbrev: string, awayAbbrev: string): Promise<{
  homeXgPct: number; awayXgPct: number; gap: number;
  homeHotCold: 'hot' | 'cold' | 'neutral';   // shooting variance flag for the home team
  awayHotCold: 'hot' | 'cold' | 'neutral';
} | null> {
  const [h, a] = await Promise.all([
    getMoneyPuckTeamStats(homeAbbrev),
    getMoneyPuckTeamStats(awayAbbrev),
  ]);
  if (!h || !a) return null;
  const gap = Number((h.xGoalsForPct - a.xGoalsForPct).toFixed(3));
  // Goals - expected goals > +5 in fewer than ~30 GP means a hot streak that
  // tends to regress. < -5 means cold shooting that tends to bounce back.
  const hotCold = (gfve: number, gp: number): 'hot' | 'cold' | 'neutral' => {
    if (gp < 10) return 'neutral';
    if (gfve > 5) return 'hot';
    if (gfve < -5) return 'cold';
    return 'neutral';
  };
  return {
    homeXgPct: h.xGoalsForPct,
    awayXgPct: a.xGoalsForPct,
    gap,
    homeHotCold: hotCold(h.goalsForVsExpected, h.gamesPlayed),
    awayHotCold: hotCold(a.goalsForVsExpected, a.gamesPlayed),
  };
}
