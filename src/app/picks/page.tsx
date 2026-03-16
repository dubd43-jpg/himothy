"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Trophy, Zap, Target, BarChart3, TrendingUp, Crown, Bomb, ArrowRight, Clock, Globe, ShieldCheck, ShieldAlert, Activity, ChevronRight } from "lucide-react";
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
      badge: "Level 4 Edge",
      badgeColor: "bg-primary/20 text-primary border-primary/30",
      description: "Our highest confidence play. Filtered through 12 unique variables for the maximum measurable edge.",
      accentColor: "border-primary/40 hover:border-primary shadow-[0_0_20px_rgba(212,168,67,0.08)]",
    },
    {
      id: "PRESSURE_PACK" as CategoryKey,
      href: "/pressure-pack",
      icon: Zap,
      label: "Pressure Pack",
      badge: "Edge Confirmed",
      badgeColor: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      description: "Forceful plays identifying market inefficiency. We only move when the probability exceeds 75%.",
      accentColor: "border-orange-500/20 hover:border-orange-500/50",
    },
    {
      id: "VIP_4_PACK" as CategoryKey,
      href: "/vip-picks",
      icon: Target,
      label: "VIP 4-Pack",
      badge: "Stable Board",
      badgeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      description: "Structured daily foundation. Picks cross-checked against live roster and injury feeds every 5 minutes.",
      accentColor: "border-blue-500/20 hover:border-blue-500/50",
    },
    {
      id: "PARLAY_PLAN" as CategoryKey,
      href: "/parlay-plan",
      icon: BarChart3,
      label: "$10 Parlay Plan",
      badge: "EV+ Chaser",
      badgeColor: "bg-green-500/20 text-green-400 border-green-500/30",
      description: "Turning small stakes into a move. Multi-leg tickets built on cumulative edge advantage.",
      accentColor: "border-green-500/20 hover:border-green-500/50",
    },
    {
      id: "OVERNIGHT" as CategoryKey,
      href: "/overnight",
      icon: TrendingUp,
      label: "Overnight & Global",
      badge: "Global Monitor",
      badgeColor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      description: "Soccer and Tennis markets monitored 24/7. Continuous scanning for timezone-based inefficiency.",
      accentColor: "border-purple-500/20 hover:border-purple-500/50",
    },
    {
      id: "PERSONAL_PLAY" as CategoryKey,
      href: "/himothy-picks",
      icon: Crown,
      label: "My HIMOTHY Pick",
      badge: "Verified Edge",
      badgeColor: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      description: "My own read, superseding the algorithm. Only posted when 'Roster Verified' signals are green.",
      accentColor: "border-yellow-500/20 hover:border-yellow-500/50",
    },
    {
      id: "HAILMARY" as CategoryKey,
      href: "/hailmary",
      icon: Bomb,
      label: "The Hailmarys",
      badge: "Lotto / Variance",
      badgeColor: "bg-red-500/20 text-red-400 border-red-500/30",
      description: "Calculated lottery tickets. Maximum variance, maximum transparency. Shown only if value exists.",
      accentColor: "border-red-500/20 hover:border-red-500/50",
    },
    {
      id: "OVERSEAS" as CategoryKey,
      href: "/overseas",
      icon: Globe,
      label: "Overseas & International",
      badge: "Global Edge",
      badgeColor: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      description: "International leagues (Serie A, Superliga) audited locally. We follow the depth of the board.",
      accentColor: "border-yellow-500/20 hover:border-yellow-500/50",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="px-6 lg:px-10 py-10 max-w-7xl mx-auto flex flex-col gap-10">

        {/* Header Section */}
        <div className="flex flex-col gap-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>

          <div className="flex flex-col md:flex-row items-center gap-10 border-b border-border pb-10">
            <Image
              src="/logo.jpg"
              alt="HIMOTHY Plays and Parlays"
              width={100}
              height={100}
              className="rounded-full border-4 border-primary/40 shadow-[0_0_30px_rgba(212,168,67,0.2)] flex-shrink-0"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black border border-primary/20 uppercase tracking-[0.2em]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Continuous Decision Engine
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                  <span className="text-foreground">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                </div>
              </div>
              <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-foreground mb-4">
                TODAY&apos;S <span className="text-primary tracking-normal font-light italic">EDGE BOARD</span>
              </h1>
              <div className="flex flex-wrap items-center gap-6">
                 <div className="flex items-center gap-2 text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                    <Activity className="w-3.5 h-3.5 animate-pulse" /> Live Monitoring Active
                 </div>
                 <div className="flex items-center gap-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Roster Verified 
                 </div>
                 <div className="flex items-center gap-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    <Target className="w-3.5 h-3.5 text-primary" /> EV+ Optimized
                 </div>
              </div>
            </div>
            <div className="w-full md:w-auto">
               <div className="bg-secondary/20 p-4 rounded-2xl border border-border/50 flex flex-col gap-2">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Board Status</span>
                  <div className="flex items-center gap-4">
                     <div className="flex flex-col">
                        <span className="text-xs font-black text-foreground">32 ACTIVE</span>
                        <span className="text-[9px] font-bold text-muted-foreground">MARKETS</span>
                     </div>
                     <div className="h-8 w-[1px] bg-border" />
                     <div className="flex flex-col">
                        <span className="text-xs font-black text-primary italic">SHARP ACTION</span>
                        <span className="text-[9px] font-bold text-muted-foreground uppercase">DETECTION</span>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        </div>

        {/* MAIN ATTRACTION: Picks Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
               <Trophy className="w-4 h-4 text-primary" /> Main Picks & Tickets
            </h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {packages.map((pkg) => {
              const Icon = pkg.icon;
              const availableCount = counts ? counts[pkg.id] : 0;
              const isAvailable = availableCount > 0;
              
              return (
                <div
                  key={pkg.id}
                  className={`group bg-card border-2 rounded-2xl p-6 flex flex-col gap-4 transition-all duration-200 ${isAvailable ? pkg.accentColor : 'opacity-70 border-dashed grayscale-[0.5]'}`}
                >
                  <div className="flex items-start justify-between">
                    <div className={`w-12 h-12 rounded-xl bg-secondary flex items-center justify-center ${isAvailable ? 'group-hover:bg-primary/10' : ''} transition-colors`}>
                      <Icon className={`w-6 h-6 ${isAvailable ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${pkg.badgeColor}`}>
                      {pkg.badge}
                    </span>
                  </div>

                  <div className="flex-1">
                    <h2 className={`font-black text-lg ${isAvailable ? 'text-foreground' : 'text-muted-foreground'} uppercase leading-tight mb-2`}>
                      {pkg.label}
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {pkg.description}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 mt-2 pt-4 border-t border-border">
                    <div className="flex items-center justify-between mb-1">
                       <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Lifetime Record</span>
                       {loading ? (
                         <div className="h-3 w-12 bg-secondary animate-pulse rounded" />
                       ) : (
                         <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-foreground">
                               {catStats?.[pkg.id]?.wins}-{catStats?.[pkg.id]?.losses}
                            </span>
                            <span className={`text-[10px] font-black ${catStats?.[pkg.id]?.units >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                               {catStats?.[pkg.id]?.units >= 0 ? '+' : ''}{catStats?.[pkg.id]?.units}U
                            </span>
                         </div>
                       )}
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${isAvailable ? 'text-primary' : 'text-muted-foreground'}`}>Available Today</span>
                        <span className={`text-xl font-black ${isAvailable ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {loading ? "..." : availableCount}
                        </span>
                      </div>
                      {isAvailable ? (
                        <Link
                          href={pkg.href}
                          className="inline-flex items-center gap-1 text-xs font-black text-primary group-hover:gap-2 transition-all uppercase tracking-tight"
                        >
                          View Picks <ArrowRight className="w-4 h-4" />
                        </Link>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[9px] font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 uppercase">
                          <ShieldAlert className="w-3 h-3" /> Integrity Lock
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RESULTS SUMMARY: Record Section (Lower on Page) */}
        <div className="mt-12 pt-12 border-t border-border flex flex-col gap-8">
           <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
                 Official Performance Summary
              </h2>
              <Link href="/results" className="text-[10px] font-black text-primary uppercase flex items-center gap-1 hover:gap-2 transition-all">
                Full Results History <ArrowRight className="w-3 h-3" />
              </Link>
           </div>
           <RecordDashboard />
        </div>

        {/* LIVE GAME BOARDS (Bottom section) */}
        <div className="mt-12 pt-12 border-t border-border flex flex-col gap-8">
           <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
                 <Activity className="w-4 h-4 text-red-500 animate-pulse" /> Live Aggregator: Scanning Feeds
              </h2>
           </div>
           <LiveScoreBoard />
        </div>

        {/* Bottom Disclaimers & Engine Links */}
        <div className="mt-12 p-6 bg-card border border-border rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground leading-relaxed">
              ⚠️ HIMOTHY is a live decision engine. All lines and odds shown are for informational purposes. 
              We re-evaluate facts every 5 minutes. If information changes, the pick changes or is removed.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
             <Link href="/monitoring" className="px-3 py-1.5 bg-secondary text-muted-foreground text-[10px] font-black rounded uppercase hover:text-primary border border-border transition-colors">Monitoring</Link>
             <Link href="/audit" className="px-3 py-1.5 bg-secondary text-muted-foreground text-[10px] font-black rounded uppercase hover:text-primary border border-border transition-colors">Audit</Link>
             <Link href="/system-health" className="px-3 py-1.5 bg-secondary text-muted-foreground text-[10px] font-black rounded uppercase hover:text-primary border border-border transition-colors">Health</Link>
          </div>
        </div>

      </div>
    </div>
  );
}
