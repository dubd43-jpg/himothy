"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

interface Step {
  side: 'over' | 'under';
  point: number;
  bestPrice: number | null;
  bestBook: string | null;
}
interface Ladder {
  player: string;
  market: string;
  steps: Step[];
}

interface Props {
  league: string;
  homeTeam: string;
  awayTeam: string;
}

const MARKET_LABELS: Record<string, string> = {
  player_points_alternate: "Points",
  player_rebounds_alternate: "Rebounds",
  player_assists_alternate: "Assists",
  player_threes_alternate: "3-Pointers",
  player_shots_on_goal_alternate: "Shots on Goal",
  pitcher_strikeouts_alternate: "Strikeouts",
  batter_hits_alternate: "Hits",
  batter_total_bases_alternate: "Total Bases",
  batter_home_runs_alternate: "Home Runs",
  player_pass_yds_alternate: "Pass Yds",
  player_rush_yds_alternate: "Rush Yds",
  player_reception_yds_alternate: "Rec Yds",
};

const fmtOdds = (n: number | null) => (n == null ? "—" : n > 0 ? `+${n}` : `${n}`);
const priceColor = (n: number | null) => (n == null ? "text-white/30" : n > 0 ? "text-emerald-400" : n > -150 ? "text-white" : "text-white/50");

// Alt prop LADDERS — same player, multiple lines (e.g., LeBron over 22.5 / 24.5 / 26.5).
// Hard Rock prices these softly, so the goal is to surface the cheapest step at the best
// book per player+stat. Quota-heavy, on-demand only.
export function AltPropLadders({ league, homeTeam, awayTeam }: Props) {
  const [ladders, setLadders] = useState<Ladder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const u = `/api/research/alt-props?league=${encodeURIComponent(league)}&home=${encodeURIComponent(homeTeam)}&away=${encodeURIComponent(awayTeam)}`;
        const r = await fetch(u, { cache: "no-store" });
        const d = await r.json();
        if (mounted) setLadders(d.ladders || []);
      } catch { /* ignore */ }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [league, homeTeam, awayTeam]);

  if (loading || ladders.length === 0) return null;

  // Group ladders by player so each player gets one card with stats stacked inside.
  const byPlayer = new Map<string, Ladder[]>();
  for (const l of ladders) {
    if (!byPlayer.has(l.player)) byPlayer.set(l.player, []);
    byPlayer.get(l.player)!.push(l);
  }

  return (
    <section className="rounded-3xl border-2 border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white/60">
        <Sparkles className="h-4 w-4 text-amber-400" /> Alt Prop Ladders
        <span className="ml-auto text-[10px] text-white/30">best book per step</span>
      </div>

      <div className="space-y-5">
        {Array.from(byPlayer.entries()).slice(0, 8).map(([player, list]) => (
          <div key={player} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
            <div className="text-sm font-black mb-3 truncate">{player}</div>
            {list.map((lad) => {
              const overs = lad.steps.filter((s) => s.side === 'over').slice(0, 5);
              const unders = lad.steps.filter((s) => s.side === 'under').slice(0, 5);
              const label = MARKET_LABELS[lad.market] || lad.market.replace(/^player_|_alternate$/g, '').replace(/_/g, ' ');
              return (
                <div key={lad.market} className="mb-3 last:mb-0">
                  <div className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-2">{label}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-white/30 mb-1">Over</div>
                      <div className="space-y-1">
                        {overs.map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-xs rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1">
                            <span className="font-black tabular-nums">{s.point}</span>
                            <span className={`font-black tabular-nums ${priceColor(s.bestPrice)}`}>{fmtOdds(s.bestPrice)}</span>
                            {s.bestBook && <span className="text-[9px] text-white/30 hidden md:inline">{s.bestBook.slice(0, 6)}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-white/30 mb-1">Under</div>
                      <div className="space-y-1">
                        {unders.reverse().map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-xs rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1">
                            <span className="font-black tabular-nums">{s.point}</span>
                            <span className={`font-black tabular-nums ${priceColor(s.bestPrice)}`}>{fmtOdds(s.bestPrice)}</span>
                            {s.bestBook && <span className="text-[9px] text-white/30 hidden md:inline">{s.bestBook.slice(0, 6)}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
