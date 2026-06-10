import { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Big Games — Tonight's Headline Matchups",
  description: "Every edge on tonight's playoff, championship, or marquee matchups. Spreads, totals, halves, quarters, team totals, props — every angle on the headline games of the night.",
  path: "/big-games",
});

export default function BigGamesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
