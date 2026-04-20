"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Activity,
  Clock,
  CheckCircle2,
  XOctagon,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Zap,
  Award,
  XCircle,
  TrendingDown
} from "lucide-react";

interface Game {
  id: string;
  sport: string;
  status: string;      // "pre" | "in" | "post"
  statusText: string;  // "7:00 PM ET" or "Q3 4:12" or "Final"
  name?: string;
  homeTeam: string;
  homeScore: string;
  awayTeam: string;
  awayScore: string;
  vegasOdds?: string;
  prevOdds?: string;
  ourPick?: string;
  pickStatus?: "WINNING" | "LOSING" | "PENDING" | "WON" | "LOST";
}

const OUR_PICKS: Record<string, { pick: string; evaluate: (home: number, away: number, status: string) => "WINNING" | "LOSING" | "PENDING" | "WON" | "LOST" }> = {
  "ATL-ORL": {
    pick: "Hawks -0.5 (1Q)",
    evaluate: (home, away, status) => {
      if (status === "pre") return "PENDING";
      if (home > away) return status === "post" ? "WON" : "WINNING";
      return status === "post" ? "LOST" : "LOSING";
    },
  },
  "HOU-LAL": {
    pick: "🏆 Rockets -1.5 (1H)",
    evaluate: (home, away, status) => {
      if (status === "pre") return "PENDING";
      if (home - away >= 2) return status === "post" ? "WON" : "WINNING";
      return status === "post" ? "LOST" : "LOSING";
    },
  },
};

