import { Metadata } from 'next';
import { cache } from 'react';
import { absoluteUrl, pageMeta, sportsEventJsonLd, breadcrumbsJsonLd, matchupPath } from '@/lib/seo';
import { getOrComputeBoard } from '@/services/dailyBoardCache';

// Server-side data fetch + metadata for each /pick/[gameId] page. This is the SEO
// powerhouse: every matchup gets a unique title ("Dodgers vs Rockies Picks Today"),
// unique description ("Take Dodgers -1.5 at -110 — 7-3 ATS L10..."), unique OG image
// (dynamically rendered via /api/og), and structured data (SportsEvent + breadcrumbs).
//
// Google indexes each pick page as its own landing for that matchup.

type DeepPick = any;

function findPickInBoards(gameId: string, boards: DeepPick[]): DeepPick | null {
  for (const data of boards) {
    if (!data) continue;
    const candidates: any[] = [
      data.grandSlam,
      ...(data.pressurePack || []),
      ...(data.vip4Pack || []),
      ...(data.parlayPlan || []),
      ...(data.marquee || []),
      ...(data.asleepPicks || []),
    ];
    for (const p of candidates) {
      if (p && String(p.gameId) === String(gameId)) return p;
    }
  }
  return null;
}

// Only check the NA board for metadata. Scanning every board sequentially was making
// the breakdown page take 20+ seconds to first paint. Wrapped in React.cache so the
// metadata call and the layout's default export share one fetch per request — not two.
const fetchPickForMetadata = cache(async (gameId: string): Promise<DeepPick | null> => {
  try {
    const data = await getOrComputeBoard('north-american');
    return findPickInBoards(gameId, [data]);
  } catch { return null; }
});

export async function generateMetadata({ params }: { params: { gameId: string } }): Promise<Metadata> {
  const pick = await fetchPickForMetadata(params.gameId);
  if (!pick) {
    return pageMeta({
      title: 'Pick Breakdown',
      description: 'Real-line value, recent trends, sharp money, and the full reasoning behind tonight\'s pick.',
      path: `/pick/${params.gameId}`,
    });
  }
  const home = pick.homeTeam?.name || 'Home';
  const away = pick.awayTeam?.name || 'Away';
  const matchup = `${away} vs ${home}`;
  const title = `${matchup} Picks Today — ${pick.selection}`;
  const oddsStr = pick.odds ? `${pick.odds}` : '';
  const conf = pick.confidenceScore != null ? ` Confidence ${pick.confidenceScore}.` : '';
  const description = `${pick.league} — Our pick: ${pick.selection}${oddsStr ? ` at ${oddsStr}` : ''}. ${matchup} on ${new Date(pick.startTime || Date.now()).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}.${conf} Real reasoning, multi-book best price, recent ATS trends.`;

  // Dynamic OG image for this specific pick — uses the /api/og route.
  const ogParams = new URLSearchParams({
    title: pick.selection || matchup,
    subtitle: `${pick.league} · ${matchup}`,
    odds: oddsStr,
    tag: pick.tier || '',
  });
  const ogImage = `/api/og?${ogParams.toString()}`;

  // Set the canonical to the pretty matchup URL so Google indexes the keyword-rich slug
  // (/picks/mlb/houston-astros-vs-texas-rangers-picks) instead of /pick/[id]. Both URLs
  // serve the same content; the canonical tag tells Google which one is "real."
  const canonicalPath = matchupPath(pick.league || 'sport', away, home);
  return pageMeta({
    title,
    description,
    path: canonicalPath,
    ogImage,
    keywords: [
      `${away} vs ${home} picks`,
      `${away} vs ${home} predictions`,
      `${pick.league} picks today`,
      `${home} picks`,
      `${away} picks`,
      pick.selection,
    ],
  });
}

export default async function PickLayout({ children, params }: { children: React.ReactNode; params: { gameId: string } }) {
  const pick = await fetchPickForMetadata(params.gameId);
  const gameUrl = absoluteUrl(`/pick/${params.gameId}`);

  return (
    <>
      {pick && (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(sportsEventJsonLd({
                name: `${pick.awayTeam?.name || 'Away'} vs ${pick.homeTeam?.name || 'Home'}`,
                startDate: pick.startTime || new Date().toISOString(),
                league: pick.league || 'Sports',
                homeTeam: pick.homeTeam?.name || 'Home',
                awayTeam: pick.awayTeam?.name || 'Away',
                gameUrl,
              })),
            }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(breadcrumbsJsonLd([
                { name: 'Home', path: '/' },
                { name: "Today's Picks", path: '/picks' },
                { name: `${pick.awayTeam?.name || 'Away'} vs ${pick.homeTeam?.name || 'Home'}`, path: `/pick/${params.gameId}` },
              ])),
            }}
          />
        </>
      )}
      {children}
    </>
  );
}
