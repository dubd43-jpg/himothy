"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Crown, Flame, ShieldCheck, DollarSign, Lock, RefreshCw, Trophy } from "lucide-react";
import { PickSummaryCard, type DeepPick } from "@/components/PickBreakdown";
import { useLiveScores } from "@/components/useLiveScores";
import { computeLiveState } from "@/lib/livePickStatus";
import { formatGameDateTimeET } from "@/lib/datetime";

interface ParlayExtraLeg {
  type: "prop" | "total";
  league: string; gameId: string; eventName: string;
  selection: string; odds: string | null; startTime: string | null; detail: string;
}

interface DailyPicksData {
  success: boolean; boardDate: string; generatedAt: string;
  grandSlam: DeepPick | null; pressurePack: DeepPick[]; vip4Pack: DeepPick[]; parlayPlan: DeepPick[];
  parlayExtraLegs?: ParlayExtraLeg[];
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
function parlayOddsFromList(oddsList: (string | null | undefined)[]) {
  const decs = oddsList.map((o) => toDecimal(parseAmerican(o ?? undefined))).filter((d) => Number.isFinite(d));
  if (decs.length === 0) return null;
  const total = decs.reduce((a, d) => a * d, 1);
  return total >= 2 ? `+${Math.round((total - 1) * 100)}` : `-${Math.round(100 / (total - 1))}`;
}

// Compact card for a prop/total fill leg on the $10 Parlay. Not clickable — there's no
// per-game breakdown for a player prop — but it shows the selection, price, game, and time.
function ExtraLegCard({ leg, index }: { leg: ParlayExtraLeg; index: number }) {
  const when = formatGameDateTimeET(leg.startTime);
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-widest text-white/30">
        <span className="truncate">
          <span className="text-primary">#{index + 1} · </span>
          <span className="text-sky-400/70">{leg.type === "prop" ? "PROP" : "TOTAL"}</span> · {leg.league} · {leg.eventName}
        </span>
        {when && <span className="shrink-0">{when}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="text-2xl font-black text-white leading-tight md:text-3xl">{leg.selection}</div>
        {leg.odds && <div className="shrink-0 rounded-xl border border-primary/25 bg-primary/10 px-4 py-2 text-xl font-black tabular-nums text-primary">{leg.odds}</div>}
      </div>
      {leg.detail && <div className="mt-2 text-xs text-white/45">{leg.detail}</div>}
    </article>
  );
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
  const [record, setRecord] = useState<{ wins: number; losses: number; pushes: number; winPercentage: string; units: number; streak?: { type: 'W' | 'L' | null; count: number }; clvBeatRate?: string; clvTracked?: number } | null>(null);
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
  // $10 Parlay can carry prop/total fill legs on top of the game legs (thin slates).
  const extraLegs: ParlayExtraLeg[] = product === "parlayPlan" ? (data?.parlayExtraLegs || []) : [];
  const parlayLegCount = picks.length + extraLegs.length;
  const allParlayOdds = [...picks.map((p) => p.odds), ...extraLegs.map((l) => l.odds)];
  const combined = product === "parlayPlan" && parlayLegCount > 1 ? parlayOddsFromList(allParlayOdds) : null;

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

          {/* Compact lifetime record strip — readable but doesn't dominate the page. */}
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 md:px-5 md:py-3.5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40 shrink-0">Lifetime</span>
                <span className="text-2xl md:text-3xl font-black tabular-nums leading-none">
                  {record?.wins ?? 0}<span className="text-white/30">-</span>{record?.losses ?? 0}{record?.pushes ? <><span className="text-white/30">-</span>{record.pushes}</> : null}
                </span>
                <span className="text-base md:text-lg font-black text-emerald-400 tabular-nums leading-none">{record?.winPercentage || '0.0%'}</span>
                <span className={`text-sm md:text-base font-black tabular-nums leading-none ${(record?.units ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {(record?.units ?? 0) >= 0 ? '+' : ''}{(record?.units ?? 0).toFixed(1)}u
                </span>
                {product === "grandSlam" && record?.streak && record.streak.type && record.streak.count >= 2 && (
                  <span className={`text-sm md:text-base font-black tabular-nums leading-none inline-flex items-center gap-1 ${record.streak.type === 'W' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {record.streak.type === 'W' ? '🔥' : '🥶'} {record.streak.count}{record.streak.type}
                  </span>
                )}
                {record?.clvBeatRate && (record.clvTracked ?? 0) > 0 && (
                  <span className="text-xs md:text-sm font-black tabular-nums leading-none text-white/50">
                    <span className="text-[9px] uppercase tracking-widest text-white/30 mr-1">CLV</span>{record.clvBeatRate}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {combined && (
                  <span className="text-xs font-black text-primary tabular-nums">
                    <span className="text-[9px] uppercase tracking-widest text-primary/60 mr-1.5">Parlay</span>{combined}
                  </span>
                )}
                <button type="button" onClick={() => load(true)} disabled={refreshing}
                  className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors disabled:opacity-40">
                  <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
                </button>
              </div>
            </div>
          </div>
          {accentNote && <p className="mt-4 text-xs font-semibold text-primary/80">{accentNote}</p>}
        </div>

        {/* Picks */}
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
            <span className="text-sm font-semibold text-white/40">Running deep research...</span>
          </div>
        ) : (picks.length === 0 && parlayLegCount === 0) ? (
          <div className="rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.02] py-20 text-center px-6">
            <Trophy className="mx-auto h-14 w-14 text-white/15 mb-5" />
            <h3 className="text-2xl font-black uppercase tracking-tight">{meta.emptyTitle}</h3>
            <p className="mx-auto mt-3 max-w-md text-white/40 leading-relaxed">{meta.emptyBody}</p>
          </div>
        ) : product === "parlayPlan" && parlayLegCount > 1 ? (() => {
          // Parlay aggregate: any single leg losing kills the whole parlay. Show BIG
          // WIN / LOSS / PUSH watermark on the parlay container so customers see the
          // ticket's fate at a glance — no hunting through individual legs.
          let anyLost = false; let anyPending = false; let allWon = true;
          for (const p of picks) {
            const ls = computeLiveState(p, liveMap[p.gameId]);
            if (!ls || ls.state !== 'final') { anyPending = true; allWon = false; continue; }
            if (ls.result === 'lost') { anyLost = true; allWon = false; }
            else if (ls.result !== 'won') { allWon = false; }
          }
          // Prop/total fill legs aren't live-graded — if any exist and no game leg has lost
          // yet, the ticket stays pending (we can't call a win until props settle).
          if (extraLegs.length > 0 && !anyLost) { anyPending = true; allWon = false; }
          const parlayResult: 'won' | 'lost' | 'pending' | 'push' = anyLost ? 'lost' : anyPending ? 'pending' : allWon ? 'won' : 'push';
          const containerAccent =
            parlayResult === 'won' ? 'border-emerald-400/70 bg-gradient-to-br from-emerald-500/[0.18] to-emerald-500/[0.04] shadow-[0_0_40px_-8px_rgba(16,185,129,0.5)]' :
            parlayResult === 'lost' ? 'border-red-500/80 bg-gradient-to-br from-red-500/[0.22] to-red-500/[0.04] shadow-[0_0_40px_-8px_rgba(239,68,68,0.5)]' :
            parlayResult === 'push' ? 'border-white/25 bg-white/[0.05]' :
            'border-primary/30 bg-primary/[0.04]';
          return (
            <div className={`relative overflow-hidden rounded-3xl border-2 p-5 md:p-6 space-y-4 ${containerAccent}`}>
              {parlayResult !== 'pending' && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
                  <div className={`text-8xl md:text-9xl font-black uppercase tracking-tighter ${
                    parlayResult === 'won' ? 'text-emerald-400/12' :
                    parlayResult === 'lost' ? 'text-red-500/15' :
                    'text-white/10'
                  }`}>
                    {parlayResult === 'won' ? 'WIN' : parlayResult === 'lost' ? 'LOSS' : 'PUSH'}
                  </div>
                </div>
              )}
              <div className="relative text-sm text-white/60">
                <span className="font-black text-primary">{parlayLegCount}-leg parlay</span> — all legs must hit. One leg losing = the whole parlay loses{combined ? `. Estimated payout: ${combined}` : ""}.
                {extraLegs.length > 0 && <span className="block mt-1 text-xs text-white/40">Game legs plus {extraLegs.length} prop/total {extraLegs.length === 1 ? "leg" : "legs"} for extra value on a light slate.</span>}
              </div>
              <div className="relative space-y-5">
                {picks.map((pick, i) => (
                  <PickSummaryCard
                    key={pick.gameId}
                    pick={pick}
                    index={i}
                    href={`/pick/${pick.gameId}?board=${board}&from=${PRODUCT_PATH[product]}`}
                    live={computeLiveState(pick, liveMap[pick.gameId])}
                  />
                ))}
                {extraLegs.map((leg, i) => (
                  <ExtraLegCard key={`${leg.gameId}-${leg.selection}-${i}`} leg={leg} index={picks.length + i} />
                ))}
              </div>
            </div>
          );
        })() : (
          <div className="space-y-5">
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
