import { Metadata } from "next";
import { ProductPickPage } from "@/components/ProductPickPage";

export const metadata: Metadata = {
  title: "$10 Parlay Plan | HIMOTHY PLAYS AND PARLAYS",
  description: "A daily strategic multi-leg ticket — different games than our straight picks — with the reasoning on every leg.",
};

export default function ParlayPlanPage() {
  return (
    <ProductPickPage
      product="parlayPlan"
      subtitle="Built for the flip chasers — we run it daily. A smart multi-leg ticket designed to turn $10 into a real move. Strategic parlays, not wild guesses. Every leg is a different game and is broken down below."
      accentNote="💰 Recommended stake: $10. Built for positive value across all legs."
    />
  );
}
