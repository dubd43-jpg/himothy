// VSIN PUBLIC BETTING SPLITS SERVICE
//
// Action Network paywalled their `/web/v1/scoreboard/{sport}` betting splits
// fields in early June 2026, leaving the engine blind to public/sharp money
// (every `sharpMoneyAligned` came back false). VSiN publishes their consensus
// public betting splits + handle % on public HTML pages at:
//   https://data.vsin.com/{league}/betting-splits/
//
// Each row contains team names, spread line, money line, and three columns
// per market: HANDLE % (= money %), BETS % (= ticket count %), and the price.
// The sharp signal is the gap: when HANDLE > BETS by 10+ points, sharp money
// is on that side regardless of ticket count.
//
// We scrape every 30 min via the /api/cron/refresh-vsin route, persist to the
// `vsin_betting_splits` table, and surface via getVsinSplit(home, away, league).
// Falls back gracefully when the page format changes (returns empty).

import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';

const VSIN_LEAGUES: Record<string, string> = {
  'MLB': 'mlb',
  'NBA': 'nba',
  'WNBA': 'wnba',
  'NHL': 'nhl',
  'NFL': 'nfl',
  'NCAA Basketball': 'college-basketball',
  'College Football': 'college-football',
};

export interface VsinSplit {
  league: string;
  homeTeam: string;
  awayTeam: string;
  // Spread market
  homeSpreadHandlePct: number | null;     // % of dollars on home spread
  homeSpreadBetsPct: number | null;       // % of tickets on home spread
  homeSpreadLine: number | null;
  awaySpreadLine: number | null;
  // Total market
  overHandlePct: number | null;
  overBetsPct: number | null;
  totalLine: number | null;
  // Money line
  homeMlHandlePct: number | null;
  homeMlBetsPct: number | null;
  awayMlHandlePct: number | null;
  awayMlBetsPct: number | null;
  homeMlPrice: number | null;
  awayMlPrice: number | null;
  refreshedAt: string;
}

async function ensureSchema(): Promise<void> {
  if (!hasDatabase()) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS vsin_betting_splits (
        league TEXT NOT NULL,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        home_spread_handle_pct NUMERIC,
        home_spread_bets_pct NUMERIC,
        home_spread_line NUMERIC,
        away_spread_line NUMERIC,
        over_handle_pct NUMERIC,
        over_bets_pct NUMERIC,
        total_line NUMERIC,
        home_ml_handle_pct NUMERIC,
        home_ml_bets_pct NUMERIC,
        away_ml_handle_pct NUMERIC,
        away_ml_bets_pct NUMERIC,
        home_ml_price NUMERIC,
        away_ml_price NUMERIC,
        refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (league, home_team, away_team)
      )
    `);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS vsin_betting_splits_refreshed_idx ON vsin_betting_splits (refreshed_at DESC)`
    );
  } catch (err) {
    console.error('[vsin] schema bootstrap failed', err);
  }
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

function pctNum(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/(\d{1,3})\s*%/);
  return m ? Number(m[1]) : null;
}

function priceNum(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/([+-]?\d{2,4})/);
  return m ? Number(m[1]) : null;
}

function lineNum(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/([+-]?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

// VSiN pages display the date of the games shown in the page header
// ("Thursday, Jun 4"). Parse it to skip pages with games more than ~3 days out
// — relevant during off-seasons (e.g. NFL in June shows opening-weekend lines
// in September). Returns null when no date is found (treat as current).
function parseVsinPageDate(html: string): Date | null {
  // Look for "DayOfWeek, Mon DD" in the header. VSiN uses 3-letter month
  // abbreviations.
  const m = html.match(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)(?:day)?,\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2})/i);
  if (!m) return null;
  const monthIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
    .indexOf(m[2].slice(0, 3).toLowerCase());
  if (monthIdx < 0) return null;
  const day = Number(m[3]);
  if (!isFinite(day) || day < 1 || day > 31) return null;
  const now = new Date();
  let year = now.getUTCFullYear();
  // If the parsed month is BEFORE current month by more than 3 months, it must
  // be next year (e.g. it's December and the page lists "Feb 5").
  if (monthIdx < now.getUTCMonth() - 3) year += 1;
  return new Date(Date.UTC(year, monthIdx, day));
}

