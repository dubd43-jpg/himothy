import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { NbaSeoContent } from "@/components/SportSeoContent";
import { pageMeta } from "@/lib/seo";
import { Trophy } from "lucide-react";

export const metadata = pageMeta({
  title: "NBA Picks Today — Free Daily NBA Plays, ATS & Player Props",
  description: "Tonight's NBA slate: moneyline, spread, total, and player prop picks for every game. Multi-book best prices, ATS L10 tendencies, alt prop ladders.",
  path: "/nba-picks-today",
  keywords: [
    "nba picks today", "free nba picks", "nba ats picks", "nba spread picks",
    "nba over under picks", "nba player props today", "nba parlay picks",
    "nba predictions", "best nba picks tonight",
  ],
});

export default function NBAPicksTodayPage() {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' });

  return (
    <PicksPageTemplate
      sport="NBA"
      title={`NBA Picks – ${today}`}
      subtitle="Complete coverage of tonight's NBA slate. Every game analyzed via roster-verified decision logs."
      badge="NBA Coverage"
      icon={<Trophy className="w-9 h-9 text-primary" />}
      backHref="/picks"
      backLabel="All Picks"
      accentNote="🏀 NBA Analysis: We monitor minute-by-minute injury reports and official roster moves."
      seoContent={<NbaSeoContent />}
    />
  );
}
