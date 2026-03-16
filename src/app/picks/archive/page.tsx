"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Calendar, Trophy, ChevronRight, CheckCircle2, XCircle, MinusCircle, ShieldCheck, Filter, Search, History as HistoryIcon, ShieldAlert } from "lucide-react";

interface ArchivePick {
  id: string;
  sport: string;
  league: string;
  game: string;
  selection: string;
  odds: string;
  result: "win" | "loss" | "push" | "void" | "pending";
  units: number;
  category: string;
  pickType: string;
  publishTime: string;
  gradeTime: string;
  correction?: {
    originalResult: string;
    correctedResult: string;
    reason: string;
    timestamp: string;
  };
}

interface ArchiveDay {
  date: string;
  summary: {
    wins: number;
    losses: number;
    pushes: number;
    voids: number;
    units: number;
    winRate: string;
  };
  sports: Record<string, string>;
  picks: ArchivePick[];
}

export default function ResultsArchivePage() {
  const [archive, setArchive] = useState<ArchiveDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    async function fetchArchive() {
      try {
        const res = await fetch(`/api/records/archive?filter=${activeFilter}`);
        const data = await res.json();
        if (data.success) {
          setArchive(data.archive);
        }
      } catch (err) {
        console.error("Archive fetch failed", err);
      } finally {
        setLoading(false);
      }
    }
    fetchArchive();
  }, [activeFilter]);

  const getResultIcon = (result: string) => {
    switch (result) {
      case "win": return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case "loss": return <XCircle className="w-4 h-4 text-red-500" />;
      case "push": return <MinusCircle className="w-4 h-4 text-muted-foreground" />;
      default: return null;
    }
  };

  const filters = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "7days", label: "Last 7 Days" },
    { id: "month", label: "This Month" },
    { id: "all", label: "All Records" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="px-6 lg:px-10 py-10 max-w-7xl mx-auto flex flex-col gap-8">
        
        {/* Navigation */}
        <Link
          href="/picks"
          className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-white transition-colors w-max"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Live Board
        </Link>

        {/* Page Header */}
        <div className="border-b border-border pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black mb-4 border border-primary/20 uppercase tracking-widest">
            <ShieldCheck className="w-3.5 h-3.5" /> Transparent Vault
          </div>
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-foreground mb-4">
            RESULTS <span className="text-primary tracking-normal font-light">ARCHIVE</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">
            Every move we&apos;ve ever published, preserved in a permanent ledger. No deletions. No revisions. Total accountability.
          </p>
        </div>

        {/* Navigation Filters */}
        <div className="flex flex-wrap gap-2 border-b border-border pb-6">
           {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${activeFilter === f.id ? "bg-primary text-primary-foreground border-primary shadow-[0_0_15px_rgba(212,168,67,0.3)]" : "bg-secondary/20 text-muted-foreground border-border hover:border-primary/50"}`}
              >
                {f.label}
              </button>
           ))}
           <div className="ml-auto flex items-center gap-2 px-4 py-2 bg-secondary/10 border border-border rounded-xl">
              <Calendar className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-black uppercase text-muted-foreground">Select Range</span>
           </div>
        </div>

        {/* Archive Grid */}
        <div className="grid grid-cols-1 gap-6">
          {loading ? (
            [1,2,3].map(i => (
              <div key={i} className="h-40 bg-secondary/20 border border-border rounded-2xl animate-pulse" />
            ))
          ) : archive.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center bg-secondary/5 border-2 border-dashed border-border rounded-3xl">
               <HistoryIcon className="w-16 h-16 text-muted-foreground mb-4 opacity-20" />
               <h3 className="text-xl font-black uppercase text-foreground">No Historical results yet</h3>
               <p className="text-muted-foreground text-sm mt-3 max-w-md font-medium">
                 HIMOTHY is starting fresh. We do not fabricate past records. Once the first verified picks are graded, they will appear here automatically.
               </p>
            </div>
          ) : archive.map((day) => (
            <div 
              key={day.date} 
              className={`bg-card border-2 rounded-2xl overflow-hidden transition-all ${expandedDate === day.date ? 'border-primary shadow-[0_0_30px_rgba(212,168,67,0.1)]' : 'border-border hover:border-primary/30'}`}
            >
              {/* Day Header */}
              <div 
                className="p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 cursor-pointer"
                onClick={() => setExpandedDate(expandedDate === day.date ? null : day.date)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-secondary flex flex-col items-center justify-center text-center border border-border">
                    <span className="text-[10px] font-black text-muted-foreground uppercase">{new Date(day.date).toLocaleString('default', { month: 'short' })}</span>
                    <span className="text-2xl font-black text-foreground">{day.date.split('-')[2]}</span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                    <div className="flex flex-wrap items-center gap-3 mt-1">
                      {Object.entries(day.sports).map(([sport, record]) => (
                        <span key={sport} className="text-[10px] font-bold text-muted-foreground px-2 py-0.5 bg-secondary/50 rounded border border-border">
                          {sport}: {record}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8 w-full md:w-auto border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-8">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Record</span>
                    <span className="text-xl font-black text-foreground">{day.summary.wins}-{day.summary.losses}{day.summary.pushes > 0 ? `-${day.summary.pushes}` : ''}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Net Units</span>
                    <span className={`text-xl font-black ${day.summary.units >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {day.summary.units >= 0 ? '+' : ''}{day.summary.units.toFixed(1)}U
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Win %</span>
                    <span className="text-xl font-black text-primary">{day.summary.winRate}</span>
                  </div>
                  <ChevronRight className={`w-6 h-6 text-muted-foreground transition-transform ml-auto md:ml-0 ${expandedDate === day.date ? 'rotate-90' : ''}`} />
                </div>
              </div>

              {/* Day Picks (Expandable) */}
              {expandedDate === day.date && (
                <div className="bg-secondary/10 border-t border-border p-6 md:p-8 animate-in slide-in-from-top-4 duration-300">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[900px]">
                      <thead>
                        <tr className="border-b border-border/50 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                          <th className="pb-4 pl-2">Section / Sport</th>
                          <th className="pb-4">Game / Event</th>
                          <th className="pb-4">Selection</th>
                          <th className="pb-4">Odds</th>
                          <th className="pb-4">Published / Graded</th>
                          <th className="pb-4">Outcome</th>
                          <th className="pb-4 text-right pr-2">Units</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {day.picks.map((pick) => (
                          <React.Fragment key={pick.id}>
                            <tr className={`border-b border-border/30 hover:bg-secondary/20 transition-colors ${pick.correction ? 'bg-primary/5' : ''}`}>
                              <td className="py-4 pl-2">
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-black text-primary uppercase">{pick.category.replace('_', ' ')}</span>
                                  <span className="text-[9px] font-bold text-muted-foreground uppercase">{pick.sport}</span>
                                </div>
                              </td>
                              <td className="py-4 font-bold text-foreground">{pick.game}</td>
                              <td className="py-4">
                                <div className="flex flex-col">
                                  <span className="font-black">{pick.selection}</span>
                                  <span className="text-[9px] font-bold text-muted-foreground uppercase">{pick.pickType}</span>
                                </div>
                              </td>
                              <td className="py-4 font-bold text-muted-foreground">{pick.odds}</td>
                              <td className="py-4">
                                <div className="flex flex-col text-[10px] font-mono text-muted-foreground">
                                  <span>P: {new Date(pick.publishTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  <span>G: {new Date(pick.gradeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              </td>
                              <td className="py-4">
                                <div className="flex items-center gap-2">
                                  {getResultIcon(pick.result)}
                                  <span className={`font-black uppercase text-[10px] ${pick.result === 'win' ? 'text-emerald-500' : pick.result === 'loss' ? 'text-red-500' : 'text-muted-foreground'}`}>
                                    {pick.result}
                                  </span>
                                </div>
                              </td>
                              <td className={`py-4 text-right pr-2 font-black ${pick.units > 0 ? 'text-emerald-400' : pick.units < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                                {pick.units > 0 ? '+' : ''}{pick.units.toFixed(1)}
                              </td>
                            </tr>
                            {pick.correction && (
                              <tr className="bg-primary/5">
                                <td colSpan={7} className="py-2 px-4">
                                  <div className="flex items-center gap-3 bg-background/50 border border-primary/20 rounded-lg p-3 text-[10px] font-bold">
                                    <ShieldAlert className="w-4 h-4 text-primary animate-pulse" />
                                    <div className="flex flex-col gap-1">
                                      <span className="text-primary uppercase tracking-widest">Correction Log</span>
                                      <span className="text-foreground">
                                        Result adjusted from <span className="line-through opacity-50 uppercase">{pick.correction.originalResult}</span> to <span className="uppercase text-primary">{pick.correction.correctedResult}</span> • {pick.correction.reason}
                                      </span>
                                      <span className="text-muted-foreground opacity-70 italic">Updated: {new Date(pick.correction.timestamp).toLocaleString()}</span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div className="mt-8 flex items-center justify-center gap-3 p-6 bg-secondary/20 border border-border rounded-2xl text-center">
           <Trophy className="w-5 h-5 text-primary" />
           <p className="text-xs font-bold text-muted-foreground max-w-xl">
             This archive is a cryptographically signed record of every play released by the HIMOTHY system. Past performance is not indicative of future results — bet responsibly.
           </p>
        </div>
      </div>
    </div>
  );
}
