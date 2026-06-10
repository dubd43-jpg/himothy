"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Lock, ExternalLink } from "lucide-react";
import { PickBreakdown, type DeepPick } from "@/components/PickBreakdown";
import { AuthorByline } from "@/components/AuthorByline";
import { useLiveScores } from "@/components/useLiveScores";
import { computeLiveState } from "@/lib/livePickStatus";
import { buildHardRockUrl } from "@/lib/hardRock";

export default function PickPage({ params }: { params: { gameId: string } }) {
  const [pick, setPick] = useState<DeepPick | null>(null);
  const [loading, setLoading] = useState(true);
  const liveMap = useLiveScores();
  const live = pick ? computeLiveState(pick, liveMap[pick.gameId]) : null;

  const board = typeof window !== "undefined"
    ? (new URLSearchParams(window.location.search).get("board") || "north-american")
    : "north-american";
  const backHref = typeof window !== "undefined"
    ? (new URLSearchParams(window.location.search).get("from") || "/picks")
    : "/picks";

  useEffect(() => {
    let mounted = true;
    // Pull every bucket on the board (was missing asleepPicks — fix). Then if the pick
    // still isn't found (deep link from a different board, or board param mismatched),
    // fall back to scanning every board so the breakdown page never dead-ends.
    const flattenBoard = (d: any): DeepPick[] => {
      if (!d) return [];
      return [d.grandSlam, ...(d.pressurePack || []), ...(d.vip4Pack || []), ...(d.parlayPlan || []), ...(d.marquee || []), ...(d.asleepPicks || [])]
        .filter(Boolean) as DeepPick[];
    };
    const load = async () => {
      try {
        // First, try the board from the URL — fast path, hits the warm cache.
        const res = await fetch(`/api/research/daily-picks?board=${encodeURIComponent(board)}`, { cache: "no-store" });
        const d = await res.json();
        let found = flattenBoard(d).find((p) => p.gameId === params.gameId) || null;

        // Fallback — scan every board in parallel until we find the pick. Lets a link
        // copied from /picks?board=combat still resolve when reopened later.
        if (!found) {
          const otherBoards = ['north-american', 'soccer', 'tennis', 'combat', 'global'].filter((b) => b !== board);
          const results = await Promise.all(otherBoards.map((b) =>
            fetch(`/api/research/daily-picks?board=${b}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
          ));
          for (const data of results) {
            const hit = flattenBoard(data).find((p) => p.gameId === params.gameId);
            if (hit) { found = hit; break; }
          }
        }

        if (mounted) setPick(found);
      } catch {
        /* ignore */
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    // Keep the single pick live too — it can change up to ~15 min before game time.
    const i = setInterval(load, 120000);
    return () => { mounted = false; clearInterval(i); };
  }, [params.gameId, board]);

  return (
    <div className="min-h-screen bg-background text-white pb-24">
      <div className="mx-auto max-w-3xl px-5 py-8 md:px-8 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <Link href={backHref} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/logo-badge.png" alt="HIMOTHY PLAYS AND PARLAYS" width={34} height={34} className="rounded-full border border-primary/40" />
            <span className="hidden sm:block text-xs font-black uppercase tracking-tight leading-none">HIMOTHY <span className="text-primary italic">Plays &amp; Parlays</span></span>
          </Link>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
          <Lock className="h-3 w-3" /> Premium Pick — included with access
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
            <span className="text-sm font-semibold text-white/40">Loading the breakdown...</span>
          </div>
        ) : pick ? (
          <>
            <PickBreakdown pick={pick} live={live} />
            <a
              href={buildHardRockUrl({ league: pick.league, selection: pick.selection, homeTeam: pick.homeTeam.name, awayTeam: pick.awayTeam.name })}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-3 w-full md:w-auto md:self-start rounded-2xl bg-primary px-6 py-4 text-sm font-black uppercase tracking-widest text-black hover:bg-white transition-all shadow-[0_15px_40px_-10px_rgba(212,168,67,0.5)]"
            >
              Bet on Hard Rock <ExternalLink className="h-4 w-4" />
            </a>
            <AuthorByline />
            {/* Alt-line ladders, alt prop ladders, niche markets, and the full game-props
                screen were REMOVED from the customer page — that's a full odds board that
                gives away extra plays and our market data. Customers get OUR pick + why we
                like it, period. (These remain available for the back-end/admin view.) */}
          </>
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.02] py-20 text-center px-6">
            <h3 className="text-xl font-black uppercase tracking-tight">Pick not available</h3>
            <p className="mx-auto mt-3 max-w-md text-white/40 leading-relaxed">
              This play may have settled, started, or changed. Head back to today's board for the latest.
            </p>
            <Link href="/picks" className="mt-5 inline-block rounded-xl bg-primary px-5 py-2.5 text-xs font-black uppercase tracking-widest text-black hover:bg-white transition-all">
              Today's Picks
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
