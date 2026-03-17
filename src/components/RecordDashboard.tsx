"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Target, Zap, ShieldCheck, Globe, Trophy, Activity, Cpu } from "lucide-react";

interface RecordSummary {
  today: { wins: number; losses: number; winPercentage: string; units: number };
  last7Days: { wins: number; losses: number; winPercentage: string; units: number };
  thisMonth: { wins: number; losses: number; winPercentage: string; units: number };
  allTime: { wins: number; losses: number; winPercentage: string; units: number };
}

export function RecordDashboard() {
  const [data, setData] = useState<RecordSummary | null>(null);

  useEffect(() => {
    fetch('/api/records/summary')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.stats) {
          setData(data.stats);
        }
      })
      .catch(err => console.error("RecordDashboard fetch error:", err));
  }, []);

  if (!data) return (
    <div className="animate-pulse space-y-8 p-10">
      <div className="h-4 bg-white/5 rounded w-1/3 mb-12"></div>
      <div className="grid grid-cols-2 gap-8">
        <div className="h-32 bg-white/5 rounded-3xl"></div>
        <div className="h-32 bg-white/5 rounded-3xl"></div>
        <div className="h-32 bg-white/5 rounded-3xl"></div>
        <div className="h-32 bg-white/5 rounded-3xl"></div>
      </div>
    </div>
  );

  const stats = [
    { 
      label: "Today's Node", 
      val: `${data?.today?.wins ?? 0}-${data?.today?.losses ?? 0}`, 
      sub: `+${data?.today?.units ?? 0}U PROFIT`, 
      color: "text-primary" 
    },
    { 
      label: "7-Day Pulse", 
      val: `${data?.last7Days?.wins ?? 0}-${data?.last7Days?.losses ?? 0}`, 
      sub: `${data?.last7Days?.winPercentage ?? "0%"} HIT RATE`, 
      color: "text-emerald-400" 
    },
    { 
      label: "Monthly Output", 
      val: `${data?.thisMonth?.wins ?? 0}-${data?.thisMonth?.losses ?? 0}`, 
      sub: `+${data?.thisMonth?.units ?? 0}U PROFIT`, 
      color: "text-primary/70" 
    },
    { 
      label: "System Lifetime", 
      val: `${data?.allTime?.wins ?? 0}-${data?.allTime?.losses ?? 0}`, 
      sub: `+${data?.allTime?.units ?? 0}U PROFIT`, 
      color: "text-white" 
    },
  ];

  return (
    <div className="space-y-8">
      {/* Tactical Stats Matrix */}
      <div className="grid grid-cols-2 gap-4 md:gap-6">
        {stats.map((s, i) => (
          <div key={i} className="flex flex-col gap-3 p-6 rounded-[1.5rem] border border-white/5 bg-white/[0.02] group hover:bg-white/[0.04] hover:border-white/10 transition-all duration-500 relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-20 transition-opacity`} />
            <span className="text-[11px] font-black uppercase tracking-[0.4em] text-white/20">{s.label}</span>
            <span className={`text-4xl md:text-5xl font-black font-mono tracking-tighter ${s.color}`}>{s.val}</span>
            <div className="flex items-center gap-3">
               <div className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full bg-current opacity-30`} style={{ width: '100%' }} />
               </div>
               <span className="text-[10px] font-black text-white/40 whitespace-nowrap tracking-widest">{s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Accuracy Node */}
      <div className="p-8 md:p-10 rounded-[2rem] bg-gradient-to-b from-white/[0.04] to-transparent border border-white/10 space-y-6 md:space-y-8 relative overflow-hidden">
         
         <div className="flex items-center justify-between">
            <div className="flex flex-col gap-2">
               <div className="flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6 text-emerald-500" />
                  <span className="text-[12px] font-black uppercase text-white/60 tracking-[0.3em]">Master Accuracy Index</span>
               </div>
               <p className="text-xs text-white/20 font-medium tracking-tight">Across all 24 verified international sports nodes</p>
            </div>
            <div className="flex flex-col items-end gap-1">
               <span className="text-4xl font-black text-emerald-400 font-mono tracking-tighter">{data.allTime.winPercentage}</span>
               <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Global Hit Rate</span>
            </div>
         </div>

         <div className="relative pt-6">
            <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-1">
               <div 
                 className="h-full bg-gradient-to-r from-primary via-emerald-500 to-emerald-400 shadow-[0_0_40px_rgba(34,197,94,0.5)] transition-all duration-[2000ms] ease-out rounded-full" 
                 style={{ width: data.allTime.winPercentage }} 
               />
            </div>
            {/* Ticks */}
            <div className="flex justify-between mt-3 px-1">
               {[0, 25, 50, 75, 100].map(tick => (
                 <span key={tick} className="text-[9px] font-black text-white/10">{tick}%</span>
               ))}
            </div>
         </div>

         <div className="flex items-center gap-5 p-6 rounded-2xl bg-black/40 border border-white/5">
            <Cpu className="w-5 h-5 text-primary opacity-40" />
            <p className="text-[10px] text-white/30 font-bold leading-relaxed uppercase tracking-widest">
               HIMOTHY CORE: REAL-TIME VERIFICATION ENABLED. ALL RECORDS ARE SOURCE-VALIDATED AGAINST OFFICIAL FEEDS.
            </p>
         </div>
      </div>
    </div>
  );
}
