"use client";

import { useEffect, useState } from "react";
import type { LiveGame } from "@/lib/livePickStatus";

// Polls our live-scores feed and returns a gameId -> live game map so any pick can
// show its live score, clock, and result. Refreshes fast (15s) so it feels live.
export function useLiveScores() {
  const [liveMap, setLiveMap] = useState<Record<string, LiveGame>>({});

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/scores/live", { cache: "no-store" });
        const data = await res.json();
        if (!mounted) return;
        const map: Record<string, LiveGame> = {};
        for (const g of data.games || []) {
          map[String(g.id)] = {
            id: String(g.id),
            isLive: !!g.isLive,
            isFinal: !!g.isFinal,
            isScheduled: !!g.isScheduled,
            homeScore: Number(g.homeScore) || 0,
            awayScore: Number(g.awayScore) || 0,
            period: g.period || "",
            clock: g.clock || "",
            homeTeam: g.homeTeam || "",
            awayTeam: g.awayTeam || "",
          };
        }
        setLiveMap(map);
      } catch {
        /* non-blocking — picks still render without live data */
      }
    };
    load();
    const i = setInterval(load, 15000);
    return () => {
      mounted = false;
      clearInterval(i);
    };
  }, []);

  return liveMap;
}
