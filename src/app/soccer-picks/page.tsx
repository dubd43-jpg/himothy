import { Suspense } from "react";
import { SportPackBoard } from "@/components/SportPackBoard";

export const metadata = { title: "Soccer Picks Today | HIMOTHY" };

export default function SoccerPicksPage() {
  return (
    <Suspense>
      <SportPackBoard
        board="soccer"
        name="Soccer"
        emoji="⚽"
        tagline="EPL · UCL · MLS · La Liga · Serie A · More — up to 7 picks, best first"
        backHref="/"
      />
    </Suspense>
  );
}
