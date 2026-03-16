import { Metadata } from "next";
import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { Crown } from "lucide-react";

export const metadata: Metadata = {
  title: "HIMOTHY Picks | HIMOTHY",
  description: "Personal reads from HIMOTHY himself. Only posted when roster and confidence signals are absolute green.",
};

export default function MyPlayPage() {
  return (
    <PicksPageTemplate
      category="PERSONAL_PLAY"
      title="My Personal Play"
      subtitle="The system is for everyone. But occasionally, my own read supersedes the algorithm. This is the play I'm personally riding today — no committee, just me."
      badge="Exclusive"
      icon={<Crown className="w-9 h-9 text-primary" />}
      backHref="/picks"
      backLabel="Back to All Picks"
      columns={1}
      accentNote="👑 This is a founder-only call. My read, my conviction, my money on it."
    />
  );
}
