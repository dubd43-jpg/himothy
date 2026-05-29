"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Layers, ExternalLink, Clock, CircleDot, Timer } from "lucide-react";
import { buildHardRockUrl } from "@/lib/hardRock";
import { formatGameDateTimeET } from "@/lib/datetime";
import { useLiveScores } from "@/components/useLiveScores";
import { computeLiveState } from "@/lib/livePickStatus";

interface SportParlayLeg {
  type: "game" | "prop";
  league: string;
  gameId: string;
  eventName: string;
  selection: string;
  odds: string | null;
  edgeScore: number;
  detail: string;
  startTime: string | null;
  selectionSide?: "home" | "away" | null;
  marketType?: string | null;
}
interface SportParlay {
  sport: string;
  legs: SportParlayLeg[];
  legCount: number;
  estimatedOdds: string;
  payoutOnDollar: string;
  singleGame: boolean;
  earliestStart: string | null;
}

function fmtTime(iso: string | null): string | null {
  return formatGameDateTimeET(iso) || null;
}

// Live state for one leg. Game legs (with a selectionSide) get graded against the live
// score; prop legs can't be live-graded, so they stay 'pre'/'final' from game state only.
function legLiveState(leg: SportParlayLeg, liveMap: Record<string, any>) {
  const g = liveMap[leg.gameId];
  if (!g) return null;
  if (leg.type === "game" && (leg.selectionSide === "home" || leg.selectionSide === "away")) {
    return computeLiveState(
      { league: leg.league, selection: leg.selection, selectionSide: leg.selectionSide, marketType: leg.marketType || "moneyline", spread: null, total: null },
      g,
    );
  }
  // Prop / no-side leg: surface game state (scheduled/live/final) without a won/lost grade.
  return { state: g.isFinal ? "final" : g.isLive ? "live" : "pre", awayScore: g.awayScore, homeScore: g.homeScore, period: g.period, clock: g.clock, result: null, meterPct: null, trend: null, leaderName: null, gradable: false } as any;
}

// Whole-parlay result: any final leg that lost = lost; all final+won = won; else pending.
function parlayResult(legs: SportParlayLeg[], liveMap: Record<string, any>): "won" | "lost" | "pending" {
  let anyLost = false, anyPending = false, anyFinal = false;
  for (const leg of legs) {
    const ls = legLiveState(leg, liveMap);
    if (!ls || ls.state !== "final") { anyPending = true; continue; }
    anyFinal = true;
    if (ls.gradable && ls.result === "lost") anyLost = true;
    else if (ls.gradable && ls.result !== "won") anyPending = true; // push/unknown → not yet decided
    else if (!ls.gradable) anyPending = true; // prop final but ungraded here
  }
  if (anyLost) return "lost";
  if (anyPending || !anyFinal) return "pending";
  return "won";
}

