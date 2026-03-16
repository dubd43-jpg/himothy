import { Metadata } from "next";
import Link from "next/link";
import { LiveScoreBoard } from "@/components/LiveScoreBoard";
import { Activity, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Live Sports Board | Real-Time Scores & Updates | HIMOTHY",
  description: "Track live sports scores and real-time game updates on the HIMOTHY Live Board. Continuous feed monitoring for NBA, NHL, and more.",
  keywords: ["live sports board", "live scores", "real-time sports", "game tracker", "HIMOTHY live"],
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
              <Activity className="w-10 h-10 text-red-500 animate-pulse" /> Live Sports Board
           </h1>
           <p className="text-muted-foreground text-lg mt-2 max-w-2xl">
              Our real-time aggregator monitoring every game on the active slate. Roster moves and market updates synchronized in real-time.
           </p>
        </div>

        <LiveScoreBoard />

        <div className="mt-8 p-6 bg-card border border-border rounded-2xl flex items-center gap-4">
           <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
           <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Feed Integrity: All scores verified via consensus truth engine.
           </p>
        </div>
      </div>
    </div>
  );
}
