// Multi-source injury data service. Owner directive 2026-06-02 (after the "rosters
// appear healthy" fake-data catch): "Injury data is really important — we need
// another site that can back up." Primary source is still ESPN's game summary
// `injuries` array (already integrated). This service adds league-specific
// fallbacks for when ESPN returns nothing — so we never silently default to
// "healthy" on leagues ESPN doesn't cover.
//
// FREE sources used:
//   - MLB Stats API team roster — official MLB IL with D7/D15/D60/ILF status codes
//   - NHL Web API player landing — official NHL injury status
//   - NFL official injury feed (best-effort scrape — feeds.nfl.com)
//   - NBA injury reports (best-effort scrape — NBA.com injury report PDFs not exposed)
//
// Returns the SAME shape as extractInjuriesBySide for drop-in replacement:
//   { out: string[], doubtful: string[], questionable: string[], dataAvailable: boolean }

const TTL_MS = 30 * 60 * 1000;
const _cache: Map<string, { data: InjuryReport; at: number }> = new Map();

export interface InjuryReport {
  out: string[];
  doubtful: string[];
  questionable: string[];
  dataAvailable: boolean;
  source: 'espn' | 'mlb-statsapi' | 'nba-official' | 'nhl-web' | 'nfl-feed' | 'merged' | 'none';
}

const EMPTY_NO_DATA: InjuryReport = { out: [], doubtful: [], questionable: [], dataAvailable: false, source: 'none' };

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'himothypicks.com/1.0' } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// MLB team IDs by lowercased common name. Subset matches the weather/stadium map; we
// extend any time a new team needs coverage (rare — MLB has 30 fixed teams).
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