// VSiN's HTML table uses one row per side. Each game is two consecutive rows.
// Column order (after stripping tags + |-separating):
//   [reload-icon, team-name, spread, spread-handle%, spread-bets%, total,
//    total-handle%, total-bets%, ml-price, ml-handle%, ml-bets%]
// We pair rows by adjacency. Returns parsed VsinSplit rows for ALL games found.
async function scrapeOneLeague(leagueKey: string, leagueLabel: string): Promise<VsinSplit[]> {
  const url = `https://data.vsin.com/${leagueKey}/betting-splits/`;
  let html: string;
  try {
    const res = await fetch(url, { redirect: 'follow', cache: 'no-store', headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
    if (!res.ok) return [];
    html = await res.text();
  } catch { return []; }

  // 2026-06-04 off-season guard. NFL in June shows opening-weekend (September)
  // game lines that won't matter for ~3 months. Skip pages whose displayed
  // date is more than 3 days from today — keeps the persisted table focused
  // on the current betting window and prevents stale far-future rows from
  // racking up on every refresh.
  const pageDate = parseVsinPageDate(html);
  if (pageDate) {
    const daysOut = (pageDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    if (daysOut > 3) return [];
  }

  const trMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  // Strip header rows (contain "Spread|SPR" etc.)
  const dataRows = trMatches
    .map((r) => stripTags(r))
    .filter((t) => !/\bSpread\|SPR\b/i.test(t) && !/\bHandle\|HND\b/i.test(t));

  // Parse a single row into its column cells. Cells = the |-separated tokens
  // with empty tokens stripped. Need to be defensive — VSiN tweaks markup
  // periodically.
  const parseRow = (text: string): { teamName: string; cells: string[] } | null => {
    const cells = text.split('|').map((s) => s.trim()).filter((s) => s.length > 0);
    if (cells.length < 9) return null;
    // The team name is the first cell that's NOT a digit/icon/reload character.
    let teamIdx = -1;
    for (let i = 0; i < Math.min(cells.length, 5); i++) {
      const c = cells[i];
      if (/^[A-Z]/.test(c) && /[a-z]/.test(c) && c.length > 3) { teamIdx = i; break; }
    }
    if (teamIdx < 0) return null;
    const teamName = cells[teamIdx];
    return { teamName, cells: cells.slice(teamIdx + 1) };
  };

  const out: VsinSplit[] = [];
  for (let i = 0; i + 1 < dataRows.length; i++) {
    const awayParsed = parseRow(dataRows[i]);
    const homeParsed = parseRow(dataRows[i + 1]);
    if (!awayParsed || !homeParsed) continue;

    const a = awayParsed.cells;
    const h = homeParsed.cells;

    // Expected post-team-name layout:
    //   [0] spread line
    //   [1] spread handle %
    //   [2] spread bets %
    //   [3] total line
    //   [4] total handle %
    //   [5] total bets %
    //   [6] ml price
    //   [7] ml handle %
    //   [8] ml bets %
    // Some columns have arrows (▲ ▼) appended; pctNum + priceNum still extract.
    const split: VsinSplit = {
      league: leagueLabel,
      homeTeam: homeParsed.teamName,
      awayTeam: awayParsed.teamName,
      homeSpreadLine: lineNum(h[0]),
      awaySpreadLine: lineNum(a[0]),
      homeSpreadHandlePct: pctNum(h[1]),
      homeSpreadBetsPct: pctNum(h[2]),
      totalLine: lineNum(a[3]),
      overHandlePct: pctNum(a[4]),
      overBetsPct: pctNum(a[5]),
      awayMlPrice: priceNum(a[6]),
      homeMlPrice: priceNum(h[6]),
      awayMlHandlePct: pctNum(a[7]),
      awayMlBetsPct: pctNum(a[8]),
      homeMlHandlePct: pctNum(h[7]),
      homeMlBetsPct: pctNum(h[8]),
      refreshedAt: new Date().toISOString(),
    };

    // Skip if we got nothing useful — protects against header/spacer rows.
    if (
      split.homeSpreadHandlePct == null &&
      split.overHandlePct == null &&
      split.homeMlPrice == null
    ) continue;

    out.push(split);
    i++; // advance past the home row we already consumed
  }

  return out;
}

async function persist(splits: VsinSplit[]): Promise<number> {
  if (!hasDatabase() || splits.length === 0) return 0;
  await ensureSchema();
  let n = 0;
  for (const s of splits) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO vsin_betting_splits (
            league, home_team, away_team,
            home_spread_handle_pct, home_spread_bets_pct,
            home_spread_line, away_spread_line,
            over_handle_pct, over_bets_pct, total_line,
            home_ml_handle_pct, home_ml_bets_pct,
            away_ml_handle_pct, away_ml_bets_pct,
            home_ml_price, away_ml_price, refreshed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
         ON CONFLICT (league, home_team, away_team) DO UPDATE SET
            home_spread_handle_pct = EXCLUDED.home_spread_handle_pct,
            home_spread_bets_pct = EXCLUDED.home_spread_bets_pct,
            home_spread_line = EXCLUDED.home_spread_line,
            away_spread_line = EXCLUDED.away_spread_line,
            over_handle_pct = EXCLUDED.over_handle_pct,
            over_bets_pct = EXCLUDED.over_bets_pct,
            total_line = EXCLUDED.total_line,
            home_ml_handle_pct = EXCLUDED.home_ml_handle_pct,
            home_ml_bets_pct = EXCLUDED.home_ml_bets_pct,
            away_ml_handle_pct = EXCLUDED.away_ml_handle_pct,
            away_ml_bets_pct = EXCLUDED.away_ml_bets_pct,
            home_ml_price = EXCLUDED.home_ml_price,
            away_ml_price = EXCLUDED.away_ml_price,
            refreshed_at = NOW()`,
        s.league, s.homeTeam, s.awayTeam,
        s.homeSpreadHandlePct, s.homeSpreadBetsPct,
        s.homeSpreadLine, s.awaySpreadLine,
        s.overHandlePct, s.overBetsPct, s.totalLine,
        s.homeMlHandlePct, s.homeMlBetsPct,
        s.awayMlHandlePct, s.awayMlBetsPct,
        s.homeMlPrice, s.awayMlPrice,
      );
      n++;
    } catch (err) {
      console.error('[vsin] upsert failed', s.league, s.homeTeam, err);
    }
  }
  return n;
}

export interface RefreshResult {
  scanned: number;
  persisted: number;
  byLeague: Record<string, number>;
  pruned: number;
}

export async function refreshVsinSplits(): Promise<RefreshResult> {
  const out: RefreshResult = { scanned: 0, persisted: 0, byLeague: {}, pruned: 0 };
  for (const [label, key] of Object.entries(VSIN_LEAGUES)) {
    try {
      const splits = await scrapeOneLeague(key, label);
      out.scanned += splits.length;
      out.byLeague[label] = splits.length;
      const n = await persist(splits);
      out.persisted += n;
    } catch (err) {
      console.error('[vsin] league scrape failed', label, err);
    }
  }

  // 2026-06-04 prune stale rows. Anything not refreshed in the last 48 hours
  // is no longer on a VSiN page — either the game's done or the page rolled
  // forward. Drop these so off-season NFL futures (etc.) don't accumulate.
  if (hasDatabase()) {
    try {
      const res: any = await prisma.$executeRawUnsafe(
        `DELETE FROM vsin_betting_splits WHERE refreshed_at < NOW() - INTERVAL '48 hours'`,
      );
      out.pruned = typeof res === 'number' ? res : 0;
    } catch { /* non-fatal */ }
  }

  return out;
}

// Loose team-name match: case-insensitive substring on either column. VSiN uses
// "San Diego Padres", ESPN uses "San Diego Padres" too — should be 1:1 for the
// majors. Fall back to includes() for college-team mismatches.
function teamsMatch(vsinName: string, target: string): boolean {
  if (!vsinName || !target) return false;
  const a = vsinName.toLowerCase().trim();
  const b = target.toLowerCase().trim();
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

// Lookup the most recent VsinSplit for a given matchup. Returns null when we
// don't have data (game not on a VSiN board, or scrape hasn't run yet today).
export async function getVsinSplit(league: string, homeTeam: string, awayTeam: string): Promise<VsinSplit | null> {
  if (!hasDatabase()) return null;
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM vsin_betting_splits WHERE league = $1`,
      league,
    );
    for (const r of rows) {
      if (teamsMatch(r.home_team, homeTeam) && teamsMatch(r.away_team, awayTeam)) {
        return {
          league: r.league,
          homeTeam: r.home_team,
          awayTeam: r.away_team,
          homeSpreadHandlePct: r.home_spread_handle_pct == null ? null : Number(r.home_spread_handle_pct),
          homeSpreadBetsPct: r.home_spread_bets_pct == null ? null : Number(r.home_spread_bets_pct),
          homeSpreadLine: r.home_spread_line == null ? null : Number(r.home_spread_line),
          awaySpreadLine: r.away_spread_line == null ? null : Number(r.away_spread_line),
          overHandlePct: r.over_handle_pct == null ? null : Number(r.over_handle_pct),
          overBetsPct: r.over_bets_pct == null ? null : Number(r.over_bets_pct),
          totalLine: r.total_line == null ? null : Number(r.total_line),
          homeMlHandlePct: r.home_ml_handle_pct == null ? null : Number(r.home_ml_handle_pct),
          homeMlBetsPct: r.home_ml_bets_pct == null ? null : Number(r.home_ml_bets_pct),
          awayMlHandlePct: r.away_ml_handle_pct == null ? null : Number(r.away_ml_handle_pct),
          awayMlBetsPct: r.away_ml_bets_pct == null ? null : Number(r.away_ml_bets_pct),
          homeMlPrice: r.home_ml_price == null ? null : Number(r.home_ml_price),
          awayMlPrice: r.away_ml_price == null ? null : Number(r.away_ml_price),
          refreshedAt: new Date(r.refreshed_at).toISOString(),
        };
      }
    }
  } catch (err) {
    console.error('[vsin] lookup failed', err);
  }
  return null;
}

// Derived: which side has the sharp money? Sharp = handle% > bets% by a margin.
// Returns { side, intensity } where intensity 1-3 reflects the magnitude of the
// money/bets gap (10+, 20+, 30+ pts).
export function deriveSharpSideFromVsin(split: VsinSplit | null): {
  mlSharp: 'home' | 'away' | null; mlConfidence: number;
  spreadSharp: 'home' | 'away' | null; spreadConfidence: number;
} {
  if (!split) return { mlSharp: null, mlConfidence: 0, spreadSharp: null, spreadConfidence: 0 };
  let mlSharp: 'home' | 'away' | null = null;
  let mlConfidence = 0;
  if (split.homeMlHandlePct != null && split.homeMlBetsPct != null
    && split.awayMlHandlePct != null && split.awayMlBetsPct != null) {
    const homeGap = split.homeMlHandlePct - split.homeMlBetsPct;
    const awayGap = split.awayMlHandlePct - split.awayMlBetsPct;
    if (homeGap >= 10 && awayGap < 5) { mlSharp = 'home'; mlConfidence = Math.min(100, 50 + homeGap * 2); }
    else if (awayGap >= 10 && homeGap < 5) { mlSharp = 'away'; mlConfidence = Math.min(100, 50 + awayGap * 2); }
    else if (Math.abs(homeGap) > Math.abs(awayGap)) { mlSharp = homeGap > 0 ? 'home' : 'away'; mlConfidence = Math.min(100, 30 + Math.abs(homeGap)); }
    else { mlSharp = awayGap > 0 ? 'away' : 'home'; mlConfidence = Math.min(100, 30 + Math.abs(awayGap)); }
  }
  let spreadSharp: 'home' | 'away' | null = null;
  let spreadConfidence = 0;
  if (split.homeSpreadHandlePct != null && split.homeSpreadBetsPct != null) {
    const homeGap = split.homeSpreadHandlePct - split.homeSpreadBetsPct;
    if (homeGap >= 10) { spreadSharp = 'home'; spreadConfidence = Math.min(100, 50 + homeGap * 2); }
    else if (homeGap <= -10) { spreadSharp = 'away'; spreadConfidence = Math.min(100, 50 + Math.abs(homeGap) * 2); }
  }
  return { mlSharp, mlConfidence, spreadSharp, spreadConfidence };
}
