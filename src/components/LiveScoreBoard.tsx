"use client";

import { useEffect, useState } from "react";
import { Activity, CircleDot, Timer, Trophy, ShieldAlert, Cpu, RefreshCw, Globe } from "lucide-react";

interface GameScore {
  id: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string;
  period: string;
  clock: string;
}

export function LiveScoreBoard() {
  const [games, setGames] = useState<GameScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const fetchScores = async () => {
    try {
      const res = await fetch('/api/scores/live');
      const data = await res.json();
      setGames(data.games || []);
      setLastSync(new Date().toLocaleTimeString());
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch scores", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScores();
    const interval = setInterval(fetchScores, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 border border-white/5 bg-black/40 rounded-[3rem] relative overflow-hidden">
        <Cpu className="w-16 h-16 text-primary animate-spin mb-8 opacity-40" />
        <div className="flex flex-col items-center gap-2">
           <p className="text-[12px] font-black uppercase tracking-[0.5em] text-primary">Synchronizing Global Feed</p>
           <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em]">Authenticating Node Connections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Feed Status Bar */}
      <div className="flex items-center justify-between px-10 py-6 bg-white/[0.02] border border-white/5 rounded-3xl">
         <div className="flex items-center gap-4">
            <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.8)]" />
            <span className="text-[11px] font-black uppercase tracking-[0.4em] text-white/60">System Feed Live</span>
         </div>
         <div className="flex items-center gap-4 text-[11px] font-black text-white/20 uppercase tracking-[0.2em]">
            <RefreshCw className="w-4 h-4 animate-spin-slow" />
            Last Sync: {lastSync}
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {games.length === 0 ? (
          <div className="col-span-full py-32 text-center bg-black/40 border-2 border-dashed border-white/5 rounded-[3rem]">
            <ShieldAlert className="w-20 h-20 text-white/10 mx-auto mb-8" />
            <p className="text-sm font-black uppercase tracking-[0.5em] text-white/20">No Active Data In Target Windows</p>
          </div>
        ) : (
          games.map((game) => (
            <div key={game.id} className="relative group bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-10 hover:border-primary/40 transition-all duration-700 overflow-hidden shadow-2xl">
              
              {/* Header */}
              <div className="flex justify-between items-center mb-10">
                <div className="flex flex-col gap-1">
                   <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">{game.league}</span>
                   <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40 flex items-center gap-1.5 inline-flex">
                      <Globe className="w-3.5 h-3.5" /> {game.sport}
                   </span>
                </div>
                <div className={`flex items-center gap-3 px-5 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest
                  ${game.status === "live" ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-white/5 border-white/10 text-white/40'}
                `}>
                  {game.status === "live" ? <CircleDot className="w-3 h-3 animate-pulse" /> : <Timer className="w-3 h-3 " />}
                  {game.status === "live" ? "ACTIVE" : "FINAL"}
                </div>
              </div>

              {/* Scoreboard */}
              <div className="flex flex-col gap-8">
                <div className="flex items-center justify-between group/team">
                  <span className="text-xl font-black text-white group-hover/team:text-primary transition-colors uppercase tracking-tighter">{game.awayTeam}</span>
                  <span className="text-4xl font-black font-mono text-white tracking-tighter tabular-nums">{game.awayScore}</span>
                </div>
                <div className="flex items-center justify-between group/team">
                  <span className="text-xl font-black text-white group-hover/team:text-primary transition-colors uppercase tracking-tighter">{game.homeTeam}</span>
                  <span className="text-4xl font-black font-mono text-white tracking-tighter tabular-nums">{game.homeScore}</span>
                </div>
              </div>

              {/* Progress */}
              <div className="mt-12 pt-8 border-t border-white/5 flex justify-between items-center">
                 <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Temporal Status</span>
                    <div className="text-xs font-bold text-primary italic">
                       {game.period} {game.clock !== "0:00" && `• ${game.clock}`}
                    </div>
                 </div>
                 <div className="flex items-center gap-3">
                    <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                       <div className="w-2/3 h-full bg-primary shadow-[0_0_10px_rgba(212,168,67,0.5)]" />
                    </div>
                    <Activity className="w-4 h-4 text-primary opacity-40" />
                 </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
