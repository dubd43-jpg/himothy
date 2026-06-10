"use client";

// ADMIN BOARD — back-end view of EVERY pick we're on today, highest conviction to lowest,
// with ALL our info (the full breakdown incl. tendencies/signals/edges via admin={true}) and
// the full odds boards (alt-line ladders, alt prop ladders, niche markets, game props) on
// demand per pick. This is the owner's "what do I bet" + "why" screen. Customers never see
// this — it lives behind the admin password gate. None of this is on the public pick pages.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { PickBreakdown, type DeepPick } from "@/components/PickBreakdown";
import { AltLines } from "@/components/AltLines";
import { AltPropLadders } from "@/components/AltPropLadders";
import { NicheMarkets } from "@/components/NicheMarkets";
import { GameProps } from "@/components/GameProps";
import { useLiveScores } from "@/components/useLiveScores";
import { computeLiveState } from "@/lib/livePickStatus";

function AdminPickRow({ pick, rank, live }: { pick: DeepPick; rank: number; live: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-black text-white/30 tabular-nums">#{rank}</span>
          <span className={`text-2xl font-black tabular-nums ${pick.confidenceScore >= 96 ? "text-emerald-400" : pick.confidenceScore >= 85 ? "text-primary" : "text-white/70"}`}>
            {pick.confidenceScore}<span className="text-[10px] text-white/30">/100</span>
          </span>
          <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{pick.tier}</span>
        </div>
        <span className="text-[11px] font-bold text-white/40 truncate">{pick.league} · {pick.eventName}</span>
      </div>
      <PickBreakdown pick={pick} live={live} admin />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-primary/70 hover:text-primary transition-colors"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? "Hide" : "Show"} full odds board (alt lines · prop ladders · niche · game props)
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-white/5 pt-3">
          <AltLines league={pick.league} homeTeam={pick.homeTeam.name} homeAbbr={pick.homeTeam.abbreviation} awayTeam={pick.awayTeam.name} awayAbbr={pick.awayTeam.abbreviation} />
          <AltPropLadders league={pick.league} homeTeam={pick.homeTeam.name} awayTeam={pick.awayTeam.name} />
          <NicheMarkets league={pick.league} homeTeam={pick.homeTeam.name} awayTeam={pick.awayTeam.name} />
          <GameProps gameId={pick.gameId} league={pick.league} />
        </div>
      )}
    </div>
  );
}

export default function AdminBoardPage() {
  const [picks, setPicks] = useState<DeepPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenStatus, setRegenStatus] = useState<string | null>(null);
  const [regenBusy, setRegenBusy] = useState(false);
  const liveMap = useLiveScores();

  const loadBoard = async (forceRefresh = false) => {
    const url = forceRefresh
      ? "/api/research/daily-picks?board=north-american&refresh=true"
      : "/api/research/daily-picks?board=north-american";
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "x-admin-secret": (typeof window !== "undefined" ? localStorage.getItem("himothy_admin_secret") : null) || "" },
    });
    const d = await res.json();
    const all: DeepPick[] = [
      ...(d.grandSlam ? [d.grandSlam] : []),
      ...(d.pressurePack || []), ...(d.vip4Pack || []), ...(d.parlayPlan || []),
      ...(d.marquee || []), ...(d.asleepPicks || []),
    ];
    const seen = new Set<string>();
    return all.filter((p) => {
      const k = `${p.gameId}|${p.marketType}|${p.selection}`.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).sort((a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0));
  };

  useEffect(() => {
    let mounted = true;
    loadBoard().then((deduped) => { if (mounted) setPicks(deduped); }).catch(() => {}).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const forceRegen = async () => {
    setRegenBusy(true);
    setRegenStatus("Regenerating… this takes 60-120s, please wait.");
    try {
      const deduped = await loadBoard(true);
      setPicks(deduped);
      setRegenStatus(`Done — ${deduped.length} picks loaded.`);
    } catch (err) {
      setRegenStatus(`Error: ${String(err)}`);
    } finally {
      setRegenBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-white pb-24">
      <div className="mx-auto max-w-4xl px-5 py-8 flex flex-col gap-5">
        <Link href="/admin" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors w-max">
          <ArrowLeft className="h-4 w-4" /> Admin
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight">Today's Board — Every Pick</h1>
            <p className="mt-2 text-sm text-white/50">Highest conviction to lowest. Full breakdown + odds boards (admin only — never shown to customers). {picks.length} plays.</p>
          </div>
          <button
            type="button"
            onClick={forceRegen}
            disabled={regenBusy}
            className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary text-xs font-black uppercase tracking-widest rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${regenBusy ? 'animate-spin' : ''}`} />
            {regenBusy ? 'Running engine…' : 'Force Regen'}
          </button>
        </div>
        {regenStatus && (
          <div className={`px-4 py-3 rounded-lg text-xs font-mono ${regenStatus.startsWith('Error') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
            {regenStatus}
          </div>
        )}
        {loading ? (
          <div className="py-20 text-center text-white/40">Loading the board…</div>
        ) : picks.length === 0 ? (
          <div className="py-16 text-center space-y-4">
            <p className="text-white/40">No picks on the board yet — morning cron may have timed out.</p>
            <button type="button" onClick={forceRegen} disabled={regenBusy} className="px-6 py-3 bg-primary text-black font-black text-sm uppercase tracking-widest rounded-full hover:bg-white transition-colors disabled:opacity-50">
              {regenBusy ? 'Generating…' : 'Generate Today\'s Picks Now'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {picks.map((pick, i) => (
              <AdminPickRow key={`${pick.gameId}-${pick.marketType}-${pick.selection}-${i}`} pick={pick} rank={i + 1} live={computeLiveState(pick, liveMap[pick.gameId])} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
