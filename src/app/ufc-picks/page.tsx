import { Suspense } from "react";
import { SportPackBoard } from "@/components/SportPackBoard";

export const metadata = { title: "UFC & Boxing Picks | HIMOTHY" };

export default function UfcPicksPage() {
  return (
    <Suspense>
      <SportPackBoard
        board="combat"
        name="UFC / Boxing"
        emoji="🥊"
        tagline="Fighter analysis — not the full card. Only the best play."
        backHref="/"
      />
    </Suspense>
  );
}
