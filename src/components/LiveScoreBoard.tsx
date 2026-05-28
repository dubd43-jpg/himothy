"use client";

import { useEffect, useState } from "react";
import { Activity, CircleDot, Timer, ShieldAlert, RefreshCw, Globe, Target } from "lucide-react";
import { formatGameDateTimeET, formatUpdatedET } from "@/lib/datetime";

interface GameScore {
  id: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  period: string;
  clock: string;
  isLive: boolean;
  isFinal: boolean;
  isScheduled: boolean;
  startTime?: string;
  externalLink: string;
  oddsSource?: string | null;
  freshnessMinutes?: number;
  oddsAvailable?: boolean;
}

// gameId -> the HIMOTHY picks we have on that game
type PickMap = Record<string, string[]>;

export function LiveScoreBoard() {
  const [games, setGames] = useState<GameScore[]>([]);
  const [pickMap, setPickMap] = useState<PickMap>({});
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Which games do we actually have a play on? Pull our picks (cached) and build a map.
  const fetchOurPicks = async () => {
    try {
      const [naRes, p20Res] = await Promise.all([
        fetch('/api/research/daily-picks?board=north-american', { cache: 'no-store' }),
        fetch('/api/research/power20', { cache: 'no-store' }),
      ]);
      const na = await naRes.json().catch(() => ({}));
      const p20 = await p20Res.json().catch(() => ({}));
      const map: PickMap = {};
      // Main-board picks take priority. Power 20 only adds a chip for a game the main
      // board hasn't already claimed — never two chips for the same game.
      const add = (gid?: string, sel?: string, opts?: { onlyIfNew?: boolean }) => {
        if (!gid || !sel) return;
        map[gid] ||= [];
        if (opts?.onlyIfNew && map[gid].length > 0) return;
        if (!map[gid].includes(sel)) map[gid].push(sel);
      };
      if (na?.success) {
        if (na.grandSlam) add(na.grandSlam.gameId, na.grandSlam.selection);
        (na.pressurePack || []).forEach((p: any) => add(p.gameId, p.selection));
        (na.vip4Pack || []).forEach((p: any) => add(p.gameId, p.selection));
        (na.parlayPlan || []).forEach((p: any) => add(p.gameId, p.selection));
        (na.nrfi || []).forEach((p: any) => add(p.gameId, 'NRFI · No Runs 1st'));
      }
      if (p20?.success) (p20.picks || []).forEach((p: any) => add(p.gameId, p.selection, { onlyIfNew: true }));
      setPickMap(map);
    } catch {
      /* non-blocking */
    }
  };

  const fetchScores = async () => {
    try {
      const res = await fetch('/api/scores/live', { cache: 'no-store' });
      const data = await res.json();
      setGames(data.games || []);
      setLastSync(new Date().toISOString());
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch scores", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOurPicks();
    fetchScores();
    // Scores refresh fast (15s) so you can follow the game; our pick set changes
    // slowly, so re-pull it every 3 min.
    const scoreInterval = setInterval(fetchScores, 15000);
    const pickInterval = setInterval(fetchOurPicks, 180000);
    return () => { clearInterval(scoreInterval); clearInterval(pickInterval); };
  }, []);

  // Only the games we actually have a play on.
  const ourGames = games.filter((g) => pickMap[g.id]?.length);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 border border-white/5 bg-background/40 rounded-[2.5rem]">
        <Activity className="w-12 h-12 text-primary animate-pulse mb-6 opacity-50" />
        <p className="text-[11px] font-black uppercase tracking-[0.4em] text-primary">Loading our games</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Status bar */}
      <div className="flex items-center justify-between px-6 md:px-10 py-5 bg-white/[0.02] border border-white/5 rounded-3xl">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/60">Live — Games We're On</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-black text-white/20 uppercase tracking-[0.2em]">
          <RefreshCw className="w-4 h-4" /> {lastSync ? `Updated ${formatUpdatedET(lastSync)}` : ''}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ourGames.length === 0 ? (
          <div className="col-span-full py-24 text-center bg-background/40 border-2 border-dashed border-white/5 rounded-[2.5rem]">
            <ShieldAlert className="w-16 h-16 text-white/10 mx-auto mb-6" />
            <p className="text-sm font-black uppercase tracking-[0.3em] text-white/30">No games we're on are live right now</p>
            <p className="text-xs text-white/20 mt-2 font-semibold">Today's plays appear here once they tip off. Check the board for upcoming picks.</p>
          </div>
        ) : (
          ourGames.map((game) => (
            <div key={game.id} className="relative group bg-white/[0.03] border border-white/10 rounded-[2rem] p-6 md:p-7 hover:border-primary/40 transition-all overflow-hidden">
              {/* Header */}
              <div className="flex justify-between items-center mb-5">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">{game.league}</span>
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40 inline-flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" /> {game.sport}
                  </span>
                </div>
                <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest
                  ${game.isLive ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                    game.isFinal ? 'bg-white/5 border-white/10 text-white/40' :
                    'bg-primary/10 border-primary/20 text-primary'}`}>
                  {game.isLive ? <CircleDot className="w-3 h-3 animate-pulse" /> : <Timer className="w-3 h-3" />}
                  {game.isLive ? "LIVE" : game.isFinal ? "FINAL" : "SCHEDULED"}
                </div>
              </div>

              {/* Scoreboard */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-lg md:text-xl font-black text-white/90 uppercase tracking-tighter">{game.awayTeam}</span>
                  <span className="text-4xl md:text-5xl font-black font-mono text-primary tabular-nums">{game.awayScore}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-lg md:text-xl font-black text-white/90 uppercase tracking-tighter">{game.homeTeam}</span>
                  <span className="text-4xl md:text-5xl font-black font-mono text-primary tabular-nums">{game.homeScore}</span>
                </div>
              </div>

              {/* OUR PICK(S) on this game */}
              <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/[0.05] p-3">
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-primary/70 mb-1">
                  <Target className="w-3 h-3" /> Our Play
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(pickMap[game.id] || []).map((sel, i) => (
                    <span key={i} className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-black text-primary">{sel}</span>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div className="mt-5 pt-4 border-t border-white/5 flex justify-between items-center gap-2">
                <div className="text-xs font-bold text-primary italic">
                  {game.period}{game.clock && game.clock !== "0:00" ? ` • ${game.clock}` : ''}
                </div>
                {game.isScheduled && formatGameDateTimeET(game.startTime) && (
                  <div className="text-[11px] font-bold text-white/40 inline-flex items-center gap-1">
                    <Timer className="w-3 h-3" /> {formatGameDateTimeET(game.startTime)}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
