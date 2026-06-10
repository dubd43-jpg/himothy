// NBA OFFICIAL INJURY REPORT — the authoritative source
//
// 2026-06-06 owner directive: ESPN's NBA injury data is hours stale. The NBA
// publishes its own injury report PDF daily and updates it hourly on game days.
// Every paid aggregator (Rotowire, Sportsdata.io, etc.) pulls from this same
// source. Cut the middlemen out — fetch the PDF, parse it, use it as primary.
//
// PDF location: NBA Communications posts at
//   https://official.nba.com/wp-content/uploads/sites/4/INJURY-REPORT.pdf
// but they also publish timestamped versions at the CDN. We try a list of
// recent candidate URLs (today/yesterday at common report times) and use the
// first one that returns a valid PDF.
//
// Parse strategy: pdf-parse → text → row-by-row scan for "TEAM | PLAYER | STATUS"
// patterns. The report layout is consistent: each row has a team name, a player
// name, and a status (Out / Questionable / Doubtful / Probable / Available).

const TTL_MS = 30 * 60 * 1000; // 30 min — report updates ~hourly on game days

export interface NbaInjuryReport {
  byTeam: Record<string, { out: string[]; doubtful: string[]; questionable: string[]; probable: string[]; available: string[] }>;
  fetchedAt: number;
  sourceUrl: string;
  hasData: boolean;
}

const _cache: { data: NbaInjuryReport | null } = { data: null };

// NBA team name → injury-report team string. NBA uses full city + team names.
// The report uses "Boston Celtics" etc. We normalize for case-insensitive match.
function normTeam(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Build candidate PDF URLs for today and yesterday at typical report times
// (NBA releases at 1PM, 5PM, 8:30PM ET — but timestamps in URLs vary).
function candidateUrls(): string[] {
  const out: string[] = [];
  const now = new Date();
  // Try the stable "latest" URL first — NBA Comms keeps one fresh.
  out.push('https://official.nba.com/wp-content/uploads/sites/4/INJURY-REPORT.pdf');
  // Then timestamped variants for today and yesterday.
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - dayOffset);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const datePart = `${y}-${m}-${day}`;
    for (const hour of ['08PM', '05PM', '01PM', '08AM']) {
      out.push(`https://ak-static.cms.nba.com/referee/injury/Injury-Report_${datePart}_${hour}.pdf`);
    }
  }
  return out;
}

async function fetchPdfBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'himothypicks.com/1.0 NBAInjuryFetch' },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('pdf') && !ct.includes('octet-stream')) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

