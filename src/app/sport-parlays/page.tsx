"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Layers, ExternalLink } from "lucide-react";
import { buildHardRockUrl } from "@/lib/hardRock";

interface SportParlayLeg {
  type: "game" | "prop";
  league: string;
  gameId: string;
  eventName: string;
  selection: string;
  odds: string | null;
  edgeScore: number;
  detail: string;
}
interface SportParlay {
  sport: string;
  legs: SportParlayLeg[];
  legCount: number;
  estimatedOdds: string;
  payoutOnDollar: string;
  singleGame: boolean;
}

export default function SportParlaysPage() {
  const [parlays, setParlays] = useState<SportParlay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/research/sport-parlays", { cache: "no-store" });
        const d = await r.json();
        if (d.success) setParlays(d.parlays || []);
      } catch {/* ignore */}
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background text-white pb-24">
      <div className="mx-auto max-w-3xl px-5 py-8 md:px-8 flex flex-col gap-7">
        <div className="flex items-center justify-between gap-4">
          <Link href="/picks" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to Picks
          </Link>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/logo-badge.png" alt="HIMOTHY" width={34} height={34} className="rounded-full border border-primary/40" />
            <span className="hidden sm:block text-xs font-black uppercase tracking-tight">HIMOTHY <span className="text-primary italic">Plays &amp; Parlays</span></span>
          </Link>
        </div>

        <div className="border-b border-white/5 pb-6">
          <h1 className="flex items-center gap-3 text-3xl md:text-4xl font-black uppercase tracking-tight">
            <Layers className="h-8 w-8 text-primary" /> Sport Parlays
          </h1>
          <p className="mt-3 max-w-2xl text-base text-white/55 leading-relaxed">
            One 4-leg parlay per sport, single-sport each. When a sport only has a game or two (playoffs), we dig into player and game props from those games to build the four legs — real value, never filler.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
            <span className="text-sm font-semibold text-white/40">Building a 4-leg parlay for every sport...</span>
          </div>
        ) : parlays.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.02] py-12 text-center px-6">
            <h3 className="text-xl font-black uppercase tracking-tight">No Sport Parlays Today</h3>
            <p className="mx-auto mt-3 max-w-md text-white/45 leading-relaxed">
              No sport had 4 quality legs available. We only build a parlay when there's real value — no padding.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {parlays.map((p) => (
              <article key={p.sport} className="rounded-3xl border-2 border-primary/30 bg-gradient-to-br from-primary/[0.06] to-transparent p-5 md:p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xl md:text-2xl font-black uppercase tracking-tight text-white">{p.sport} Parlay</div>
                    <div className="text-[11px] font-bold uppercase tracking-widest text-white/40 mt-1">
                      {p.legCount}-leg · {p.singleGame ? "single-game build" : "multi-game"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl md:text-3xl font-black text-primary tabular-nums">{p.estimatedOdds}</div>
                    <div className="text-[11px] text-white/30 font-bold">{p.payoutOnDollar}</div>
                  </div>
                </div>
                <div className="space-y-2">
                  {p.legs.map((leg, i) => (
                    <div key={`${leg.gameId}-${leg.selection}-${i}`} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                      <div className="w-6 h-6 shrink-0 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-black text-white/40">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white truncate">{leg.selection}</div>
                        <div className="text-[10px] text-white/40 truncate">
                          {leg.type === "prop" ? "PROP" : "GAME"} · {leg.eventName} · {leg.detail}
                        </div>
                      </div>
                      {leg.odds && <span className="text-sm font-black tabular-nums text-white/60 shrink-0">{leg.odds}</span>}
                    </div>
                  ))}
                </div>
                <a
                  href={buildHardRockUrl({ league: p.sport, selection: `${p.sport} parlay` })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-black hover:bg-white transition-all"
                >
                  Build on Hard Rock <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
