// MLB UMPIRE SCORECARD INTEGRATION
//
// Free crowdsourced ump data. The home-plate umpire has measurable impact on
// MLB totals:
//   - Tight zones → more BBs, fewer Ks, higher scoring
//   - Wide zones → more Ks, fewer BBs, lower scoring
//   - Calls in favor of one team's hitters can shift run expectancy
//
// Source: umpirescorecard.com — per-umpire pages list recent-game accuracy,
// consistency, and favored-team direction. We scrape those, store rolling
// averages in Postgres `UmpireTendency`, and reuse the persisted row for ~14
// days before refreshing.

import { LEAGUE_URLS } from '@/lib/validation';
import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';

export interface UmpireTendency {
  umpName: string | null;
  totalsLean: 'over' | 'under' | 'neutral';
  sample: number;
  runsLeanPerGame: number | null;
  accuracyPct: number | null;
  source: 'umpirescorecard' | 'espn-summary' | 'unavailable';
}

const mem = new Map<string, { data: UmpireTendency | null; at: number }>();
const TTL_MS = 60 * 60 * 1000;             // 1h for game-level lookups
const ROW_REFRESH_MS = 14 * 24 * 60 * 60 * 1000; // 14d before re-scraping a persisted ump

async function fetchEspnUmp(gameId: string): Promise<string | null> {
  const baseUrl = LEAGUE_URLS['MLB'];
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/summary?event=${gameId}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const d = await res.json();
    const officials = d?.gameInfo?.officials || d?.header?.competitions?.[0]?.officials || [];
    if (!Array.isArray(officials)) return null;
    const plate = officials.find((o: any) => {
      const pos = String(o?.position?.displayName || o?.position?.name || '').toLowerCase();
      return pos.includes('home plate') || pos === 'home';
    }) || officials[0];
    return plate?.displayName || plate?.fullName || plate?.name || null;
  } catch { return null; }
}

// Scrape umpirescorecard.com per-umpire page. Their HTML exposes recent-game
// stats in a roughly table-shaped layout; we extract numeric tendencies via
// regex rather than a full DOM parse to stay deployment-friendly (no jsdom in
// the bundle). If their markup changes the function returns null and we fall
// back to neutral.
async function scrapeUmpScorecard(umpName: string): Promise<{
  accuracyPct: number | null;
  consistencyPct: number | null;
  runsLeanPerGame: number | null;
  sampleSize: number;
} | null> {
  // The site routes by URL-encoded full name on the /umpires/{name} path.
  // Their canonical slug lowercases and dash-joins; fall back to %20 encoding
  // if the dashed form 404s.
  const slug = umpName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const candidates = [
    `https://umpscorecards.com/single_umpire/?umpire=${encodeURIComponent(umpName)}`,
    `https://www.umpirescorecard.com/umpires/${slug}`,
    `https://umpirescorecard.com/umpires/${slug}`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      if (!res.ok) continue;
      const html = await res.text();
      // Extract: "Accuracy: 93.5%" / "Consistency: 95.2%" / sample = N games
      const acc = /accuracy[^0-9]{0,20}([0-9]{1,3}\.[0-9])\s*%/i.exec(html);
      const cons = /consistency[^0-9]{0,20}([0-9]{1,3}\.[0-9])\s*%/i.exec(html);
      const games = /(\d{1,4})\s*games\b/i.exec(html);
      // Runs above expected (per their "Favor" / "Run impact" lines)
      const runs = /run[^a-z]{0,12}(?:impact|favor)[^-0-9]{0,20}(-?[0-9]\.[0-9]{1,2})/i.exec(html);
      if (!acc && !cons && !games) continue;
      return {
        accuracyPct: acc ? Number(acc[1]) : null,
        consistencyPct: cons ? Number(cons[1]) : null,
        runsLeanPerGame: runs ? Number(runs[1]) : null,
        sampleSize: games ? Number(games[1]) : 0,
      };
    } catch { /* try next candidate */ }
  }
  return null;
}

