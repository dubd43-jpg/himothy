import { Metadata } from "next";
import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "Pressure Pack | HIMOTHY",
  description: "The two strongest plays of the day. Maximum pressure on market inefficiencies.",
};

export default function PressurePackPage() {
  return (
    <PicksPageTemplate
      category="PRESSURE_PACK"
      title="HIMOTHY Pressure Pack"
      subtitle="Our 2 strongest plays of the day. If we're applying pressure anywhere on the board, it's right here. Both legs picked for maximum edge."
      badge="High Pressure"
      icon={<Zap className="w-9 h-9 text-primary" />}
      backHref="/picks"
      backLabel="Back to All Picks"
      columns={2}
      accentNote="⚡ Recommended: Play these as straights or combine for a 2-leg."
    />
  );
}
