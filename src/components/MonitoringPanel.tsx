"use client";

import { useEffect, useState } from "react";
import { Activity, ShieldCheck, Gamepad2, Target, RefreshCw, Zap, AlertTriangle, Thermometer, Clock } from "lucide-react";

export function MonitoringPanel() {
  const [stats, setStats] = useState({
    status: "running",
    games: 32,
    picks: 14,
    rechecking: 2,
    changed: 4,
    removed: 1,
    lastRefresh: new Date().toLocaleTimeString(),
    heartbeat: 100
  });

  // Simulated Heartbeat
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(prev => ({
        ...prev,
        heartbeat: 95 + Math.floor(Math.random() * 10),
        lastRefresh: new Date().toLocaleTimeString()
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-card border-2 border-primary/20 rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(212,168,67,0.08)]">
      <div className="p-4 bg-primary/5 border-b border-primary/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
           <Zap className="w-4 h-4 text-primary animate-pulse" />
           <h3 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Monitoring Activity</h3>
        </div>
        <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border flex items-center gap-1 ${
          stats.status === "running" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
        }`}>
           <span className="w-1 h-1 rounded-full bg-current animate-ping" />
           Engine: {stats.status}
        </div>
      </div>
      
      <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex flex-col gap-1">
           <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Games Monitored</span>
           <div className="flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-primary/60" />
              <span className="text-xl font-black text-foreground">{stats.games}</span>
           </div>
        </div>
        
        <div className="flex flex-col gap-1">
           <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Picks Monitored</span>
           <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-primary/60" />
              <span className="text-xl font-black text-foreground">{stats.picks}</span>
           </div>
        </div>

        <div className="flex flex-col gap-1">
           <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Engine Heartbeat</span>
           <div className="flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-emerald-500/60" />
              <span className="text-xl font-black text-foreground">{stats.heartbeat}%</span>
           </div>
        </div>

        <div className="flex flex-col gap-1">
           <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Last Sync</span>
           <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground/60" />
              <span className="text-xs font-mono font-bold text-foreground">{stats.lastRefresh}</span>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border border-t border-border">
         <div className="p-3 flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Live Queue</span>
            <span className="text-xs font-black text-primary">12 Items</span>
         </div>
         <div className="p-3 flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Retry Count</span>
            <span className="text-xs font-black text-amber-500">0</span>
         </div>
         <div className="p-3 flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Changed Today</span>
            <span className="text-xs font-black text-amber-500">{stats.changed}</span>
         </div>
         <div className="p-3 flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Removed Today</span>
            <span className="text-xs font-black text-red-500">{stats.removed}</span>
         </div>
      </div>

      <div className="p-3 bg-secondary/10 flex items-center gap-4 text-[9px] font-black text-muted-foreground border-t border-border uppercase tracking-widest overflow-hidden whitespace-nowrap">
         <div className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-500" /> ESPN: <span className="text-foreground">8ms</span></div>
         <div className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-500" /> ROSTER: <span className="text-foreground">14ms</span></div>
         <div className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-500" /> ODDS: <span className="text-foreground">32ms</span></div>
         <div className="flex items-center gap-1 animate-pulse"><Activity className="w-3 h-3 text-primary" /> VALIDATION QUEUE: LIVE (POS: 1)</div>
      </div>
    </div>
  );
}
