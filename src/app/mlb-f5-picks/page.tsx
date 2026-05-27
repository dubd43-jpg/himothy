import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { F5SeoContent } from "@/components/SportSeoContent";
import { pageMeta } from "@/lib/seo";
import { Target } from "lucide-react";

export const metadata = pageMeta({
  title: "MLB F5 Picks Today — First 5 Innings Totals, Spread, ML",
  description: "Today's MLB First 5 Innings (F5) picks. Isolate the starting pitcher matchup, skip bullpen variance. F5 totals, run lines, moneylines.",
  path: "/mlb-f5-picks",
  keywords: [
    "mlb f5 picks", "first 5 innings picks", "mlb first five innings", "f5 picks today",
    "mlb f5 total", "mlb f5 run line", "first 5 innings betting", "mlb f5 predictions",
    "starting pitcher picks", "mlb pitcher props",
  ],
});

export default function MlbF5PicksPage() {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return (
    <PicksPageTemplate
      sport="MLB"
      title={`MLB F5 Picks – ${today}`}
      subtitle="First 5 innings only. Isolate the starting pitcher matchup. Bullpen variance removed. The sharpest baseball angle nobody&apos;s playing."
      badge="F5 Strategy"
      icon={<Target className="w-9 h-9 text-blue-400" />}
      backHref="/mlb-picks"
      backLabel="All MLB Picks"
      accentNote="⚾ F5 Edge: Removes bullpen meltdowns — pure starter-vs-starter math at smaller juice."
      seoContent={<F5SeoContent />}
    />
  );
}
