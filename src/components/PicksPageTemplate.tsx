"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { SmartPickCard } from "@/components/SmartPickCard";
import { Copy, ExternalLink, CheckSquare, ArrowLeft, RefreshCw, Zap, ShieldAlert, ShieldCheck, Activity, Target } from "lucide-react";
import { Pick, getPicksByCategory, PickCategory, PICK_REGISTRY } from "@/lib/picksData";
import { ReactNode } from "react";

interface PicksPageTemplateProps {
  category?: PickCategory;
  sport?: string;
  title: string;
  subtitle: string;
  badge?: string;
  icon: ReactNode;
  backHref?: string;
  backLabel?: string;
  columns?: 1 | 2 | 3;
  accentNote?: string;
}

export function PicksPageTemplate({
  category,
  sport,
  title,
  subtitle,
  badge,
  icon,
  backHref = "/picks",
  backLabel = "Back to All Picks",
  columns = 2,
  accentNote,
}: PicksPageTemplateProps) {
  // If no category is provided, we fetch everything and filter by sport
  const initialPicks = category 
    ? getPicksByCategory(category) 
    : PICK_REGISTRY;
  
  // Apply sport filter if provided
  const filteredPicks = sport
    ? initialPicks.filter(p => p.sport.toLowerCase() === sport.toLowerCase())
    : initialPicks;

  const [picks, setPicks] = useState<{ pick: Pick; preValidation: any; tracking: any }[]>(
    filteredPicks.map(p => ({ pick: p, preValidation: null, tracking: null }))
  );
  const [selectedPicks, setSelectedPicks] = useState<Pick[]>([]);
  const [catStats, setCatStats] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [lastSync, setLastSync] = useState("");
  const [isSyncing, setIsSyncing] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [slateRes, recordsRes] = await Promise.all([
        fetch("/api/slate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ picks: filteredPicks }),
        }),
        fetch("/api/records/summary")
      ]);
      
      const slateData = await slateRes.json();
      const recordsData = await recordsRes.json();
      
      if (slateData.success && slateData.results) setPicks(slateData.results);
      
      // If we have a category, show those stats. If it's a sport page, maybe overall stats?
      if (recordsData.success) {
        if (category) {
          setCatStats(recordsData.category_stats?.[category]);
        } else {
          setCatStats(recordsData.stats?.allTime);
        }
      }
      
      setLastSync(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Data sync failed", err);
    } finally {
      setIsSyncing(false);
    }
  }, [filteredPicks, category]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const togglePick = (pick: Pick) => {
    if (selectedPicks.find((p) => p.id === pick.id)) {
      setSelectedPicks(selectedPicks.filter((p) => p.id !== pick.id));
    } else {
      setSelectedPicks([...selectedPicks, pick]);
    }
  };

  const copySlipContent = () => {
    const slipText = selectedPicks
      .map((p) => `• ${p.game}\n  ${p.selection} (${p.odds})`)
      .join("\n\n");
    const header = `HIMOTHY SLIP BUILDER\n--------------------\n`;
    navigator.clipboard.writeText(header + slipText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const gridClass =
    columns === 3
      ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      : columns === 1
      ? "grid grid-cols-1 max-w-2xl gap-6"
      : "grid grid-cols-1 md:grid-cols-2 gap-6";

  const verifiedPicks = picks.filter(p => p.preValidation?.safe_to_publish);
  const liveCount = verifiedPicks.filter(p => p.preValidation?.status === "live").length;
  const finalCount = verifiedPicks.filter(p => p.preValidation?.status === "final").length;

  return (
    <div className="min-h-screen bg-background text-foreground pb-32">
      <div className="px-6 lg:px-10 py-10 max-w-7xl mx-auto flex flex-col gap-8">
        {/* Back Button */}
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max"
        >
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </Link>

        {/* Page Header */}
        <div className="border-b border-border pb-8 relative">
          <div className="absolute top-0 right-0 flex items-center gap-4">
            {/* Category Performance Badge */}
            {catStats && (
              <div className="hidden lg:flex flex-col items-end px-6 py-2 bg-primary/5 border border-primary/20 rounded-2xl">
                 <span className="text-[10px] font-black text-primary uppercase tracking-widest">Lifetime Record</span>
                 {catStats.wins + catStats.losses === 0 ? (
                   <span className="text-sm font-bold text-muted-foreground mt-1">No official results yet</span>
                 ) : (
                   <div className="flex items-center gap-3">
                      <span className="text-xl font-black text-foreground">{catStats.wins}-{catStats.losses}-{catStats.pushes}</span>
                      <div className="h-6 w-[1px] bg-primary/20" />
                      <div className="flex flex-col">
                         <span className="text-xs font-black text-emerald-500">{catStats.units >= 0 ? '+' : ''}{catStats.units}U</span>
                         <span className="text-[9px] font-black text-muted-foreground uppercase">{catStats.winPercentage} RATE</span>
                      </div>
                   </div>
                 )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-[10px] font-black text-primary uppercase tracking-widest">Registry Sync</span>
                <span className="text-xs font-bold text-muted-foreground">{isSyncing ? "Verifying..." : lastSync ? `Updated ${lastSync}` : "Connecting..."}</span>
              </div>
              <div className={`p-2 rounded-lg bg-secondary border border-border ${isSyncing ? 'animate-spin' : ''}`}>
                <RefreshCw className="w-4 h-4 text-primary" />
              </div>
            </div>
          </div>
          
          {badge && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-black mb-4 border border-primary/20 uppercase tracking-widest">
              <ShieldCheck className="w-3.5 h-3.5" />
              {badge}
            </div>
          )}
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-foreground mb-3 flex items-center gap-3">
            {icon} {title}
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed mb-6">{subtitle}</p>

          <div className="flex lg:hidden mb-6">
             {catStats && (
               <div className="flex items-center gap-6 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl w-full">
                  {catStats.wins + catStats.losses === 0 ? (
                    <div className="flex flex-col">
                       <span className="text-[9px] font-black text-primary uppercase">Lifetime Record</span>
                       <span className="text-sm font-bold text-muted-foreground">No official results yet</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col">
                         <span className="text-[9px] font-black text-primary uppercase">Lifetime</span>
                         <span className="text-lg font-black">{catStats.wins}-{catStats.losses}</span>
                      </div>
                      <div className="flex flex-col">
                         <span className="text-[9px] font-black text-emerald-500 uppercase">Profit</span>
                         <span className="text-lg font-black text-emerald-500">+{catStats.units}U</span>
                      </div>
                      <div className="flex flex-col">
                         <span className="text-[9px] font-black text-muted-foreground uppercase">Win Rate</span>
                         <span className="text-lg font-black">{catStats.winPercentage}</span>
                      </div>
                    </>
                  )}
               </div>
             )}
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 bg-secondary/30 border border-border px-4 py-2 rounded-xl">
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Available Today</span>
                <span className="text-lg font-black text-foreground">{verifiedPicks.length}</span>
              </div>
              <div className="w-px h-8 bg-border mx-2" />
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Live</span>
                <span className="text-lg font-black text-emerald-400">{liveCount}</span>
              </div>
              <div className="w-px h-8 bg-border mx-2" />
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Final</span>
                <span className="text-lg font-black text-blue-400">{finalCount}</span>
              </div>
            </div>

            {verifiedPicks.length > 0 && (
              <button 
                onClick={() => setSelectedPicks(verifiedPicks.map(p => p.pick))}
                className="bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest border border-primary/30 px-4 py-2 rounded-xl hover:bg-primary/20 transition-all flex items-center gap-2"
              >
                <CheckSquare className="w-3.5 h-3.5" /> Select All Card
              </button>
            )}

            {verifiedPicks.length < initialPicks.length && !isSyncing && (
              <div className="flex items-center gap-2 text-[10px] font-black text-amber-500 bg-amber-500/10 px-4 py-2 rounded-xl border border-amber-500/20 uppercase tracking-widest">
                <ShieldAlert className="w-3.5 h-3.5" /> 
                System Lock: Quality over Quantity
              </div>
            )}
          </div>
        </div>

        {/* Picks Grid */}
        <div className={gridClass}>
          {isSyncing && picks.every(item => !item.preValidation) ? (
            <div className="col-span-full py-24 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-3xl bg-secondary/10">
              <div className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin mb-6" />
              <h3 className="text-2xl font-black uppercase tracking-widest text-primary animate-pulse italic">AUDITING SLATE...</h3>
              <p className="text-muted-foreground text-sm mt-2 font-medium">Synchronizing with live league feeds.</p>
            </div>
          ) : verifiedPicks.length === 0 ? (
            <div className="col-span-full py-24 text-center flex flex-col items-center bg-secondary/5 border-2 border-dashed border-border rounded-3xl">
               <ShieldAlert className="w-16 h-16 text-muted-foreground mb-6 opacity-40" />
               <h3 className="text-3xl font-black text-foreground uppercase tracking-tight">
                 {title.toLowerCase().includes("grand slam") ? "Holding for Perfection" : "No Action Today"}
               </h3>
               <p className="text-muted-foreground mt-4 max-w-md mx-auto leading-relaxed font-semibold text-lg">
                 {title.toLowerCase().includes("grand slam") 
                   ? "The Grand Slam only drops when we hit a 97%+ confidence threshold. We are skipping today to protect your bankroll."
                   : "Our quality-control audit found no plays that met our strict edge requirements for this category today."
                 }
               </p>
            </div>
          ) : (
            verifiedPicks.map((item, i) => (
              <SmartPickCard
                key={item.pick.id}
                pick={item.pick}
                validation={item.preValidation}
                tracking={item.tracking}
                isSelected={selectedPicks.some((p) => p.id === item.pick.id)}
                onToggleSelect={() => togglePick(item.pick)}
              />
            ))
          )}
        </div>

        {/* Registry Badge */}
        <div className="mt-8 flex items-center justify-center p-6 bg-secondary/20 border border-border rounded-2xl gap-4">
           <ShieldCheck className="w-8 h-8 text-primary" />
           <div>
              <p className="text-xs font-black text-foreground uppercase tracking-widest">HIMOTHY SINGLE SOURCE OF TRUTH</p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">Every play rendered is cross-checked across 4 private nodes before being authorized for display.</p>
           </div>
        </div>
      </div>

      {/* Floating Slip Bar */}
      {selectedPicks.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-50 pointer-events-none">
          <div className="max-w-3xl mx-auto bg-card border-2 border-primary rounded-xl p-4 shadow-[0_0_40px_rgba(212,168,67,0.3)] flex flex-col md:flex-row items-center justify-between gap-4 pointer-events-auto relative">
            <div className="absolute -top-3 left-6 bg-primary text-primary-foreground text-[10px] font-black uppercase px-3 py-1 rounded-full flex items-center gap-1">
              <CheckSquare className="w-3 h-3" /> Slip Setup ({selectedPicks.length})
            </div>
            <div className="flex-1 mt-2 md:mt-0">
              <h4 className="font-bold text-lg leading-tight">
                {selectedPicks.length} play{selectedPicks.length > 1 ? "s" : ""} selected
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">Copy these exactly as shown into Hard Rock Bet.</p>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <button
                onClick={copySlipContent}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-secondary text-foreground text-sm font-bold px-4 py-2.5 rounded-lg hover:bg-secondary/80 transition-all border border-border"
              >
                <Copy className="w-4 h-4" /> {copied ? "Copied!" : "Copy Slip"}
              </button>
              <a
                href="https://hardrock.bet"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-primary text-primary-foreground text-sm font-bold px-4 py-2.5 rounded-lg hover:bg-primary/90 transition-all shadow-[0_0_15px_rgba(212,168,67,0.3)]"
              >
                Open Books <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
