import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { MlbSeoContent } from "@/components/SportSeoContent";
import { pageMeta } from "@/lib/seo";
import { Target } from "lucide-react";

export const metadata = pageMeta({
  title: "MLB Picks Today — Free Run Line, F5, NRFI & Total Plays",
  description: "Today's full MLB slate analyzed: moneyline, run line, totals, F5 (first 5 innings), NRFI, and player prop picks. Multi-book best prices, pitcher matchups, weather, ATS L10 tendencies.",
  path: "/mlb-picks",
  keywords: [
    "mlb picks today", "free mlb picks", "mlb run line picks", "mlb f5 picks",
    "first five innings picks", "nrfi picks today", "mlb over under picks",
    "mlb player props", "mlb predictions", "best mlb picks tonight",
  ],
});

export default function MLBPicksPage() {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  return (
    <PicksPageTemplate
      sport="MLB"
      title={`MLB Picks – ${today}`}
      subtitle="Deep-dive baseball analytics. Pitcher efficiency, bullpen usage, and weather-adjusted market entries."
      badge="MLB Data"
      icon={<Target className="w-9 h-9 text-blue-500" />}
      backHref="/picks"
      backLabel="All Picks"
      accentNote="⚾ MLB Focus: Pitch-by-pitch modeling and stadium-specific environmental factors."
      seoContent={<MlbSeoContent />}
    />
  );
}
