import { Suspense } from "react";
import { SportPackBoard } from "@/components/SportPackBoard";

export const metadata = { title: "Racing Picks Today | HIMOTHY" };

export default function RacingPicksPage() {
  return (
    <Suspense>
      <SportPackBoard
        board="racing"
        name="Racing"
        emoji="🏎️"
        tagline="F1 · NASCAR · IndyCar — best plays when the edge is there"
        backHref="/"
      />
    </Suspense>
  );
}
