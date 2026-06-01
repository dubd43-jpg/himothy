"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Radio, Clock } from "lucide-react";
import { formatGameDateTimeET, TIME_TBD } from "@/lib/datetime";

interface NrfiPlay {
  gameId: string; eventName: string; awayPitcher: string; homePitcher: string;
  awayERA: number | null; homeERA: number | null; nrfiScore: number; reason: string; odds: string;
  startTime: string; awayTeam: string; homeTeam: string;
  state: "pre" | "live" | "final"; statusDetail: string;
  awayScore: number; homeScore: number; firstInningRuns: number | null;
  result: "won" | "lost" | "pending" | null;
}

interface NrfiRecord { wins: number; losses: number; pushes: number; winPercentage: string }

export default function NrfiPage() {
  const [plays, setPlays] = useState<NrfiPlay[]>([]);
  const [record, setRecord] = useState<NrfiRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [res, recRes] = await Promise.all([
          fetch("/api/research/daily-picks?board=north-american", { cache: "no-store" }),
          fetch("/api/records/summary", { cache: "no-store" }),
        ]);
        const d = await res.json();
        if (mounted) setPlays((d.nrfi || []) as NrfiPlay[]);
        const rec = await recRes.json();
        if (mounted) setRecord(rec?.success ? (rec.category_stats?.NRFI || null) : null);
      } catch {
        /* ignore */
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    // Refresh fast so the NRFI result flips to won/lost as soon as the 1st inning settles.
    const i = setInterval(load, 30000);
    return () => { mounted = false; clearInterval(i); };
  }, []);

  // Tonight's NRFI tally, straight from today's settled games (real numbers now, even
  // before the lifetime database is wired up).
  const tonight = plays.reduce(
    (acc, p) => {
      if (p.result === "won") acc.won++;
      else if (p.result === "lost") acc.lost++;
      else if (p.result === "pending") acc.pending++;
      return acc;
    },
    { won: 0, lost: 0, pending: 0 }
  );

  return (
    <div className="min-h-screen bg-background text-white pb-24">
      <div className="mx-auto max-w-5xl px-5 py-8 md:px-8 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/picks" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" /> All Picks
          </Link>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/logo-badge.png" alt="HIMOTHY PLAYS AND PARLAYS" width={34} height={34} className="rounded-full border border-primary/40" />
            <span className="hidden sm:block text-xs font-black uppercase tracking-tight leading-none">HIMOTHY <span className="text-primary italic">Plays &amp; Parlays</span></span>
          </Link>
        </div>

        <div className="border-b border-white/5 pb-6">
          <h1 className="flex items-center gap-3 text-3xl md:text-4xl font-black uppercase tracking-tight">
            <Radio className="h-8 w-8 text-primary" /> NRFI — No Runs First Inning
          </h1>
          <p className="mt-3 max-w-2xl text-base text-white/50 leading-relaxed">
            MLB games we like for zero runs in the 1st — judged off both starting pitchers, with the reason on every game.
          </p>

          {/* Compact NRFI stat strip — matches the rest of the section pages. */}
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 md:px-5 md:py-3.5">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40 shrink-0">NRFI Lifetime</span>
              <span className="text-2xl md:text-3xl font-black tabular-nums leading-none">
                {record?.wins ?? 0}<span className="text-white/30">-</span>{record?.losses ?? 0}{record?.pushes ? <><span className="text-white/30">-</span>{record.pushes}</> : null}
              </span>
              <span className="text-base md:text-lg font-black text-emerald-400 tabular-nums leading-none">{record?.winPercentage || '0.0%'}</span>
              {(tonight.won + tonight.lost + tonight.pending) > 0 && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Tonight</span>
                  <span className="text-base md:text-lg font-black text-emerald-400 tabular-nums leading-none">{tonight.won}W</span>
                  <span className="text-base md:text-lg font-black text-red-400 tabular-nums leading-none">{tonight.lost}L</span>
                  {tonight.pending > 0 && <span className="text-xs font-bold text-amber-400">{tonight.pending} live</span>}
                </>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
            <span className="text-sm font-semibold text-white/40">Loading...</span>
          </div>
        ) : plays.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.02] py-20 text-center px-6">
            <Radio className="mx-auto h-14 w-14 text-white/15 mb-5" />
            <h3 className="text-2xl font-black uppercase tracking-tight">No NRFI Plays Today</h3>
            <p className="mx-auto mt-3 max-w-md text-white/40 leading-relaxed">We only flag NRFI when both starters profile to keep the first frame clean. Nothing qualified today.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {plays.map((play) => {
              const startTime = formatGameDateTimeET(play.startTime) || TIME_TBD;
              const showLive = play.state !== "pre";
              return (
              <Link key={play.gameId} href={`/pick/${play.gameId}?from=/nrfi&selection=${encodeURIComponent(`NRFI — ${play.eventName}`)}`} className="block">
              <article className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3 hover:border-primary/40 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold text-white/40">{play.eventName}</div>
                    <div className="mt-0.5 text-lg font-black text-white">NRFI · No Runs 1st Inning</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs font-bold">
                      <span className="text-primary">Under 0.5 (1st)</span>
                      <span className="text-white/30">~{play.odds} · verify price</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[9px] font-black uppercase tracking-widest text-white/30">HIMOTHY rating</div>
                    <div className="text-lg font-black text-emerald-400">{play.nrfiScore}<span className="text-[10px] text-white/30">/100</span></div>
                  </div>
                </div>

                {/* Status: start time (pregame) OR live score + result */}
                {!showLive ? (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white/45">
                    <Clock className="h-3.5 w-3.5" /> Starts {startTime}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-bold tabular-nums text-white/70">
                      {play.state === "live"
                        ? <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-red-400"><span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> Live</span>
                        : <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Final</span>}
                      <span>{play.awayScore}–{play.homeScore}</span>
                      {play.statusDetail && <span className="text-[11px] font-bold italic text-white/40">{play.statusDetail}</span>}
                    </div>
                    {play.result === "won" && <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-emerald-400">NRFI Won ✓</span>}
                    {play.result === "lost" && <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-red-400">NRFI Lost</span>}
                    {play.result === "pending" && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-amber-400">1st in progress…</span>}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-white/55">{play.awayPitcher} · {play.awayERA?.toFixed(2)} ERA</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-white/55">{play.homePitcher} · {play.homeERA?.toFixed(2)} ERA</span>
                </div>
                <p className="text-xs text-white/55 leading-relaxed">{play.reason}</p>
              </article>
              </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
