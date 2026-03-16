import { Metadata } from "next";
import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { TrendingUp } from "lucide-react";

export const metadata: Metadata = {
  title: "Overnight & Global | HIMOTHY",
  description: "Soccer, Tennis, and international markets monitored 24/7 for timezone-based inefficiency.",
};

export default function OvernightPage() {
  return (
    <PicksPageTemplate
      category="OVERNIGHT"
      title="Overnight & Global Action"
      subtitle="Soccer, Tennis, and early morning markets. The action never sleeps — and neither does our algorithm. These are the global edges you might be sleeping on."
      badge="Global Markets"
      icon={<TrendingUp className="w-9 h-9 text-primary" />}
      backHref="/picks"
      backLabel="Back to All Picks"
      columns={2}
      accentNote="🌍 These markets open early. Set your alarms or bet the night before."
    />
  );
}
