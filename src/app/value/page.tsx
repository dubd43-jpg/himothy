"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Target, TrendingUp } from "lucide-react";
import { PickSummaryCard, type DeepPick } from "@/components/PickBreakdown";
import { useLiveScores } from "@/components/useLiveScores";
import { computeLiveState } from "@/lib/livePickStatus";

export default function ValuePage() {
  const [plays, setPlays] = useState<DeepPick[]>([]);
  const [loading, setLoading] = useState(true);
  const liveMap = useLiveScores();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/research/daily-picks?board=north-american", { cache: "no-store" });
        const d = await res.json();
        if (mounted) setPlays((d.valuePlays || []) as DeepPick[]);
      } catch {
        /* ignore */
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    const i = setInterval(load, 120000);
    return () => { mounted = false; clearInterval(i); };
  }, []);

  return (
    <div className="min-h-screen bg-background text-white pb-24">
      <div className="mx-auto max-w-5xl px-5 py-8 md:px-8 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/picks" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" /> All Picks
          </Link>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/logo-badge.png" alt="HIMOTHY PLAYS AND PARLAYS" width={34} height={34} className="rounded-full border border-primary/40" />
            <span className="hidden sm:block text-xs font-black uppercase tracking-tight leading-none">HIMOTHY <span className="text-primary italic">Plays &amp; Parlays</span></span>
          </Link>
        </div>

        <div className="border-b border-white/5 pb-6">
          <h1 className="flex items-center gap-3 text-3xl md:text-4xl font-black uppercase tracking-tight">
            <TrendingUp className="h-8 w-8 text-emerald-400" /> Value Plays
          </h1>
          <p className="mt-3 max-w-2xl text-base text-white/50 leading-relaxed">
            The only plays where the real multi-book price beats the true line — a genuine edge,
            measured, not guessed. Some days there are a few. Some days there are none, and the
            smart move is to sit out. We only play when the math is on our side.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-emerald-400 animate-spin" />
            <span className="text-sm font-semibold text-white/40">Scanning the market for edges...</span>
          </div>
        ) : plays.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.02] py-20 text-center px-6">
            <Target className="mx-auto h-14 w-14 text-white/15 mb-5" />
            <h3 className="text-2xl font-black uppercase tracking-tight">No Value On The Board</h3>
            <p className="mx-auto mt-3 max-w-md text-white/40 leading-relaxed">
              Nothing today beats the true line, so there&apos;s no edge to bet — and forcing a play
              with no edge is how you lose. The disciplined move is to pass and wait for a real spot.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {plays.map((pick) => (
              <div key={pick.gameId}>
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-400">
                  <TrendingUp className="h-2.5 w-2.5" /> +{pick.oddsInsight?.valueEdge}% edge vs true line
                </div>
                <PickSummaryCard
                  pick={pick}
                  href={`/pick/${pick.gameId}?board=north-american&from=/value`}
                  live={computeLiveState(pick, liveMap[pick.gameId])}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
