import { useState, useEffect } from "react";
import { Activity, ShieldAlert, CheckCircle2, Clock, CheckSquare, Square, ExternalLink } from "lucide-react";
import Link from "next/link";
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
}: PickProps) {
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    if (!gameTime) return;

    const updateCountdown = () => {
      try {
        // Construct a parseable date string assuming ET
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

        // Parse with ET context
        const dateStr = `${datePart} ${gameTime}`;
        const startTime = new Date(dateStr + " GMT-0400").getTime(); // Force ET offset (Approx)
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
    <div className={`bg-card border rounded-xl overflow-hidden transition-all relative flex flex-col h-full
      ${
        isWinning
          ? "border-emerald-500 shadow-[0_0_20px_rgba(34,197,94,0.25)]"
          : isLosing
          ? "border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.25)]"
          : isSelected
          ? "border-primary shadow-[0_0_20px_rgba(212,168,67,0.2)]"
          : "border-border shadow-lg hover:border-primary/50"
      }
    `}>
      
      {/* Header */}
      <div 
        className={`p-4 border-b border-border flex justify-between items-start cursor-pointer group
          ${
            isWinning ? "bg-emerald-500/10"
            : isLosing ? "bg-red-500/10"
            : "bg-background/50"
          }
        `}
        onClick={onToggleSelect}
      >
        <div className="flex gap-3">
          {onToggleSelect && (
            <div className="flex-shrink-0 mt-1 transition-colors">
              {isSelected ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5 text-muted-foreground group-hover:text-primary/50" />}
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-primary tracking-wider uppercase">{sport}</span>
              <div className="flex items-center gap-2">
                {isPremium && (
                  <span className="text-[9px] font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded uppercase">PREMIUM</span>
                )}
                {liveStatus && (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider
                    ${
                      isWinning ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : isLosing ? "bg-red-500/20 text-red-400 border-red-500/30"
                      : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                    }
                  `}>
                    {isLive && <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${ isWinning ? "bg-emerald-400" : isLosing ? "bg-red-400" : "bg-yellow-400"}`} />}
                    {liveStatus}
                  </span>
                )}
                {gameTime && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground bg-secondary/50 border border-border px-2 py-0.5 rounded-full whitespace-nowrap min-w-[80px] justify-center">
                    <Clock className="w-3 h-3" />
                    {countdown ? (
                      <span className="text-primary font-black tabular-nums">{countdown}</span>
                    ) : (
                      <>{gameDate ? `${gameDate} • ` : ""}{gameTime}</>
                    )}
                  </span>
                )}
              </div>
            </div>
            <h3 className="font-bold text-lg mt-0.5 text-foreground leading-tight">{game}</h3>
          </div>
        </div>
      </div>

      {/* Main Bet Info */}
      <div className="p-5 bg-background flex-1 flex flex-col justify-center cursor-pointer" onClick={onToggleSelect}>
        <div className="flex items-center justify-between mb-4">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">{market}</span>
            <div className="text-2xl font-black text-foreground">{selection}</div>
          </div>
          <div className="text-right space-y-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Line / Odds</span>
            <div className="text-xl font-bold text-primary">{line} <span className="text-muted-foreground text-sm ml-1">({odds})</span></div>
          </div>
        </div>

        {/* Model Stats Row */}
        <div className="grid grid-cols-3 gap-2 bg-secondary/30 rounded-lg p-3 border border-border mt-2 pointer-events-none">
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">System Confidence</div>
            <div className={`font-black ${isHighConfidence ? 'text-emerald-400' : 'text-primary'}`}>
              {(confidence * 10).toFixed(0)}%
            </div>
          </div>
          <div className="text-center border-l border-border pl-2">
            <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Model Edge</div>
            <div className="font-bold text-sm text-foreground">{edge}</div>
          </div>
          <div className="text-center border-l border-border pl-2">
            <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Risk Profile</div>
            <div className="font-bold text-sm text-foreground">{risk}</div>
          </div>
        </div>
      </div>

      {/* Analysis Section */}
      <div className="p-4 border-t border-border bg-card/80 flex flex-col gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground mb-1">
            <Activity className="w-3.5 h-3.5" /> System Analysis
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed font-medium">
            {reasoning}
          </p>
        </div>
        
        <div className="mt-2 pt-3 border-t border-border/50 space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-bold text-muted-foreground">Best Use: <span className="text-foreground">{bestUse}</span></span>
            </div>
            
            <div className="text-[9px] text-muted-foreground uppercase font-bold flex items-center gap-1" title="Lines originated from this book">
              <span className="opacity-70">Source:</span> {sportsbook} <ShieldAlert className="w-3 h-3 text-yellow-500 opacity-80" />
            </div>
          </div>
          
          {/* CONDITIONAL: Show bet button OR live status */}
          {!liveStatus || liveStatus === "PENDING" ? (
            <div className="flex items-center justify-between gap-3 bg-secondary/20 p-2 rounded border border-border/50">
              <div className="text-[10px] text-muted-foreground leading-tight flex-1 font-medium">
                * Always verify current lines before placing. Odds shift.
              </div>
              
              <a 
                href="https://hardrock.bet"
                target="_blank" 
                rel="noopener noreferrer"
                onClick={handleOutboundClick}
                className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded hover:bg-primary/90 transition-colors flex items-center gap-1 flex-shrink-0"
              >
                Place This Bet <ExternalLink className="w-3 h-3 ml-0.5" />
              </a>
            </div>
          ) : (
            <div className={`p-3 rounded-lg border-2 ${
              isWinning ? "bg-emerald-500/10 border-emerald-500/30" :
              isLosing ? "bg-red-500/10 border-red-500/30" :
              "bg-secondary/20 border-border"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(liveStatus === "WINNING" || liveStatus === "LOSING") && (
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                  <span className={`text-xs font-black uppercase tracking-wider ${
                    isWinning ? "text-emerald-400" : isLosing ? "text-red-400" : "text-foreground"
                  }`}>
                    {liveStatus === "WINNING" ? "🟢 LIVE — COVERING" :
                     liveStatus === "LOSING" ? "🔴 LIVE — AT RISK" :
                     liveStatus === "WON" ? "✅ FINAL — HIT" :
                     liveStatus === "LOST" ? "❌ FINAL — MISSED" : liveStatus}
                  </span>
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                  isWinning ? "bg-emerald-500/20 text-emerald-400" :
                  isLosing ? "bg-red-500/20 text-red-400" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {liveStatus === "WINNING" || liveStatus === "LOSING" ? "IN PROGRESS" : "COMPLETE"}
                </span>
              </div>
              {(liveStatus === "WON" || liveStatus === "LOST") && (
                <p className="text-[10px] text-muted-foreground mt-2 font-bold italic">
                  {liveStatus === "WON" ? "This pick cashed. Record updated." : "This pick did not hit. Moving on."}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
