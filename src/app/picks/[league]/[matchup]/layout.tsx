import { Metadata } from "next";
import { cache } from "react";
import {
  absoluteUrl, pageMeta, sportsEventJsonLd, breadcrumbsJsonLd, matchupPath,
} from "@/lib/seo";
import { getOrComputeBoard } from "@/services/dailyBoardCache";
import type { BoardType } from "@/services/deepResearchService";

// Pretty-URL SEO layout. This is the indexable matchup page Google ranks for queries
// like "houston astros vs texas rangers picks" — the gameId page becomes an alias and
// its canonical points here.

type DeepPick = any;

const BOARDS_TO_SEARCH: BoardType[] = ["north-american", "soccer", "tennis", "combat", "global"];

const slugify = (s: string) =>
  (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function findInBoard(d: any, slug: string): DeepPick | null {
  if (!d) return null;
  const candidates: any[] = [
    d.grandSlam,
    ...(d.pressurePack || []),
    ...(d.vip4Pack || []),
    ...(d.parlayPlan || []),
    ...(d.marquee || []),
    ...(d.asleepPicks || []),
  ].filter(Boolean);
  for (const p of candidates) {
    const expected = `${slugify(p.awayTeam?.name)}-vs-${slugify(p.homeTeam?.name)}-picks`;
    if (expected === slug) return p as DeepPick;
  }
  return null;
}

// Wrapped in React.cache so the metadata function and the layout's children share one
// fetch per request (no double-scan). NA-board first (most likely hit), fall through.
const findPickBySlug = cache(async (slug: string): Promise<DeepPick | null> => {
  // Try NA first since most matchups live there.
  try {
    const data = await getOrComputeBoard("north-american");
    const hit = findInBoard(data, slug);
    if (hit) return hit;
  } catch { /* try the rest */ }

  // Fall back to other boards (combat, tennis, etc.)
  for (const b of BOARDS_TO_SEARCH.slice(1)) {
    try {
      const data = await getOrComputeBoard(b);
      const hit = findInBoard(data, slug);
      if (hit) return hit;
    } catch { /* try next */ }
  }
  return null;
});

export async function generateMetadata({ params }: { params: { league: string; matchup: string } }): Promise<Metadata> {
  const pick = await findPickBySlug(params.matchup);
  if (!pick) {
    return pageMeta({
      title: "Matchup Picks Today",
      description: "Daily sports picks, predictions, and betting analysis.",
      path: `/picks/${params.league}/${params.matchup}`,
    });
  }
  const home = pick.homeTeam?.name || "Home";
  const away = pick.awayTeam?.name || "Away";
  const matchup = `${away} vs ${home}`;
  const today = new Date(pick.startTime || Date.now()).toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric",
  });
  const title = `${matchup} Picks & Predictions — ${today}`;
  const oddsStr = pick.odds ? ` at ${pick.odds}` : "";
  const description = `${pick.league} ${matchup} picks today. Our pick: ${pick.selection}${oddsStr}. Full analysis, ATS L10 tendencies, multi-book best prices, alt prop ladders. Real plays, real reasons.`;

  // Dynamic OG image for this matchup
  const ogParams = new URLSearchParams({
    title: pick.selection || matchup,
    subtitle: `${pick.league} · ${matchup}`,
    odds: pick.odds || "",
    tag: pick.tier || "",
  });

  return pageMeta({
    title,
    description,
    path: `/picks/${params.league}/${params.matchup}`,
    ogImage: `/api/og?${ogParams.toString()}`,
    keywords: [
      `${away} vs ${home} picks`,
      `${away} vs ${home} predictions`,
      `${away} ${home} picks today`,
      `${pick.league} picks today`,
      `${home} picks today`,
      `${away} picks today`,
      pick.selection,
    ],
  });
}

export default async function MatchupLayout({
  children, params,
}: { children: React.ReactNode; params: { league: string; matchup: string } }) {
  const pick = await findPickBySlug(params.matchup);
  const url = absoluteUrl(`/picks/${params.league}/${params.matchup}`);

  return (
    <>
      {pick && (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(sportsEventJsonLd({
              name: `${pick.awayTeam?.name || "Away"} vs ${pick.homeTeam?.name || "Home"}`,
              startDate: pick.startTime || new Date().toISOString(),
              league: pick.league || "Sports",
              homeTeam: pick.homeTeam?.name || "Home",
              awayTeam: pick.awayTeam?.name || "Away",
              gameUrl: url,
            })) }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd([
              { name: "Home", path: "/" },
              { name: "Today's Picks", path: "/picks" },
              { name: pick.league || "Sport", path: `/picks?board=north-american` },
              { name: `${pick.awayTeam?.name || "Away"} vs ${pick.homeTeam?.name || "Home"}`,
                path: `/picks/${params.league}/${params.matchup}` },
            ])) }}
          />
        </>
      )}
      {children}
    </>
  );
}
