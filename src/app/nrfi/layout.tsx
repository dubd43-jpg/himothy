import { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "NRFI — No Runs First Inning, MLB",
  description: "Daily NRFI picks. Both starters must have sub-3.50 ERA. Real first-frame math: ERA, WHIP, opposing leadoff on-base rate, and recent 1st-inning scoring tendency.",
  path: "/nrfi",
});

export default function NrfiLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
