"use client";

import { useEffect, useState } from "react";
import { Activity, ShieldCheck, Gamepad2, Target, RefreshCw, Zap, AlertTriangle, Thermometer, Clock } from "lucide-react";

export function MonitoringPanel() {
  const [stats, setStats] = useState({
      status: "syncing",
      games: 0,
      picks: 0,
      rechecking: 0,
      changed: 0,
      removed: 0,
      lastRefresh: "--",
      heartbeat: 0,
      refreshAgeSeconds: 0,
      runCount: 0,
  });

  useEffect(() => {
      let mounted = true;

      const poll = async () => {
         try {
            const res = await fetch('/api/ops/live-refresh?maxStaleSeconds=120', { cache: 'no-store' });
            const json = await res.json();
            if (!mounted || !json?.success || !json?.summary) return;

            const generatedAt = json.snapshot?.generatedAt ? new Date(json.snapshot.generatedAt) : null;
            setStats({
               status: 'running',
               games: Number(json.summary.gamesMonitored || 0),
               picks: Number(json.summary.researchReady || 0),
               rechecking: Number(json.summary.upcomingGames || 0),
               changed: Number(json.summary.lineChanges || 0),
               removed: 0,
               lastRefresh: generatedAt ? generatedAt.toLocaleTimeString() : '--',
               heartbeat: Math.max(0, Math.min(100, 100 - Math.floor(Number(json.summary.refreshAgeSeconds || 0) / 6))),
               refreshAgeSeconds: Number(json.summary.refreshAgeSeconds || 0),
               runCount: Number(json.summary.runCount || 0),
            });
         } catch {
            if (!mounted) return;
            setStats((prev) => ({ ...prev, status: 'degraded' }));
         }
      };

      poll();
      const interval = setInterval(poll, 30000);

      return () => {
         mounted = false;
         clearInterval(interval);
      };
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
            <span className="text-xs font-black text-primary">{stats.rechecking} Items</span>
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
         <div className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-500" /> LIVE RESEARCH READY: <span className="text-foreground">{stats.picks}</span></div>
         <div className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-500" /> REFRESH AGE: <span className="text-foreground">{stats.refreshAgeSeconds}s</span></div>
         <div className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-500" /> TOTAL RUNS: <span className="text-foreground">{stats.runCount}</span></div>
         <div className="flex items-center gap-1 animate-pulse"><Activity className="w-3 h-3 text-primary" /> VALIDATION QUEUE: LIVE</div>
      </div>
    </div>
  );
}