function leanFromRuns(runsLeanPerGame: number | null, sampleSize: number): 'over' | 'under' | 'neutral' {
  if (runsLeanPerGame == null || sampleSize < 5) return 'neutral';
  if (runsLeanPerGame >= 0.4) return 'over';
  if (runsLeanPerGame <= -0.4) return 'under';
  return 'neutral';
}

async function loadOrRefreshPersisted(umpName: string): Promise<UmpireTendency | null> {
  if (!hasDatabase()) return null;
  try {
    const existing = await prisma.$queryRawUnsafe<Array<{
      umpName: string; sampleSize: number; totalsLean: string;
      runsLeanPerGame: number | null; accuracyPct: number | null;
      lastRefreshed: Date;
    }>>(
      `SELECT "umpName", "sampleSize", "totalsLean", "runsLeanPerGame", "accuracyPct", "lastRefreshed"
       FROM "UmpireTendency" WHERE "umpName" = $1 LIMIT 1`,
      umpName,
    );
    const fresh = existing[0] && (Date.now() - new Date(existing[0].lastRefreshed).getTime()) < ROW_REFRESH_MS;
    if (fresh) {
      return {
        umpName: existing[0].umpName,
        totalsLean: existing[0].totalsLean as any,
        sample: existing[0].sampleSize,
        runsLeanPerGame: existing[0].runsLeanPerGame,
        accuracyPct: existing[0].accuracyPct,
        source: 'umpirescorecard',
      };
    }
    // Stale or missing — re-scrape.
    const scraped = await scrapeUmpScorecard(umpName);
    if (!scraped) {
      // Keep existing stale row alive (better than nothing) but don't touch timestamp.
      if (existing[0]) {
        return {
          umpName: existing[0].umpName,
          totalsLean: existing[0].totalsLean as any,
          sample: existing[0].sampleSize,
          runsLeanPerGame: existing[0].runsLeanPerGame,
          accuracyPct: existing[0].accuracyPct,
          source: 'umpirescorecard',
        };
      }
      return null;
    }
    const totalsLean = leanFromRuns(scraped.runsLeanPerGame, scraped.sampleSize);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "UmpireTendency" ("id","umpName","sampleSize","runsLeanPerGame","accuracyPct","totalsLean","source","lastRefreshed","updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'umpirescorecard.com', NOW(), NOW())
       ON CONFLICT ("umpName") DO UPDATE SET
         "sampleSize" = EXCLUDED."sampleSize",
         "runsLeanPerGame" = EXCLUDED."runsLeanPerGame",
         "accuracyPct" = EXCLUDED."accuracyPct",
         "totalsLean" = EXCLUDED."totalsLean",
         "lastRefreshed" = NOW(),
         "updatedAt" = NOW()`,
      umpName, scraped.sampleSize, scraped.runsLeanPerGame, scraped.accuracyPct, totalsLean,
    );
    return {
      umpName, totalsLean, sample: scraped.sampleSize,
      runsLeanPerGame: scraped.runsLeanPerGame,
      accuracyPct: scraped.accuracyPct,
      source: 'umpirescorecard',
    };
  } catch {
    return null;
  }
}

// Public API.
export async function getUmpireTendency(gameId: string): Promise<UmpireTendency | null> {
  const k = `mlb:${gameId}`;
  const cached = mem.get(k);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;
  const name = await fetchEspnUmp(gameId);
  if (!name) {
    mem.set(k, { data: null, at: Date.now() });
    return null;
  }
  const persisted = await loadOrRefreshPersisted(name);
  if (persisted) {
    mem.set(k, { data: persisted, at: Date.now() });
    return persisted;
  }
  // No persisted row, no scrape — return the ump name with neutral lean so
  // admin can at least see who's behind the plate.
  const fallback: UmpireTendency = {
    umpName: name, totalsLean: 'neutral', sample: 0,
    runsLeanPerGame: null, accuracyPct: null,
    source: 'espn-summary',
  };
  mem.set(k, { data: fallback, at: Date.now() });
  return fallback;
}
