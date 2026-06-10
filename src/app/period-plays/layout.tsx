import { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Period Plays — 1H, Q1, F5 Totals",
  description: "Daily 1st half, 1st quarter, and MLB F5 totals. Different math than full-game totals — bullpen, late-game variance, and starter-only innings change the picture.",
  path: "/period-plays",
});

export default function PeriodPlaysLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
