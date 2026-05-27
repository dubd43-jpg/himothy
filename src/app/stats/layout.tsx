import { pageMeta } from '@/lib/seo';

export const metadata = pageMeta({
  title: "HIMOTHY Picks Record & Stats — Verified Performance",
  description: "The full verified record. Lifetime W/L by category, parlay-by-leg breakdown, win rate by odds bucket, hottest SGP themes. No fluff, no fake history — just every graded pick from day one.",
  path: "/stats",
  keywords: [
    "sports picks record", "verified picks record", "parlay win rate",
    "ats record", "sports capper stats", "real betting record",
  ],
});

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