// Parse the NBA report PDF text into per-team injury buckets.
// The report layout (consistent across releases):
//   Game date | Game time | Match-up | Team | Player Name | Current Status | Reason
// We pick up rows where the status keyword appears, walking backwards to find
// the team and forwards to capture the name.
function parseReportText(text: string): NbaInjuryReport['byTeam'] {
  const byTeam: NbaInjuryReport['byTeam'] = {};
  if (!text) return byTeam;

  // Strip noise — page headers/footers
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Heuristic: each injury row contains a status word and a player name.
  // The team name appears either on the same line or on the immediately
  // preceding line. We track the "current team" as we walk.
  let currentTeam = '';
  const TEAMS = [
    'Atlanta Hawks', 'Boston Celtics', 'Brooklyn Nets', 'Charlotte Hornets',
    'Chicago Bulls', 'Cleveland Cavaliers', 'Dallas Mavericks', 'Denver Nuggets',
    'Detroit Pistons', 'Golden State Warriors', 'Houston Rockets', 'Indiana Pacers',
    'LA Clippers', 'Los Angeles Lakers', 'Memphis Grizzlies', 'Miami Heat',
    'Milwaukee Bucks', 'Minnesota Timberwolves', 'New Orleans Pelicans',
    'New York Knicks', 'Oklahoma City Thunder', 'Orlando Magic', 'Philadelphia 76ers',
    'Phoenix Suns', 'Portland Trail Blazers', 'Sacramento Kings', 'San Antonio Spurs',
    'Toronto Raptors', 'Utah Jazz', 'Washington Wizards',
  ];
  const STATUSES = ['Out', 'Doubtful', 'Questionable', 'Probable', 'Available'];

  for (const raw of lines) {
    // Detect team appearances anywhere in the line.
    for (const team of TEAMS) {
      if (raw.includes(team)) { currentTeam = team; break; }
    }
    if (!currentTeam) continue;

    // Detect a status keyword AS A WHOLE WORD (so "Available" doesn't trigger on "Available")
    // and pair with the preceding player name in the same row.
    for (const status of STATUSES) {
      const re = new RegExp(`\\b${status}\\b`);
      if (!re.test(raw)) continue;
      // Player name = the chunk between team-name (or row start) and the status word.
      // Strip the team and reason from the row to isolate the name.
      let rest = raw.replace(new RegExp(currentTeam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ' ').trim();
      rest = rest.replace(re, ` __STATUS__ `).trim();
      // Player name is the comma-separated "Last, First" pattern before __STATUS__
      const beforeStatus = rest.split('__STATUS__')[0]?.trim() || '';
      // Look for "Last, First" — most consistent NBA report format
      const nameMatch = beforeStatus.match(/[A-Z][A-Za-z'\-.]+(?:\s+[A-Z][A-Za-z'\-.]+)*,\s*[A-Z][A-Za-z'\-.]+(?:\s+[A-Z][A-Za-z'\-.]+)*/);
      const playerName = nameMatch
        ? nameMatch[0].split(',').reverse().map(s => s.trim()).join(' ')
        : beforeStatus.split(/\s{2,}/)[0]?.trim() || '';
      if (!playerName || playerName.length < 3) continue;

      const bucket = byTeam[currentTeam] ||= { out: [], doubtful: [], questionable: [], probable: [], available: [] };
      const tag = playerName;
      if (status === 'Out' && !bucket.out.includes(tag)) bucket.out.push(tag);
      else if (status === 'Doubtful' && !bucket.doubtful.includes(tag)) bucket.doubtful.push(tag);
      else if (status === 'Questionable' && !bucket.questionable.includes(tag)) bucket.questionable.push(tag);
      else if (status === 'Probable' && !bucket.probable.includes(tag)) bucket.probable.push(tag);
      else if (status === 'Available' && !bucket.available.includes(tag)) bucket.available.push(tag);
      break;
    }
  }

  return byTeam;
}

export async function getNbaInjuryReport(): Promise<NbaInjuryReport> {
  if (_cache.data && Date.now() - _cache.data.fetchedAt < TTL_MS) return _cache.data;

  let sourceUrl = '';
  let buf: Buffer | null = null;
  for (const url of candidateUrls()) {
    buf = await fetchPdfBuffer(url);
    if (buf) { sourceUrl = url; break; }
  }
  if (!buf) {
    const empty: NbaInjuryReport = { byTeam: {}, fetchedAt: Date.now(), sourceUrl: '', hasData: false };
    _cache.data = empty;
    return empty;
  }

  let byTeam: NbaInjuryReport['byTeam'] = {};
  try {
    // pdf-parse exports default; tolerate both CJS and ESM interop.
    const pdfParseMod: any = await import('pdf-parse');
    const pdfParse = pdfParseMod.default || pdfParseMod;
    const parsed = await pdfParse(buf);
    byTeam = parseReportText(parsed.text || '');
  } catch (err) {
    console.error('[nbaInjuryReport] parse failed', err);
  }

  const result: NbaInjuryReport = {
    byTeam,
    fetchedAt: Date.now(),
    sourceUrl,
    hasData: Object.keys(byTeam).length > 0,
  };
  _cache.data = result;
  return result;
}

// Single-team lookup. Returns the bucket for the given team name, or null.
export async function getNbaInjuriesForTeam(teamName: string): Promise<{
  out: string[]; doubtful: string[]; questionable: string[]; dataAvailable: boolean;
} | null> {
  const report = await getNbaInjuryReport();
  if (!report.hasData) return null;
  // Fuzzy match team name (ESPN says "LA Clippers", NBA says "LA Clippers"; ESPN
  // says "Los Angeles Lakers", NBA says "Los Angeles Lakers"). Normalize both.
  const target = normTeam(teamName);
  for (const [reportTeam, bucket] of Object.entries(report.byTeam)) {
    const norm = normTeam(reportTeam);
    if (norm === target || norm.includes(target) || target.includes(norm)) {
      return { out: bucket.out, doubtful: bucket.doubtful, questionable: bucket.questionable, dataAvailable: true };
    }
  }
  return null;
}
