import { Suspense } from "react";
import { SportPackBoard } from "@/components/SportPackBoard";

export const metadata = { title: "Tennis Picks Today | HIMOTHY" };

export default function TennisPicksPage() {
  return (
    <Suspense>
      <SportPackBoard
        board="tennis"
        name="Tennis"
        emoji="🎾"
        tagline="ATP · WTA · Surface splits · H2H tendencies — up to 7 picks, best first"
        backHref="/"
      />
    </Suspense>
  );
}
