"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Crown, ExternalLink, TrendingUp, TrendingDown } from "lucide-react";
import { buildHardRockUrl } from "@/lib/hardRock";

interface PropEdge {
  athleteId: string;
  playerName: string;
  position: string;
  teamName: string;
  side: "home" | "away";
  league: string;
  market: string;
  projection: number;
  marketLine: number | null;
  marketOverPrice: number | null;
  marketUnderPrice: number | null;
  bestBook: string | null;
  l5Avg: number | null;
  l10Avg: number | null;
  seasonAvg: number | null;
  hitRateL10: { hits: number; sample: number; pct: number } | null;
  edgeScore: number;
  recommended: "over" | "under" | null;
  gameId: string;
  eventName: string;
}

interface PersonalPickPayload {
  success: boolean;
  topPick: PropEdge | null;
  runnerUps: PropEdge[];
  totalGamesScanned: number;
  totalPropsEvaluated: number;
  emptyReason?: string;
}

const MARKET_LABELS: Record<string, string> = {
  pitcher_strikeouts: "Strikeouts",
  batter_hits: "Hits",
  batter_home_runs: "Home Runs",
  batter_total_bases: "Total Bases",
  batter_rbis: "RBIs",
  player_points: "Points",
  player_rebounds: "Rebounds",
  player_assists: "Assists",
  player_threes: "3-Pointers Made",
  player_shots_on_goal: "Shots On Goal",
  player_goals: "Goals",
};

function americanOdds(n: number | null): string {
  if (n == null) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

export default function HimothyPersonalPickPage() {
  const [data, setData] = useState<PersonalPickPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/research/personal-pick", { cache: "no-store" });
        setData(await r.json());
      } catch {/* ignore */}
      finally { setLoading(false); }
    })();
  }, []);

  const top = data?.topPick;
  const marketLabel = top ? (MARKET_LABELS[top.market] || top.market) : "";
  const recommendedLine = top && top.marketLine != null
    ? `${top.recommended === "over" ? "Over" : "Under"} ${top.marketLine}`
    : top?.recommended === "over" ? `Trending Over` : top?.recommended === "under" ? `Trending Under` : "—";

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
            <Crown className="h-8 w-8 text-primary" /> HIMOTHY Personal Pick
          </h1>
          <p className="mt-3 max-w-2xl text-base text-white/55 leading-relaxed">
            One pick. Every day. The single highest-edge player prop across MLB, NBA, NHL, NFL, WNBA, and college — recency-weighted projection vs. market line. Standalone — not bundled with subscriptions.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
            <span className="text-sm font-semibold text-white/40">Scanning every prop across every league...</span>
          </div>
        ) : !top ? (
          <div className="rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.02] py-12 text-center px-6">
            <h3 className="text-xl font-black uppercase tracking-tight">Resting Today</h3>
            <p className="mx-auto mt-3 max-w-md text-white/45 leading-relaxed">
              {data?.emptyReason || "No prop passed the bar today. Personal Pick only posts when a real edge is on the board."}
            </p>
            <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-white/30">
              Scanned {data?.totalGamesScanned ?? 0} games · {data?.totalPropsEvaluated ?? 0} props
            </p>
          </div>
        ) : (
          <article className="rounded-3xl border-2 border-primary/40 bg-gradient-to-br from-primary/[0.08] to-transparent p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-widest text-white/40">
              <span>{top.league} · {top.eventName}</span>
              <span className="inline-flex items-center gap-1 text-primary">
                <Crown className="h-3 w-3" /> Personal Pick · edge {top.edgeScore}
              </span>
            </div>

            <div>
              <div className="text-3xl md:text-4xl font-black text-white leading-tight">
                {top.playerName}
              </div>
              <div className="mt-2 text-lg md:text-xl font-bold text-primary">
                {marketLabel} · {recommendedLine}
              </div>
              {top.marketOverPrice != null && (
                <div className="mt-1 text-sm text-white/60">
                  Best price: {top.recommended === "over" ? americanOdds(top.marketOverPrice) : americanOdds(top.marketUnderPrice)}
                  {top.bestBook ? ` at ${top.bestBook}` : ""}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Projection" value={top.projection.toFixed(2)} accent />
              <Stat label="Line" value={top.marketLine != null ? top.marketLine.toFixed(1) : "—"} />
              <Stat label="Last 5 avg" value={top.l5Avg != null ? top.l5Avg.toFixed(2) : "—"} />
              <Stat label="Last 10 avg" value={top.l10Avg != null ? top.l10Avg.toFixed(2) : "—"} />
            </div>

            {top.hitRateL10 && top.marketLine != null && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
                {top.recommended === "over" ? (
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-rose-400" />
                )}
                <div className="flex-1">
                  <div className="text-xs font-black uppercase tracking-widest text-white/40">Tendency vs the line</div>
                  <div className="text-sm font-bold text-white mt-1">
                    {top.recommended === "over"
                      ? `Hit the over in ${top.hitRateL10.hits} of last ${top.hitRateL10.sample} games`
                      : `Under hit in ${top.hitRateL10.sample - top.hitRateL10.hits} of last ${top.hitRateL10.sample} games`}
                    {" "}({Math.round((top.recommended === "over" ? top.hitRateL10.pct : 1 - top.hitRateL10.pct) * 100)}%)
                  </div>
                </div>
              </div>
            )}

            <a
              href={buildHardRockUrl({ league: top.league, selection: `${top.playerName} ${marketLabel}` })}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-3 w-full rounded-2xl bg-primary px-6 py-4 text-sm font-black uppercase tracking-widest text-black hover:bg-white transition-all shadow-[0_15px_40px_-10px_rgba(212,168,67,0.5)]"
            >
              Bet on Hard Rock <ExternalLink className="h-4 w-4" />
            </a>

            <p className="text-[11px] text-white/30 font-medium leading-relaxed">
              Recency-weighted projection: 40% last 5 + 40% last 10 + 20% season. Scanned {data?.totalGamesScanned} games, {data?.totalPropsEvaluated} props evaluated. Frozen for the day at 8am ET.
            </p>
          </article>
        )}

        {top && data && data.runnerUps.length > 0 && (
          <section className="space-y-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Also strong today</div>
            <div className="space-y-2">
              {data.runnerUps.map((r) => (
                <div key={`${r.athleteId}-${r.market}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-black truncate">{r.playerName} · {MARKET_LABELS[r.market] || r.market}</div>
                    <div className="text-[10px] text-white/40 uppercase tracking-widest">{r.league} · {r.eventName}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-black text-white/70">
                      {r.recommended === "over" ? "O" : "U"} {r.marketLine != null ? r.marketLine.toFixed(1) : "—"}
                    </div>
                    <div className="text-[10px] text-white/30">edge {r.edgeScore}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border ${accent ? "border-primary/40 bg-primary/[0.06]" : "border-white/10 bg-white/[0.03]"} p-3 text-center`}>
      <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">{label}</div>
      <div className={`text-lg font-black ${accent ? "text-primary" : "text-white"} tabular-nums`}>{value}</div>
    </div>
  );
}
