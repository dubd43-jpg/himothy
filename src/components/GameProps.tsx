"use client";

import { useEffect, useState } from "react";

// Renders the REAL-line player props for a single game (loaded on demand when a customer
// opens a pick, which keeps the odds-API quota low). Only shows props where we have a real
// sportsbook line AND a measured edge — never the old fabricated estimates.

interface PropRec {
  displayStat: string;
  recentAvg: number | null;
  marketLine: number | null;
  hasRealLine: boolean;
  overPrice: number | null;
  underPrice: number | null;
  bestBook: string | null;
  direction: "over" | "under";
  edgePct: number;
  confidence: string;
  reason: string;
  playerName?: string;
  last5Avg?: number | null;
  streakOver?: number;
  streakWindow?: number;
  trendDirection?: "up" | "down" | "flat";
}
interface PropsResp {
  dataAvailable?: boolean;
  playerProps?: { playerName: string; propRecs: PropRec[] }[];
}

export function GameProps({ gameId, league }: { gameId: string; league: string }) {
  const [data, setData] = useState<PropsResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch(`/api/research/player-props?gameId=${encodeURIComponent(gameId)}&league=${encodeURIComponent(league)}`, { cache: "no-store" });
        const j = await r.json();
        if (mounted) setData(j);
      } catch {
        /* non-blocking */
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [gameId, league]);

  if (loading) return null;

  const all = (data?.playerProps || []).flatMap((p) => p.propRecs.map((r) => ({ ...r, playerName: p.playerName })));
  const valueProps = all
    .filter((r) => r.hasRealLine && ["ELITE", "HIGH", "MEDIUM"].includes(r.confidence))
    .sort((a, b) => Math.abs(b.edgePct) - Math.abs(a.edgePct))
    .slice(0, 6);

  // Only render when there's a genuine real-line edge to show — no fake props, no noise.
  if (valueProps.length === 0) return null;

  return (
    <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.03] p-4 space-y-3">
      <div className="text-[11px] font-black uppercase tracking-widest text-emerald-400">Player Props — real lines, real edge</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {valueProps.map((r, i) => {
          const price = r.direction === "over" ? r.overPrice : r.underPrice;
          return (
            <div key={i} className="rounded-xl border border-white/8 bg-black/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-black text-white">{r.playerName}</div>
                  <div className="mt-0.5 text-xs font-bold text-primary">
                    {r.direction === "over" ? "OVER" : "UNDER"} {r.marketLine} {r.displayStat}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-black text-emerald-400">+{Math.abs(r.edgePct).toFixed(0)}%</div>
                  <div className="text-[10px] text-white/40">edge</div>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-bold text-white/45">
                {price != null && (
                  <span className="rounded-full border border-white/10 px-2 py-0.5 tabular-nums text-white/60">
                    {price > 0 ? "+" : ""}{price}{r.bestBook ? ` · ${r.bestBook}` : ""}
                  </span>
                )}
                {r.streakWindow && r.streakWindow > 0 && (
                  <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                    OVER {r.streakOver}/{r.streakWindow}
                  </span>
                )}
                {r.trendDirection === "up" && <span className="text-emerald-400">↑ heating up</span>}
                {r.trendDirection === "down" && <span className="text-amber-400">↓ cooling</span>}
                {r.last5Avg != null && <span>last 5 avg {r.last5Avg.toFixed(1)}</span>}
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-white/45">{r.reason}</p>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-white/30">Best price shown across books — verify before betting. Props update through the day.</p>
    </div>
  );
}
