import { Suspense } from "react";
import { SportPackBoard } from "@/components/SportPackBoard";

export const metadata = { title: "Golf Picks Today | HIMOTHY" };

export default function GolfPicksPage() {
  return (
    <Suspense>
      <SportPackBoard
        board="individual"
        name="Golf"
        emoji="⛳"
        tagline="Pick to win — not a full field list. Only when the edge is real."
        backHref="/"
      />
    </Suspense>
  );
}
