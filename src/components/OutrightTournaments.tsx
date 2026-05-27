"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";

interface Contender {
  name: string;
  bestPrice: number | null;
  bestBook: string | null;
  consensusProb: number | null;
}
interface Tournament {
  sportKey: string;
  title: string;
  commenceTime: string | null;
  contenders: Contender[];
  bookCount: number;
}

const fmtOdds = (n: number | null) => (n == null ? "—" : n > 0 ? `+${n}` : `${n}`);
const fmtDate = (iso: string | null) => {
  if (!iso) return "TBD";
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric" });
  } catch { return "TBD"; }
};

export function OutrightTournaments({ tournaments }: { tournaments: Tournament[] }) {
  if (!tournaments || tournaments.length === 0) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.02] py-12 text-center text-sm text-white/40">
        No active outright futures right now. Check back when a major or championship gets close.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {tournaments.map((t) => (
        <section key={t.sportKey} className="rounded-3xl border-2 border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-amber-400">
                <Trophy className="h-4 w-4" /> {t.title}
              </div>
              <div className="text-[10px] text-white/40 mt-1">
                Starts {fmtDate(t.commenceTime)} · {t.bookCount} books · best price shown
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {t.contenders.map((c, i) => (
              <div key={c.name + i} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-black text-white/30 w-6">{i + 1}.</span>
                  <span className="text-sm font-black truncate">{c.name}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {c.consensusProb != null && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{c.consensusProb}%</span>
                  )}
                  <span className={`text-sm font-black tabular-nums ${c.bestPrice != null && c.bestPrice > 0 ? 'text-emerald-400' : 'text-white'}`}>
                    {fmtOdds(c.bestPrice)}
                  </span>
                  {c.bestBook && <span className="text-[10px] text-white/30 hidden md:inline">{c.bestBook}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
