import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { SportsPicksTodaySeoContent } from "@/components/SportSeoContent";
import { pageMeta } from "@/lib/seo";
import { Globe } from "lucide-react";

export const metadata = pageMeta({
  title: "Sports Picks Today — Free Daily Plays Across Every Sport",
  description: "Today's full multi-sport board across NBA, NFL, MLB, NHL, WNBA, UFC, tennis, golf, soccer, NCAA. Real plays, tendency math on every pick.",
  path: "/sports-picks-today",
  keywords: [
    "sports picks today", "expert sports picks", "free sports picks today",
    "best picks tonight", "free daily picks", "sharp picks today",
    "betting picks today", "best bets today", "expert picks daily",
  ],
});

export default function SportsPicksTodayPage() {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' });

  return (
    <PicksPageTemplate
      title={`Global Picks – ${today}`}
      subtitle="Complete multi-sport board analysis. Every market we monitor is checked for decision-engine authorized edges."
      badge="Global Coverage"
      icon={<Globe className="w-9 h-9 text-purple-500" />}
      backHref="/picks"
      backLabel="All Picks"
      accentNote="🌏 Total Board Coverage: From domestic pro leagues to overseas niche markets."
      seoContent={<SportsPicksTodaySeoContent />}
    />
  );
}
