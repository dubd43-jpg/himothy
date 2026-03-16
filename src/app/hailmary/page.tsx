import { Metadata } from "next";
import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { Bomb } from "lucide-react";

export const metadata: Metadata = {
  title: "Hailmarys | HIMOTHY",
  description: "Calculated high-variance lottery tickets. 10, 15, and 20-leg lottos for maximum payouts.",
};

export default function HailmarysPage() {
  return (
    <PicksPageTemplate
      category="HAILMARY"
      title="The Hailmarys"
      subtitle="We preach bankroll management. But for the true degens and flip chasers, we drop 10-leg, 15-leg, and 20-leg calculated lottos every single night. Small stakes, massive payouts."
      badge="Lotto Tickets"
      icon={<Bomb className="w-9 h-9 text-primary animate-pulse" />}
      backHref="/picks"
      backLabel="Back to All Picks"
      columns={3}
      accentNote="💣 Small stakes only. $1–$10 max. These are lottery tickets — calculated ones."
    />
  );
}
