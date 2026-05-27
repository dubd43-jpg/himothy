"use client";

import { useEffect, useState } from "react";
import { Layers } from "lucide-react";

interface AltStep {
  side: string;
  point: number;
  bestPrice: number | null;
  bestBook: string | null;
}
interface TeamTotal {
  side: 'home' | 'away';
  line: number;
  bestOverPrice: number | null;
  bestUnderPrice: number | null;
  bestOverBook: string | null;
  bestUnderBook: string | null;
}
interface Pkg {
  altSpreads: AltStep[];
  altTotals: AltStep[];
  teamTotals: TeamTotal[];
  bookCount: number;
}

interface Props {
  league: string;
  homeTeam: string;
  homeAbbr: string;
  awayTeam: string;
  awayAbbr: string;
}

const fmtOdds = (n: number | null) => (n == null ? "—" : n > 0 ? `+${n}` : `${n}`);
const priceColor = (n: number | null) => (n == null ? "text-white/30" : n > 0 ? "text-emerald-400" : n > -150 ? "text-white" : "text-white/50");

// Hard Rock-style alt-line ladder. Shows the cheapest price at the best book per step
// of the spread + totals ladders, plus the team totals. Quota-safe — loads on-demand.
export function AltLines({ league, homeTeam, homeAbbr, awayTeam, awayAbbr }: Props) {
  const [pkg, setPkg] = useState<Pkg | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const u = `/api/research/alt-lines?league=${encodeURIComponent(league)}&home=${encodeURIComponent(homeTeam)}&away=${encodeURIComponent(awayTeam)}`;
        const r = await fetch(u, { cache: "no-store" });
        const d = await r.json();
        if (mounted) setPkg(d.altLines || null);
      } catch { /* ignore */ }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [league, homeTeam, awayTeam]);

  if (loading || !pkg) return null;

  const homeSpreads = pkg.altSpreads.filter((s) => s.side === 'home').sort((a, b) => b.point - a.point);
  const awaySpreads = pkg.altSpreads.filter((s) => s.side === 'away').sort((a, b) => b.point - a.point);
  const overs = pkg.altTotals.filter((t) => t.side === 'over').sort((a, b) => a.point - b.point);
  const unders = pkg.altTotals.filter((t) => t.side === 'under').sort((a, b) => b.point - a.point);
  const homeTT = pkg.teamTotals.find((t) => t.side === 'home');
  const awayTT = pkg.teamTotals.find((t) => t.side === 'away');

  const hasAnything = homeSpreads.length || awaySpreads.length || overs.length || unders.length || homeTT || awayTT;
  if (!hasAnything) return null;

  const SpreadColumn = ({ label, steps }: { label: string; steps: AltStep[] }) => (
    <div className="space-y-1.5">
      <div className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</div>
      {steps.slice(0, 6).map((s, i) => (
        <div key={i} className="flex items-center justify-between text-xs rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
          <span className="font-black tabular-nums">{s.point > 0 ? `+${s.point}` : s.point}</span>
          <span className={`font-black tabular-nums ${priceColor(s.bestPrice)}`}>{fmtOdds(s.bestPrice)}</span>
          {s.bestBook && <span className="text-[9px] text-white/30 hidden md:inline">{s.bestBook.slice(0, 6)}</span>}
        </div>
      ))}
    </div>
  );

  return (
    <section className="rounded-3xl border-2 border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white/60">
        <Layers className="h-4 w-4 text-sky-400" /> Alt-Line Ladder
        <span className="ml-auto text-[10px] text-white/30">{pkg.bookCount} books</span>
      </div>

      {(homeSpreads.length > 0 || awaySpreads.length > 0) && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          {awaySpreads.length > 0 && <SpreadColumn label={`${awayAbbr} Spread`} steps={awaySpreads} />}
          {homeSpreads.length > 0 && <SpreadColumn label={`${homeAbbr} Spread`} steps={homeSpreads} />}
        </div>
      )}

      {(overs.length > 0 || unders.length > 0) && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          {overs.length > 0 && <SpreadColumn label="Over Total" steps={overs} />}
          {unders.length > 0 && <SpreadColumn label="Under Total" steps={unders} />}
        </div>
      )}

      {(homeTT || awayTT) && (
        <div className="pt-4 border-t border-white/5">
          <div className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-2">Team Totals</div>
          <div className="grid grid-cols-2 gap-3">
            {[awayTT, homeTT].map((tt, idx) => {
              if (!tt) return <div key={idx} />;
              const abbr = tt.side === 'home' ? homeAbbr : awayAbbr;
              return (
                <div key={tt.side} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">{abbr}</div>
                  <div className="text-xl font-black tabular-nums">{tt.line}</div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-white/50">Over <span className={`font-black ${priceColor(tt.bestOverPrice)}`}>{fmtOdds(tt.bestOverPrice)}</span></span>
                    <span className="text-white/50">Under <span className={`font-black ${priceColor(tt.bestUnderPrice)}`}>{fmtOdds(tt.bestUnderPrice)}</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
