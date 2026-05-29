"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Trophy, RefreshCw } from "lucide-react";
import { PickSummaryCard, type DeepPick } from "@/components/PickBreakdown";
import { useLiveScores } from "@/components/useLiveScores";
import { computeLiveState } from "@/lib/livePickStatus";

interface CatRecord { wins: number; losses: number; pushes: number; winPercentage: string; units: number; }

export default function BigGamesPage() {
  const [games, setGames] = useState<DeepPick[]>([]);
  const [record, setRecord] = useState<CatRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const liveMap = useLiveScores();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/research/daily-picks?board=north-american", { cache: "no-store" });
        const d = await res.json();
        if (mounted) setGames((d.marquee || []) as DeepPick[]);
      } catch {
        /* ignore */
      } finally {
        if (mounted) setLoading(false);
      }
      try {
        const r = await fetch("/api/records/summary", { cache: "no-store" });
        const rd = await r.json();
        if (mounted) setRecord((rd?.category_stats?.MARQUEE as CatRecord) ?? null);
      } catch { /* ignore */ }
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
            <Trophy className="h-8 w-8 text-primary" /> Tonight's Big Games
          </h1>
          <p className="mt-3 max-w-2xl text-base text-white/50 leading-relaxed">
            Tonight's headline games — we dig the whole game (sides, totals, halves, quarters, props) and surface every play we love, not just one. Each is an 80+ conviction play; if a game has nothing we love, it isn't here.
          </p>
          {/* Big Games own record bracket */}
          <div className="mt-5 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Big Games Record</span>
            <span className="text-xl font-black tabular-nums leading-none">
              {record?.wins ?? 0}<span className="text-white/30">-</span>{record?.losses ?? 0}{record?.pushes ? <><span className="text-white/30">-</span>{record.pushes}</> : null}
            </span>
            <span className="text-sm font-black text-emerald-400 tabular-nums leading-none">{record?.winPercentage || "0.0%"}</span>
            {typeof record?.units === "number" && (
              <span className={`text-sm font-black tabular-nums leading-none ${record.units >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {record.units >= 0 ? "+" : ""}{record.units.toFixed(1)}u
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
            <span className="text-sm font-semibold text-white/40">Loading...</span>
          </div>
        ) : games.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.02] py-20 text-center px-6">
            <Trophy className="mx-auto h-14 w-14 text-white/15 mb-5" />
            <h3 className="text-2xl font-black uppercase tracking-tight">No Big Game Today</h3>
            <p className="mx-auto mt-3 max-w-md text-white/40 leading-relaxed">There's no championship- or playoff-stage game on the slate right now. We only flag the ones that really matter.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {games.map((pick, i) => (
              <div key={`${pick.gameId}-${pick.marketType}-${pick.selection}-${i}`}>
                {pick.bigGameLabel && (
                  <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
                    <Trophy className="h-2.5 w-2.5" /> {pick.bigGameLabel}
                  </div>
                )}
                <PickSummaryCard pick={pick} href={`/pick/${pick.gameId}?board=north-american&from=/big-games`} live={computeLiveState(pick, liveMap[pick.gameId])} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
