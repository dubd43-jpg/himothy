"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Crown, TrendingUp, ArrowLeft, Zap, Timer } from "lucide-react";
import { PickSummaryCard, type DeepPick } from "@/components/PickBreakdown";
import { useLiveScores } from "@/components/useLiveScores";
import { computeLiveState } from "@/lib/livePickStatus";
import { formatGameDateTimeET } from "@/lib/datetime";

interface NrfiPlay {
  gameId: string; eventName: string; league: string; startTime: string;
  awayTeam: string; homeTeam: string; awayPitcher: string; homePitcher: string;
  awayERA: number | null; homeERA: number | null; nrfiScore: number; reason: string; odds: string;
}
interface OutrightEntry {
  name: string; odds: string | null; position?: number | null;
}
interface OutrightTournament {
  tournamentName: string; league: string; startDate?: string | null; entries: OutrightEntry[];
}
interface BoardData {
  success: boolean;
  grandSlam: DeepPick | null;
  pressurePack: DeepPick[];
  vip4Pack: DeepPick[];
  parlayPlan: DeepPick[];
  nrfi?: NrfiPlay[];
  outrights?: OutrightTournament[];
}

function CompactParlayLeg({ pick, index }: { pick: DeepPick; index: number }) {
  const time = formatGameDateTimeET(pick.startTime);
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0">
      <span className="text-[10px] font-black text-emerald-400/60 w-4 shrink-0">{index + 1}.</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-black text-white truncate">{pick.selection}</div>
        <div className="text-[10px] text-white/35 truncate">{pick.league} · {pick.awayTeam?.name} @ {pick.homeTeam?.name}</div>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {pick.odds && <span className="text-sm font-black text-emerald-300 tabular-nums">{pick.odds}</span>}
        {time && <span className="hidden sm:block text-[10px] text-white/25">{time}</span>}
      </div>
    </div>
  );
}

export interface SportPackConfig {
  board: string;
  name: string;
  emoji: string;
  tagline: string;
  backHref?: string;
}

export function SportPackBoard({ board, name, emoji, tagline, backHref = "/" }: SportPackConfig) {
  const liveMap = useLiveScores();
  const [data, setData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetch_ = async () => {
      try {
        const res = await fetch(`/api/research/daily-picks?board=${encodeURIComponent(board)}`, { cache: "no-store" });
        const json = await res.json();
        if (mounted && json.success) setData(json);
      } catch { /* non-fatal */ }
      finally { if (mounted) setLoading(false); }
    };
    fetch_();
    const t = setInterval(fetch_, 30000);
    return () => { mounted = false; clearInterval(t); };
  }, [board]);

  // All picks ranked best-first, deduped by gameId
  const allPicks: DeepPick[] = [];
  const seen = new Set<string>();
  for (const p of [data?.grandSlam, ...(data?.pressurePack ?? []), ...(data?.vip4Pack ?? [])]) {
    if (p && !seen.has(p.gameId)) { seen.add(p.gameId); allPicks.push(p); }
  }

  const isGolf = board === "individual";
  const outrights = data?.outrights ?? [];
  const parlay = data?.parlayPlan ?? [];

  return (
    <div className="min-h-screen bg-background text-white pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-background/70 backdrop-blur-xl px-4 py-4 md:px-8">
        <div className="mx-auto max-w-7xl flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <Image src="/logo-badge.png" alt="HIMOTHY" width={36} height={36} className="rounded-full border border-primary/40" />
            <span className="hidden sm:block text-sm font-black uppercase tracking-tight leading-none">
              HIMOTHY <span className="text-primary italic">Plays &amp; Parlays</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/picks" className="text-xs font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
              HIMOTHY Board
            </Link>
            <Link href="/pricing" className="text-xs font-black uppercase tracking-widest text-primary hover:text-white transition-colors">
              Pricing
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">

        {/* Back link */}
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-white/30 hover:text-white mb-6 transition-colors">
          <ArrowLeft className="h-3 w-3" /> All Packages
        </Link>

        {/* Page title */}
        <div className="mb-8">
          <div className="text-4xl mb-2">{emoji}</div>
          <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">{name} Pack</h1>
          <p className="text-white/40 mt-1 text-sm">{tagline}</p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
              <span className="text-sm font-semibold text-white/40">Loading {name} picks…</span>
            </div>
          </div>
        )}

        {!loading && (
          <div className="space-y-6">

            {/* Golf: outright contenders */}
            {isGolf && outrights.length > 0 && (
              <div className="space-y-4">
                {outrights.map((t) => (
                  <div key={t.tournamentName} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">{t.tournamentName}</div>
                    <div className="space-y-2">
                      {t.entries.map((e, i) => (
                        <div key={e.name} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-white/30 w-5">{i + 1}.</span>
                            <span className="font-black text-white">{e.name}</span>
                          </div>
                          {e.odds && <span className="text-sm font-black text-primary tabular-nums">{e.odds}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Regular picks */}
            {!isGolf && allPicks.length > 0 && (
              <div className="space-y-4">
                {allPicks.map((pick, i) => (
                  <div key={pick.gameId} className="flex items-start gap-3">
                    <div className="pt-5 shrink-0 w-6 text-center">
                      {i === 0
                        ? <Crown className="h-4 w-4 text-primary mx-auto" />
                        : <span className="text-[11px] font-black text-white/30">{i + 1}.</span>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <PickSummaryCard
                        pick={pick}
                        href={`/pick/${pick.gameId}?board=${board}`}
                        index={i}
                        live={computeLiveState(pick, liveMap[pick.gameId])}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!isGolf && allPicks.length === 0 && (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-10 text-center">
                <div className="text-3xl mb-3">{emoji}</div>
                <div className="text-sm font-black text-white/30">No {name} picks today.</div>
                <div className="text-xs text-white/20 mt-1">Check back once the slate is set.</div>
              </div>
            )}

            {isGolf && outrights.length === 0 && (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-10 text-center">
                <div className="text-3xl mb-3">{emoji}</div>
                <div className="text-sm font-black text-white/30">No golf tournament active today.</div>
              </div>
            )}

            {/* System Parlay */}
            {parlay.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-white/8">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-emerald-400">System Parlay</h2>
                </div>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 space-y-1">
                  {parlay.map((pick, i) => (
                    <CompactParlayLeg key={pick.gameId} pick={pick} index={i} />
                  ))}
                  <p className="text-[10px] text-white/25 pt-2">
                    Place as a single multi-leg ticket. Bet small — variance play, not the main event.
                  </p>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
