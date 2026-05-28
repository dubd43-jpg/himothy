"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Crown, Flame, ShieldCheck, DollarSign, Lock, RefreshCw, Trophy } from "lucide-react";
import { PickSummaryCard, type DeepPick } from "@/components/PickBreakdown";
import { useLiveScores } from "@/components/useLiveScores";
import { computeLiveState } from "@/lib/livePickStatus";

interface DailyPicksData {
  success: boolean; boardDate: string; generatedAt: string;
  grandSlam: DeepPick | null; pressurePack: DeepPick[]; vip4Pack: DeepPick[]; parlayPlan: DeepPick[];
  totalGamesScanned: number;
}

type ProductKey = "grandSlam" | "pressurePack" | "vip4Pack" | "parlayPlan";

const PRODUCT_PATH: Record<ProductKey, string> = {
  grandSlam: "/grand-slam", pressurePack: "/pressure-pack", vip4Pack: "/vip-picks", parlayPlan: "/parlay-plan",
};

const PRODUCT_META: Record<ProductKey, { category: string; label: string; icon: any; emptyTitle: string; emptyBody: string; }> = {
  grandSlam: {
    category: "GRAND_SLAM", label: "HIMOTHY 1-Pick Grand Slam", icon: Crown,
    emptyTitle: "Holding for Perfection",
    emptyBody: "The Grand Slam only drops when we truly feel it — our single highest-confidence play. No qualifying play cleared the bar today, so we're sitting out to protect the bankroll.",
  },
  pressurePack: {
    category: "PRESSURE_PACK", label: "HIMOTHY 2-Pick Pressure Pack", icon: Flame,
    emptyTitle: "No Pressure Plays Today",
    emptyBody: "Our 2 strongest plays — when it's time to hammer, the HIMOTHY BET drops here only. Nothing met the pressure threshold today.",
  },
  vip4Pack: {
    category: "VIP_4_PACK", label: "HIMOTHY VIP 4-Pack", icon: ShieldCheck,
    emptyTitle: "No VIP Action Today",
    emptyBody: "Your daily foundation of clean, consistent value. The audit found no plays meeting our VIP edge requirements today.",
  },
  parlayPlan: {
    category: "PARLAY_PLAN", label: "$10 Parlay Plan", icon: DollarSign,
    emptyTitle: "No Parlay Today",
    emptyBody: "Strategic parlays, not wild guesses. We didn't find legs worth combining today.",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAmerican(odds?: string | null) {
  if (!odds) return NaN;
  const m = String(odds).match(/[+-]?\d{3,4}/);
  return m ? Number.parseInt(m[0], 10) : NaN;
}
function toDecimal(a: number) { return a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a); }
function parlayOdds(picks: DeepPick[]) {
  const decs = picks.map((p) => toDecimal(parseAmerican(p.odds))).filter((d) => Number.isFinite(d));
  if (decs.length === 0) return null;
  const total = decs.reduce((a, d) => a * d, 1);
  return total >= 2 ? `+${Math.round((total - 1) * 100)}` : `-${Math.round(100 / (total - 1))}`;
}
// ─── The page ─────────────────────────────────────────────────────────────────

export function ProductPickPage({
  product, board = "north-american", title, subtitle, accentNote,
}: {
  product: ProductKey; board?: string; title?: string; subtitle?: string; accentNote?: string;
}) {
  const meta = PRODUCT_META[product];
  const liveMap = useLiveScores();
  const [data, setData] = useState<DailyPicksData | null>(null);
  const [record, setRecord] = useState<{ wins: number; losses: number; pushes: number; winPercentage: string; units: number; streak?: { type: 'W' | 'L' | null; count: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (force = false) => {
    if (force) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ board });
      if (force) params.set("refresh", "true");
      const [picksRes, recRes] = await Promise.all([
        fetch(`/api/research/daily-picks?${params.toString()}`, { cache: "no-store" }),
        fetch(`/api/records/summary`, { cache: "no-store" }),
      ]);
      const picksJson = await picksRes.json();
      if (picksJson.success) setData(picksJson);
      const recJson = await recRes.json();
      if (recJson.success) setRecord(recJson.category_stats?.[meta.category] || null);
    } catch (e) {
      console.error("Product page load failed", e);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    load();
    // Auto-refresh every 2 min so the pick reflects live odds/lineup/injury changes.
    const interval = setInterval(() => load(true), 120000);
    return () => clearInterval(interval);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [board, product]);

  const picks: DeepPick[] = useMemo(() => {
    if (!data) return [];
    if (product === "grandSlam") return data.grandSlam ? [data.grandSlam] : [];
    return (data[product] as DeepPick[]) || [];
  }, [data, product]);

  const Icon = meta.icon;
  const combined = product === "parlayPlan" && picks.length > 1 ? parlayOdds(picks) : null;

  return (
    <div className="min-h-screen bg-background text-white pb-32">
      <div className="mx-auto max-w-5xl px-5 py-8 md:px-8 flex flex-col gap-7">
        {/* Brand + back */}
        <div className="flex items-center justify-between gap-4">
          <Link href="/picks" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" /> All Picks
          </Link>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/logo-badge.png" alt="HIMOTHY PLAYS AND PARLAYS" width={34} height={34} className="rounded-full border border-primary/40" />
            <span className="hidden sm:block text-xs font-black uppercase tracking-tight leading-none">HIMOTHY <span className="text-primary italic">Plays &amp; Parlays</span></span>
          </Link>
        </div>

        {/* Header */}
        <div className="border-b border-white/5 pb-7">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
              <Lock className="h-3 w-3" /> Premium Pick — included with access
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300/80">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live — updates near game time
            </span>
          </div>
          <h1 className="flex items-center gap-3 text-3xl md:text-4xl font-black uppercase tracking-tight">
            <Icon className="h-8 w-8 text-primary" /> {title || meta.label}
          </h1>
          {subtitle && <p className="mt-3 max-w-2xl text-base text-white/50 leading-relaxed">{subtitle}</p>}

          {/* BIG lifetime record block — user wants every section's own stats prominent. */}
          <div className="mt-6 rounded-3xl border-2 border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Lifetime Record — {title || meta.label}</div>
                {record && (record.wins + record.losses) > 0 ? (
                  <div className="mt-2 flex items-baseline flex-wrap gap-x-5 gap-y-1">
                    <span className="text-5xl md:text-6xl font-black tabular-nums leading-none">
                      {record.wins}<span className="text-white/30">-</span>{record.losses}{record.pushes ? <><span className="text-white/30">-</span>{record.pushes}</> : null}
                    </span>
                    <span className="text-2xl md:text-3xl font-black text-emerald-400 tabular-nums leading-none">{record.winPercentage}</span>
                    {typeof record.units === 'number' && (
                      <span className={`text-xl md:text-2xl font-black tabular-nums leading-none ${record.units >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {record.units >= 0 ? '+' : ''}{record.units.toFixed(1)}u
                      </span>
                    )}
                    {record.streak && record.streak.type && record.streak.count >= 2 && (
                      <span className={`text-xl md:text-2xl font-black tabular-nums leading-none inline-flex items-center gap-1 ${record.streak.type === 'W' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {record.streak.type === 'W' ? '🔥' : '🥶'} {record.streak.count}{record.streak.type}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 text-2xl font-black text-white/30">Tracking starts now — kept 100% real</div>
                )}
              </div>
              <button type="button" onClick={() => load(true)} disabled={refreshing}
                className="shrink-0 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors disabled:opacity-40 pt-1">
                <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
            {combined && (
              <div className="mt-4 pt-4 border-t border-white/8 flex items-baseline gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/80">Parlay Odds Today</span>
                <span className="text-2xl md:text-3xl font-black text-primary tabular-nums">{combined}</span>
              </div>
            )}
          </div>
          {accentNote && <p className="mt-4 text-xs font-semibold text-primary/80">{accentNote}</p>}
        </div>

        {/* Picks */}
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
            <span className="text-sm font-semibold text-white/40">Running deep research...</span>
          </div>
        ) : picks.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.02] py-20 text-center px-6">
            <Trophy className="mx-auto h-14 w-14 text-white/15 mb-5" />
            <h3 className="text-2xl font-black uppercase tracking-tight">{meta.emptyTitle}</h3>
            <p className="mx-auto mt-3 max-w-md text-white/40 leading-relaxed">{meta.emptyBody}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {product === "parlayPlan" && picks.length > 1 && (
              <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4 text-sm text-white/60">
                <span className="font-black text-primary">{picks.length}-leg parlay</span> — each leg is a different game. Combine all legs into one $10 ticket{combined ? ` for ${combined}` : ""}.
              </div>
            )}
            {picks.map((pick, i) => (
              <PickSummaryCard
                key={pick.gameId}
                pick={pick}
                index={picks.length > 1 ? i : undefined}
                href={`/pick/${pick.gameId}?board=${board}&from=${PRODUCT_PATH[product]}`}
                live={computeLiveState(pick, liveMap[pick.gameId])}
              />
            ))}
          </div>
        )}

        {/* Footer note */}
        <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          <ShieldCheck className="h-6 w-6 shrink-0 text-primary" />
          <p className="text-xs text-white/40 leading-relaxed">
            Every pick comes with the reason we like it. Win or lose, the result is graded honestly and kept on the record.
          </p>
        </div>
      </div>
    </div>
  );
}
