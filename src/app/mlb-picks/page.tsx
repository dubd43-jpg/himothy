import { Metadata } from "next";
import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { Target } from "lucide-react";

export const metadata: Metadata = {
  title: "MLB Picks Today | Sharp Baseball Betting & Predictions | HIMOTHY",
  description: "Get the sharpest MLB picks and baseball betting predictions. Our model tracks pitcher data and weather analytics for the ultimate edge.",
  keywords: ["MLB picks", "MLB picks today", "baseball betting", "MLB predictions", "sharp MLB plays", "baseball best bets"],
};

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
    />
  );
}
