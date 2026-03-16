import { Metadata } from "next";
import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { Globe } from "lucide-react";

export const metadata: Metadata = {
  title: "Overseas Audited | HIMOTHY",
  description: "International leagues audited locally for depth. Soccer, basketball, and more from around the globe.",
};

export default function OverseasPage() {
  return (
    <PicksPageTemplate
      category="OVERSEAS"
      title="Overseas & International"
      subtitle="Real international action happening right now — Serie A, Denmark Superliga, Polish Ekstraklasa, Romania Liga 1 and more. Updated daily with actual games on the board."
      badge="Live Overseas Action"
      icon={<Globe className="w-9 h-9 text-primary" />}
      backHref="/picks"
      backLabel="Back to All Picks"
      columns={2}
      accentNote="🌍 These games start as early as 4:00 AM ET. Bet the night before or set your alarms."
    />
  );
}
