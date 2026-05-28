"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Clock, ExternalLink } from "lucide-react";
import { buildHardRockUrl } from "@/lib/hardRock";

interface PeriodPlay {
  gameId: string;
  eventName: string;
  league: string;
  awayTeam: string;
  homeTeam: string;
  period: '1H' | '2H' | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'P1' | 'P2' | 'P3';
  market: 'spread' | 'total' | 'moneyline';
  selection: string;
  line: number | null;
  odds: string | null;
  bestBook: string | null;
  edgeScore: number;
  reason: string;
}

export default function PeriodPlaysPage() {
  const [plays, setPlays] = useState<PeriodPlay[]>([]);
  const [scanned, setScanned] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/research/period-plays', { cache: 'no-store' });
        const d = await r.json();
        if (d.success) {
          setPlays(d.plays || []);
          setScanned(d.totalGamesScanned || 0);
        }
      } catch {/* ignore */}
      finally { setLoading(false); }
    })();
  }, []);

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
            <Clock className="h-8 w-8 text-primary" /> Period Plays
          </h1>
          <p className="mt-3 max-w-2xl text-base text-white/55 leading-relaxed">
            First halves, second halves, quarters, hockey periods. Whenever the tendency math and the line don't agree, we surface the play — Over or Under, every period offered.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
            <span className="text-sm font-semibold text-white/40">Scanning every half and quarter on the board…</span>
          </div>
        ) : plays.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.02] py-12 text-center px-6">
            <h3 className="text-xl font-black uppercase tracking-tight">No Period Edges Today</h3>
            <p className="mx-auto mt-3 max-w-md text-white/45 leading-relaxed">
              Scanned {scanned} games. Nothing cleared the edge floor for a half / quarter / period play. Could also be Odds API quota — period markets need a paid tier.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {plays.map((p, i) => (
              <article key={`${p.gameId}-${p.period}-${p.selection}-${i}`} className="rounded-2xl border-2 border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5">
                <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">
                  <span>{p.league} · {p.awayTeam} @ {p.homeTeam}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-primary">
                    {p.period} · edge {p.edgeScore}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-xl md:text-2xl font-black text-white">{p.selection}</div>
                  {p.odds && (
                    <div className="shrink-0 rounded-xl border border-primary/25 bg-primary/10 px-3 py-1.5 text-lg font-black tabular-nums text-primary">{p.odds}</div>
                  )}
                </div>
                <p className="mt-2 text-xs text-white/50 leading-relaxed">{p.reason}</p>
                <div className="mt-3 flex items-center gap-3">
                  <a
                    href={buildHardRockUrl({ league: p.league, selection: p.selection, homeTeam: p.homeTeam, awayTeam: p.awayTeam })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black uppercase tracking-widest text-black hover:bg-white transition-all"
                  >
                    Bet on Hard Rock <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  {p.bestBook && (
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Best price: {p.bestBook}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
