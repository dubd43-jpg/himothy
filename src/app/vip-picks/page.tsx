import { Metadata } from "next";
import { PicksPageTemplate } from "@/components/PicksPageTemplate";
import { Target } from "lucide-react";

export const metadata: Metadata = {
  title: "VIP 4-Pack | HIMOTHY",
  description: "Your daily foundation for sports intelligence. A structured 4-play package covering NBA, NHL, and more.",
};

export default function Vip4PackPage() {
  return (
    <PicksPageTemplate
      category="VIP_4_PACK"
      title="HIMOTHY VIP 4-Pack"
      subtitle="This is your daily foundation. Our structured 4-play package covering NBA, NHL, College, and NFL. Clean action, consistent value — every single day."
      badge="Daily Foundation"
      icon={<Target className="w-9 h-9 text-primary" />}
      backHref="/picks"
      backLabel="Back to All Picks"
      columns={2}
      accentNote="🎯 These are your everyday plays. The bread and butter."
    />
  );
}
