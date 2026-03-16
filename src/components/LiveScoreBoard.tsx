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
   status: string; // "Live", "Final", "1st Qtr", etc.
   clock: string;
   stats?: {
      fgPct: string;
      rebounds: number;
      turnovers: number;
   };
}

export function LiveScoreBoard() {
   const [games, setGames] = useState<LiveGame[]>([]);
   const [loading, setLoading] = useState(true);

   useEffect(() => {
      // Simulated live feed for the sake of the requirement
      const mockGames: LiveGame[] = [
         {
            id: "1",
            league: "NBA",
            homeTeam: "Lakers",
            awayTeam: "Warriors",
            homeScore: 102,
            awayScore: 98,
            status: "4th Qtr",
            clock: "2:14",
            stats: { fgPct: "48%", rebounds: 42, turnovers: 12 }
         },
         {
            id: "2",
            league: "NBA",
            homeTeam: "Nets",
            awayTeam: "Knicks",
            homeScore: 88,
            awayScore: 91,
            status: "3rd Qtr",
            clock: "6:45",
            stats: { fgPct: "44%", rebounds: 38, turnovers: 15 }
         },
         {
            id: "3",
            league: "EPL",
            homeTeam: "Arsenal",
            awayTeam: "Chelsea",
            homeScore: 2,
            awayScore: 1,
            status: "Live",
            clock: "78'",
            stats: { fgPct: "65% Poss", rebounds: 4, turnovers: 0 } // Re-purposed fields for soccer
         }
      ];

      setGames(mockGames);
      setLoading(false);
   }, []);

   if (loading) return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
         {[1, 2, 3].map(i => (
            <div key={i} className="bg-card border border-border rounded-xl h-40"></div>
         ))}
      </div>
   );

   return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         {games.map((game) => (
            <div key={game.id} className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/40 transition-all flex flex-col">
               <div className="bg-secondary/30 px-4 py-2 flex items-center justify-between border-b border-border">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{game.league}</span>
                  <div className="flex items-center gap-1.5">
                     <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                     <span className="text-[10px] font-black text-red-500 uppercase">{game.status} • {game.clock}</span>
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

                  {game.stats && (
                     <div className="grid grid-cols-3 gap-2 mt-2 pt-4 border-t border-border/50">
                        <div className="flex flex-col">
                           <span className="text-[8px] font-black text-muted-foreground uppercase">Efficiency</span>
                           <span className="text-[10px] font-black">{game.stats.fgPct}</span>
                        </div>
                        <div className="flex flex-col">
                           <span className="text-[8px] font-black text-muted-foreground uppercase">Boards</span>
                           <span className="text-[10px] font-black">{game.stats.rebounds}</span>
                        </div>
                        <div className="flex flex-col">
                           <span className="text-[8px] font-black text-muted-foreground uppercase">TOV</span>
                           <span className="text-[10px] font-black">{game.stats.turnovers}</span>
                        </div>
                     </div>
                  )}
               </div>
            </div>
         ))}
      </div>
   );
}
