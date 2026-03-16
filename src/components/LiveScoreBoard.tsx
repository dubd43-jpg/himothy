"use client";

import { useEffect, useState } from "react";
import { Activity, CircleDot, Timer, Trophy, ShieldAlert, Cpu } from "lucide-react";

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

  const fetchScores = async () => {
    try {
      const res = await fetch('/api/scores/live');
      const data = await res.json();
      setGames(data.games || []);
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
      <div className="flex flex-col items-center justify-center py-20 bg-black/40 border border-white/5 rounded-3xl">
        <Cpu className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/50">Synchronizing Live Feed...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {games.length === 0 ? (
        <div className="col-span-full py-12 text-center bg-black/40 border border-white/5 rounded-3xl">
          <ShieldAlert className="w-10 h-10 text-white/20 mx-auto mb-4" />
          <p className="text-xs font-black uppercase tracking-widest text-white/40">No Live Events in Target Window</p>
        </div>
      ) : (
        games.map((game) => (
          <div key={game.id} className="glass-morphism rounded-2xl p-5 hover:border-primary/40 transition-all group overflow-hidden relative">
            <div className="scanline opacity-20" />
            
            {/* Header: Sport & Status */}
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                 <span className="text-[9px] font-black uppercase tracking-widest text-white/50">{game.sport} • {game.league}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-[8px] font-black text-emerald-400 uppercase tracking-tighter">
                <Timer className="w-2.5 h-2.5" />
                {game.status === "live" ? "ACTIVE" : "FINAL"}
              </div>
            </div>

            {/* Content: Scores */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white/70 group-hover:text-white transition-colors uppercase tracking-tight">{game.awayTeam}</span>
                <span className="text-xl font-black font-mono text-white tabular-nums">{game.awayScore}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white/70 group-hover:text-white transition-colors uppercase tracking-tight">{game.homeTeam}</span>
                <span className="text-xl font-black font-mono text-white tabular-nums">{game.homeScore}</span>
              </div>
            </div>

            {/* Footer: Clock & Progress */}
            <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center">
               <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 italic">
                  <span>{game.period}</span>
                  {game.clock !== "0:00" && <span>• {game.clock}</span>}
               </div>
               <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="w-2/3 h-full bg-primary/40" />
               </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
