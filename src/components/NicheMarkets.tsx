"use client";

import { useEffect, useState } from "react";
import { Activity, Goal } from "lucide-react";

interface F5 {
  totalLine: number | null;
  bestOverPrice: number | null;
  bestUnderPrice: number | null;
  homeF5SpreadLine: number | null;
  awayF5SpreadLine: number | null;
  bestHomeSpreadPrice: number | null;
  bestAwaySpreadPrice: number | null;
  homeF5MLPrice: number | null;
  awayF5MLPrice: number | null;
  bookCount: number;
}

interface Scorer {
  player: string;
  bestPrice: number | null;
  bestBook: string | null;
  consensusProb: number | null;
}

interface Props {
  league: string;
  homeTeam: string;
  awayTeam: string;
}

const fmtOdds = (n: number | null) => (n == null ? "—" : n > 0 ? `+${n}` : `${n}`);

export function NicheMarkets({ league, homeTeam, awayTeam }: Props) {
  const [f5, setF5] = useState<F5 | null>(null);
  const [scorers, setScorers] = useState<Scorer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const u = `/api/research/niche-markets?league=${encodeURIComponent(league)}&home=${encodeURIComponent(homeTeam)}&away=${encodeURIComponent(awayTeam)}`;
        const r = await fetch(u, { cache: "no-store" });
        const d = await r.json();
        if (!mounted) return;
        setF5(d.f5 || null);
        setScorers(d.scorers || []);
      } catch { /* ignore */ }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [league, homeTeam, awayTeam]);

  const hasF5 = league === "MLB" && f5 && (f5.totalLine != null || f5.homeF5MLPrice != null);
  const hasScorers = (league === "NFL" || league === "College Football" || league === "NHL") && scorers.length > 0;

  if (loading) return null;
  if (!hasF5 && !hasScorers) return null;

  return (
    <section className="rounded-3xl border-2 border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white/60">
        <Activity className="h-4 w-4 text-amber-400" /> Niche Markets
      </div>

      {hasF5 && f5 && (
        <div className="space-y-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-amber-400">F5 — First 5 Innings</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {f5.totalLine != null && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">F5 Total</div>
                <div className="text-xl font-black">{f5.totalLine}</div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-white/50">Over <span className="font-black text-emerald-400">{fmtOdds(f5.bestOverPrice)}</span></span>
                  <span className="text-white/50">Under <span className="font-black text-rose-400">{fmtOdds(f5.bestUnderPrice)}</span></span>
                </div>
              </div>
            )}
            {f5.homeF5SpreadLine != null && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">F5 Spread</div>
                <div className="text-xl font-black">{homeTeam} {f5.homeF5SpreadLine > 0 ? "+" : ""}{f5.homeF5SpreadLine}</div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-white/50">Home <span className="font-black">{fmtOdds(f5.bestHomeSpreadPrice)}</span></span>
                  <span className="text-white/50">Away <span className="font-black">{fmtOdds(f5.bestAwaySpreadPrice)}</span></span>
                </div>
              </div>
            )}
            {(f5.homeF5MLPrice != null || f5.awayF5MLPrice != null) && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">F5 Moneyline</div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-white/60">{awayTeam}</span>
                  <span className="font-black">{fmtOdds(f5.awayF5MLPrice)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-white/60">{homeTeam}</span>
                  <span className="font-black">{fmtOdds(f5.homeF5MLPrice)}</span>
                </div>
              </div>
            )}
          </div>
          <div className="text-[10px] text-white/30">Best price across {f5.bookCount} books</div>
        </div>
      )}

      {hasScorers && (
        <div className={hasF5 ? "mt-5 pt-5 border-t border-white/5 space-y-3" : "space-y-3"}>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-sky-400">
            <Goal className="h-3 w-3" /> Anytime {league === "NHL" ? "Goal Scorer" : "Touchdown Scorer"}
          </div>
          <div className="space-y-2">
            {scorers.slice(0, 8).map((s, i) => (
              <div key={s.player + i} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-black text-white/40 w-5">{i + 1}.</span>
                  <span className="text-sm font-bold truncate">{s.player}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {s.consensusProb != null && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{s.consensusProb}%</span>
                  )}
                  <span className="text-sm font-black text-emerald-400">{fmtOdds(s.bestPrice)}</span>
                  {s.bestBook && <span className="text-[10px] text-white/30 hidden md:inline">{s.bestBook}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
