import { Metadata } from "next";
import { ProductPickPage } from "@/components/ProductPickPage";

export const metadata: Metadata = {
  title: "1-Pick Grand Slam | HIMOTHY PLAYS AND PARLAYS",
  description: "Our single highest-confidence play of the day — with the full data-backed reasoning for exactly why we like it.",
};

export default function GrandSlamPage() {
  return (
    <ProductPickPage
      product="grandSlam"
      subtitle="The strongest play of the day — our single highest-conviction pick. It only drops when we really feel it. Here's exactly why we like it, with real data."
      accentNote="One pick. Maximum conviction. Only when the math earns it."
    />
  );
}
