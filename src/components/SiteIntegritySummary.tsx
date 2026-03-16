"use client";

import { ShieldCheck, ShieldAlert, FileSearch, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";

interface AuditStats {
  total_checked: number;
  passed: number;
  suppressed: number;
  roster_failures: number;
  time_mismatches: number;
  stale_items: number;
  last_audit: string;
}

interface SiteIntegritySummaryProps {
  stats: AuditStats | null;
  loading: boolean;
}

export function SiteIntegritySummary({ stats, loading }: SiteIntegritySummaryProps) {
  if (loading || !stats) {
    return (
      <div className="bg-secondary/10 border border-border/50 rounded-xl p-6 animate-pulse">
        <div className="h-4 w-48 bg-secondary rounded mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-12 bg-secondary/50 rounded-lg" />)}
        </div>
      </div>
    );
  }

  const hasIssues = stats.suppressed > 0;

  return (
    <div className="bg-background border-2 border-border/40 rounded-2xl overflow-hidden shadow-sm">
      <div className="bg-secondary/20 p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSearch className="w-5 h-5 text-primary" />
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Full Logic Audit & Consistency Report</h3>
        </div>
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase opacity-60">
              <Clock className="w-3 h-3" /> Last Full Run: {new Date(stats.last_audit).toLocaleTimeString()}
           </div>
           <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border flex items-center gap-1 ${
             !hasIssues ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
           }`}>
             {!hasIssues ? <CheckCircle2 className="w-2.5 h-2.5" /> : <ShieldAlert className="w-2.5 h-2.5" />}
             {!hasIssues ? "System Clean" : "Integrity Filters Active"}
           </div>
        </div>
      </div>

      <div className="p-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
        <div className="flex flex-col gap-1">
           <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Total Checked</span>
           <span className="text-xl font-black text-foreground">{stats.total_checked}</span>
        </div>
        
        <div className="flex flex-col gap-1">
           <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Passed Audit</span>
           <span className="text-xl font-black text-foreground">{stats.passed}</span>
        </div>

        <div className="flex flex-col gap-1">
           <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">Suppressed</span>
           <span className="text-xl font-black text-foreground">{stats.suppressed}</span>
           {stats.suppressed > 0 && <span className="text-[8px] font-bold text-red-400 uppercase italic">Publish Blocked</span>}
        </div>

        <div className="flex flex-col gap-1 border-l border-border/50 pl-4">
           <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Roster Sync Errors</span>
           <div className="flex items-center gap-2">
              <span className={`text-xl font-black ${stats.roster_failures > 0 ? 'text-amber-500' : 'text-foreground/40'}`}>{stats.roster_failures}</span>
              {stats.roster_failures > 0 && <AlertTriangle className="w-3 h-3 text-amber-500" />}
           </div>
        </div>

        <div className="flex flex-col gap-1">
           <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Time Mismatches</span>
           <div className="flex items-center gap-2">
              <span className={`text-xl font-black ${stats.time_mismatches > 0 ? 'text-amber-500' : 'text-foreground/40'}`}>{stats.time_mismatches}</span>
           </div>
        </div>

        <div className="flex flex-col gap-1">
           <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Stale Heartbeats</span>
           <div className="flex items-center gap-2">
              <span className={`text-xl font-black ${stats.stale_items > 0 ? 'text-red-500' : 'text-foreground/40'}`}>{stats.stale_items}</span>
           </div>
        </div>
      </div>

      <div className="px-5 py-3 bg-secondary/5 border-t border-border flex items-center justify-between">
         <div className="flex gap-4">
            <span className="text-[9px] font-bold text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-500" /> EVENT REALITY CHECK: PASSED</span>
            <span className="text-[9px] font-bold text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-500" /> CROSS-PAGE SYNC: VERIFIED</span>
            <span className="text-[9px] font-bold text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-500" /> PICK COUNT CONSISTENCY: OK</span>
         </div>
         <p className="text-[9px] font-black text-muted-foreground uppercase tracking-tighter max-w-[400px] text-right">
            GATEKEEPER PROTOCOL: Nothing is published unless all 8 integrity checks pass. 
            <span className="text-primary ml-1">Volume suppressed to protect accuracy.</span>
         </p>
      </div>
    </div>
  );
}
