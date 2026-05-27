import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { KboSeoContent } from "@/components/SportSeoContent";
import { pageMeta } from "@/lib/seo";
import { Target } from "lucide-react";

export const metadata = pageMeta({
  title: "KBO Picks Today — Korean Baseball Plays For US Bettors",
  description: "Today's KBO picks: moneyline, run line, totals, and player props for every game. Soft US markets, sharp F5 pitcher angles, multi-book best prices.",
  path: "/kbo-picks-today",
  keywords: [
    "kbo picks today", "korean baseball picks", "kbo predictions", "kbo run line picks",
    "kbo total picks", "kbo over under", "free kbo picks", "kbo betting today",
    "korean baseball plays", "kbo first 5 innings",
  ],
});

export default function KboPicksTodayPage() {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return (
    <PicksPageTemplate
      sport="KBO"
      title={`KBO Picks – ${today}`}
      subtitle="Korean baseball plays for US night-owl bettors. Softer markets, sharper edges, multi-book best prices on every line."
      badge="KBO Coverage"
      icon={<Target className="w-9 h-9 text-rose-400" />}
      backHref="/picks"
      backLabel="All Picks"
      accentNote="⚾ KBO Edge: US books carry thin liquidity here — line inefficiencies stay open longer than MLB."
      seoContent={<KboSeoContent />}
    />
  );
}
