"use client";

import React from "react";
import Link from "next/link";
import { 
  BarChart, 
  ArrowLeft,
  ChevronRight,
  ShieldAlert
} from "lucide-react";
import { HistoricalResults } from "@/components/HistoricalResults";

export default function ResultsPage() {
  return (
    <div className="min-h-screen bg-black text-white pb-24 selection:bg-primary/30">
      {/* 1. Tactical Navigation */}
      <nav className="px-6 lg:px-10 py-6 flex items-center justify-between border-b border-white/5 bg-background/50 backdrop-blur-xl sticky top-0 z-50">
        <Link href="/picks" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors border border-white/5">
            <ArrowLeft className="w-5 h-5 text-white/40 group-hover:text-primary transition-colors" />
          </div>
          <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40 group-hover:text-white transition-colors">Return to Hub</span>
        </Link>
        
        <div className="flex items-center gap-6">
           <div className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/5 border border-emerald-500/10">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Global Node Sync: Active</span>
           </div>
        </div>
      </nav>

      <main className="px-6 lg:px-10 py-12 max-w-5xl mx-auto space-y-20">
        
        {/* 2. Advanced Header */}
        <section className="space-y-6">
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-primary/10 text-primary border border-primary/20">
            <BarChart className="w-4 h-4" />
            <span className="text-[11px] font-black uppercase tracking-[0.3em]">HIMOTHY MASTER LEDGER</span>
          </div>
          
          <div className="space-y-4">
            <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-[0.9]">
              SYSTEM <span className="text-primary italic">TRANSPARENCY</span> <br />
              ARCHIVE
            </h1>
            <p className="text-lg md:text-xl text-white/40 font-medium leading-relaxed max-w-2xl">
              We track every node execution, market audit, and event result with total precision. 
              Browse the historical record by date below.
            </p>
          </div>
        </section>

        {/* 3. The Browser Component */}
        <HistoricalResults />

        {/* 4. Accountability Footer */}
        <section className="pt-20 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-12">
           <div className="space-y-6">
              <div className="flex items-center gap-3 text-primary">
                 <ShieldAlert className="w-6 h-6" />
                 <h3 className="text-xl font-black uppercase tracking-tight">Zero-Deletion Policy</h3>
              </div>
              <p className="text-white/40 text-sm leading-relaxed font-medium">
                 Unlike traditional betting trackers, our system is immutable. Once a pick is published to the public board, it CANNOT be removed or edited. Losses are documented with the same intensity as wins to maintain system integrity.
              </p>
           </div>
           
           <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-8 flex flex-col justify-between group hover:bg-white/[0.04] transition-all cursor-pointer">
              <div className="space-y-2">
                 <h4 className="text-sm font-black uppercase text-white/60 tracking-wider">Need a deeper dive?</h4>
                 <p className="text-xs text-white/30 font-bold uppercase tracking-widest">Access the raw data vault for institutional review.</p>
              </div>
              <div className="flex items-center gap-2 mt-8 text-primary font-black text-xs uppercase tracking-[0.3em] group-hover:translate-x-2 transition-transform">
                 Vault Access <ChevronRight className="w-4 h-4" />
              </div>
           </div>
        </section>

      </main>
    </div>
  );
}
