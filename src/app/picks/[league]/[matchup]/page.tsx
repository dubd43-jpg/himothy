"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { PickBreakdown, type DeepPick } from "@/components/PickBreakdown";
import { GameProps } from "@/components/GameProps";
import { NicheMarkets } from "@/components/NicheMarkets";
import { AltLines } from "@/components/AltLines";
import { AltPropLadders } from "@/components/AltPropLadders";
import { AuthorByline } from "@/components/AuthorByline";
import { useLiveScores } from "@/components/useLiveScores";
import { computeLiveState } from "@/lib/livePickStatus";

// Pretty matchup URL: /picks/[league]/[matchup-slug]. Renders the same breakdown as
// /pick/[gameId] but at the SEO-friendly slug, e.g. /picks/mlb/houston-astros-vs-texas-rangers-picks.
// Google indexes THIS URL — the gameId URL sets its canonical here so the keyword-rich
// slug wins ranking. Internal links keep using gameId (no refactor needed).

const BOARDS_TO_SEARCH = ["north-american", "soccer", "tennis", "combat", "global"] as const;

function findInBoard(d: any, slug: string): DeepPick | null {
  if (!d) return null;
  const candidates: any[] = [
    d.grandSlam,
    ...(d.pressurePack || []),
    ...(d.vip4Pack || []),
    ...(d.parlayPlan || []),
    ...(d.marquee || []),
    ...(d.asleepPicks || []),
  ].filter(Boolean);
  const norm = (s: string) => (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  for (const p of candidates) {
    const expected = `${norm(p.awayTeam?.name)}-vs-${norm(p.homeTeam?.name)}-picks`;
    if (expected === slug) return p as DeepPick;
  }
  return null;
}

export default function MatchupPickPage() {
  const params = useParams<{ league: string; matchup: string }>();
  const [pick, setPick] = useState<DeepPick | null>(null);
  const [loading, setLoading] = useState(true);
  const liveMap = useLiveScores();
  const live = pick ? computeLiveState(pick, liveMap[pick.gameId]) : null;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        // Search every board in parallel — the matchup slug is sport-agnostic, so we just
        // find whichever board has it. The /picks/[league] segment is purely cosmetic for
        // SEO (Google ranks the league keyword in the URL) — it's not used for routing.
        const results = await Promise.all(
          BOARDS_TO_SEARCH.map((b) =>
            fetch(`/api/research/daily-picks?board=${b}`, { cache: "no-store" })
              .then((r) => r.json())
              .catch(() => null),
          ),
        );
        let found: DeepPick | null = null;
        for (const data of results) {
          found = findInBoard(data, params.matchup);
          if (found) break;
        }
        if (mounted) setPick(found);
      } catch { /* ignore */ }
      finally { if (mounted) setLoading(false); }
    };
    load();
    const i = setInterval(load, 120000);
    return () => { mounted = false; clearInterval(i); };
  }, [params.matchup]);

  return (
    <div className="min-h-screen bg-background text-white pb-24">
      <div className="mx-auto max-w-3xl px-5 py-8 md:px-8 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/picks" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Picks
          </Link>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/logo-badge.png" alt="HIMOTHY Plays and Parlays" width={34} height={34} className="rounded-full border border-primary/40" />
            <span className="hidden sm:block text-xs font-black uppercase tracking-tight leading-none">HIMOTHY <span className="text-primary italic">Plays &amp; Parlays</span></span>
          </Link>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
          <Lock className="h-3 w-3" /> Free Pick — full breakdown
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
            <span className="text-sm font-semibold text-white/40">Loading the breakdown...</span>
          </div>
        ) : pick ? (
          <>
            <PickBreakdown pick={pick} live={live} />
            <AuthorByline />
            <AltLines league={pick.league} homeTeam={pick.homeTeam.name} homeAbbr={pick.homeTeam.abbreviation} awayTeam={pick.awayTeam.name} awayAbbr={pick.awayTeam.abbreviation} />
            <AltPropLadders league={pick.league} homeTeam={pick.homeTeam.name} awayTeam={pick.awayTeam.name} />
            <NicheMarkets league={pick.league} homeTeam={pick.homeTeam.name} awayTeam={pick.awayTeam.name} />
            <GameProps gameId={pick.gameId} league={pick.league} />
          </>
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.02] py-20 text-center px-6">
            <h3 className="text-xl font-black uppercase tracking-tight">Matchup not on tonight&apos;s board</h3>
            <p className="mx-auto mt-3 max-w-md text-white/40 leading-relaxed">
              This matchup may have settled, been postponed, or isn&apos;t playing today. Head back to today&apos;s board for the latest slate.
            </p>
            <Link href="/picks" className="mt-5 inline-block rounded-xl bg-primary px-5 py-2.5 text-xs font-black uppercase tracking-widest text-black hover:bg-white transition-all">
              Today&apos;s Picks
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
