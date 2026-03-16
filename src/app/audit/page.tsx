"use client";

import { useState, useEffect } from "react";
import { SiteIntegritySummary } from "@/components/SiteIntegritySummary";
import { PickAuditFeed } from "@/components/PickAuditFeed";
import { ShieldCheck, History, ArrowLeft, RefreshCw, Activity, ShieldAlert, Search, Filter } from "lucide-react";
import Link from "next/link";

export default function AuditPage() {
  const [auditStats, setAuditStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAudit() {
      try {
        const res = await fetch("/api/registry/status");
        const data = await res.json();
        if (data.success) {
          setAuditStats(data.audit_stats);
        }
      } catch (err) {
        console.error("Failed to fetch audit status", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAudit();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="px-6 lg:px-10 py-10 max-w-7xl mx-auto flex flex-col gap-8">
        
        <Link href="/picks" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Back to Picks Hub
        </Link>

        <div className="border-b border-border pb-8">
          <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-emerald-500" /> Full Logic Audit
          </h1>
          <p className="text-muted-foreground mt-2">
            Immutable validation logs and consistency checks for the Decision Engine. Nothing is published without a verified truth tie-break.
          </p>
        </div>

        <SiteIntegritySummary stats={auditStats} loading={loading} />

        <div className="grid grid-cols-1 gap-6">
           <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-border bg-secondary/10 flex items-center justify-between">
                 <h3 className="text-xs font-black uppercase tracking-widest">Active Suppressions & Corrections</h3>
                 <div className="flex items-center gap-2">
                    <div className="relative">
                       <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                       <input 
                        type="text" 
                        placeholder="Search logs..." 
                        className="bg-background border border-border rounded px-8 py-1.5 text-[10px] focus:outline-none focus:border-primary w-48"
                       />
                    </div>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-background border border-border rounded text-[10px] font-bold">
                       <Filter className="w-3 h-3" /> Filter
                    </button>
                 </div>
              </div>
              <div className="divide-y divide-border">
                 {[
                   { type: "SUPPRESSION", event: "LAL vs GSW", reason: "Stephen Curry (Out) - Roster Integrity Failure", time: "2 min ago" },
                   { type: "CORRECTION", event: "NYK vs PHI", reason: "Start time variance > 5 min - Synchronized with ESPN Core", time: "14 min ago" },
                   { type: "STALE_BLOCK", event: "MCI vs LIV", reason: "Odds feed latency > 30s - Market Validity Failure", time: "21 min ago" },
                   { type: "SUPPRESSION", event: "Personal Play #082", reason: "League phase mismatch: Preseason detection", time: "1 hour ago" }
                 ].map((log, i) => (
                    <div key={i} className="p-4 flex items-center gap-4 hover:bg-secondary/5 transition-colors">
                       <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${
                         log.type === "SUPPRESSION" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                         log.type === "CORRECTION" ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                         "bg-amber-500/10 text-amber-500 border-amber-500/20"
                       }`}>
                          {log.type}
                       </span>
                       <div className="flex-1">
                          <p className="text-xs font-bold">{log.event}</p>
                          <p className="text-[10px] text-muted-foreground">{log.reason}</p>
                       </div>
                       <span className="text-[10px] font-mono text-muted-foreground uppercase">{log.time}</span>
                    </div>
                 ))}
              </div>
           </div>
        </div>

      </div>
    </div>
  );
}
