import { Metadata } from "next";
import { ProductPickPage } from "@/components/ProductPickPage";

export const metadata: Metadata = {
  title: "2-Pick Pressure Pack | HIMOTHY PLAYS AND PARLAYS",
  description: "Our 2 strongest plays of the day — the HIMOTHY BET drops here only. Full reasoning on every pick.",
};

export default function PressurePackPage() {
  return (
    <ProductPickPage
      product="pressurePack"
      subtitle="Our 2 strongest plays of the day. When it's time to apply pressure, it's here — and when it's time to hammer, the HIMOTHY BET drops in this section only. Each pick is broken down below."
      accentNote="⚡ Play these as straights or combine them into a 2-leg."
    />
  );
}
