"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { 
  ArrowLeft, Trophy, Zap, Target, BarChart3, TrendingUp, 
  Crown, Bomb, ArrowRight, Clock, Globe, ShieldCheck, 
  ShieldAlert, Activity, ChevronRight, Cpu, Timer, LineChart 
} from "lucide-react";
import { LiveScoreBoard } from "@/components/LiveScoreBoard";
import { RecordDashboard } from "@/components/RecordDashboard";

type CategoryKey = "GRAND_SLAM" | "PRESSURE_PACK" | "VIP_4_PACK" | "PARLAY_PLAN" | "OVERNIGHT" | "PERSONAL_PLAY" | "HAILMARY" | "OVERSEAS";

export default function PicksHubPage() {
  const [counts, setCounts] = useState<Record<CategoryKey, number> | null>(null);
  const [catStats, setCatStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statusRes, recordsRes] = await Promise.all([
          fetch("/api/registry/status"),
          fetch("/api/records/summary")
        ]);
        
        const statusData = await statusRes.json();
        const recordsData = await recordsRes.json();
        
        if (statusData.success) setCounts(statusData.counts);
        if (recordsData.success) setCatStats(recordsData.category_stats);
      } catch (err) {
        console.error("Failed to fetch page data", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const packages = [
    {
      id: "GRAND_SLAM" as CategoryKey,
      href: "/grand-slam",
      icon: Trophy,
      label: "HIMOTHY Grand Slam",
      badge: "LVL 4 EDGE",
      badgeColor: "bg-primary text-black",
      description: "Our absolute highest confidence play. Filtered through 12 neural variables for maximum measurable edge.",
      accentColor: "border-primary/20 hover:border-primary shadow-[0_0_30px_rgba(212,168,67,0.1)]",
      performance: "ELITE"
    },
    {
      id: "PRESSURE_PACK" as CategoryKey,
      href: "/pressure-pack",
      icon: Zap,
      label: "Pressure Pack",
      badge: "HIGH PRESSURE",
      badgeColor: "bg-orange-500 text-black",
      description: "Forceful plays identifying market inefficiency. We only move when probability exceeds 75%.",
      accentColor: "border-orange-500/20 hover:border-orange-500/50",
      performance: "STRONG"
    },
    {
      id: "VIP_4_PACK" as CategoryKey,
      href: "/vip-picks",
      icon: Target,
      label: "VIP 4-Pack",
      badge: "STABLE BOARD",
      badgeColor: "bg-blue-500 text-white",
      description: "Structured daily foundation. Picks cross-checked against live feeds every 5 minutes.",
      accentColor: "border-blue-500/20 hover:border-blue-500/50",
      performance: "STABLE"
    },
    {
      id: "PARLAY_PLAN" as CategoryKey,
      href: "/parlay-plan",
      icon: BarChart3,
      label: "$10 Parlay Plan",
      badge: "FLIP CHASER",
      badgeColor: "bg-emerald-500 text-black",
      description: "Turning small stakes into a move. Multi-leg tickets built on cumulative edge advantage.",
      accentColor: "border-emerald-500/20 hover:border-emerald-500/50",
      performance: "EV+"
    },
    {
      id: "OVERNIGHT" as CategoryKey,
      href: "/overnight",
      icon: TrendingUp,
      label: "Overnight & Global",
      badge: "24/7 MONITOR",
      badgeColor: "bg-purple-500 text-white",
      description: "Soccer and Tennis markets monitored around the clock for timezone-based inefficiency.",
      accentColor: "border-purple-500/20 hover:border-purple-500/50",
      performance: "MODERATE"
    },
    {
      id: "PERSONAL_PLAY" as CategoryKey,
      href: "/himothy-picks",
      icon: Crown,
      label: "My HIMOTHY Pick",
      badge: "ROSTER VERIFIED",
      badgeColor: "bg-yellow-500 text-black",
      description: "Human-led analysis superseding the algorithm. Only posted when 'Verified' signals are green.",
      accentColor: "border-yellow-500/20 hover:border-yellow-500/50",
      performance: "DIRECT"
    },
    {
      id: "HAILMARY" as CategoryKey,
      href: "/hailmary",
      icon: Bomb,
      label: "The Hailmarys",
      badge: "LOTTO / MAX VAR",
      badgeColor: "bg-red-500 text-white",
      description: "Calculated lottery tickets. Maximum variance, maximum transparency. Math-forced plays only.",
      accentColor: "border-red-500/20 hover:border-red-500/50",
      performance: "HIGH VAR"
    },
    {
      id: "OVERSEAS" as CategoryKey,
      href: "/overseas",
      icon: Globe,
      label: "Overseas & Int'l",
      badge: "GLOBAL EDGE",
      badgeColor: "bg-yellow-500 text-black",
      description: "International leagues (Serie A, Superliga) audited locally. Deep board scanning enabled.",
      accentColor: "border-yellow-500/20 hover:border-yellow-500/50",
      performance: "VERIFIED"
    },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-white pb-24 premium-gradient selection:bg-primary/30">
      
      {/* 1. Tactical Header */}
      <header className="px-5 md:px-12 py-6 border-b border-white/5 bg-black/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-6">
            <Link href="/" className="p-2 md:p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-all border border-white/10 group shrink-0">
              <ArrowLeft className="w-5 h-5 text-white/50 group-hover:text-primary transition-colors" />
            </Link>
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="relative group shrink-0">
                <Image 
                  src="/logo.jpg" 
                  alt="HIMOTHY" 
                  width={36} 
                  height={36} 
                  className="rounded-lg border border-primary/40 himo-glow transition-all group-hover:border-primary md:w-10 md:h-10" 
                />
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-black animate-pulse" />
              </div>
              <div className="flex flex-col justify-center min-w-0">
                <h1 className="text-base md:text-xl font-black tracking-tight uppercase leading-none truncate">
                  HIMOTHY <span className="text-primary italic">CORE</span>
                </h1>
                <span className="text-[8px] md:text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mt-1 truncate">Deployment Slate Hub</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 md:gap-8 shrink-0">
            <div className="hidden sm:flex flex-col items-end">
               <span className="text-[9px] font-black text-primary uppercase tracking-widest leading-none mb-1">Neural Health</span>
               <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1.5">
                 <Cpu className="w-3 h-3" /> 144ms
               </span>
            </div>
            <div className="hidden sm:block h-6 w-[1px] bg-white/10" />
            <div className="flex items-center gap-3">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
               <span className="text-[10px] font-black uppercase tracking-widest text-white/60">{new Date().toLocaleDateString('en-US', { weekday: 'short' })}</span>
            </div>
            <Link 
              href="/results"
              className="px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-lg text-[10px] font-black text-primary uppercase tracking-widest transition-all flex items-center gap-2"
            >
               <LineChart className="w-3.5 h-3.5" /> LEDGER
            </Link>
          </div>
        </div>
      </header>

      <div className="px-5 md:px-12 py-8 md:py-16 max-w-7xl mx-auto space-y-12 md:space-y-24">
        {/* 2. Hero Identity */}
        <section className="flex flex-col gap-6 md:gap-10">
          <div className="inline-flex items-center gap-3 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 w-fit">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Continuous Decision Engine Activated</span>
          </div>
          
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
            <div className="space-y-4 max-w-2xl">
              <h2 className="text-5xl md:text-7xl lg:text-8xl font-black uppercase tracking-tighter leading-[0.95] md:leading-[0.85]">
                Today&apos;s <br className="hidden md:block" />
                <span className="text-primary italic">Edge Board.</span>
              </h2>
              <p className="text-base md:text-xl text-white/50 font-medium leading-relaxed max-w-xl">
                Aggregating live signals from 32 global markets. Every node below is audited for roster integrity and market efficiency.
              </p>
            </div>
            
            <div className="flex gap-4 md:gap-6 w-full lg:w-auto">
               <div className="flex-1 lg:flex-none px-6 md:px-10 py-6 rounded-3xl bg-white/[0.03] border border-white/10 flex flex-col gap-1 items-center md:items-start text-center md:text-left transition-all hover:bg-white/[0.05]">
                  <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Active Markets</span>
                  <span className="text-3xl md:text-4xl font-black text-white">32</span>
               </div>
               <div className="flex-1 lg:flex-none px-6 md:px-10 py-6 rounded-3xl bg-white/[0.03] border border-white/10 flex flex-col gap-1 items-center md:items-start text-center md:text-left transition-all hover:bg-white/[0.05]">
                  <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Neural Load</span>
                  <span className="text-3xl md:text-4xl font-black text-emerald-400">9.8/10</span>
               </div>
            </div>
          </div>
        </section>

        {/* 3. The Grid Matrix */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {packages.map((pkg) => {
            const Icon = pkg.icon;
            const availableCount = counts ? counts[pkg.id] : 0;
            const isAvailable = availableCount > 0;
            
            return (
              <Link
                key={pkg.id}
                href={pkg.href}
                className={`group glass-morphism rounded-[1.5rem] md:rounded-[2rem] p-6 md:p-8 flex flex-col gap-6 transition-all duration-500 border-white/5 relative overflow-hidden h-full 
                  ${isAvailable ? pkg.accentColor : 'opacity-30 grayscale pointer-events-none'}`}
              >
                {/* Visual Flair */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.03] -mr-8 -mt-8 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
                
                <div className="flex items-start justify-between relative">
                  <div className="p-4 bg-white/5 rounded-2xl group-hover:bg-primary/20 transition-all border border-white/10 group-hover:border-primary/20">
                    <Icon className={`w-8 h-8 ${isAvailable ? 'text-primary' : 'text-white/20'}`} />
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-full border border-white/10 ${pkg.badgeColor}`}>
                    {pkg.badge}
                  </span>
                </div>

                <div className="space-y-4 flex-1">
                  <h3 className="text-2xl font-black uppercase tracking-tight group-hover:text-primary transition-colors leading-none">
                    {pkg.label}
                  </h3>
                  <p className="text-sm text-white/50 leading-relaxed font-medium">
                    {pkg.description}
                  </p>
                </div>

                <div className="pt-6 border-t border-white/5 space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                          <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Lifetime Record</span>
                          <span className="text-xl font-black text-white flex items-center gap-2 font-mono">
                             {catStats?.[pkg.id]?.wins ?? 0}-{catStats?.[pkg.id]?.losses ?? 0}
                             <span className={`text-[11px] font-bold ${ (catStats?.[pkg.id]?.units ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {(catStats?.[pkg.id]?.units ?? 0) >= 0 ? '+' : ''}{catStats?.[pkg.id]?.units ?? 0}U
                             </span>
                          </span>
                      </div>
                      <div className="flex flex-col items-end">
                         <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Node Status</span>
                       <span className="text-xs font-black text-white uppercase italic">{pkg.performance}</span>
                      </div>
                    </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                       <span className="text-[9px] font-black text-primary uppercase tracking-[0.2em] mb-1">Deployment Access</span>
                       <span className="text-2xl md:text-3xl font-black text-white font-mono flex items-baseline gap-1">
                         {availableCount} <span className="text-[10px] text-white/40 ml-1">NODES</span>
                       </span>
                    </div>
                    <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center group-hover:border-primary group-hover:bg-primary group-hover:text-black transition-all">
                       <ArrowRight className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>

        {/* 4. Live Environment Monitoring */}
        <section className="space-y-12 md:space-y-16">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
            <div className="flex flex-col gap-4">
               <div className="flex items-center gap-3 text-red-500">
                  <Activity className="w-5 h-5 md:w-6 md:h-6 animate-pulse" />
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.4em]">Live Aggregator State</span>
               </div>
               <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight">System Performance Hub</h2>
            </div>
            <Link href="/results" className="group flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all">
               View Full Neural Audit History <ArrowRight className="w-3.5 h-3.5 md:w-4 md:h-4 group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
             <div className="lg:col-span-8">
                <LiveScoreBoard />
             </div>
             <div className="lg:col-span-4 glass-morphism rounded-[3rem] p-8 md:p-12 h-fit border-white/5">
                <div className="flex flex-col gap-8">
                   <div className="pb-8 border-b border-white/5">
                      <h3 className="text-lg font-black uppercase tracking-widest text-primary mb-2">Master Accuracy Index</h3>
                      <p className="text-xs text-white/40 font-medium leading-relaxed">System-wide performance across all verified nodes since deployment.</p>
                   </div>
                   <RecordDashboard />
                </div>
             </div>
          </div>
        </section>
      </div>

      {/* 5. Terminal Warning Area */}
      <footer className="px-6 lg:px-12 py-12 md:py-16 bg-black border-t border-white/5 mt-16 md:mt-24">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
           <div className="flex flex-col gap-4 md:gap-6 text-center lg:text-left">
              <div className="flex items-center justify-center lg:justify-start gap-4 text-primary">
                 <ShieldAlert className="w-6 h-6 md:w-8 md:h-8" />
                 <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] md:tracking-[0.5em]">Neural Protocol Advisory 44.1</span>
              </div>
              <p className="text-[10px] text-white/20 leading-relaxed font-bold uppercase tracking-wider max-w-xl mx-auto lg:mx-0">
                 HIMOTHY IS A LIVE DECISION ENGINE. ALL LINES SHOWN ARE FOR AUDIT PURPOSES. WE RE-EVALUATE EVERY FACT EVERY 5 MINUTES. IF INFORMATION CHANGES, THE NODE IS REMOVED. WAGER AT YOUR OWN RISK. 21+.
              </p>
           </div>
           <div className="flex flex-wrap gap-3 justify-center lg:justify-end">
              <Link href="/monitoring" className="px-4 md:px-6 py-2.5 md:py-3 bg-white/5 text-white/40 text-[9px] md:text-[10px] font-black rounded-xl uppercase hover:text-primary border border-white/10 transition-colors tracking-widest">Sys Monitor</Link>
              <Link href="/audit" className="px-4 md:px-6 py-2.5 md:py-3 bg-white/5 text-white/40 text-[9px] md:text-[10px] font-black rounded-xl uppercase hover:text-primary border border-white/10 transition-colors tracking-widest">Final Audit</Link>
              <Link href="/system-health" className="px-4 md:px-6 py-2.5 md:py-3 bg-white/5 text-white/40 text-[9px] md:text-[10px] font-black rounded-xl uppercase hover:text-primary border border-white/10 transition-colors tracking-widest">Health</Link>
           </div>
        </div>
      </footer>
    </div>
  );
}
