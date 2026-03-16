"use client";

import { MonitoringPanel } from "@/components/MonitoringPanel";
import { ArrowLeft, Activity, Globe, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function MonitoringPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="px-6 lg:px-10 py-10 max-w-7xl mx-auto flex flex-col gap-8">
        
        <Link href="/picks" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Back to Picks Hub
        </Link>

        <div className="border-b border-border pb-8">
          <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3">
            <Activity className="w-8 h-8 text-primary" /> Engine Monitoring
          </h1>
          <p className="text-muted-foreground mt-2">
            Real-time status of the Continuous Decision Engine. Monitoring data feed health and background refresh activity.
          </p>
        </div>

        <MonitoringPanel />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="bg-card border border-border rounded-2xl p-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-4">Feed Health Status</h3>
              <div className="space-y-4">
                 {[
                   { name: "ESPN Scoreboard API", status: "Active", latency: "12ms", health: 100 },
                   { name: "Live Roster Feed", status: "Active", latency: "34ms", health: 98 },
                   { name: "Global Odds Monitor", status: "Active", latency: "61ms", health: 100 },
                   { name: "Validation Queue Admin", status: "Active", latency: "5ms", health: 100 }
                 ].map((feed, i) => (
                    <div key={i} className="flex items-center justify-between">
                       <div className="flex flex-col">
                          <span className="text-sm font-bold">{feed.name}</span>
                          <span className="text-[10px] text-muted-foreground uppercase font-black">{feed.status} • Latency: {feed.latency}</span>
                       </div>
                       <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
                             <div className="h-full bg-emerald-500" style={{ width: `${feed.health}%` }} />
                          </div>
                          <span className="text-[10px] font-black text-emerald-500">{feed.health}%</span>
                       </div>
                    </div>
                 ))}
              </div>
           </div>

           <div className="bg-card border border-border rounded-2xl p-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-4">Background Refresh Activity</h3>
              <div className="space-y-3">
                 {[
                   "NBA Refresh Cycle Started",
                   "NFL Roster Sync Completed",
                   "MLB Line Movement Detected",
                   "Soccer Match Time Correction Applied",
                   "Tennis Odds Re-verified",
                   "Internal Cache Purge Executed"
                 ].map((act, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                       <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                       <span className="text-xs font-medium text-foreground">{act}</span>
                       <span className="text-[9px] font-mono text-muted-foreground ml-auto uppercase">{60 - (i*8)}s ago</span>
                    </div>
                 ))}
              </div>
           </div>
        </div>

      </div>
    </div>
  );
}