export default function SportParlaysPage() {
  const [parlays, setParlays] = useState<SportParlay[]>([]);
  const [loading, setLoading] = useState(true);
  const liveMap = useLiveScores();

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
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-6 flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <Link href="/picks" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to Picks
          </Link>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/logo-badge.png" alt="HIMOTHY" width={30} height={30} className="rounded-full border border-primary/40" />
            <span className="hidden sm:block text-xs font-black uppercase tracking-tight">HIMOTHY <span className="text-primary italic">Plays &amp; Parlays</span></span>
          </Link>
        </div>

        <div className="border-b border-white/5 pb-4">
          <h1 className="flex items-center gap-2.5 text-2xl md:text-3xl font-black uppercase tracking-tight">
            <Layers className="h-6 w-6 text-primary" /> Sport Parlays
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/50 leading-relaxed">
            One 4-leg parlay per sport, single-sport each. Never repeats our main-board picks — these are fresh angles. When a sport has only a game or two, we dig into player and game props for real value.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="h-7 w-7 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
            <span className="text-xs font-semibold text-white/40">Building a 4-leg parlay for every sport...</span>
          </div>
        ) : parlays.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.02] py-10 text-center px-6">
            <h3 className="text-lg font-black uppercase tracking-tight">No Sport Parlays Today</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/45 leading-relaxed">
              No sport had 4 quality legs available. We only build a parlay when there's real value — no padding.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {parlays.map((p) => {
              const locks = fmtTime(p.earliestStart);
              const result = parlayResult(p.legs, liveMap);
              const resultChip = result === "won"
                ? { t: "HIT", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" }
                : result === "lost"
                ? { t: "LOST", cls: "bg-red-500/15 text-red-400 border-red-500/30" }
                : null;
              return (
                <article key={p.sport} className={`rounded-2xl border bg-gradient-to-br from-primary/[0.05] to-transparent p-4 space-y-3 ${result === "won" ? "border-emerald-400/40" : result === "lost" ? "border-red-500/40" : "border-primary/25"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base md:text-lg font-black uppercase tracking-tight text-white truncate flex items-center gap-2">
                        {p.sport} Parlay
                        {resultChip && <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black tracking-widest ${resultChip.cls}`}>{resultChip.t}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-bold uppercase tracking-widest text-white/40 mt-0.5">
                        <span>{p.legCount}-leg · {p.singleGame ? "single-game" : "multi-game"}</span>
                        {locks && (
                          <span className="inline-flex items-center gap-1 text-amber-300/70">
                            <Clock className="h-3 w-3" /> locks {locks}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xl md:text-2xl font-black text-primary tabular-nums leading-none">{p.estimatedOdds}</div>
                      <div className="text-[10px] text-white/30 font-bold mt-0.5">{p.payoutOnDollar}</div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {p.legs.map((leg, i) => {
                      const t = fmtTime(leg.startTime);
                      const ls = legLiveState(leg, liveMap);
                      const statusChip = (() => {
                        if (!ls) return null;
                        if (ls.state === "final") {
                          if (ls.result === "won") return <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-black text-emerald-400">✓ WON</span>;
                          if (ls.result === "lost") return <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-black text-red-400">✗ LOST</span>;
                          return <span className="shrink-0 text-[9px] font-black text-white/40">FINAL</span>;
                        }
                        if (ls.state === "live") return <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-black text-emerald-400"><CircleDot className="h-2.5 w-2.5 animate-pulse" /> LIVE {ls.awayScore}-{ls.homeScore}</span>;
                        return <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold text-white/30"><Timer className="h-2.5 w-2.5" /> {t || "scheduled"}</span>;
                      })();
                      return (
                        <div key={`${leg.gameId}-${leg.selection}-${i}`} className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 ${ls?.state === "final" && ls.result === "lost" ? "border-red-500/20 bg-red-500/[0.04]" : ls?.state === "final" && ls.result === "won" ? "border-emerald-500/20 bg-emerald-500/[0.04]" : ls?.state === "live" ? "border-emerald-500/20 bg-white/[0.02]" : "border-white/8 bg-white/[0.02]"}`}>
                          <div className="w-5 h-5 shrink-0 rounded-full bg-white/5 flex items-center justify-center text-[9px] font-black text-white/40">{i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-bold text-white truncate">{leg.selection}</div>
                            <div className="flex flex-wrap items-center gap-x-1.5 text-[9px] text-white/40 truncate">
                              <span className="text-primary/60 font-black">{leg.type === "prop" ? "PROP" : "GAME"}</span>
                              <span className="truncate">{leg.eventName}</span>
                              {t && <span className="text-white/30">· {t}</span>}
                            </div>
                          </div>
                          {statusChip}
                          {leg.odds && <span className="text-[13px] font-black tabular-nums text-white/55 shrink-0">{leg.odds}</span>}
                        </div>
                      );
                    })}
                  </div>
                  <a
                    href={buildHardRockUrl({ league: p.sport, selection: `${p.sport} parlay` })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 w-full rounded-lg bg-primary px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-black hover:bg-white transition-all"
                  >
                    Build on Hard Rock <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