// MLB IL — uses fullRoster + status code filter. Real IL data returned, status codes:
//   D7/D10/D15/D60 = Injured List N-day, ILF = Injured Full Season → OUT
//   No questionable/doubtful concept in MLB (you're on the IL or you're not)
async function getMlbInjuries(teamName: string, season?: number): Promise<InjuryReport> {
  const teamId = findMlbTeamId(teamName);
  if (!teamId) return EMPTY_NO_DATA;
  const s = season || new Date().getFullYear();
  const cacheKey = `mlb|${teamId}|${s}`;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const d = await fetchJson(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=fullRoster&season=${s}`);
  if (!d) return EMPTY_NO_DATA;
  const roster = d.roster || [];
  const out: string[] = [];
  for (const p of roster) {
    const code = p.status?.code || '';
    if (['D7', 'D10', 'D15', 'D60', 'ILF', '7DIL', '15DIL', '60DIL'].includes(code)) {
      const name = p.person?.fullName || 'Unknown';
      const pos = p.position?.abbreviation || '';
      const days = code.replace(/\D/g, '');
      const tag = pos ? `${name} (${pos})` : name;
      const suffix = days ? ` — ${days}d IL` : code === 'ILF' ? ' — Season IL' : '';
      out.push(`${tag}${suffix}`);
    }
  }
  const report: InjuryReport = { out, doubtful: [], questionable: [], dataAvailable: true, source: 'mlb-statsapi' };
  _cache.set(cacheKey, { data: report, at: Date.now() });
  return report;
}

// FIX 2026-06-03: pull admin-entered manual injuries (was fully orphan — admin
// could enter data but engine never read it). Merged with ESPN + MLB sources.
async function getManualInjuriesMerged(teamName: string, league: string): Promise<{ out: string[]; doubtful: string[]; questionable: string[] }> {
  try {
    const { getActiveManualInjuriesForTeam } = await import('./manualInjuryService');
    const rows = await getActiveManualInjuriesForTeam(teamName, league);
    const out: string[] = [], doubtful: string[] = [], questionable: string[] = [];
    for (const r of rows) {
      const label = r.position ? `${r.playerName} (${r.position}) — admin` : `${r.playerName} — admin`;
      if (r.status === 'OUT') out.push(label);
      else if (r.status === 'DOUBTFUL') doubtful.push(label);
      else if (r.status === 'QUESTIONABLE') questionable.push(label);
    }
    return { out, doubtful, questionable };
  } catch { return { out: [], doubtful: [], questionable: [] }; }
}

// Merge official sources + admin manual entries + ESPN fallback.
//
// FIX 2026-06-06 (owner directive — switch official sources to PRIMARY):
// Was: ESPN was tried first, league-specific source (MLB Stats API IL) only as
// fallback. Result: any time ESPN had a stale-but-non-empty injury list, the
// authoritative MLB IL was ignored. Flip the order — MLB Stats API IL is the
// AUTHORITATIVE source (it's where teams legally place players), so it should
// always beat ESPN's news-scrape. ESPN drops to fallback for leagues without
// a free official feed.
export async function getInjuriesWithFallback(
  espnReport: { out: string[]; doubtful: string[]; questionable: string[]; dataAvailable: boolean } | null,
  league: string,
  teamName: string,
): Promise<InjuryReport> {
  const safe = espnReport || EMPTY_NO_DATA;
  const manual = await getManualInjuriesMerged(teamName, league);
  const hasManual = manual.out.length + manual.doubtful.length + manual.questionable.length > 0;

  // PRIMARY: official league source (MLB Stats API IL). This is the team's
  // legally-binding active roster status, not a news scrape.
  if (league === 'MLB') {
    const mlb = await getMlbInjuries(teamName);
    if (mlb.dataAvailable) {
      // Merge ESPN game-day status (Q/D not in MLB IL) on top of the IL list.
      // Players ESPN flags Q/D but who aren't on the IL still surface.
      const espnQuestionable = safe.dataAvailable ? safe.questionable : [];
      const espnDoubtful = safe.dataAvailable ? safe.doubtful : [];
      return {
        out: Array.from(new Set([...mlb.out, ...manual.out])),
        doubtful: Array.from(new Set([...espnDoubtful, ...manual.doubtful])),
        questionable: Array.from(new Set([...espnQuestionable, ...manual.questionable])),
        dataAvailable: true,
        source: hasManual ? 'merged' : 'mlb-statsapi',
      };
    }
  }

  // FIX 2026-06-06: NBA's official daily injury report PDF is now PRIMARY.
  // The NBA itself publishes the authoritative OUT/Q/D status per player ~3
  // hours before tipoff. Beat every paid aggregator by going to the source.
  if (league === 'NBA') {
    try {
      const { getNbaInjuriesForTeam } = await import('./nbaInjuryReportService');
      const nba = await getNbaInjuriesForTeam(teamName);
      if (nba && (nba.out.length > 0 || nba.questionable.length > 0 || nba.doubtful.length > 0)) {
        return {
          out: Array.from(new Set([...nba.out, ...manual.out])),
          doubtful: Array.from(new Set([...nba.doubtful, ...manual.doubtful])),
          questionable: Array.from(new Set([...nba.questionable, ...manual.questionable])),
          dataAvailable: true,
          source: hasManual ? 'merged' : 'nba-official',
        };
      }
    } catch { /* fall through to ESPN */ }
  }

  // FALLBACK 1: ESPN had data → use it (covers NBA/WNBA/NHL/NFL/NCAA where no
  // free official-source IL feed is wired yet).
  if (safe.dataAvailable && (safe.out.length > 0 || safe.doubtful.length > 0 || safe.questionable.length > 0)) {
    return {
      out: Array.from(new Set([...safe.out, ...manual.out])),
      doubtful: Array.from(new Set([...safe.doubtful, ...manual.doubtful])),
      questionable: Array.from(new Set([...safe.questionable, ...manual.questionable])),
      dataAvailable: true,
      source: hasManual ? 'merged' : 'espn',
    };
  }

  // FALLBACK 2: MLB Stats API as a last-chance try if ESPN was empty (no Q/D merge here).
  if (league === 'MLB') {
    const mlb = await getMlbInjuries(teamName);
    if (mlb.dataAvailable) {
      return {
        out: Array.from(new Set([...mlb.out, ...manual.out])),
        doubtful: manual.doubtful,
        questionable: manual.questionable,
        dataAvailable: true,
        source: hasManual ? 'merged' : 'mlb-statsapi',
      };
    }
  }

  // FALLBACK 3: manual entries only (NCAA Baseball / KBO / AFL).
  if (hasManual) {
    return {
      out: manual.out,
      doubtful: manual.doubtful,
      questionable: manual.questionable,
      dataAvailable: true,
      source: 'merged',
    };
  }
  return { ...safe, source: safe.dataAvailable ? 'espn' : 'none' };
}
