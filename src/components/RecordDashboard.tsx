"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Trophy, TrendingUp, Calendar, History, Activity, ShieldCheck, Target } from "lucide-react";

interface RecordStats {
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  pending: number;
  units: number;
  winPercentage: string;
}

interface PerformanceMatrix {
  today: RecordStats;
  yesterday: RecordStats;
  last7Days: RecordStats;
  thisMonth: RecordStats;
  allTime: RecordStats;
}

export function RecordDashboard() {
  const [stats, setStats] = useState<PerformanceMatrix | null>(null);
  const [hasHistory, setHasHistory] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/records/summary");
        const data = await res.json();
        if (data.success) {
          setStats(data.stats);
          setHasHistory(data.hasHistory);
        }
      } catch (err) {
        console.error("Failed to fetch records", err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) return (
    <div className="bg-card border border-border rounded-2xl p-6 animate-pulse mb-8">
      <div className="h-4 w-48 bg-secondary rounded mb-4" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-secondary/50 rounded-xl" />)}
      </div>
    </div>
  );

  if (!hasHistory) {
    return (
      <div className="mb-8 p-8 bg-secondary/5 border-2 border-dashed border-border rounded-3xl flex flex-col items-center justify-center text-center">
        <Trophy className="w-12 h-12 text-muted-foreground mb-4 opacity-30" />
        <h2 className="text-xl font-black uppercase tracking-widest text-foreground">Verified Record</h2>
        <p className="text-primary font-black uppercase tracking-tighter text-2xl mt-1">No official record yet</p>
        <p className="text-muted-foreground text-sm mt-3 font-medium max-w-md">
          HIMOTHY utilizes a zero-base integrity system. Tracking begins once the first verified picks are officially published and graded against real-world results.
        </p>
        <div className="mt-6 flex items-center gap-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest bg-secondary/20 px-4 py-2 rounded-full border border-border">
          <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Permanent Ledger Initialized
        </div>
      </div>
    );
  }

  const StatBox = ({ title, data, icon: Icon, highlight = false }: { title: string, data: RecordStats, icon: any, highlight?: boolean }) => (
    <div className={`p-4 rounded-xl border transition-all hover:scale-[1.02] ${highlight ? 'bg-primary/10 border-primary/30 shadow-[0_0_20px_rgba(212,168,67,0.1)]' : 'bg-secondary/20 border-border group hover:bg-secondary/30'}`}>
      <div className="flex items-center gap-2 mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-primary transition-colors">
        <Icon className="w-3 h-3" /> {title}
      </div>
      <div className="flex flex-col">
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-black text-foreground">{data.wins}-{data.losses}</span>
          {data.pushes > 0 && <span className="text-[10px] font-bold text-muted-foreground">({data.pushes}P)</span>}
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className={`text-xs font-black ${data.units >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {data.units >= 0 ? '+' : ''}{data.units.toFixed(1)}U
          </span>
          <span className="text-[10px] font-bold text-muted-foreground">{data.winPercentage}</span>
        </div>
      </div>
    </div>
  );

  if (!stats) return null;

  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center justify-between px-2">
         <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">HIMOTHY VERIFIED RECORD</h2>
         </div>
         <div className="hidden md:flex items-center gap-4 text-[10px] font-black text-muted-foreground uppercase opacity-60">
            <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Permanent Ledger</span>
            <span className="flex items-center gap-1"><Target className="w-3 h-3" /> Auto-Settled</span>
         </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatBox title="Today" data={stats.today} icon={Activity} />
        <StatBox title="Yesterday" data={stats.yesterday} icon={Calendar} highlight />
        <StatBox title="7 Days" data={stats.last7Days} icon={TrendingUp} />
        <StatBox title="This Month" data={stats.thisMonth} icon={History} />
        <StatBox title="All-Time" data={stats.allTime} icon={Trophy} />
      </div>

      <div className="bg-secondary/10 border border-border p-3 rounded-lg flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase px-4">
         <span className="animate-pulse flex items-center gap-2">
            <CirclePulse /> Monitoring {stats.allTime.pending + stats.today.pending} Pending Markets
         </span>
         <div className="flex items-center gap-4">
            <Link href="/picks/archive" className="flex items-center gap-1 hover:text-primary transition-colors">
               <History className="w-3 h-3" /> View History Archive
            </Link>
            <span>System 1 Integrity: Every Win is Documented</span>
         </div>
      </div>
    </div>
  );
}

function CirclePulse() {
  return (
    <div className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
    </div>
  );
}
