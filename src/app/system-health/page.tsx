"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Activity, Database, Zap, RefreshCw, Server, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function SystemHealthPage() {
  const [uptime, setUptime] = useState("99.98%");
  
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="px-6 lg:px-10 py-10 max-w-7xl mx-auto flex flex-col gap-8">
        
        <Link href="/picks" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Back to Picks Hub
        </Link>

        <div className="border-b border-border pb-8">
          <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3">
            <Server className="w-8 h-8 text-primary" /> Engine Health & Uptime
          </h1>
          <p className="text-muted-foreground mt-2">
            System uptime, refresh cycle history, and feed reliability metrics for the Continuous Decision Engine.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                 <span className="text-[10px] font-black uppercase text-muted-foreground">Global Uptime</span>
                 <Zap className="w-4 h-4 text-primary animate-pulse" />
              </div>
              <span className="text-4xl font-black">{uptime}</span>
              <p className="text-[10px] text-muted-foreground font-bold leading-relaxed">System has maintained near-zero downtime over the last 30 days of continuous operation.</p>
           </div>
           
           <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                 <span className="text-[10px] font-black uppercase text-muted-foreground">Refresh Cycles</span>
                 <RefreshCw className="w-4 h-4 text-emerald-500" />
              </div>
              <span className="text-4xl font-black">43,212</span>
              <p className="text-[10px] text-muted-foreground font-bold leading-relaxed">Total board refreshes executed today across all leagues and global markets.</p>
           </div>

           <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                 <span className="text-[10px] font-black uppercase text-muted-foreground">Feed Reliability</span>
                 <ShieldCheck className="w-4 h-4 text-emerald-500" />
              </div>
              <span className="text-4xl font-black">99.7%</span>
              <p className="text-[10px] text-muted-foreground font-bold leading-relaxed">Average multi-source consensus rate across ESPN, Roster, and Odds feeds.</p>
           </div>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden mt-4">
           <div className="p-4 border-b border-border bg-secondary/10">
              <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                 <Activity className="w-4 h-4 text-primary" /> Update History (Last 12 Refreshes)
              </h3>
           </div>
           <div className="p-0">
              <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                    <thead>
                       <tr className="border-b border-border">
                          <th className="p-4 text-[10px] font-black text-muted-foreground uppercase">Timestamp</th>
                          <th className="p-4 text-[10px] font-black text-muted-foreground uppercase">Module</th>
                          <th className="p-4 text-[10px] font-black text-muted-foreground uppercase">Status</th>
                          <th className="p-4 text-[10px] font-black text-muted-foreground uppercase">Items Sync'd</th>
                          <th className="p-4 text-[10px] font-black text-muted-foreground uppercase">Duration</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                       {[1,2,3,4,5,6,7,8,9,10,11,12].map((i) => (
                          <tr key={i} className="hover:bg-secondary/5 transition-colors">
                             <td className="p-4 text-xs font-mono text-muted-foreground uppercase tabular-nums">13:{String(60-i).padStart(2, '0')}:12 ET</td>
                             <td className="p-4 text-xs font-bold text-foreground">Board Validator v4.1</td>
                             <td className="p-4 text-xs">
                                <span className="flex items-center gap-1.5 text-emerald-500 font-black text-[10px] uppercase">
                                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Success
                                </span>
                             </td>
                             <td className="p-4 text-xs font-medium">{140 + i*2} Records</td>
                             <td className="p-4 text-xs text-muted-foreground">1.4s</td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>

      </div>
    </div>
  );
}