export default function ScoresPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [games, setGames] = useState<Game[]>([]);
  const [liveNow, setLiveNow] = useState<Game[]>([]); // Separated live feed
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(15);
  
  const prevGamesRef = useRef<Game[]>([]);

  const toDateStr = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

  const formatDisplay = (d: Date) =>
    d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const isToday = toDateStr(selectedDate) === toDateStr(today);

  const fetchSportData = useCallback(async (sport: string, dateStr?: string): Promise<Game[]> => {
    const isSoccer = sport.includes('.') || ['usa.1', 'mlb', 'nba', 'nhl'].indexOf(sport) === -1;
    const leagueMap: any = { 
      nba: 'basketball', nhl: 'hockey', mlb: 'baseball',
      'eng.1': 'soccer', 'ita.1': 'soccer', 'esp.1': 'soccer', 'ger.1': 'soccer', 'fra.1': 'soccer',
      'usa.1': 'soccer', 'den.1': 'soccer', 'ned.1': 'soccer', 'por.1': 'soccer', 'mex.1': 'soccer', 'bra.1': 'soccer'
    };
    
    const url = `https://site.api.espn.com/apis/site/v2/sports/${leagueMap[sport] || 'soccer'}/${sport}/scoreboard${dateStr ? `?dates=${dateStr}` : ''}`;
    
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return [];
      const json = await res.json();
      return (json.events ?? []).map((e: any) => {
        const comp = e.competitions?.[0];
        const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
        const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
        let statusType = e.status?.type?.state ?? "pre";
        let statusDetail = e.status?.type?.shortDetail ?? "";
        let homeScoreNum = parseInt(home?.score ?? "0");
        let awayScoreNum = parseInt(away?.score ?? "0");

          // Preserve feed truth: never synthesize final status or scores.
        
        const homeAbbr = home?.team?.abbreviation ?? home?.team?.shortDisplayName ?? "";
        const awayAbbr = away?.team?.abbreviation ?? away?.team?.shortDisplayName ?? "";
        const key = `${homeAbbr}-${awayAbbr}`;
        
        let pickDef = OUR_PICKS[key];
        const vegasOdds = comp?.odds?.[0]?.details ?? "Odds unavailable";

        const prevGame = prevGamesRef.current.find(pg => pg.id === e.id);

        return {
          id: e.id,
          sport: isSoccer ? (comp?.shortName || sport.split('.')[0].toUpperCase()) : sport.toUpperCase(),
          name: e.name || `${awayAbbr} @ ${homeAbbr}`,
          status: statusType,
          statusText: statusDetail,
          homeTeam: `${homeAbbr} ${home?.team?.shortDisplayName ?? ""}`,
          homeScore: (statusType === "pre" && homeScoreNum === 0 && (!home || !home.score)) ? "-" : String(homeScoreNum),
          awayTeam: `${awayAbbr} ${away?.team?.shortDisplayName ?? ""}`,
          awayScore: (statusType === "pre" && awayScoreNum === 0 && (!away || !away.score)) ? "-" : String(awayScoreNum),
          vegasOdds: vegasOdds,
          prevOdds: prevGame?.vegasOdds,
          ourPick: pickDef?.pick,
          pickStatus: pickDef?.evaluate(homeScoreNum, awayScoreNum, statusType),
        };
      });
    } catch (err) {
      return [];
    }
  }, []);

  const loadGames = useCallback(async (isManual = false) => {
    if (isManual) {
      setRefreshing(true);
      setCountdown(15);
    }
    try {
      const dateStr = toDateStr(selectedDate);
      
      // Extensive Global Slate
      const sports = ["nba", "nhl", "mlb", "eng.1", "ita.1", "esp.1", "ger.1", "fra.1", "den.1", "ned.1", "por.1", "mex.1"];
      const results = await Promise.all(sports.map(s => fetchSportData(s, dateStr)));
      const allSelected = results.flat();
      
      // High-Priority Live Sync
      const liveResults = await Promise.all(["nba", "nhl", "eng.1", "ita.1", "esp.1"].map(s => fetchSportData(s)));
      const allLive = liveResults.flat().filter(g => g.status === "in");
      
      setGames(allSelected);
      setLiveNow(allLive);
      prevGamesRef.current = [...allSelected, ...allLive];
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      console.error("Scores sync error", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate, fetchSportData]);

  useEffect(() => {
    loadGames();
    const interval = setInterval(() => {
      loadGames();
      setCountdown(15);
    }, 15000);
    const timer = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 15));
    }, 1000);
    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [loadGames]);

  // Combined logic: If we are on "Today", and there are truly LIVE games on ESPN right now,
  // we merge them in case they were late-night games from "Yesterday" that are still on.
  const activeGames = [...liveNow, ...games.filter(g => g.status === "in")]
    .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i); // dedupe

  const upcomingGames = games.filter(g => g.status === "pre" && !activeGames.find(ag => ag.id === g.id));
  const finalGames = games.filter(g => g.status === "post");

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-30">
        <div className="w-full flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" /> Home
            </Link>
            <div className="h-5 w-px bg-border" />
            <Link href="/" className="font-black text-xl tracking-tighter">
              HIMOTHY <span className="text-primary">SCORES</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
             <div className="hidden md:flex items-center gap-2 text-[10px] font-black text-primary bg-primary/10 border border-primary/20 px-3 py-1 rounded-full uppercase">
                <Zap className="w-3 h-3 fill-primary" />
                Live Sync: {countdown}s
              </div>
            <button
              onClick={() => loadGames(true)}
              className="flex items-center gap-1.5 text-xs font-black text-muted-foreground hover:text-foreground transition-all px-3 py-1.5 rounded-lg border border-border"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-primary" : ""}`} />
            </button>
          </div>
        </div>

        <div className="border-t border-border px-6 py-3 flex items-center justify-between bg-background/50">
          <button onClick={() => {
            const d = new Date(selectedDate);
            d.setDate(d.getDate() - 1);
            setSelectedDate(d);
          }} className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-secondary transition-all">
            <ChevronLeft className="w-4 h-4" /> PREV
          </button>
          <div className="text-center">
            <div className="font-black text-sm uppercase tracking-tight">{formatDisplay(selectedDate)}</div>
            {isToday && <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mt-0.5 animate-pulse">Live Feed Active</div>}
          </div>
          <button onClick={() => {
            const d = new Date(selectedDate);
            d.setDate(d.getDate() + 1);
            setSelectedDate(d);
          }} className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-secondary transition-all">
            NEXT <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto flex flex-col gap-8">
        
        {/* TOP STATUS RIBBON */}
        {isToday && activeGames.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-2xl flex items-center justify-center gap-4 text-xs font-black text-red-500">
             <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
             {activeGames.length} GAMES CURRENTLY LIVE IN THE MARKET
          </div>
        )}

        {/* ACTIVE GAMES (WHAT IS ON NOW) */}
        {activeGames.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-5 bg-red-600 rounded-full animate-pulse" />
              <h2 className="text-xl font-black uppercase tracking-tight text-foreground">Live Now</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeGames.map((game) => (
                <GameCard key={game.id} game={game} isLive={true} />
              ))}
            </div>
          </section>
        )}

        {/* UPCOMING FOR SELECTED DATE */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-5 bg-primary rounded-full" />
            <h2 className="text-xl font-black uppercase tracking-tight text-foreground/70">Upcoming Slate</h2>
          </div>
          {loading ? (
             <div className="py-20 text-center uppercase tracking-widest text-[10px] font-black opacity-40">Syncing Slate...</div>
          ) : upcomingGames.length === 0 ? (
            <div className="py-10 text-center border-2 border-dashed border-border rounded-xl opacity-30">
              <p className="font-black text-xs uppercase tracking-widest">No scheduled games for this date</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {upcomingGames.map((game) => (
                <GameCard key={game.id} game={game} isLive={false} />
              ))}
            </div>
          )}
        </section>

        {/* RECENT OUTCOMES section */}
        {finalGames.length > 0 && (
          <section className="bg-secondary/10 p-6 md:p-8 rounded-3xl border border-border mt-6">
             <div className="flex items-center gap-2 mb-6">
              <div className="w-1.5 h-5 bg-muted rounded-full" />
              <h2 className="text-xl font-black uppercase tracking-tight text-foreground/50">Completed Audit</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
               {finalGames.map((game) => (
                 <ResultCard key={game.id} game={game} />
               ))}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}

function GameCard({ game, isLive }: { game: Game; isLive: boolean }) {
  const lineChanged = game.prevOdds && game.prevOdds !== game.vegasOdds;
  const isGoodTrend = game.vegasOdds?.includes("+105");
  const isBadTrend = game.vegasOdds?.includes("-135");

  return (
    <div className={`bg-card border-2 rounded-2xl overflow-hidden transition-all relative
      ${lineChanged ? "border-primary shadow-[0_0_20px_rgba(212,168,67,0.15)] animate-pulse" : 
        isGoodTrend ? "border-emerald-500/40" : 
        isBadTrend ? "border-destructive/40" : "border-border"}
    `}>
      <div className="px-5 py-3 bg-secondary/30 border-b border-border/50 flex justify-between items-center">
        <span className="text-[10px] font-black text-muted-foreground uppercase">{game.sport} • {game.statusText}</span>
        {isLive && <span className="text-[10px] font-black text-red-500 bg-red-500/10 px-2 py-0.5 rounded tracking-tighter">LIVE</span>}
      </div>

      <div className="p-5 space-y-4">
        <div className="flex justify-between items-center bg-background/50 p-2 rounded-lg border border-border/40">
          <span className="text-[9px] font-black text-muted-foreground uppercase">Live Odds</span>
          <div className="text-right">
            <span className={`text-base font-black ${isGoodTrend ? "text-emerald-400" : isBadTrend ? "text-destructive" : "text-foreground"}`}>
              {game.vegasOdds}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-lg font-bold text-foreground">{game.awayTeam}</span>
            <span className="text-2xl font-black font-mono">{game.awayScore}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-lg font-bold text-foreground">{game.homeTeam}</span>
            <span className="text-2xl font-black font-mono">{game.homeScore}</span>
          </div>
        </div>

        {game.ourPick && (
          <div className="pt-4 border-t border-border/50 flex justify-between items-center">
             <div className="flex flex-col">
               <span className="text-[9px] font-black text-muted-foreground uppercase">Pick</span>
               <span className="text-sm font-black text-foreground">{game.ourPick}</span>
             </div>
             {game.pickStatus === "WINNING" && <span className="text-[10px] font-black text-emerald-400">WINNING</span>}
             {game.pickStatus === "LOSING" && <span className="text-[10px] font-black text-destructive">LOSING</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultCard({ game }: { game: Game }) {
  return (
    <div className="bg-background border border-border p-4 rounded-xl flex flex-col justify-between group">
      <div>
        <div className="flex justify-between items-center mb-2">
           <span className="text-[9px] font-black bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded">FINAL</span>
           <span className="text-xs font-black text-foreground font-mono">{game.awayScore} - {game.homeScore}</span>
        </div>
        <h3 className="font-black text-[10px] truncate">{game.name || `${game.awayTeam} @ ${game.homeTeam}`}</h3>
      </div>
      <div className="mt-4 pt-3 border-t border-border flex justify-between items-center">
        <span className="text-[10px] font-black text-foreground">{game.vegasOdds}</span>
        {game.pickStatus === "WON" ? <Award className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-destructive opacity-30" />}
      </div>
    </div>
  );
}
