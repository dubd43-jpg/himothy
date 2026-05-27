"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Flame } from "lucide-react";
import { PickSummaryCard, type DeepPick } from "@/components/PickBreakdown";
import { useLiveScores } from "@/components/useLiveScores";
import { computeLiveState } from "@/lib/livePickStatus";
import { YearlyMemberGate } from "@/components/YearlyMemberGate";

// "Asleep Picks" — lesser-watched leagues where the public bets less and lines are
// less efficient. NCAA Baseball, UFC, AFL, Cricket, Rugby NRL, etc. The user's whole
// edge-finding strategy starts here: find the games nobody is watching.
export default function AsleepPage() {
  const [picks, setPicks] = useState<DeepPick[]>([]);
  const [loading, setLoading] = useState(true);
  const liveMap = useLiveScores();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/research/daily-picks?board=north-american", { cache: "no-store" });
        const d = await r.json();
        if (mounted) setPicks((d.asleepPicks || []) as DeepPick[]);
      } catch { /* ignore */ }
      finally { if (mounted) setLoading(false); }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background text-white pb-24">
      <div className="mx-auto max-w-5xl px-5 py-8 md:px-8 flex flex-col gap-7">
        <div className="flex items-center justify-between gap-4">
          <Link href="/picks" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/logo-badge.png" alt="HIMOTHY" width={34} height={34} className="rounded-full border border-primary/40" />
            <span className="hidden sm:block text-xs font-black uppercase tracking-tight">HIMOTHY <span className="text-primary italic">Plays &amp; Parlays</span></span>
          </Link>
        </div>

        <div className="border-b border-white/5 pb-6">
          <h1 className="flex items-center gap-3 text-3xl md:text-4xl font-black uppercase tracking-tight">
            <Flame className="h-8 w-8 text-amber-400" /> Asleep Picks
          </h1>
          <p className="mt-3 max-w-2xl text-base text-white/50 leading-relaxed">
            Games people aren't watching — quieter markets like NCAA Baseball, UFC, AFL, Rugby, KBO. Soft books, real edges. The plays mainstream cappers won't touch.
          </p>
        </div>

        <YearlyMemberGate
          toolName="Asleep Picks"
          toolDescription="Lesser-watched leagues where sportsbooks haven't priced as tightly — NCAA Baseball, KBO, AFL, rugby, Brazil Serie A, lower European leagues. Where the line inefficiencies live."
        >
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-amber-400 animate-spin" />
            <span className="text-sm font-semibold text-white/40">Scanning quiet markets...</span>
          </div>
        ) : picks.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.02] py-16 text-center text-sm text-white/40">
            No asleep edges right now — most quiet leagues are off tonight. Check back when MLB/NCAA/UFC card pops.
          </div>
        ) : (
          <div className="space-y-3">
            {picks.map((p, i) => (
              <PickSummaryCard key={p.gameId + p.selection} pick={p} href={`/pick/${p.gameId}?board=north-american&from=/asleep`} index={i} live={computeLiveState(p, liveMap[p.gameId])} />
            ))}
          </div>
        )}
        </YearlyMemberGate>
      </div>
    </div>
  );
}
