import { Metadata } from "next";
import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { BarChart3 } from "lucide-react";

export const metadata: Metadata = {
  title: "Best Parlay Picks | Daily High-Value Parlays | HIMOTHY",
  description: "Find the best parlay picks today. Strategic multi-leg tickets built on cumulative edge advantage and bankroll management.",
  keywords: ["best parlay picks", "daily parlay", "high value parlays", "parlay predictions", "sports parlay picks"],
};

export default function BestParlayPicksPage() {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  return (
    <PicksPageTemplate
      category="PARLAY_PLAN"
      title={`Best Parlays – ${today}`}
      subtitle="Strategic multi-leg tickets built on cumulative edge. Turning small stakes into serious bankroll moves."
      badge="Parlay Strategy"
      icon={<BarChart3 className="w-9 h-9 text-emerald-500" />}
      backHref="/picks"
      backLabel="All Picks"
      accentNote="📈 Parlay Logic: We only combine plays where the correlated edge exceeds the market price."
    />
  );
}
