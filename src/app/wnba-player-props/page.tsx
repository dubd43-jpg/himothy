import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { WnbaPropsSeoContent } from "@/components/SportSeoContent";
import { pageMeta } from "@/lib/seo";
import { Target } from "lucide-react";

export const metadata = pageMeta({
  title: "WNBA Player Props Today — Points, Rebounds, Assists, Threes",
  description: "Today's WNBA player prop picks: points, rebounds, assists, threes, steals. Alt-line ladders, multi-book best prices, last-5 streak data, top-star props daily.",
  path: "/wnba-player-props",
  keywords: [
    "wnba player props today", "wnba props", "caitlin clark props", "a'ja wilson props",
    "wnba points prop", "wnba rebounds prop", "wnba assists prop", "wnba threes prop",
    "wnba picks today", "free wnba player props",
  ],
});

export default function WnbaPlayerPropsPage() {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return (
    <PicksPageTemplate
      sport="WNBA"
      title={`WNBA Player Props – ${today}`}
      subtitle="Every WNBA game tonight, every player prop ladder, every book's best price. Daily Caitlin Clark, A'ja Wilson, Ionescu, and the full slate."
      badge="WNBA Props"
      icon={<Target className="w-9 h-9 text-orange-400" />}
      backHref="/picks"
      backLabel="All Picks"
      accentNote="🏀 WNBA Edge: Softer prop pricing than NBA — alt ladders surface real value steps every night."
      seoContent={<WnbaPropsSeoContent />}
    />
  );
}
