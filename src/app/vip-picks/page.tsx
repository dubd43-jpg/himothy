import { Metadata } from "next";
import { ProductPickPage } from "@/components/ProductPickPage";

export const metadata: Metadata = {
  title: "VIP 4-Pack | HIMOTHY PLAYS AND PARLAYS",
  description: "Your daily 4-play foundation — clean action, consistent value, with the reasoning behind every pick.",
};

export default function Vip4PackPage() {
  return (
    <ProductPickPage
      product="vip4Pack"
      subtitle="This is your daily foundation — our structured 4-play package. Clean action, consistent value, every single day. Each play is broken down with real data below."
      accentNote="🎯 Your everyday plays — the bread and butter."
    />
  );
}
