import { useState, useEffect } from "react";
import { Activity, ShieldAlert, CheckCircle2, Clock, CheckSquare, Square, ExternalLink, Trophy, Cpu, Globe, Medal, ShieldCheck, ListChecks } from "lucide-react";
import { MouseEvent } from "react";

export interface PickProps {
  sport: string;
  game: string;
  gameDate?: string;
  gameTime?: string;
  selection: string;
  market: string;
  line: string;
  odds: string;
  confidence: number;
  edge: string;
  risk: string;
  reasoning: string;
  bestUse?: string;
  isPremium?: boolean;
  sportsbook?: string;
  deepLink?: string;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  liveStatus?: "WINNING" | "LOSING" | "PENDING" | "WON" | "LOST";
  fadeReasoning?: string;
}

export function PickCard({
  sport,
  game,
  gameDate,
  gameTime,
  selection,
  market,
  line,
  odds,
  confidence,
  edge,
  risk,
  reasoning,
  bestUse,
  isPremium = false,
  sportsbook = "Hard Rock Bet",
  deepLink,
  isSelected = false,
  onToggleSelect,
  liveStatus,
  fadeReasoning,
}: PickProps) {
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    if (!gameTime) return;

    const updateCountdown = () => {
      try {
        let datePart = gameDate || "Today";
        const now = new Date();
        const nowInET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' }).format(now);
        
        if (datePart === "Today") {
          datePart = nowInET;
        } else if (datePart === "Tomorrow") {
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          datePart = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' }).format(tomorrow);
        }

        const dateStr = `${datePart} ${gameTime}`;
        const startTime = new Date(dateStr + " GMT-0400").getTime();
        const diff = startTime - now.getTime();

        if (isNaN(startTime) || diff <= 0) {
          setCountdown(null);
          return;
        }

        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);

        if (h > 0) setCountdown(`${h}h ${m}m`);
        else if (m > 0) setCountdown(`${m}m ${s}s`);
        else setCountdown(`${s}s`);
      } catch (err) {
        setCountdown(null);
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [gameDate, gameTime]);

  const isHighConfidence = confidence >= 9.0;
  const isWinning = liveStatus === "WINNING" || liveStatus === "WON";
  const isLosing = liveStatus === "LOSING" || liveStatus === "LOST";
  const isLive = liveStatus === "WINNING" || liveStatus === "LOSING" || liveStatus === "PENDING";

  const handleOutboundClick = async (e: MouseEvent<HTMLAnchorElement>) => {
    if (!deepLink) return;
    try {
      await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: deepLink, pickSelection: selection, sportsbook })
      });
    } catch (err) {}
  };

  return (
    <div className={`bg-card border border-white/10 rounded-[2.5rem] overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] h-full flex flex-col relative group transition-all duration-500 hover:border-primary/40 ${
      isLosing ? "opacity-60 grayscale-[0.5] border-red-500/30" : isWinning ? "border-emerald-500/30" : ""
    }`}>
      
      {/* 1. Tactical Header */}
      <div 
        className={`p-8 border-b border-white/5 flex flex-col gap-6 cursor-pointer group/header
          ${isWinning ? "bg-emerald-500/[0.03]" : isLosing ? "bg-red-500/[0.03]" : "bg-background/40"}
        `}
        onClick={onToggleSelect}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                {onToggleSelect && (
                  <div className="transition-all transform group-hover/header:scale-110">
                    {isSelected ? <CheckSquare className="w-6 h-6 text-primary" /> : <Square className="w-6 h-6 text-white/20 group-hover/header:text-primary/50" />}
                  </div>
                )}
                <span className="text-[11px] font-black text-primary tracking-[0.4em] uppercase opacity-60 flex items-center gap-2">
                   <Globe className="w-3.5 h-3.5" /> {sport} {gameDate ? `• ${gameDate}` : ""}
                </span>
              </div>
              <h3 className="text-3xl md:text-4xl font-black text-white leading-tight tracking-tighter">
                {game.split(" vs. ")[0]} <span className="text-white/10 mx-2 font-light italic text-2xl">VS</span> {game.split(" vs. ")[1]}
              </h3>
            </div>
            
            <div className="flex flex-col items-start md:items-end gap-4">
              <div className="flex items-center gap-3">
                {isPremium && (
                  <div className="flex items-center gap-2.5 bg-primary text-black px-5 py-1.5 rounded-full shadow-[0_0_40px_rgba(212,168,67,0.3)] animate-float">
                    <Trophy className="w-4 h-4" />
                    <span className="text-[11px] font-black uppercase tracking-widest">PREMIUM NODES</span>
                  </div>
                )}
                {liveStatus && (
                  <div className={`flex items-center gap-2.5 px-5 py-1.5 rounded-full font-black text-[10px] uppercase tracking-widest border
                    ${isWinning ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                      : isLosing ? "bg-red-500/20 text-red-400 border-red-500/30" 
                      : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"}
                  `}>
                     {isLive && <div className={`w-2 h-2 rounded-full animate-pulse ${isWinning ? "bg-emerald-400" : isLosing ? "bg-red-400" : "bg-yellow-400"}`} />}
                     {liveStatus}
                  </div>
                )}
              </div>
              <div className="inline-flex items-center gap-3 text-[11px] font-black text-white/40 bg-white/[0.03] border border-white/10 px-6 py-3 rounded-2xl whitespace-nowrap shadow-inner">
                <Clock className="w-4.5 h-4.5 text-primary opacity-60" />
                {countdown ? (
                  <span className="flex items-center gap-2.5">
                    <span className="uppercase text-[9px] font-black opacity-40 tracking-[0.2em]">Start In</span>
                    <span className="text-primary font-black tabular-nums tracking-tighter text-base">{countdown}</span>
                  </span>
                ) : (
                  <span className="font-black tracking-[0.2em] text-sm">{gameTime}</span>
                )}
              </div>
            </div>
        </div>
      </div>

      {/* 2. Strategy Hero */}
      <div 
        className="p-12 md:p-16 bg-black/60 flex flex-col items-center text-center border-b border-white/5 relative overflow-hidden group/bet min-h-[300px] justify-center cursor-pointer"
        onClick={onToggleSelect}
      >
        <div className="absolute inset-0 bg-primary/[0.03] opacity-0 group-hover/bet:opacity-100 transition-opacity duration-1000" />
        
        <span className="text-xs font-black text-white/20 uppercase tracking-[0.5em] mb-8">Node Strategy: {market}</span>
        <div className="text-5xl md:text-7xl font-black text-white mb-12 tracking-tighter filter drop-shadow-[0_0_30px_rgba(255,255,255,0.1)] transition-transform group-hover/bet:scale-[1.03] duration-700">
           {selection}
        </div>
        
        <div className="flex items-center gap-20">
          <div className="flex flex-col items-center gap-2">
            <span className="text-[11px] font-black text-white/20 uppercase tracking-[0.3em]">Line Agent</span>
            <span className="text-4xl font-black text-primary tracking-tighter">{line}</span>
          </div>
          <div className="w-px h-20 bg-white/10" />
          <div className="flex flex-col items-center gap-2">
            <span className="text-[11px] font-black text-white/20 uppercase tracking-[0.3em]">Market Rate</span>
            <span className="text-4xl font-black text-white tracking-tighter">{odds}</span>
          </div>
        </div>
      </div>

      {/* 3. Logical Analysis - DUAL SCAN */}
      <div className="p-12 md:p-16 space-y-16 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* SUPPORT ANALYSIS */}
            <div className="space-y-8">
               <div className="flex items-center gap-4 text-[13px] font-black text-emerald-400 uppercase tracking-[0.5em]">
                  <Activity className="w-7 h-7" /> Support Analysis
               </div>
               <p className="text-xl md:text-2xl font-medium text-white/90 leading-relaxed font-serif italic border-l-[6px] border-emerald-500/20 pl-12 py-6">
                  "{reasoning}"
               </p>
            </div>

            {/* STRATEGIC FADE */}
            {fadeReasoning && (
               <div className="space-y-8 border-t lg:border-t-0 lg:border-l border-white/5 pt-12 lg:pt-0 lg:pl-12">
                  <div className="flex items-center gap-4 text-[13px] font-black text-red-500 uppercase tracking-[0.5em]">
                     <ShieldAlert className="w-7 h-7" /> Opponent Fade
                  </div>
                  <p className="text-xl md:text-2xl font-medium text-white/50 leading-relaxed italic border-l-[6px] border-red-500/20 pl-12 py-6">
                     "{fadeReasoning}"
                  </p>
               </div>
            )}
        </div>

        {/* Model Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 pt-12 border-t border-white/5">
          <div className="flex flex-col gap-4 p-8 rounded-[2rem] bg-white/[0.02] border border-white/5">
            <span className="text-[12px] font-black text-white/30 uppercase tracking-widest">Confidence Index</span>
            <span className="text-4xl font-black text-primary">{(confidence * 10).toFixed(0)}%</span>
          </div>
          <div className="flex flex-col gap-4 p-8 rounded-[2rem] bg-white/[0.02] border border-white/5">
            <span className="text-[12px] font-black text-white/30 uppercase tracking-widest">System Measured Edge</span>
            <span className="text-4xl font-black text-emerald-400">{edge}</span>
          </div>
          <div className="flex flex-col gap-4 p-8 rounded-[2rem] bg-white/[0.02] border border-white/5">
            <span className="text-[12px] font-black text-white/30 uppercase tracking-widest">Risk Variance</span>
            <span className="text-4xl font-black text-white truncate">{risk}</span>
          </div>
        </div>
      </div>

      {/* 4. Action Area */}
      <div className="p-12 md:p-16 border-t border-white/5 bg-black/60 space-y-12">
         <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
           <div className="flex flex-col gap-3">
              <span className="text-[12px] font-black text-white/20 uppercase tracking-[0.4em]">HIMOTHY CORE v4.2 Deployment Ready</span>
              <div className="flex items-center gap-3 text-emerald-400 font-bold text-base uppercase tracking-[0.3em]">
                 <ShieldCheck className="w-6 h-6" />
                 Market Node Authenticated via {sportsbook}
              </div>
           </div>
           
           {!liveStatus || liveStatus === "PENDING" ? (
             <a 
               href="https://hardrock.bet"
               target="_blank" 
               rel="noopener noreferrer"
               onClick={handleOutboundClick}
               className="w-full lg:w-auto px-16 py-8 bg-primary hover:bg-white text-black text-lg font-black rounded-[2rem] transition-all flex items-center justify-center gap-5 shadow-[0_30px_70px_-10px_rgba(212,168,67,0.4)] hover:shadow-[0_30px_80px_-10px_rgba(255,255,255,0.3)] transform hover:-translate-y-3 active:scale-95"
             >
               EXECUTE STRATEGY <ExternalLink className="w-6 h-6" />
             </a>
           ) : (
              <div className={`w-full lg:w-auto px-16 py-8 border-2 rounded-[2rem] text-center flex flex-col gap-2 min-w-[300px]
                ${isWinning ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
                  isLosing ? "bg-red-500/10 border-red-500/30 text-red-400" :
                  "bg-white/5 border-white/10 text-white/40"}
              `}>
                <span className="text-lg font-black uppercase tracking-widest">
                  {liveStatus === "WON" ? "✅ STRATEGY HIT" : liveStatus === "LOST" ? "❌ STRATEGY MISSED" : "📡 NODE ACTIVE"}
                </span>
                <span className="text-[10px] font-black opacity-60 uppercase tracking-[0.5em]">
                  {liveStatus === "WON" || liveStatus === "LOST" ? "NODE FINALIZED" : "LIVE SIGNAL CAPTURED"}
                </span>
              </div>
           )}
        </div>
        
        <p className="text-center text-[11px] text-white/5 font-black uppercase tracking-[0.8em] pt-8 border-t border-white/[0.03]">
          HIMOTHY INTEL SYSTEMS — TRUTH SOURCE: {sportsbook.toUpperCase()}
        </p>
      </div>
    </div>
  );
}
