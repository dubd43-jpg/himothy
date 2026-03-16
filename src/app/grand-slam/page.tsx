import { Metadata } from "next";
import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { Trophy } from "lucide-react";

export const metadata: Metadata = {
  title: "Grand Slam | HIMOTHY",
  description: "The highest confidence pick on the board. Filtered through 12 variables for maximum edge.",
};

export default function GrandSlamPage() {
  return (
    <PicksPageTemplate
      category="GRAND_SLAM"
      title="HIMOTHY Grand Slam"
      subtitle="That ONE pick that should never lose. Our highest confidence play of the entire slate — the algorithm's lock of the day."
      badge="Never Lose"
      icon={<Trophy className="w-9 h-9 text-primary" />}
      backHref="/picks"
      backLabel="Back to All Picks"
      columns={1}
      accentNote="🏆 Confidence: 100% — This is our top-tier play. Ride with full conviction."
    />
  );
}
