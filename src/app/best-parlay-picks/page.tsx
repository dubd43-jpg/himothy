import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { ParlaySeoContent } from "@/components/SportSeoContent";
import { pageMeta } from "@/lib/seo";
import { BarChart3 } from "lucide-react";

export const metadata = pageMeta({
  title: "Best Parlay Picks Today — Parlay Plan, Power of Parlays",
  description: "Today's strategic parlay picks built on real math. The $10 Parlay Plan, Power of Parlays heavy-chalk stack, and Power 10 daily. Legs capped at -450.",
  path: "/best-parlay-picks",
  keywords: [
    "best parlay picks", "best parlays today", "daily parlay picks", "$10 parlay",
    "parlay of the day", "sgp picks", "same game parlay", "power 20 parlay",
    "parlay strategy", "free parlay picks today",
  ],
});

export default function BestParlayPicksPage() {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' });

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
      seoContent={<ParlaySeoContent />}
    />
  );
}
