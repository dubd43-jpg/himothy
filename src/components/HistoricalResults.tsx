"use client";

import React, { useState, useEffect } from "react";
import { 
  CalendarDays, 
  ChevronLeft, 
  ChevronRight, 
  Trophy, 
  Target, 
  Zap, 
  Activity,
  CheckCircle2,
  XOctagon,
  MinusCircle,
  ShieldCheck
} from "lucide-react";

interface PickResult {
  package: string;
  sport: string;
  selection: string;
  odds: string;
  result: string;
  status: 'WIN' | 'LOSS' | 'PUSH' | 'PENDING';
  recap: string;
}

interface DailyRecord {
  date: string;
  record: string;
  unitsWon: string;
  winPercentage: string;
  picks: PickResult[];
}

const TRACKING_TIMEZONE = 'America/New_York';
const OFFICIAL_START_DATE = '2026-04-20';

function toEtDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TRACKING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value || '1970';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

function formatEtDisplayDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TRACKING_TIMEZONE,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function HistoricalResults() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [data, setData] = useState<DailyRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchResults = async (date: Date) => {
    setLoading(true);
    try {
      const dateStr = toEtDateKey(date);
      const res = await fetch(`/api/records/history?date=${dateStr}`);
      const json = await res.json();
      
      if (json.success) {
        const stats = json.stats.today;
        setData({
          date: formatEtDisplayDate(date),
          record: `${stats.wins}-${stats.losses}`,
          unitsWon: (stats.units >= 0 ? "+" : "") + stats.units.toFixed(1) + "U",
          winPercentage: stats.winPercentage,
          picks: (json.gradedPicks || []).map((gp: any) => ({
            package: gp.pick.category.replace(/_/g, ' '),
            sport: gp.pick.sport,
            selection: gp.pick.selection,
            odds: gp.pick.odds,
            result: gp.status === 'PENDING' ? 'LIVE/PENDING' : gp.status,
            status: gp.status,
            recap: gp.pick.reasoning?.substring(0, 100) + "..."
          }))
        });
      }
    } catch (err) {
      console.error("Failed to fetch historical results:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults(selectedDate);
  }, [selectedDate]);

  const adjustDate = (days: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + days);
    if (next > new Date()) return;
    if (toEtDateKey(next) < OFFICIAL_START_DATE) return;
    setSelectedDate(next);
  };

  const isToday = toEtDateKey(selectedDate) === toEtDateKey(new Date());
  const isOfficialStartDate = toEtDateKey(selectedDate) === OFFICIAL_START_DATE;

  return (
    <div className="space-y-8">
      {/* Date Navigator */}
      <div className="flex items-center justify-between bg-card border border-border p-4 rounded-2xl">
        <button 
          onClick={() => adjustDate(-1)}
          disabled={isOfficialStartDate}
          className={`p-2 rounded-xl transition-colors ${isOfficialStartDate ? 'opacity-20 cursor-not-allowed' : 'hover:bg-secondary'}`}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2 text-primary font-black uppercase text-xs tracking-widest mb-1">
            <CalendarDays className="w-3.5 h-3.5" /> 
            {isToday ? "LIVE BOARD" : "HISTORICAL ARCHIVE"}
          </div>
          <span className="text-xl md:text-2xl font-black uppercase">{data?.date || "Loading..."}</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">Official Record Since 2026-04-20 (ET)</span>
        </div>

        <button 
          onClick={() => adjustDate(1)}
          disabled={isToday}
          className={`p-2 rounded-xl transition-colors ${isToday ? 'opacity-20 cursor-not-allowed' : 'hover:bg-secondary'}`}
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-black uppercase tracking-[0.3em] text-white/40">Syncing Ledger...</span>
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Daily Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="p-8 bg-card border border-border rounded-3xl relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
               <span className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-4 block">Final Record</span>
               <span className="text-5xl font-black text-white">{data?.record}</span>
            </div>
            <div className="p-8 bg-card border border-emerald-500/20 rounded-3xl relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
               <span className="text-[10px] font-black text-emerald-500/60 uppercase tracking-widest mb-4 block">Net Profit</span>
               <span className="text-5xl font-black text-emerald-400">{data?.unitsWon}</span>
            </div>
            <div className="p-8 bg-card border border-border rounded-3xl relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
               <span className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-4 block">Hit Rate</span>
               <span className="text-5xl font-black text-primary">{data?.winPercentage}</span>
            </div>
          </div>

          {/* Detailed Pick List */}
          <div className="bg-card border border-border rounded-3xl overflow-hidden mb-12">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Daily Node Execution Log
              </h3>
              <div className="text-[10px] font-black text-white/20 uppercase tracking-widest">
                {data?.picks.length} Events Logged
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-secondary/30 text-[10px] font-black uppercase tracking-widest text-white/40 border-b border-border">
                  <tr>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Event / Market</th>
                    <th className="px-6 py-4">Selection</th>
                    <th className="px-6 py-4 text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data?.picks.map((pick, i) => (
                    <tr key={i} className="group hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary px-2 py-1 bg-primary/5 rounded-md border border-primary/10">
                          {pick.package}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{pick.sport}</span>
                          <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">{pick.selection}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col gap-1">
                           <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Pricing</span>
                           <span className="text-sm font-mono font-bold text-white/60">{pick.odds}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-3">
                           <span className={`text-[10px] font-black uppercase tracking-widest ${
                             pick.status === 'WIN' ? 'text-emerald-400' : 
                             pick.status === 'LOSS' ? 'text-red-400' : 
                             'text-white/40'
                           }`}>
                             {pick.result}
                           </span>
                           {pick.status === 'WIN' ? (
                             <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                           ) : pick.status === 'LOSS' ? (
                             <XOctagon className="w-5 h-5 text-red-500" />
                           ) : (
                             <MinusCircle className="w-5 h-5 text-white/20" />
                           )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data?.picks.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center gap-2 opacity-20">
                           <Activity className="w-8 h-8" />
                           <span className="text-xs font-black uppercase tracking-widest">No node data archived for this date</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Verification Footer */}
          <div className="flex items-center gap-3 p-6 rounded-2xl bg-white/[0.02] border border-white/5">
             <ShieldCheck className="w-5 h-5 text-emerald-500 opacity-50" />
             <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.2em] leading-relaxed">
               All records on this date have been independently verified against global sports data providers. System immutability active.
             </p>
          </div>
        </div>
      )}
    </div>
  );
}
