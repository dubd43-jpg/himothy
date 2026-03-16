"use client";

import { useState, useEffect } from "react";
import { Globe, ShieldCheck, Clock, Activity, ChevronRight } from "lucide-react";

interface BoardItem {
  id: string;
  label: string;
  count: number;
  priority: number;
}

export function BoardSummary() {
  const [board, setBoard] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBoard() {
      try {
        const res = await fetch("/api/board/summary");
        const data = await res.json();
        if (data.success) {
          setBoard(data.board);
        }
      } catch (err) {
        console.error("Board sync failed", err);
      } finally {
        setLoading(false);
      }
    }
    fetchBoard();
    const interval = setInterval(fetchBoard, 60000); // 1 min updates
    return () => clearInterval(interval);
  }, []);

  if (loading) return (
    <div className="bg-card border border-border rounded-2xl p-6 animate-pulse">
      <div className="h-4 w-32 bg-secondary rounded mb-4" />
      <div className="space-y-3">
        {[1,2,3,4].map(i => <div key={i} className="h-10 bg-secondary/50 rounded-lg" />)}
      </div>
    </div>
  );

  return (
    <div className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-[0_0_20px_rgba(0,0,0,0.1)]">
      <div className="bg-secondary/50 p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Live Aggregator: Today&apos;s Board</h3>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Scanning Markets
        </div>
      </div>
      
      <div className="p-4 grid grid-cols-1 gap-2 max-h-[400px] overflow-y-auto custom-scrollbar">
        {board.map((item) => (
          <div 
            key={item.id} 
            className="flex items-center justify-between p-3 rounded-xl bg-secondary/20 border border-border/50 hover:bg-secondary/30 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center text-[10px] font-black text-primary">
                {item.label.substring(0, 3).toUpperCase()}
              </div>
              <div>
                <p className="text-xs font-black text-foreground uppercase tracking-tight">{item.label}</p>
                <div className="flex items-center gap-2">
                   <p className="text-[10px] font-bold text-muted-foreground">{item.count} Active Markets Found</p>
                   {item.priority < 10 && <span className="bg-primary/10 text-primary text-[8px] px-1 rounded font-black">HIGH LIQUIDITY</span>}
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        ))}
      </div>

      <div className="p-3 bg-secondary/10 border-t border-border flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Synced 48H Window
        </div>
        <div className="flex items-center gap-1">
          <Globe className="w-3 h-3" />
          Global Feeds
        </div>
      </div>
    </div>
  );
}
