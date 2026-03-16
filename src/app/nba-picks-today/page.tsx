import { Metadata } from "next";
import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { Trophy } from "lucide-react";

export const metadata: Metadata = {
  title: "NBA Picks Today | Sharp NBA Betting & Predictions | HIMOTHY",
  description: "Get the best NBA picks today from HIMOTHY's decision engine. Advanced roster-verified analysis for every NBA game on the slate.",
  keywords: ["NBA picks", "NBA picks today", "NBA betting", "NBA predictions", "sharp NBA plays"],
};

export default function NBAPicksTodayPage() {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  
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
    />
  );
}
