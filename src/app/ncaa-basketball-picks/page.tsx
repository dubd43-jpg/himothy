import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { NcaaBasketballSeoContent } from "@/components/SportSeoContent";
import { pageMeta } from "@/lib/seo";
import { Zap } from "lucide-react";

export const metadata = pageMeta({
  title: "College Basketball Picks Today — NCAAB ATS, Total & ML",
  description: "Today's NCAAB slate: spread, moneyline, and total picks for every D-I game. Pace-adjusted analytics, ATS L10 tendencies, multi-book best prices.",
  path: "/ncaa-basketball-picks",
  keywords: [
    "ncaa basketball picks", "college basketball picks today", "ncaab picks",
    "cbb picks", "march madness picks", "college basketball predictions",
    "ncaab ats picks", "college hoops picks today", "ncaab spread picks",
  ],
});

export default function NCAABasketBallPicksPage() {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' });

  return (
    <PicksPageTemplate
      sport="CBB"
      title={`CBB Picks – ${today}`}
      subtitle="High-volume college hoops analysis. We track line movement and roster changes across every conference."
      badge="College Hoops"
      icon={<Zap className="w-9 h-9 text-orange-500" />}
      backHref="/picks"
      backLabel="All Picks"
      accentNote="🔥 CBB Edge: High-variance markets where our model identifies massive efficiency gaps."
      seoContent={<NcaaBasketballSeoContent />}
    />
  );
}
