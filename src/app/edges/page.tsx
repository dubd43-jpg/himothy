"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, TrendingUp, Target, Activity, Flame } from "lucide-react";
import { PickSummaryCard, type DeepPick } from "@/components/PickBreakdown";
import { useLiveScores } from "@/components/useLiveScores";
import { computeLiveState } from "@/lib/livePickStatus";
import { YearlyMemberGate } from "@/components/YearlyMemberGate";

// Top-level "best edges tonight" view — aggregates today's picks across all categories
// and surfaces the highest-signal plays by value edge, trend strength, and bucket fit.
export default function EdgesPage() {
  const [picks, setPicks] = useState<DeepPick[]>([]);
  const [loading, setLoading] = useState(true);
  const liveMap = useLiveScores();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/research/daily-picks?board=north-american", { cache: "no-store" });
        const d = await r.json();
        const all: DeepPick[] = [d.grandSlam, ...(d.pressurePack || []), ...(d.vip4Pack || []), ...(d.parlayPlan || []), ...(d.marquee || [])].filter(Boolean) as DeepPick[];
        if (mounted) setPicks(all);
      } catch { /* ignore */ }
      finally { if (mounted) setLoading(false); }
    })();
  }, []);

  // Top by value edge (real positive value vs the true line)
  const byValue = [...picks]
    .filter((p) => p.oddsInsight && typeof p.oddsInsight.valueEdge === "number" && p.oddsInsight.valueEdge > 0)
    .sort((a, b) => (b.oddsInsight?.valueEdge || 0) - (a.oddsInsight?.valueEdge || 0))
    .slice(0, 5);

  // Top by best bucket performance (our historical W% in this odds band)
  const byBucket = [...picks]
    .filter((p) => p.bucketStats && p.bucketStats.total >= 5 && parseFloat(p.bucketStats.winRate) >= 50)
    .sort((a, b) => parseFloat(b.bucketStats!.winRate) - parseFloat(a.bucketStats!.winRate))
    .slice(0, 5);

  // Top by team trend strength (picked team trending up + strong last 10)
  const byTrend = [...picks]
    .filter((p) => {
      const t = (p.selectionSide === "home" ? p.homeTeam : p.awayTeam)?.trends;
      return t && t.last10 && t.last10.wins >= 6 && t.trendDirection !== "down";
    })
    .sort((a, b) => {
      const ta = (a.selectionSide === "home" ? a.homeTeam : a.awayTeam)?.trends?.last10;
      const tb = (b.selectionSide === "home" ? b.homeTeam : b.awayTeam)?.trends?.last10;
      return (tb?.wins || 0) - (ta?.wins || 0);
    })
    .slice(0, 5);

  // Sharp money on our side (>= 55% money on the picked side)
  const sharpAligned = picks
    .filter((p) => {
      const si = p.sharpIntel?.betting;
      const side = p.selectionSide;
      const moneyPct = side === "home" ? si?.homeMoneyPct : si?.awayMoneyPct;
      return typeof moneyPct === "number" && moneyPct >= 55;
    })
    .slice(0, 5);

  const Section = ({ title, icon: Icon, accent, items, empty }: { title: string; icon: any; accent: string; items: DeepPick[]; empty: string }) => (
    <section>
      <div className={`mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest ${accent}`}>
        <Icon className="h-4 w-4" /> {title}
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.02] py-8 text-center text-xs text-white/40">{empty}</div>
      ) : (
        <div className="space-y-3">
          {items.map((pick) => (
            <PickSummaryCard key={pick.gameId + pick.selection} pick={pick} href={`/pick/${pick.gameId}?board=north-american&from=/edges`} live={computeLiveState(pick, liveMap[pick.gameId])} />
          ))}
        </div>
      )}
    </section>
  );

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
            <TrendingUp className="h-8 w-8 text-emerald-400" /> Tonight's Edges
          </h1>
          <p className="mt-3 max-w-2xl text-base text-white/50 leading-relaxed">
            The strongest signals on tonight's board — sorted by real‑line value, team trend, sharp money, and our own historical bucket performance.
          </p>
        </div>

        <YearlyMemberGate
          toolName="Tonight's Edges"
          toolDescription="The four sharpest reads on tonight's board: real-line value vs. true line, hot historical buckets, strong team trends, and sharp money alignment — ranked."
        >
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-emerald-400 animate-spin" />
            <span className="text-sm font-semibold text-white/40">Scanning the board for edges...</span>
          </div>
        ) : (
          <div className="space-y-8">
            <Section
              title="Real-Line Value (our price beats the true line)"
              icon={Target}
              accent="text-emerald-400"
              items={byValue}
              empty="No positive-value plays on the board right now."
            />
            <Section
              title="Hot Buckets (our historical W% by odds band)"
              icon={Activity}
              accent="text-primary"
              items={byBucket}
              empty="Need more graded picks to fill bucket data — checking back as the record grows."
            />
            <Section
              title="Strong Team Trends (8+ wins last 10 + heating up)"
              icon={Flame}
              accent="text-amber-400"
              items={byTrend}
              empty="No strong trend confluences right now."
            />
            <Section
              title="Sharp Money On Our Side"
              icon={TrendingUp}
              accent="text-sky-400"
              items={sharpAligned}
              empty="No clear sharp-aligned plays right now."
            />
          </div>
        )}
        </YearlyMemberGate>
      </div>
    </div>
  );
}
