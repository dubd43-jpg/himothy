"use client";

import { useEffect, useState } from "react";
import { TrendingDown, Calendar } from "lucide-react";
import Link from "next/link";

// Public loss-transparency page — owner directive: when we lose, we say WHY.
// Most picks sites hide losses. We surface them with the deep data so customers
// see we did the work — and learn from us. Trust > vanity record.

interface PublicLoss {
  id: string;
  date: string;
  category: string;
  league: string;
  selection: string;
  odds: string;
  closingNote: string | null;     // "Final: NYY 4-6 OAK" type line
  whyWeLikedIt: string[];          // The reasonsFor we showed at publish
  whatHappened: string | null;     // The post-game truth
  scoreGap: number | null;          // engine score gap (small = closer call)
}

export default function PublicLossesPage() {
  const [losses, setLosses] = useState<PublicLoss[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/transparency/losses", { cache: "no-store" });
        const j = await r.json();
        setLosses(j?.losses || []);
      } catch {
        setLosses([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <Link href="/picks" className="text-xs text-white/50 hover:text-white">← back to tonight's board</Link>
        <div className="mt-3 flex items-center gap-3">
          <TrendingDown className="w-7 h-7 text-red-400" />
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight">When we lose, here's why</h1>
        </div>
        <p className="mt-2 text-sm text-white/60 leading-relaxed">
          Most pick sites hide losses. We show them — with the deep data we had at publish,
          what the engine missed, and the actual result. Honest record, every time.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-white/40">Loading losses…</div>
      ) : !losses?.length ? (
        <div className="rounded-2xl border-2 border-dashed border-white/10 p-10 text-center text-white/40">
          No graded losses to show yet.
        </div>
      ) : (
        <div className="space-y-4">
          {losses.map((l) => (
            <article key={l.id} className="rounded-xl border border-red-500/30 bg-red-500/[0.04] p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-300">
                  <span>LOSS</span>
                  <span className="text-white/40">·</span>
                  <span>{l.category.replace(/_/g, " ")}</span>
                  <span className="text-white/40">·</span>
                  <span>{l.league}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-white/40">
                  <Calendar className="w-3 h-3" />
                  {l.date}
                </div>
              </div>
              <div className="text-lg font-black">{l.selection} <span className="text-white/40 font-normal text-sm">({l.odds})</span></div>
              {l.closingNote && (
                <div className="mt-2 text-sm text-white/70">{l.closingNote}</div>
              )}
              {l.whyWeLikedIt.length > 0 && (
                <div className="mt-3 border-t border-white/5 pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1.5">Why we liked it</div>
                  <ul className="space-y-1 text-xs text-white/70">
                    {l.whyWeLikedIt.map((w, i) => <li key={i} className="flex gap-1.5"><span className="text-white/30">·</span>{w}</li>)}
                  </ul>
                </div>
              )}
              {l.whatHappened && (
                <div className="mt-3 border-t border-white/5 pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1.5">What happened</div>
                  <div className="text-xs text-white/70 italic">{l.whatHappened}</div>
                </div>
              )}
              {l.scoreGap != null && l.scoreGap <= 5 && (
                <div className="mt-2 text-[10px] text-amber-400/70">
                  Coin-flip call — engine had this {l.scoreGap}-point edge over the other side. Volatility happens.
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
