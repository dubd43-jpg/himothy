import { Metadata } from "next";
import Link from "next/link";
import { LiveScoreBoard } from "@/components/LiveScoreBoard";
import { Activity, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Live Scores | HIMOTHY Plays and Parlays",
  description: "Follow the games we're on, live. Real-time scores for every HIMOTHY play.",
  keywords: ["live scores", "live sports", "game tracker", "HIMOTHY live"],
};

export default function LiveSportsBoardPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="px-6 lg:px-10 py-10 max-w-7xl mx-auto flex flex-col gap-10">
        <Link href="/picks" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Back to Picks Hub
        </Link>

        <div className="border-b border-border pb-8">
           <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight flex items-center gap-4">
              <Activity className="w-10 h-10 text-primary animate-pulse" /> Live Scores
           </h1>
           <p className="text-muted-foreground text-lg mt-2 max-w-2xl">
              Every game we have a play on, live. Watch it happen right here.
           </p>
        </div>

        <LiveScoreBoard />
      </div>
    </div>
  );
}
