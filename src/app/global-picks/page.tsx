import { Suspense } from "react";
import { SportPackBoard } from "@/components/SportPackBoard";

export const metadata = { title: "Global Picks Today | HIMOTHY" };

export default function GlobalPicksPage() {
  return (
    <Suspense>
      <SportPackBoard
        board="global"
        name="Global"
        emoji="🌍"
        tagline="KBO · AFL · Cricket · Rugby · International markets — asleep edges"
        backHref="/"
      />
    </Suspense>
  );
}
