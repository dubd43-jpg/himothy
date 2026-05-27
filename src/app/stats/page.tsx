"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, BarChart3, TrendingUp, Layers } from "lucide-react";

interface BucketStat { wins: number; losses: number; pushes: number; total: number; winRate: string }
interface LegCountStat { tickets: number; wins: number; losses: number; pending: number; winRate: string }
interface SgpThemeStat { wins: number; losses: number; total: number; winRate: string }

export default function StatsDashboardPage() {
  const [recordsRaw, setRecordsRaw] = useState<any>(null);
  const [parlayStats, setParlayStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [r, p] = await Promise.all([
          fetch("/api/records/summary", { cache: "no-store" }).then((x) => x.json()),
          fetch("/api/records/parlay-stats", { cache: "no-store" }).then((x) => x.json()),
        ]);
        if (mounted) { setRecordsRaw(r); setParlayStats(p); }
      } catch { /* ignore */ } finally { if (mounted) setLoading(false); }
    })();
  }, []);

  const lifetime = recordsRaw?.stats?.allTime || null;
  const categoryStats: Record<string, BucketStat> = recordsRaw?.category_stats || {};

  return (
    <div className="min-h-screen bg-background text-white pb-24">
      <div className="mx-auto max-w-5xl px-5 py-8 md:px-8 flex flex-col gap-7">
        <div className="flex items-center justify-between gap-4">
          <Link href="/picks" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/logo-badge.png" alt="HIMOTHY" width={34} height={34} className="rounded-full border border-primary/40" />
            <span className="hidden sm:block text-xs font-black uppercase tracking-tight">HIMOTHY <span className="text-primary italic">Plays &amp; Parlays</span></span>
          </Link>
        </div>

        <div className="border-b border-white/5 pb-6">
          <h1 className="flex items-center gap-3 text-3xl md:text-4xl font-black uppercase tracking-tight">
            <BarChart3 className="h-8 w-8 text-primary" /> Stats &amp; Trends
          </h1>
          <p className="mt-3 max-w-2xl text-base text-white/50 leading-relaxed">
            Real numbers from our verified record. Every pick recorded before the game, graded against the real final.
            The longer this runs, the sharper these patterns get.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
            <span className="text-sm font-semibold text-white/40">Loading...</span>
          </div>
        ) : (
          <>
            {/* Lifetime headline */}
            {lifetime && (
              <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Lifetime (verified)</div>
                <div className="flex flex-wrap items-end gap-6">
                  <div>
                    <div className="text-5xl font-black tabular-nums">{lifetime.wins}-{lifetime.losses}{lifetime.pushes ? `-${lifetime.pushes}` : ""}</div>
                    <div className="text-[10px] font-black text-white/30 uppercase mt-1">Record</div>
                  </div>
                  <div>
                    <div className="text-3xl font-black text-primary tabular-nums">{lifetime.winPercentage}</div>
                    <div className="text-[10px] font-black text-white/30 uppercase mt-1">Win rate</div>
                  </div>
                  <div>
                    <div className={`text-3xl font-black tabular-nums ${lifetime.units >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {lifetime.units >= 0 ? "+" : ""}{(lifetime.units ?? 0).toFixed(1)}u
                    </div>
                    <div className="text-[10px] font-black text-white/30 uppercase mt-1">Units</div>
                  </div>
                </div>
              </section>
            )}

            {/* Category breakdown */}
            <section>
              <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white/60">
                <Layers className="h-4 w-4 text-primary" /> By Category
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Object.entries(categoryStats).map(([key, v]) => {
                  const rate = parseFloat(v.winRate);
                  const tone = rate >= 55 ? "text-emerald-400" : rate >= 45 ? "text-white/70" : "text-red-400";
                  return (
                    <div key={key} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/50">{key.replace(/_/g, " ")}</span>
                        <span className={`text-sm font-black ${tone}`}>{v.winRate}</span>
                      </div>
                      <div className="flex items-end justify-between gap-2">
                        <span className="text-2xl font-black tabular-nums">{v.wins}-{v.losses}{v.pushes ? `-${v.pushes}` : ""}</span>
                        <span className="text-[11px] font-bold text-white/40">{v.total ?? v.wins + v.losses} settled</span>
                      </div>
                    </div>
                  );
                })}
                {Object.keys(categoryStats).length === 0 && (
                  <div className="col-span-full rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.02] py-10 text-center text-sm text-white/40">
                    No graded picks by category yet — fills in as games settle.
                  </div>
                )}
              </div>
            </section>

            {/* Parlay performance */}
            <section>
              <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white/60">
                <TrendingUp className="h-4 w-4 text-primary" /> Parlays by Leg Count
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div className="mb-3 text-xs font-bold text-white/40">Each ticket counts as ONE bet. Any leg loses = ticket lost.</div>
                {parlayStats?.overall?.tickets > 0 ? (
                  <>
                    <div className="mb-3 flex flex-wrap items-end gap-4 pb-3 border-b border-white/5">
                      <div>
                        <div className="text-2xl font-black tabular-nums">{parlayStats.overall.wins}-{parlayStats.overall.losses}</div>
                        <div className="text-[10px] font-black text-white/30 uppercase">Overall</div>
                      </div>
                      <div>
                        <div className="text-2xl font-black text-primary tabular-nums">{parlayStats.overall.winRate}</div>
                        <div className="text-[10px] font-black text-white/30 uppercase">Hit rate</div>
                      </div>
                      <div>
                        <div className="text-2xl font-black text-white/60 tabular-nums">{parlayStats.overall.tickets}</div>
                        <div className="text-[10px] font-black text-white/30 uppercase">Tickets</div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {Object.entries(parlayStats.byLegCount as Record<string, LegCountStat>).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-bold text-white/70">{k}</span>
                          <span className="font-bold tabular-nums text-white">{v.wins}-{v.losses}</span>
                          <span className="text-[11px] font-bold text-white/50">{v.winRate} · {v.tickets} tickets</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center text-sm text-white/40">
                    No graded parlay tickets yet — populates as parlays settle (each ticket = one bet).
                  </div>
                )}
              </div>
            </section>

            {/* SGP theme performance */}
            {parlayStats?.bySgpTheme && Object.keys(parlayStats.bySgpTheme).length > 0 && (
              <section>
                <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white/60">
                  <Layers className="h-4 w-4 text-primary" /> SGP Themes
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-1.5">
                  {Object.entries(parlayStats.bySgpTheme as Record<string, SgpThemeStat>).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-bold text-white/70">{k}</span>
                      <span className="font-bold tabular-nums text-white">{v.wins}-{v.losses}</span>
                      <span className="text-[11px] font-bold text-white/50">{v.winRate}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <p className="text-[11px] text-white/30 text-center pt-4">
              Every number on this page comes from picks we recorded *before* the game and graded against the real final score.
              Nothing is backfilled. The longer the site runs, the sharper these patterns get.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
