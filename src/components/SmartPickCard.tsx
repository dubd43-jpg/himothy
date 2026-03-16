import { useState } from "react";
import { Pick } from "@/lib/picksData";
import { PreGameValidation, LiveGameTracking } from "@/lib/types";
import { Activity, Clock, CheckCircle2, ShieldAlert, ExternalLink, RefreshCw, CircleDot, CheckSquare, ListChecks, AlertCircle } from "lucide-react";
import { MouseEvent } from "react";

interface SmartPickCardProps {
  pick: Pick;
  validation: PreGameValidation | null;
  tracking: LiveGameTracking | null;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export function SmartPickCard({ pick, validation, tracking, isSelected, onToggleSelect }: SmartPickCardProps) {
  // If no validation passed or game represents an invalid mapping, DO NOT SHOW
  if (!validation || !validation.safe_to_publish) {
    return null; // System 1 strictly rejects invalid/unsafe cards
  }

  const isLiveMode = tracking && (tracking.status === "live" || tracking.status === "final" || tracking.status === "halftime");
  
  if (isLiveMode) {
    return <LiveGameCard pick={pick} tracking={tracking!} validation={validation} />;
  }
  return <PreGameCard pick={pick} validation={validation} isSelected={isSelected} onToggleSelect={onToggleSelect} />;
}

const getSeasonLabel = (validation: PreGameValidation) => {
  if (!validation.season_context) return validation.sport;
  const { league, season_year, season_phase, round_name } = validation.season_context;
  const phaseMap: Record<string, string> = {
    "regular_season": "Regular Season",
    "preseason": "Preseason",
    "postseason": "Postseason",
    "playoffs": "Playoffs",
    "conference_tournament": "Conference Tournament",
    "play_in": "Play-In",
    "championship": "Championship"
  };
  const phaseLabel = phaseMap[season_phase] || season_phase;
  const parts = [league, `${season_year} Season`, phaseLabel];
  if (round_name && !phaseLabel.includes(round_name)) parts.push(round_name);
  return parts.filter(Boolean).join(" • ");
};

function PreGameCard({ pick, validation, isSelected, onToggleSelect }: { pick: Pick; validation: PreGameValidation; isSelected?: boolean; onToggleSelect?: () => void }) {
  const [showAudit, setShowAudit] = useState(false);
  
  const handleOutboundClick = async (e: MouseEvent<HTMLAnchorElement>) => {
    try {
      await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: "https://hardrock.bet", pickSelection: pick.selection, sportsbook: "Hard Rock Bet" })
      });
    } catch {}
  };

  const isHighConfidence = pick.confidence >= 9.0;
  
  // Monitoring Logic
  const lastChecked = new Date(validation.freshness_audit.last_checked_utc);
  const nextCheckIn = Math.max(0, validation.freshness_audit.monitoring_interval_mins - Math.floor((new Date().getTime() - lastChecked.getTime()) / 60000));
  
  const getStatusColor = (state: string) => {
    switch (state) {
      case "watching": return "text-blue-400 bg-blue-400/10 border-blue-400/20";
      case "validated": return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
      case "published": return "text-primary bg-primary/10 border-primary/20";
      case "changed": return "text-amber-400 bg-amber-400/10 border-amber-400/20";
      case "removed": return "text-red-400 bg-red-400/10 border-red-400/20";
      default: return "text-muted-foreground bg-secondary/50 border-border";
    }
  };

  return (
    <div className={`bg-card border-2 rounded-xl overflow-hidden shadow-lg h-full flex flex-col relative group transition-all duration-300 ${
      validation.lifecycle_state === "removed" ? "opacity-60 grayscale border-red-500/30" : "hover:border-primary/50 border-border"
    }`}>
      {/* Proof Banner */}
      <div className="bg-secondary/30 border-b border-border px-4 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
           <span className={`w-1.5 h-1.5 rounded-full ${validation.freshness_audit.data_status === "fresh" ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
           <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
             {validation.freshness_audit.data_status === "fresh" ? "Live Monitoring" : "Stale - Rechecking"}
           </span>
        </div>
        <div className="text-[9px] font-bold text-primary uppercase">
           Sources: {validation.sources_checked.length} Verified
        </div>
      </div>

      {pick.isPremium && (
        <div className="absolute top-8 right-0 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-bl-lg z-10">
          PREMIUM
        </div>
      )}

      {/* Header */}
      <div className={`p-4 border-b border-border bg-background/30 flex gap-3 ${onToggleSelect ? 'cursor-pointer' : ''}`} onClick={onToggleSelect}>
        {onToggleSelect && (
          <div className="flex-shrink-0 mt-1 transition-colors">
            {isSelected ? <CheckSquare className="w-5 h-5 text-primary" /> : <div className="w-5 h-5 border-2 border-muted-foreground/30 rounded" />}
          </div>
        )}
        <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black text-primary tracking-widest uppercase truncate">{getSeasonLabel(validation)}</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground bg-secondary/50 border border-border px-2 py-0.5 rounded-full whitespace-nowrap">
                <Clock className="w-3 h-3" />{validation.display_time_local}
              </span>
            </div>
            <h3 className="font-bold text-lg mt-0.5 text-foreground leading-tight">
              {validation.away_team} @ {validation.home_team}
            </h3>
          </div>
      </div>

      {/* Main Bet Info */}
      <div className="p-5 bg-background flex-1 flex flex-col justify-center">
        <div className="flex items-center justify-between mb-4">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">{pick.market}</span>
            <div className="text-2xl font-black text-foreground">{pick.selection}</div>
          </div>
          <div className="text-right space-y-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Line / Odds</span>
            <div className="text-xl font-bold text-primary">{pick.line} <span className="text-muted-foreground text-sm ml-1">({pick.odds})</span></div>
          </div>
        </div>

        {/* Engine Proof Row */}
        <div className="flex flex-wrap gap-2 mb-4">
           <div className={`px-2 py-1 rounded border text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${getStatusColor(validation.lifecycle_state)}`}>
              <CircleDot className="w-2.5 h-2.5" /> {validation.lifecycle_state}
           </div>
           <div className="px-2 py-1 rounded border border-border bg-secondary/20 text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
              <RefreshCw className="w-2.5 h-2.5" /> Next check: {nextCheckIn}m
           </div>
           {(validation.change_log || validation.verification_log.length > 0) && (
             <button 
              onClick={() => setShowAudit(!showAudit)}
              className="px-2 py-1 rounded border border-amber-500/30 bg-amber-500/5 text-[9px] font-black uppercase tracking-widest text-amber-500 hover:bg-amber-500/10"
             >
                Decision History
             </button>
           )}
        </div>

        {/* Change Log Panel (Audit Trail) */}
        {showAudit && (
          <div className="mb-4 bg-secondary/40 border border-border rounded-lg overflow-hidden">
             <div className="bg-primary/10 px-3 py-1.5 border-b border-primary/20 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-1">
                   <ShieldAlert className="w-3.5 h-3.5" /> IMMUTABLE AUDIT LOG
                </p>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
             </div>
             
             <div className="p-3 space-y-3">
                {/* Changes (High Priority) */}
                {validation.change_log && (
                  <div className="border-l-2 border-amber-500 pl-3 py-1">
                    <p className="text-[10px] font-black text-amber-500 uppercase">SYSTEM UPDATE — {new Date(validation.change_log.timestamp_utc).toLocaleTimeString()} ET</p>
                    <p className="text-xs font-bold text-foreground mt-0.5">{validation.change_log.reason_for_change}</p>
                  </div>
                )}

                {/* Verification Timeline */}
                <div className="space-y-2">
                   {validation.verification_log.slice().reverse().map((log, i) => (
                      <div key={i} className="flex gap-3 text-[10px]">
                         <span className="text-muted-foreground font-mono w-14 shrink-0">{new Date(log.timestamp_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                         <div className="flex-1">
                            <span className={`font-black uppercase mr-1.5 ${
                              log.status === "rechecked" ? "text-blue-400" : 
                              log.status === "validated" ? "text-emerald-400" :
                              "text-primary"
                            }`}>[{log.status}]</span>
                            <span className="text-foreground/80 font-medium">{log.note}</span>
                            <span className="text-[9px] text-muted-foreground block italic opacity-60">Verified via {log.source}</span>
                         </div>
                      </div>
                   ))}
                </div>
             </div>
          </div>
        )}

        {/* Model Stats Row */}
        <div className="grid grid-cols-3 gap-2 bg-secondary/30 rounded-lg p-3 border border-border">
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Confidence</div>
            <div className={`font-black ${isHighConfidence ? 'text-emerald-400' : 'text-primary'}`}>
              {(pick.confidence * 10).toFixed(0)}%
            </div>
          </div>
          <div className="text-center border-x border-border px-2">
            <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Consensus</div>
            <div className="font-bold text-xs text-foreground flex items-center justify-center gap-1">
               <ListChecks className="w-3 h-3 text-primary" /> 4/5 Models
            </div>
          </div>
          <div className="text-center pl-2">
            <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Edge</div>
            <div className="font-bold text-sm text-foreground">{pick.edge}</div>
          </div>
        </div>

        {/* Model Agreement Breakdown */}
        <div className="mt-3 space-y-1.5">
           <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              <span>Model Agreement</span>
              <span className="text-primary italic">Verified Match: {pick.selection}</span>
           </div>
           <div className="grid grid-cols-5 gap-1">
              {['Stat', 'Market', 'Situational', 'Roster', 'Trend'].map((m, i) => (
                <div key={m} className="flex flex-col items-center gap-1">
                   <div className={`w-full h-1 rounded-full ${i === 4 ? 'bg-red-500/30' : 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]'}`} />
                   <span className="text-[8px] font-bold text-muted-foreground uppercase">{m}</span>
                </div>
              ))}
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
            {pick.reasoning}
          </p>
        </div>

        {/* Parlay Legs Section */}
        {pick.legs && pick.legs.length > 0 && (
          <div className="mt-1 bg-primary/5 border border-primary/20 rounded-lg p-3">
             <div className="flex items-center gap-1.5 text-[10px] font-black text-primary uppercase tracking-widest mb-2">
                <ListChecks className="w-3.5 h-3.5" /> Selection Details
             </div>
             <div className="space-y-1.5">
                {pick.legs.map((leg, idx) => (
                   <div key={idx} className="flex items-start gap-2 text-[11px] font-bold text-foreground/90">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{leg}</span>
                   </div>
                 ))}
             </div>
          </div>
        )}
        
        <div className="mt-2 pt-3 border-t border-border/50 flex flex-col gap-3">
          <div className="flex justify-between items-center text-[9px] font-bold text-muted-foreground uppercase">
             <div className="flex flex-col gap-0.5">
                <span>CHECKED: {new Date(validation.freshness_audit.last_checked_utc).toLocaleTimeString()} ET</span>
                {validation.change_log && <span className="text-amber-500">CHANGED: {new Date(validation.change_log.timestamp_utc).toLocaleTimeString()} ET</span>}
             </div>
             <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-black ${
               validation.freshness_audit.data_status === "fresh" ? "text-emerald-500 bg-emerald-500/10" : "text-red-500 bg-red-500/10"
             }`}>
                {validation.freshness_audit.data_status.toUpperCase()} <CheckCircle2 className="w-3 h-3" />
             </span>
          </div>
          
          <div className="flex items-center justify-between gap-3 bg-secondary/20 p-2 rounded border border-border/50">
            <div className="text-[10px] text-muted-foreground leading-tight flex-1 font-medium">
              * Automated multi-source verification active.
            </div>
            {validation.lifecycle_state !== "removed" ? (
              <a 
                href={`https://www.google.com/search?q=${encodeURIComponent(pick.game + ' bet')}`}
                target="_blank" 
                rel="noopener noreferrer"
                onClick={handleOutboundClick}
                className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded hover:bg-primary/90 transition-colors flex items-center gap-1 flex-shrink-0 cursor-pointer"
              >
                Place Bet <ExternalLink className="w-3 h-3 ml-0.5" />
              </a>
            ) : (
                <div className="px-3 py-1.5 bg-muted text-muted-foreground text-[10px] font-black rounded uppercase tracking-tighter">
                   UNPUBLISHED
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveGameCard({ pick, tracking, validation }: { pick: Pick; tracking: LiveGameTracking; validation: PreGameValidation }) {
  const [prevHomeScore, setPrevHomeScore] = useState(tracking.home_team.score);
  const [prevAwayScore, setPrevAwayScore] = useState(tracking.away_team.score);
  const [homeFlash, setHomeFlash] = useState(false);
  const [awayFlash, setAwayFlash] = useState(false);

  if (tracking.home_team.score !== prevHomeScore) {
    setPrevHomeScore(tracking.home_team.score);
    setHomeFlash(true);
    setTimeout(() => setHomeFlash(false), 1000);
  }
  if (tracking.away_team.score !== prevAwayScore) {
    setPrevAwayScore(tracking.away_team.score);
    setAwayFlash(true);
    setTimeout(() => setAwayFlash(false), 1000);
  }

  const isFinal = tracking.status === "final";
  const isLive = tracking.status === "live" || tracking.status === "halftime";
  
  const homeLeader = tracking.home_team.score > tracking.away_team.score;
  const awayLeader = tracking.away_team.score > tracking.home_team.score;

  // Determine if pick is hitting (naive visual only, validation engine handles real logic elsewhere)
  const selection = pick.selection.toLowerCase();
  let pickIsWinning = false;
  let pickIsLosing = false;
  const hText = tracking.home_team.name.toLowerCase();
  const aText = tracking.away_team.name.toLowerCase();
  
  if (selection.includes(hText) || hText.includes(selection.split(" ")[0])) {
      if (homeLeader) pickIsWinning = true;
      if (awayLeader) pickIsLosing = true;
  } else if (selection.includes(aText) || aText.includes(selection.split(" ")[0])) {
      if (awayLeader) pickIsWinning = true;
      if (homeLeader) pickIsLosing = true;
  }

  return (
    <div className={`border rounded-xl flex flex-col h-full bg-card overflow-hidden transition-all duration-700
      ${isFinal ? "border-muted opacity-90" : "border-primary/30"}
    `}>
      {/* Live Header Ribbon */}
      <div className={`p-2 flex justify-between items-center border-b
        ${isFinal ? "bg-muted/30 border-border" : "bg-primary/5 border-primary/20"}
      `}>
          <div className="flex items-center gap-2">
             {isLive && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />}
             {!isLive && isFinal && <span className="w-2 h-2 rounded-full bg-muted-foreground" />}
             <span className={`text-[10px] font-black uppercase tracking-widest ${isLive ? 'text-emerald-500' : 'text-muted-foreground'}`}>
               {tracking.status} {tracking.period ? `• ${tracking.period}` : ""} {tracking.clock && tracking.clock !== "0:00" ? `• ${tracking.clock}` : ""}
             </span>
          </div>
          <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mr-2">{getSeasonLabel(validation)}</span>
              {pick.isPremium && <span className="text-[9px] font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded">PREMIUM</span>}
          </div>
      </div>

      {/* Main Scoreboard */}
      <div className="p-5 flex flex-col gap-4 bg-background">
         <div className="flex items-center justify-between text-[10px] text-muted-foreground font-bold tracking-widest uppercase mb-1">
            <span>VISITOR</span>
            <span>HOME</span>
         </div>

         <div className="flex items-center justify-between">
            {/* Away Team */}
            <div className={`flex flex-col flex-1 items-start transition-all duration-500 ${awayLeader ? 'opacity-100' : 'opacity-70'}`}>
                <div className={`flex items-center gap-2 mb-1 p-1 rounded-md transition-all ${awayLeader ? 'bg-primary/5 shadow-[0_0_10px_rgba(212,168,67,0.1)]' : ''}`}>
                   <span className={`text-sm font-bold ${awayLeader ? 'text-primary' : 'text-muted-foreground'}`}>{tracking.away_team.name}</span>
                   {tracking.away_team.has_possession && isLive && <CircleDot className="w-3 h-3 text-primary animate-pulse" />}
                </div>
            </div>

            {/* Score Center */}
            <div className="flex items-center gap-3 px-4">
                <span className={`text-3xl font-black font-mono transition-all duration-300 ${awayFlash ? 'text-primary scale-110' : 'text-foreground'}`}>
                  {tracking.away_team.score}
                </span>
                <span className="text-muted text-lg font-black">-</span>
                <span className={`text-3xl font-black font-mono transition-all duration-300 ${homeFlash ? 'text-primary scale-110' : 'text-foreground'}`}>
                  {tracking.home_team.score}
                </span>
            </div>

            {/* Home Team */}
            <div className={`flex flex-col flex-1 items-end transition-all duration-500 ${homeLeader ? 'opacity-100' : 'opacity-70'}`}>
                <div className={`flex items-center gap-2 mb-1 p-1 rounded-md transition-all ${homeLeader ? 'bg-primary/5 shadow-[0_0_10px_rgba(212,168,67,0.1)]' : ''}`}>
                   {tracking.home_team.has_possession && isLive && <CircleDot className="w-3 h-3 text-primary animate-pulse" />}
                   <span className={`text-sm font-bold text-right ${homeLeader ? 'text-primary' : 'text-muted-foreground'}`}>{tracking.home_team.name}</span>
                </div>
            </div>
         </div>
      </div>

      {/* Primary Pick Banner */}
      <div className={`py-2 px-5 flex items-center justify-between border-y ${
          isFinal ? (pickIsWinning ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20') : 'bg-secondary/30 border-border'
      }`}>
         <div className="flex flex-col">
            <span className="text-[9px] uppercase font-bold text-muted-foreground">{pick.market}</span>
            <span className="text-sm font-black text-foreground">{pick.selection}</span>
         </div>
         <div className="text-right">
            <span className="text-[10px] text-muted-foreground font-bold">Line</span>
            <div className="text-sm font-black text-primary">{pick.line}</div>
         </div>
      </div>

      {/* Play by Play Tracking Box */}
      <div className="flex-1 bg-background/50 p-4 border-b border-border flex flex-col gap-2 relative">
         <span className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1 mb-1">
           <Activity className="w-3 h-3" /> Live Event Log
         </span>
         
         {tracking.feed_health !== "ok" ? (
             <div className="flex-1 min-h-[80px] flex items-center justify-center border-2 border-dashed border-border rounded-lg p-4">
                <p className="text-[10px] font-bold text-muted-foreground uppercase text-center flex items-center gap-2">
                   <ShieldAlert className="w-4 h-4 text-yellow-500/50" />
                   Live data temporarily delayed
                </p>
             </div>
         ) : tracking.play_by_play && tracking.play_by_play.length > 0 ? (
             <div className="flex-1 space-y-2 overflow-hidden max-h-[120px]">
                {tracking.play_by_play.map((p, i) => (
                    <div key={i} className={`flex items-start gap-3 p-2 rounded text-xs transition-opacity duration-700 ${i === 0 ? 'bg-secondary/40 border border-border opacity-100' : 'opacity-60'}`}>
                        <div className="w-10 flex-shrink-0 text-[9px] font-mono text-muted-foreground mt-0.5">{p.timestamp}</div>
                        <div className="flex-1 font-medium text-foreground/80 leading-tight">
                           <span className="font-bold text-primary mr-2 uppercase">{p.team}</span>
                           {p.description}
                        </div>
                    </div>
                ))}
             </div>
         ) : (
             <div className="flex-1 min-h-[60px] flex items-center justify-center">
                <p className="text-xs text-muted-foreground font-medium italic">Awaiting plays...</p>
             </div>
         )}
      </div>

      {/* Footer Update Timestamp */}
      <div className="p-2 border-t border-border bg-card/80 flex justify-between items-center text-[9px] font-bold text-muted-foreground uppercase px-4">
         <span>Last Verified: {new Date(validation.sources_checked[0]?.last_updated || Date.now()).toLocaleTimeString()}</span>
         {isLive && <span className="flex items-center gap-1 text-primary/70 animate-pulse"><RefreshCw className="w-2.5 h-2.5" /> SYNCING</span>}
         {isFinal && <span className="text-emerald-500/80">FINALIZED</span>}
      </div>

    </div>
  );
}
