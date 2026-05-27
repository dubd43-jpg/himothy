import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { MissouriSeoContent } from "@/components/SportSeoContent";
import { pageMeta } from "@/lib/seo";
import { Trophy } from "lucide-react";

export const metadata = pageMeta({
  title: "Missouri Sports Picks Today — Free Daily MO Plays",
  description: "Daily sports picks for Missouri bettors. Cardinals, Royals, Chiefs, Blues plus full NFL, NBA, MLB, NHL. Best prices across MO-licensed books.",
  path: "/missouri-sports-picks",
  keywords: [
    "missouri sports picks", "missouri sports betting", "mo sports picks",
    "cardinals picks today", "royals picks today", "chiefs picks today",
    "blues picks today", "missouri betting", "st louis sports picks",
    "kansas city sports picks",
  ],
});

export default function MissouriSportsPicksPage() {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return (
    <PicksPageTemplate
      title={`Missouri Sports Picks – ${today}`}
      subtitle="Daily picks for Missouri bettors. Live on DraftKings, FanDuel, BetMGM, Caesars, Fanatics. Cardinals, Royals, Chiefs, Blues + the full national slate."
      badge="MO Bettors"
      icon={<Trophy className="w-9 h-9 text-amber-500" />}
      backHref="/picks"
      backLabel="All Picks"
      accentNote="🏆 MO Coverage: Sports betting live in Missouri since December 2025. Best prices across every legal MO book."
      seoContent={<MissouriSeoContent />}
    />
  );
}
