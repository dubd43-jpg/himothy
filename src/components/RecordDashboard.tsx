"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Target, Zap, ShieldCheck, Globe, Trophy } from "lucide-react";

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
      .then(data => setData(data));
  }, []);

  if (!data) return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-white/5 rounded w-1/2"></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="h-20 bg-white/5 rounded"></div>
        <div className="h-20 bg-white/5 rounded"></div>
      </div>
    </div>
  );

  const stats = [
    { label: "Today", val: `${data.today.wins}-${data.today.losses}`, sub: `Profit: +${data.today.units}U`, color: "text-primary" },
    { label: "Last 7D", val: `${data.last7Days.wins}-${data.last7Days.losses}`, sub: `Win Rate: ${data.last7Days.winPercentage}`, color: "text-emerald-400" },
    { label: "This Mo", val: `${data.thisMonth.wins}-${data.thisMonth.losses}`, sub: `Profit: +${data.thisMonth.units}U`, color: "text-blue-400" },
    { label: "Lifetime", val: `${data.allTime.wins}-${data.allTime.losses}`, sub: `Profit: +${data.allTime.units}U`, color: "text-purple-400" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 text-center">
        {stats.map((s, i) => (
          <div key={i} className="flex flex-col gap-1 p-4 rounded-xl border border-white/5 bg-white/5 group hover:bg-white/10 transition-all">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{s.label}</span>
            <span className={`text-2xl font-black ${s.color} tracking-tighter`}>{s.val}</span>
            <span className="text-[9px] font-bold text-white/20 group-hover:text-white/40 transition-all uppercase">{s.sub}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 pt-4 border-t border-white/5">
         <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
               <ShieldCheck className="w-4 h-4 text-emerald-500" />
               <span className="text-[10px] font-black uppercase text-white/60 tracking-widest">Verified Hit Rate</span>
            </div>
            <span className="text-xs font-black text-emerald-500">{data.allTime.winPercentage}</span>
         </div>
         <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-primary to-emerald-500 shadow-[0_0_10px_rgba(34,197,94,0.3)] transition-all duration-1000" 
              style={{ width: data.allTime.winPercentage }} 
            />
         </div>
         <p className="text-[9px] text-white/30 font-medium leading-relaxed italic">
           *Calculated across all tracked markets including Overseas and International nodes.
         </p>
      </div>
    </div>
  );
}
