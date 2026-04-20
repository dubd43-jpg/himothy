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
      subtitle="Our highest-conviction entry on the board, selected only after full slate validation and research review."
      badge="Top Conviction"
      icon={<Trophy className="w-9 h-9 text-primary" />}
      backHref="/picks"
      backLabel="Back to All Picks"
      columns={1}
      accentNote="Registry locked after publish. Transparent grading follows when the event settles."
    />
  );
}
