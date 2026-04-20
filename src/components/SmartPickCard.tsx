import { useState, useEffect } from "react";
import { Pick } from "@/lib/picksData";
import { PreGameValidation, LiveGameTracking } from "@/lib/types";
import { Activity, Clock, CheckCircle2, ShieldAlert, ExternalLink, RefreshCw, CircleDot, CheckSquare, ListChecks, AlertCircle, Globe, Trophy, Cpu, ShieldCheck } from "lucide-react";
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
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    const updateCountdown = () => {
      const startTime = new Date(validation.event_date_utc).getTime();
      if (!Number.isFinite(startTime)) {
        setCountdown(null);
        return;
      }
      const now = Date.now();
      const diff = startTime - now;

      if (diff <= 0) {
        setCountdown(null);
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      if (h > 0) setCountdown(`${h}h ${m}m`);
      else if (m > 0) setCountdown(`${m}m ${s}s`);
      else setCountdown(`${s}s`);
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [validation.event_date_utc]);
  
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

  return (
    <div className={`bg-card border border-white/10 rounded-[1.5rem] md:rounded-[2rem] overflow-hidden shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] h-full flex flex-col relative group transition-all duration-500 hover:border-primary/40 ${
      validation.lifecycle_state === "removed" ? "opacity-60 grayscale border-red-500/30" : ""
    }`}>
      {/* 1. Tactical Header */}
      <div className="p-6 md:p-8 border-b border-white/5 bg-background/40 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black text-primary tracking-[0.3em] uppercase opacity-60 flex items-center gap-2">
                <Globe className="w-3 h-3" /> {getSeasonLabel(validation)}
              </span>
              <h3 className="text-2xl md:text-3xl font-black text-white leading-tight tracking-tighter">
                {validation.away_team} <span className="text-white/10 mx-1 font-light italic">VS</span> {validation.home_team}
              </h3>
            </div>
            
            <div className="flex flex-col items-start md:items-end gap-3">
              {pick.isPremium && (
                <div className="flex items-center gap-2.5 bg-primary text-black px-5 py-2 rounded-full shadow-[0_0_40px_rgba(212,168,67,0.3)] animate-float">
                   <Trophy className="w-4 h-4" />
                   <span className="text-[11px] font-black uppercase tracking-widest">PREMIUM NODES</span>
                </div>
              )}
              <div className="inline-flex items-center gap-3 text-[11px] font-black text-white/40 bg-white/[0.03] border border-white/10 px-6 py-3 rounded-2xl whitespace-nowrap shadow-inner">
                <Clock className="w-4.5 h-4.5 text-primary opacity-60" />
                {countdown ? (
                  <span className="flex items-center gap-2.5">
                    <span className="uppercase text-[9px] font-black opacity-40 tracking-[0.2em]">Live In</span>
                    <span className="text-primary font-black tabular-nums tracking-tighter text-base">{countdown}</span>
                  </span>
                ) : (
                  <span className="font-black tracking-[0.2em] text-sm">{validation.display_time_local || "TBD"}</span>
                )}
              </div>
            </div>
        </div>
      </div>

      {/* 2. Strategy Hero - COMPACT */}
      <div className="p-6 md:p-8 bg-black/40 flex flex-col items-center text-center border-b border-white/5 relative overflow-hidden group/bet">
        <div className="absolute inset-0 bg-primary/[0.03] opacity-0 group-hover/bet:opacity-100 transition-opacity duration-1000" />
        
        <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.4em] mb-4">Node Strategy: {pick.market}</span>
        <div className="text-3xl md:text-5xl font-black text-white mb-6 tracking-tighter filter drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">
           {pick.selection}
        </div>
        
        <div className="flex items-center gap-8 md:gap-12">
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">Line</span>
            <span className="text-2xl md:text-3xl font-black text-primary tracking-tighter">{pick.line}</span>
          </div>
          <div className="w-px h-10 bg-white/10" />
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">Odds</span>
            <span className="text-2xl md:text-3xl font-black text-white tracking-tighter">{pick.odds}</span>
          </div>
        </div>
      </div>

      {/* 3. Audit & Analysis Toggles */}
      <div className="p-6 md:p-8 space-y-4 flex-1">
        {!showAudit && (
          <p className="text-sm md:text-base font-medium text-white/50 leading-relaxed italic line-clamp-2 mb-4">
            {pick.reasoning}
          </p>
        )}

        {/* Technical Registry Toggle */}
        <div className="pt-12">
           <button 
             onClick={() => setShowAudit(!showAudit)}
             className="w-full py-3 px-6 rounded-xl border border-white/5 bg-white/[0.02] text-[9px] font-black text-white/40 uppercase tracking-[0.3em] hover:bg-white/5 transition-all flex items-center justify-center gap-3 group"
           >
              {showAudit ? "Minimize Audit" : "Full Decision Data"}
              <div className={`transition-transform duration-700 ${showAudit ? 'rotate-180' : ''}`}>
                 <Activity className="w-3 h-3" />
              </div>
           </button>
                      {showAudit && (
             <div className="mt-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-6">
                  <div className="flex items-center gap-3 text-[11px] font-black text-primary/40 uppercase tracking-[0.4em]">
                    <Cpu className="w-4 h-4" /> Logic Audit
                  </div>
                  <p className="text-sm md:text-base font-medium text-white/90 leading-relaxed italic border-l-2 border-primary/20 pl-6 py-2">
                    "{pick.reasoning}"
                  </p>
                </div>

                {pick.fadeReasoning && (
                  <div className="space-y-4 p-6 rounded-2xl bg-red-500/5 border border-red-500/10">
                    <div className="flex items-center gap-3 text-[10px] font-black text-red-400 uppercase tracking-[0.3em]">
                      <ShieldAlert className="w-4 h-4" /> Strategic Fade
                    </div>
                    <p className="text-xs font-medium text-white/50 leading-relaxed">
                      {pick.fadeReasoning}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4 border-b border-white/5 pb-8">
                  <div className="flex flex-col gap-2 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="text-[10px] font-black text-white/30 uppercase">Edge</span>
                    <span className="text-xl font-black text-primary">{(pick.confidence * 10).toFixed(0)}%</span>
                  </div>
                  <div className="flex flex-col gap-2 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="text-[10px] font-black text-white/30 uppercase">Consensus</span>
                    <span className="text-xl font-black text-emerald-400">4/5</span>
                  </div>
                  <div className="flex flex-col gap-2 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="text-[10px] font-black text-white/30 uppercase">Market</span>
                    <span className="text-xl font-black text-white truncate">{pick.edge}</span>
                  </div>
                </div>

                <div className="space-y-6">
                  <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Node Event Log</span>
                  <div className="space-y-3">
                    {validation.verification_log.slice(-2).reverse().map((log, i) => (
                      <div key={i} className="flex gap-4 text-xs p-4 bg-white/[0.01] border border-white/[0.05] rounded-xl">
                        <span className="text-white/20 font-mono whitespace-nowrap">{new Date(log.timestamp_utc).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                        <span className="text-white/70 font-bold">{log.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
             </div>
            )}
        </div>
      </div>

      {/* 4. Deployment Action Area */}
      <div className="p-5 md:p-6 border-t border-white/5 bg-black/60 space-y-6">
        {pick.legs && pick.legs.length > 0 && (
          <div className="bg-primary/[0.03] border border-primary/20 rounded-xl p-4 md:p-6">
             <div className="flex items-center gap-2.5 text-[10px] font-black text-primary uppercase tracking-[0.3em] mb-4">
                <ListChecks className="w-4 h-4" /> Strategy Matrix
             </div>
             <div className="grid grid-cols-1 gap-3">
                {pick.legs.map((leg, idx) => (
                   <div key={idx} className="flex items-center gap-3 text-sm font-bold text-white/70 bg-white/[0.02] p-3 rounded-lg border border-white/5">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span>{leg}</span>
                   </div>
                  ))}
             </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
           <div className="flex flex-col gap-3">
              <span className="text-[12px] font-black text-white/20 uppercase tracking-[0.4em]">HIMOTHY CORE v4.2 Deployment Ready</span>
              <div className="flex items-center gap-3 text-emerald-400 font-bold text-base uppercase tracking-[0.3em]">
                 <ShieldCheck className="w-6 h-6" />
                 Market Node Authenticated
              </div>
           </div>
           
           {validation.lifecycle_state !== "removed" ? (
             <a 
               href="https://hardrock.bet"
               target="_blank" 
               rel="noopener noreferrer"
               onClick={handleOutboundClick}
               className="w-full lg:w-auto px-8 py-4 bg-primary hover:bg-white text-black text-sm font-black rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg transform hover:-translate-y-1 active:scale-95"
             >
               EXECUTE STRATEGY <ExternalLink className="w-4 h-4" />
             </a>
           ) : (
               <div className="w-full lg:w-auto px-16 py-8 border border-white/10 text-white/20 text-sm font-black rounded-[2rem] uppercase tracking-[0.6em] text-center">
                  Strategy Offline
               </div>
           )}
        </div>
        
        <p className="text-center text-[11px] text-white/5 font-black uppercase tracking-[0.8em] pt-8">
          HIMOTHY INTEL SYSTEMS — NODE ID: {pick.id.toUpperCase()}
        </p>
      </div>
    </div>
  );
}

function LiveGameCard({ pick, tracking, validation }: { pick: Pick; tracking: LiveGameTracking; validation: PreGameValidation }) {
  const [prevHomeScore, setPrevHomeScore] = useState(tracking.home_team.score);
  const [prevAwayScore, setPrevAwayScore] = useState(tracking.away_team.score);
  const [homeFlash, setHomeFlash] = useState(false);
  const [awayFlash, setAwayFlash] = useState(false);

  useEffect(() => {
    if (tracking.home_team.score !== prevHomeScore) {
      setPrevHomeScore(tracking.home_team.score);
      setHomeFlash(true);
      const timer = setTimeout(() => setHomeFlash(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [tracking.home_team.score, prevHomeScore]);

  useEffect(() => {
    if (tracking.away_team.score !== prevAwayScore) {
      setPrevAwayScore(tracking.away_team.score);
      setAwayFlash(true);
      const timer = setTimeout(() => setAwayFlash(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [tracking.away_team.score, prevAwayScore]);

  const isFinal = tracking.status === "final";
  const isLive = tracking.status === "live" || tracking.status === "halftime";
  
  const homeLeader = tracking.home_team.score > tracking.away_team.score;
  const awayLeader = tracking.away_team.score > tracking.home_team.score;

  return (
    <div className={`bg-card border border-white/10 rounded-[2.5rem] overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] h-full flex flex-col relative group transition-all duration-700 ${
      isFinal ? "opacity-80 grayscale-[0.5]" : "border-primary/40 shadow-primary/5"
    }`}>
      {/* 1. Live Header */}
      <div className={`p-5 md:p-6 border-b border-white/5 flex justify-between items-center ${isLive ? 'bg-primary/[0.03]' : 'bg-background/40'}`}>
         <div className="flex items-center gap-4">
            {isLive && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.8)]" />}
            <span className={`text-xs font-black uppercase tracking-[0.4em] ${isLive ? 'text-emerald-400' : 'text-white/40'}`}>
               {tracking.status} {tracking.period ? `• ${tracking.period}` : ""} {tracking.clock && tracking.clock !== "0:00" ? `• ${tracking.clock}` : ""}
            </span>
         </div>
         <div className="flex items-center gap-4">
            <span className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em]">{getSeasonLabel(validation)}</span>
            {pick.isPremium && <span className="text-[10px] font-black bg-primary text-black px-4 py-1 rounded-full uppercase">PREMIUM</span>}
         </div>
      </div>

      {/* 2. Tactical Scoreboard */}
      <div className="p-6 md:p-8 bg-black/60 flex flex-col gap-6 border-b border-white/5 relative overflow-hidden">
         
         <div className="flex items-center justify-between text-[9px] font-black text-white/20 tracking-[0.3em] uppercase px-2">
            <span>VISITOR</span>
            <span>HOME HUB</span>
         </div>

         <div className="flex items-center justify-between gap-4">
            {/* Away Team */}
            <div className={`flex flex-col flex-1 items-start transition-all duration-500 ${awayLeader ? 'opacity-100' : 'opacity-40'}`}>
                <h4 className={`text-xl md:text-3xl font-black tracking-tighter ${awayLeader ? 'text-primary' : 'text-white'}`}>{tracking.away_team.name}</h4>
            </div>

            {/* Score Center */}
            <div className="flex items-center gap-4 md:gap-8 px-4 md:px-8">
                <span className={`text-4xl md:text-6xl font-black font-mono transition-all duration-500 tabular-nums ${awayFlash ? 'text-primary scale-110' : 'text-white'}`}>
                  {tracking.away_team.score}
                </span>
                <span className="text-white/10 text-2xl font-light">-</span>
                <span className={`text-4xl md:text-6xl font-black font-mono transition-all duration-500 tabular-nums ${homeFlash ? 'text-primary scale-110' : 'text-white'}`}>
                  {tracking.home_team.score}
                </span>
            </div>

            {/* Home Team */}
            <div className={`flex flex-col flex-1 items-end transition-all duration-500 ${homeLeader ? 'opacity-100' : 'opacity-40'}`}>
                <h4 className={`text-xl md:text-3xl font-black tracking-tighter text-right ${homeLeader ? 'text-primary' : 'text-white'}`}>{tracking.home_team.name}</h4>
            </div>
         </div>
      </div>

      {/* 3. The Strategy Context */}
      <div className="p-10 md:p-12 space-y-12 flex-1">
         {/* Live Strategy Snapshot */}
         <div className="flex items-center justify-between bg-primary/[0.04] border border-primary/20 rounded-3xl p-8">
            <div className="flex flex-col gap-1">
               <span className="text-[10px] font-black text-primary/60 uppercase tracking-[0.3em]">Active Market</span>
               <span className="text-xl font-black text-white">{pick.market}</span>
            </div>
            <div className="flex flex-col items-end gap-1">
               <span className="text-[10px] font-black text-primary/60 uppercase tracking-[0.3em]">Target Strategy</span>
               <span className="text-xl font-black text-primary uppercase">{pick.selection}</span>
            </div>
         </div>

         {/* Dual-Team Analysis Node */}
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* Team We Like (Support) */}
            <div className="space-y-4">
               <div className="flex items-center gap-2.5 text-[11px] font-black text-emerald-400 uppercase tracking-[0.3em]">
                  <Activity className="w-5 h-5 text-emerald-500" /> Support Analysis
               </div>
               <p className="text-lg font-medium text-white/80 leading-relaxed italic border-l-4 border-emerald-500/20 pl-8 py-2">
                  "{pick.reasoning}"
               </p>
            </div>

            {/* Opponent Analysis (Fade) */}
            {pick.fadeReasoning && (
               <div className="space-y-4">
                  <div className="flex items-center gap-2.5 text-[11px] font-black text-red-400 uppercase tracking-[0.3em]">
                     <ShieldAlert className="w-5 h-5 text-red-500" /> Opponent Fade
                  </div>
                  <p className="text-lg font-medium text-white/50 leading-relaxed italic border-l-4 border-red-500/20 pl-8 py-2">
                     "{pick.fadeReasoning}"
                  </p>
               </div>
            )}
         </div>

         {/* Live Feed Tracker */}
         <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
               <span className="text-[11px] font-black text-white/20 uppercase tracking-[0.4em]">Live Intelligence Feed</span>
               <RefreshCw className={`w-4 h-4 text-emerald-500/40 ${isLive ? 'animate-spin' : ''}`} />
            </div>
            
            {tracking.feed_health !== "ok" ? (
               <div className="p-10 border border-dashed border-white/10 rounded-3xl flex flex-col items-center gap-4">
                  <AlertCircle className="w-8 h-8 text-amber-500 opacity-40" />
                  <p className="text-xs font-black text-white/30 uppercase tracking-[0.2em]">Live stream temporarily delayed</p>
               </div>
            ) : tracking.play_by_play && tracking.play_by_play.length > 0 ? (
               <div className="space-y-4 max-h-[300px] overflow-y-auto pr-4 custom-scrollbar">
                  {tracking.play_by_play.map((p, i) => (
                      <div key={i} className={`flex gap-8 p-6 rounded-2xl border transition-all ${i === 0 ? 'bg-white/[0.04] border-white/10 shadow-xl' : 'border-transparent opacity-40'}`}>
                          <span className="text-xs font-mono text-white/30 pt-1">{p.timestamp}</span>
                          <div className="flex flex-col gap-1.5 flex-1">
                             <div className="text-[10px] font-black text-primary uppercase tracking-widest">{p.team}</div>
                             <div className="text-base font-bold text-white/80 leading-tight">{p.description}</div>
                          </div>
                      </div>
                  ))}
               </div>
            ) : (
               <p className="text-center py-10 text-sm font-medium text-white/20 italic">Awaiting live event triggers...</p>
            )}
         </div>
      </div>

      {/* 4. Live Footer */}
      <div className="p-5 md:p-6 border-t border-white/5 bg-black/60 flex flex-col md:flex-row justify-between items-center gap-4">
         <div className="flex items-center gap-4 w-full md:w-auto">
            <a 
              href={tracking.external_link || `https://www.espn.com/${pick.sport.toLowerCase().includes('soccer') ? 'soccer' : 'nba'}/game/_/gameId/${tracking.game_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 md:flex-none px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-primary flex items-center justify-center gap-2 transition-all"
            >
               <Globe className="w-4 h-4" /> Watch
            </a>
            <div className="flex flex-col gap-0.5">
               <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">Node Heartbeat</span>
               <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                  {new Date(validation.sources_checked[0]?.last_updated || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
               </span>
            </div>
         </div>
         {isLive && (
           <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-full">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em]">LIVE SYNC</span>
           </div>
         )}
      </div>
    </div>
  );
}
