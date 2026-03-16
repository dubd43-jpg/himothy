"use client";

import { useState, useEffect } from "react";
import { Activity, Clock, Trophy, BarChart3, ChevronRight } from "lucide-react";

interface LiveGame {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string;
  clock: string;
  isLive: boolean;
  isFinal: boolean;
}

export function LiveScoreBoard() {
  const [games, setGames] = useState<LiveGame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGames() {
      try {
        const res = await fetch("/api/scores/live");
        const data = await res.json();
        if (data.success) {
          setGames(data.games);
        }
      } catch (err) {
        console.error("Scoreboard sync failed", err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchGames();
    const interval = setInterval(fetchGames, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, []);

  if (loading) return (
     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
        {[1,2,3].map(i => (
           <div key={i} className="bg-card border border-border rounded-xl h-40"></div>
        ))}
     </div>
  );

  if (games.length === 0) return (
    <div className="col-span-full py-12 text-center border-2 border-dashed border-border rounded-2xl bg-secondary/5">
      <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-30" />
      <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">No Active Games in Feed</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {games.map((game) => (
        <div key={game.id} className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/40 transition-all flex flex-col">
          <div className="bg-secondary/30 px-4 py-2 flex items-center justify-between border-b border-border">
             <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{game.league}</span>
             <div className="flex items-center gap-1.5">
                {game.isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                <span className={`text-[10px] font-black uppercase ${game.isLive ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {game.status} {game.clock ? `• ${game.clock}` : ''}
                </span>
             </div>
          </div>
          
          <div className="p-5 flex flex-col gap-4">
             <div className="flex items-center justify-between">
                <div className="flex flex-col gap-2">
                   <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold">{game.awayTeam[0]}</div>
                      <span className="text-sm font-black uppercase tracking-tight">{game.awayTeam}</span>
                   </div>
                   <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold">{game.homeTeam[0]}</div>
                      <span className="text-sm font-black uppercase tracking-tight">{game.homeTeam}</span>
                   </div>
                </div>
                <div className="flex flex-col gap-2 items-end">
                   <span className="text-xl font-black tabular-nums">{game.awayScore}</span>
                   <span className="text-xl font-black tabular-nums">{game.homeScore}</span>
                </div>
             </div>
          </div>
        </div>
      ))}
    </div>
  );
}
