"use client";

import React, { useState, useEffect } from "react";
import { Activity, CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";

interface AuditLogRow {
  id: string;
  time: string;
  action: "published" | "changed" | "removed";
  pick: string;
  reason: string;
}

export function PickAuditFeed() {
  const [currentTime, setCurrentTime] = useState("");
  const [lastDecisionTime, setLastDecisionTime] = useState("--");
  const [logs, setLogs] = useState<AuditLogRow[]>([]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        second: '2-digit', 
        timeZoneName: 'short' 
      }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        const res = await fetch('/api/ops/live-refresh?maxStaleSeconds=120', { cache: 'no-store' });
        const json = await res.json();
        if (!mounted || !json?.success) return;

        const generatedAt = json.snapshot?.generatedAt ? new Date(json.snapshot.generatedAt) : null;
        setLastDecisionTime(generatedAt ? generatedAt.toLocaleTimeString() : '--');

        const topCandidates = Array.isArray(json.snapshot?.topCandidates) ? json.snapshot.topCandidates : [];
        const lineChanges = Number(json.summary?.lineChanges || 0);

        const nextLogs: AuditLogRow[] = [
          {
            id: 'refresh-meta',
            time: generatedAt ? generatedAt.toLocaleTimeString() : '--',
            action: lineChanges > 0 ? 'changed' : 'published',
            pick: `${json.summary?.gamesMonitored || 0} games synchronized`,
            reason: `${json.summary?.researchReady || 0} research-ready games, ${lineChanges} line changes detected in latest cycle.`,
          },
          ...topCandidates.slice(0, 8).map((candidate: any, idx: number) => ({
            id: `${candidate.gameId}-${idx}`,
            time: generatedAt ? generatedAt.toLocaleTimeString() : '--',
            action: 'published' as const,
            pick: `${candidate.selection} (${candidate.marketType})`,
            reason: candidate.edge?.reasoningSummary || 'Edge candidate validated from live market snapshot.',
          })),
        ];

        setLogs(nextLogs);
      } catch {
        if (!mounted) return;
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
    <div className="bg-card border-2 border-primary/20 rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(212,168,67,0.05)]">
      <div className="p-4 bg-primary/5 border-b border-primary/10 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary animate-pulse" />
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">LIVE DECISION FEED</h3>
          </div>
          <div className="flex items-center gap-2">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
             <span className="text-[10px] font-black text-muted-foreground uppercase">SYNC: ACTIVE</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-[9px] font-bold text-muted-foreground border-t border-primary/10 pt-2 uppercase tracking-widest">
           <span>System Time: <span className="text-primary">{currentTime || "--:--:--"}</span></span>
           <span>Last Decision: <span className="text-foreground">{lastDecisionTime}</span></span>
        </div>
      </div>
      
      <div className="divide-y divide-border/50 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-primary/20">
        {logs.map((log) => (
          <div key={log.id} className="p-4 hover:bg-secondary/20 transition-colors flex items-start gap-4">
            <div className="mt-1">
              {log.action === "published" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              {log.action === "removed" && <XCircle className="w-4 h-4 text-red-500" />}
              {log.action === "changed" && <AlertCircle className="w-4 h-4 text-amber-500" />}
            </div>
            
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-black text-primary uppercase tracking-tighter">{log.time}</span>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
                  log.action === "published" ? "bg-emerald-500/10 text-emerald-500" :
                  log.action === "removed" ? "bg-red-500/10 text-red-500" :
                  "bg-amber-500/10 text-amber-500"
                }`}>
                  {log.action}
                </span>
              </div>
              <p className="text-sm font-bold text-foreground mb-1 leading-tight">{log.pick}</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed italic border-l-2 border-border pl-2">
                {log.reason}
              </p>
            </div>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="p-6 text-center text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Waiting for first live refresh cycle...
          </div>
        )}
      </div>
      
      <div className="p-3 bg-secondary/10 flex items-center justify-center gap-2 border-t border-border">
         <Clock className="w-3 h-3 text-muted-foreground" />
         <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
            Continuous Decision Engine: Refreshed every 2-5 mins
         </span>
      </div>
    </div>
  );
}
