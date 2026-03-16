import { Metadata } from "next";
import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { BarChart3 } from "lucide-react";

export const metadata: Metadata = {
  title: "$10 Parlay Plan | HIMOTHY",
  description: "Turning small stakes into serious moves with strategic multi-leg tickets built on cumulative edge advantage.",
};

export default function ParlayPlanPage() {
  return (
    <PicksPageTemplate
      category="PARLAY_PLAN"
      title="$10 Parlay Plan"
      subtitle="Built for the flip chasers. We run the $10 Parlay Plan every single day — a smart multi-leg ticket designed to turn a $10 stake into a real move."
      badge="Flip Chaser"
      icon={<BarChart3 className="w-9 h-9 text-primary" />}
      backHref="/picks"
      backLabel="Back to All Picks"
      columns={1}
      accentNote="💰 Recommended stake: $10. Built for positive EV across all legs."
    />
  );
}
