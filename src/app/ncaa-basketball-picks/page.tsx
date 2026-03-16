import { Metadata } from "next";
import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "NCAA Basketball Picks | College Basketball Best Bets | HIMOTHY",
  description: "Expert NCAA basketball picks and college basketball best bets. Our model analyzes volume and lineup efficiency to find the edge.",
  keywords: ["NCAA basketball picks", "college basketball picks", "CBB best bets", "March Madness picks", "college basketball predictions"],
};

export default function NCAABasketBallPicksPage() {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

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
    />
  );
}
