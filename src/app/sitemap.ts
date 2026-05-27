import { MetadataRoute } from 'next';
import { SITE_URL, matchupPath } from '@/lib/seo';
import { getOrComputeBoard } from '@/services/dailyBoardCache';

// Sitemap is generated on request and includes:
//  1. The static page list (homepage, sport landings, edge tools, etc.)
//  2. EVERY matchup URL on tonight's slate (/picks/[league]/[matchup-slug]) so Google
//     crawls each game's unique page and indexes the long-tail "[team] vs [team] picks"
//     queries we're targeting.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Pages keyed by their search-and-engagement priority. Picks-related pages get top
  // priority because that's the conversion path; legal and contact get the floor.
  const pages: Array<{ path: string; priority: number; changeFrequency?: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
    // Home + main picks board
    { path: '',                       priority: 1.0,  changeFrequency: 'daily' },
    { path: '/picks',                 priority: 0.95, changeFrequency: 'hourly' },

    // Edge tools (new this build)
    { path: '/asleep',                priority: 0.9,  changeFrequency: 'daily' },
    { path: '/edges',                 priority: 0.9,  changeFrequency: 'daily' },
    { path: '/trends',                priority: 0.9,  changeFrequency: 'daily' },
    { path: '/value',                 priority: 0.85, changeFrequency: 'daily' },

    // Product tiles
    { path: '/grand-slam',            priority: 0.9,  changeFrequency: 'daily' },
    { path: '/pressure-pack',         priority: 0.9,  changeFrequency: 'daily' },
    { path: '/vip-picks',             priority: 0.9,  changeFrequency: 'daily' },
    { path: '/parlay-plan',           priority: 0.9,  changeFrequency: 'daily' },
    { path: '/hailmary',              priority: 0.7,  changeFrequency: 'daily' },
    { path: '/overnight',             priority: 0.7,  changeFrequency: 'daily' },
    { path: '/himothy-picks',         priority: 0.7,  changeFrequency: 'daily' },
    { path: '/big-games',             priority: 0.7,  changeFrequency: 'daily' },
    { path: '/nrfi',                  priority: 0.7,  changeFrequency: 'daily' },

    // Board variants (each is its own SEO landing for that sport category)
    { path: '/picks?board=soccer',    priority: 0.85, changeFrequency: 'daily' },
    { path: '/picks?board=tennis',    priority: 0.85, changeFrequency: 'daily' },
    { path: '/picks?board=combat',    priority: 0.85, changeFrequency: 'daily' },
    { path: '/picks?board=individual',priority: 0.85, changeFrequency: 'daily' },
    { path: '/picks?board=racing',    priority: 0.8,  changeFrequency: 'daily' },
    { path: '/picks?board=global',    priority: 0.8,  changeFrequency: 'daily' },

    // Sport-specific landings (long-tail SEO targets)
    { path: '/nba-picks-today',       priority: 0.85, changeFrequency: 'daily' },
    { path: '/mlb-picks',             priority: 0.85, changeFrequency: 'daily' },
    { path: '/mlb-f5-picks',          priority: 0.85, changeFrequency: 'daily' },
    { path: '/ncaa-basketball-picks', priority: 0.8,  changeFrequency: 'daily' },
    { path: '/wnba-player-props',     priority: 0.85, changeFrequency: 'daily' },
    { path: '/kbo-picks-today',       priority: 0.8,  changeFrequency: 'daily' },
    { path: '/best-parlay-picks',     priority: 0.85, changeFrequency: 'daily' },
    { path: '/sports-picks-today',    priority: 0.85, changeFrequency: 'daily' },
    // Geo landing (Missouri legalized Dec 2025 — fresh keyword pocket)
    { path: '/missouri-sports-picks', priority: 0.8,  changeFrequency: 'daily' },

    // Results / transparency — important for trust + search
    { path: '/results',               priority: 0.9,  changeFrequency: 'daily' },
    { path: '/results-history',       priority: 0.8,  changeFrequency: 'daily' },
    { path: '/results-archive',       priority: 0.7,  changeFrequency: 'weekly' },
    { path: '/picks/archive',         priority: 0.7,  changeFrequency: 'weekly' },
    { path: '/stats',                 priority: 0.8,  changeFrequency: 'daily' },
    { path: '/transparency',          priority: 0.7,  changeFrequency: 'weekly' },

    // Live + scores
    { path: '/live-sports-board',     priority: 0.8,  changeFrequency: 'hourly' },
    { path: '/scores',                priority: 0.75, changeFrequency: 'hourly' },

    // Brand / info pages
    { path: '/how-it-works',          priority: 0.7,  changeFrequency: 'monthly' },
    { path: '/about',                 priority: 0.6,  changeFrequency: 'monthly' },
    { path: '/pricing',               priority: 0.8,  changeFrequency: 'weekly' },
    { path: '/contact',               priority: 0.5,  changeFrequency: 'monthly' },

    // Legal
    { path: '/terms',                 priority: 0.3,  changeFrequency: 'yearly' },
    { path: '/privacy',               priority: 0.3,  changeFrequency: 'yearly' },
  ];

  const staticEntries = pages.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));

  // Dynamic per-matchup URLs from tonight's slate. Each game on the board becomes its own
  // SEO landing at /picks/[league]/[matchup-slug]. Failure is non-fatal — the sitemap
  // still ships with the static entries.
  const matchupEntries: MetadataRoute.Sitemap = [];
  try {
    const boards: Array<'north-american' | 'soccer' | 'tennis' | 'combat' | 'global'> = [
      'north-american', 'soccer', 'tennis', 'combat', 'global',
    ];
    for (const b of boards) {
      try {
        const data = await getOrComputeBoard(b);
        const buckets = [
          data?.grandSlam,
          ...(data?.pressurePack || []),
          ...(data?.vip4Pack || []),
          ...(data?.parlayPlan || []),
          ...(data?.marquee || []),
          ...(data?.asleepPicks || []),
        ].filter(Boolean);
        for (const p of buckets) {
          if (!p?.homeTeam?.name || !p?.awayTeam?.name || !p?.league) continue;
          const path = matchupPath(p.league, p.awayTeam.name, p.homeTeam.name);
          matchupEntries.push({
            url: `${SITE_URL}${path}`,
            lastModified: now,
            changeFrequency: 'hourly',
            priority: 0.9,
          });
        }
      } catch { /* board fetch failed — skip */ }
    }
  } catch { /* dynamic step failed — keep going with static entries only */ }

  return [...staticEntries, ...matchupEntries];
}
