"use client";

import { PICK_REGISTRY, Pick } from "@/lib/picksData";

interface LiveGame {
  id: string;
  name: string;
  odds: string;
  prevOdds?: string;
  status: string;
  units: number;
  score: string;
  isFinal: boolean;
  winner?: string;
  league: string;
  pick?: Pick;
  progress?: string;
}

export default function AdminDashboard() {
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [completedGames, setCompletedGames] = useState<LiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [countdown, setCountdown] = useState(15);

  // Ref to track previous state for line movement detection
  const prevGamesRef = useRef<LiveGame[]>([]);

  const fetchLiveOdds = useCallback(async (isManual = false) => {
    if (isManual) {
      setRefreshing(true);
      setCountdown(15);
    }
    try {
      const leagues = [
        { name: 'NBA', scoreboard: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard", summary: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary" },
        { name: 'NHL', scoreboard: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard", summary: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/summary" },
        { name: 'MLB', scoreboard: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard", summary: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary" },
        { name: 'SOCCER', scoreboard: "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard", summary: "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary" }
      ];

      const scoreboards = await Promise.all(
        leagues.map(l => fetch(l.scoreboard, { cache: "no-store" }).then(res => res.json()))
      );

      let matchedPicks: LiveGame[] = [];

      // 1. First, find games that match our PICK_REGISTRY
      for (let i = 0; i < scoreboards.length; i++) {
        const data = scoreboards[i];
        const leagueInfo = leagues[i];

        if (!data.events) continue;

        for (const event of data.events) {
          const comp = event.competitions?.[0];
          const homeTeam = comp?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.displayName?.toLowerCase() || "";
          const awayTeam = comp?.competitors?.find((c: any) => c.homeAway === 'away')?.team?.displayName?.toLowerCase() || "";

          // Check if any pick in registry matches this game
          const relevantPick = PICK_REGISTRY.find(p => {
            const pickGame = p.game.toLowerCase();
            return pickGame.includes(homeTeam) || pickGame.includes(awayTeam);
          });

          if (relevantPick) {
            const statusType = event.status?.type?.name;
            const isFinal = statusType === "STATUS_FINAL" || statusType === "STATUS_FULL_TIME";

            const homeScore = comp?.competitors?.find((c: any) => c.homeAway === 'home')?.score || "0";
            const awayScore = comp?.competitors?.find((c: any) => c.homeAway === 'away')?.score || "0";
            const scoreString = `${awayScore} - ${homeScore}`;

            // 2. If it's a player prop, fetch the summary to get athlete stats
            let progress = "";
            if (relevantPick.market.toLowerCase().includes("player prop") && !isFinal) {
              try {
                const summaryRes = await fetch(`${leagueInfo.summary}?event=${event.id}`, { cache: "no-store" });
                const summaryData = await summaryRes.json();

                // Logic to extract player stats (e.g. Points)
                const playerName = relevantPick.selection.split("OVER")[0].split("UNDER")[0].trim().toLowerCase();

                summaryData.boxscore?.players?.forEach((team: any) => {
                  const statHeaders = team.statistics?.[0]?.names || [];
                  const ptsIndex = statHeaders.indexOf("PTS") !== -1 ? statHeaders.indexOf("PTS") : statHeaders.indexOf("G"); // G for goals in NHL?

                  const athlete = team.statistics?.[0]?.athletes?.find((a: any) =>
                    a.athlete?.displayName?.toLowerCase().includes(playerName)
                  );

                  if (athlete) {
                    const currentVal = athlete.stats[ptsIndex];
                    progress = `${currentVal} / ${relevantPick.line} ${relevantPick.market.includes("Points") ? "PTS" : ""}`;
                  }
                });
              } catch (e) {
                console.warn("Failed to fetch summary for", event.id);
              }
            }

            const prevGame = prevGamesRef.current.find(pg => pg.id === event.id);

            matchedPicks.push({
              id: event.id,
              name: event.shortName || event.name,
              odds: relevantPick.odds,
              prevOdds: prevGame?.odds,
              status: event.status?.type?.shortDetail || "Scheduled",
              units: parseFloat(relevantPick.risk) || 1.0,
              score: scoreString,
              isFinal: isFinal,
              winner: isFinal ? (parseInt(homeScore) > parseInt(awayScore) ? homeTeam : awayTeam) : undefined,
              league: leagueInfo.name,
              pick: relevantPick,
              progress: progress
            });
          }
        }
      }

      setLiveGames(matchedPicks.filter(g => !g.isFinal));
      setCompletedGames(matchedPicks.filter(g => g.isFinal).slice(0, 10));
      prevGamesRef.current = matchedPicks;
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Failed to sync odds", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveOdds();
    const interval = setInterval(() => {
      fetchLiveOdds();
      setCountdown(30); // Increased interval slightly for safety
    }, 30000);

    const timer = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 30));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [fetchLiveOdds]);

  return (
    <div className="space-y-8 pb-20">
      {/* Header with Live Status */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-primary/20 text-primary text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter animate-pulse border border-primary/30">Live Market Feed</span>
            <h1 className="text-3xl font-black uppercase tracking-tight">Admin Intelligence</h1>
          </div>
          <p className="text-muted-foreground font-medium italic">Continuous Line Tracking & Outcome Auditing</p>
        </div>
        <div className="bg-card border border-border p-3 rounded-xl flex items-center gap-6 shadow-sm">
          <div className="text-right">
            <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Next Market Sync</p>
            <div className="flex items-center gap-2 text-lg font-black text-foreground">
              <Zap className="w-4 h-4 text-primary fill-primary" />
              {countdown}s
            </div>
          </div>
          <div className="h-10 w-[1px] bg-border"></div>
          <div className="text-right">
            <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Last Update</p>
            <p className="text-sm font-bold text-foreground">{lastUpdated}</p>
          </div>
          <button onClick={() => fetchLiveOdds(true)} className="p-2 hover:bg-secondary rounded-lg transition-colors">
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── LIVE BETTING CARD ────────────────── */}
      <section className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-xl">
        <div className="bg-secondary/30 px-6 py-4 border-b border-border flex justify-between items-center bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent">
          <h2 className="text-xl font-bold flex items-center gap-2 text-white">
            <Activity className="w-5 h-5 text-primary" /> Active Deployments (Live Betting Feed)
          </h2>
          <div className="flex gap-2">
            <span className="text-[10px] font-black bg-emerald-500 text-white px-2 py-1 rounded">NBA</span>
            <span className="text-[10px] font-black bg-blue-500 text-white px-2 py-1 rounded">NHL</span>
            <span className="text-[10px] font-black bg-red-600 text-white px-2 py-1 rounded">MLB</span>
          </div>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center gap-4">
              <RefreshCw className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm font-bold text-muted-foreground italic uppercase tracking-widest">Scanning Global Oddsmakers...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {liveGames.length > 0 ? liveGames.map((game) => {
                const lineChanged = game.prevOdds && game.prevOdds !== game.odds;
                return (
                  <div key={game.id} className={`p-4 rounded-xl border-2 transition-all hover:scale-[1.02] relative group cursor-default ${lineChanged ? "border-primary shadow-[0_0_20px_rgba(212,168,67,0.15)] animate-pulse" :
                      game.odds.includes("+105") ? "border-emerald-500/50 bg-emerald-500/5" :
                        game.odds.includes("-135") ? "border-destructive/50 bg-destructive/5" : "border-border bg-background"
                    }`}>
                    {lineChanged && <span className="absolute -top-2 -right-2 bg-primary text-black text-[9px] font-black px-2 py-0.5 rounded shadow-lg z-10 border border-black/20">LINE SHIFT</span>}

                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[9px] font-black text-muted-foreground uppercase bg-secondary px-1.5 py-0.5 rounded">{game.league} • {game.status}</span>
                      <span className="text-[11px] font-black text-primary font-mono bg-primary/10 px-2 py-0.5 rounded tracking-tighter">{game.score}</span>
                    </div>

                    <h3 className="font-bold text-sm mb-1 truncate leading-tight">{game.name}</h3>

                    <div className="flex justify-between items-end mt-4">
                      <div>
                        <p className="text-[9px] font-black text-muted-foreground uppercase flex items-center gap-1">
                          Live Odds {lineChanged && <TrendingUp className="w-2.5 h-2.5 text-primary" />}
                        </p>
                        <p className={`text-xl font-black tracking-tighter ${game.odds.includes("+105") ? "text-emerald-400" : lineChanged ? "text-primary" : "text-foreground"}`}>
                          {game.odds}
                        </p>
                        {lineChanged && <p className="text-[8px] font-bold text-muted-foreground line-through opacity-50">prev: {game.prevOdds}</p>}
                      </div>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-tighter">Live Progress</p>
                      <p className="text-2xl font-black text-emerald-400 drop-shadow-sm">{game.progress || game.score}</p>
                    </div>
                  </div>
                    
                    {
                  game.pick && (
                    <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase text-white/40 tracking-widest">Market</span>
                        <span className="text-[10px] font-bold text-white/80">{game.pick.market}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase text-white/40 tracking-widest">Selection</span>
                        <span className="text-[10px] font-black text-primary uppercase italic">{game.pick.selection}</span>
                      </div>
                    </div>
                  )
                }
                  </div>
          );
              }) : (
          <div className="col-span-full py-16 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl">
            <Clock className="w-10 h-10 text-muted-foreground mb-4 opacity-20" />
            <p className="text-muted-foreground font-bold italic uppercase tracking-wider">Market Quiet • Monitoring for Line Openings</p>
          </div>
              )}
        </div>
          )}
    </div>
      </section >

    {/* ── RECENT OUTCOMESboard ────────────────── */ }
    < section className = "bg-card border-2 border-border rounded-2xl overflow-hidden shadow-xl border-l-destructive/50 border-l-4" >
        <div className="bg-destructive/5 px-6 py-4 border-b border-border flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Award className="w-5 h-5 text-destructive" /> Recent Outcomes (Who Won/Lost)
          </h2>
          <span className="text-[10px] font-black uppercase text-destructive tracking-widest bg-destructive/10 px-3 py-1 rounded-full">Auditing Complete Games</span>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {completedGames.length > 0 ? completedGames.map((game) => (
              <div key={game.id} className="p-4 rounded-xl border border-border bg-secondary/5 flex flex-col justify-between hover:bg-secondary/10 transition-colors">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[9px] font-black text-emerald-400 uppercase bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20">FINAL</span>
                    <span className="text-[11px] font-black text-foreground font-mono">{game.score}</span>
                  </div>
                  <h3 className="font-bold text-xs mb-1 truncate">{game.name}</h3>
                  <div className="bg-background border border-border rounded p-1.5 mt-2">
                    <p className="text-[9px] text-muted-foreground font-black uppercase">Winner</p>
                    <p className="text-[11px] text-primary font-black truncate">{game.winner || "Updating..."}</p>
                  </div>
                </div>
                
                <div className="flex justify-between items-center mt-4 pt-3 border-t border-border/50">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-muted-foreground uppercase">Off Odds</span>
                    <span className={`text-xs font-black ${game.odds.includes("+105") ? "text-emerald-400" : "text-foreground"}`}>{game.odds}</span>
                  </div>
                  <div className={`p-1.5 rounded-full ${game.odds.includes("+105") ? "bg-emerald-500/20 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                    {game.odds.includes("+105") ? <Award className="w-4 h-4 shadow-[0_0_10px_rgba(16,185,129,0.3)]" /> : <XCircle className="w-4 h-4 opacity-50" />}
                  </div>
                </div>
              </div>
            )) : (
              <div className="col-span-full py-10 text-center text-muted-foreground font-bold italic border border-dashed border-border rounded-lg">
                Scanning for final scores... Game history will update here.
              </div>
            )}
          </div>
        </div>
      </section >

    {/* ── MASTER ODDS RECORD LEDGER ────────────────── */ }
    < section className = "grid grid-cols-1 lg:grid-cols-2 gap-8" >
        <div className="bg-card border border-border p-6 rounded-2xl relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
            <TrendingUp className="w-40 h-40" />
          </div>
          <h2 className="text-xl font-black uppercase mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" /> Odds Range Performance
          </h2>
          <div className="space-y-4">
            <div className="p-5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 relative overflow-hidden group/item">
              <div className="flex justify-between items-start z-10 relative">
                <div>
                  <h3 className="text-2xl font-black text-emerald-400">+105 Underdogs</h3>
                  <p className="text-sm font-bold text-foreground mt-1">RECORD: 32-14</p>
                  <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed max-w-[250px]">
                    Automatic <span className="text-primary font-bold italic">2.5U-3.0U</span> Suggested. These points are currently dominating the ROI pool.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-black text-foreground drop-shadow-md">69%</div>
                  <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-1">HIT RATE</div>
                </div>
              </div>
            </div>
            <div className="p-5 bg-destructive/10 rounded-xl border border-destructive/20 relative overflow-hidden group/item">
              <div className="flex justify-between items-start z-10 relative">
                <div>
                  <h3 className="text-2xl font-black text-destructive">-135 Favorites</h3>
                  <p className="text-sm font-bold text-foreground mt-1">RECORD: 11-28</p>
                  <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed max-w-[250px]">
                    Critical <span className="text-destructive font-bold uppercase">Avoid</span>. Market markers are pricing these traps poorly.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-black text-foreground drop-shadow-md">28%</div>
                  <div className="text-[10px] font-black text-destructive uppercase tracking-widest mt-1">HIT RATE</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-xl p-6">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
            <Activity className="w-5 h-5 text-primary" /> Comprehensive Odds Ledger
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            <OddsRow label="-300+" record="45-8" winRate="84%" />
            <OddsRow label="-250" record="12-4" winRate="75%" />
            <OddsRow label="-200" record="18-7" winRate="72%" />
            <OddsRow label="-175" record="14-9" winRate="60%" />
            <OddsRow label="-150" record="22-14" winRate="61%" />
            <OddsRow label="-140" record="9-11" winRate="45%" status="warning" />
            <OddsRow label="-135" record="11-28" winRate="28%" status="danger" />
            <OddsRow label="-130" record="15-16" winRate="48%" />
            <OddsRow label="-125" record="19-17" winRate="52%" />
            <OddsRow label="-120" record="24-22" winRate="52%" />
            <OddsRow label="-115" record="28-24" winRate="53%" />
            <OddsRow label="-110" record="45-42" winRate="51%" />
            <OddsRow label="-105" record="31-29" winRate="51%" />
            <OddsRow label="EVEN" record="18-18" winRate="50%" />
            <OddsRow label="+100" record="22-20" winRate="52%" />
            <OddsRow label="+105" record="32-14" winRate="69%" status="success" />
            <OddsRow label="+110" record="14-15" winRate="48%" />
            <OddsRow label="+115" record="11-13" winRate="45%" />
            <OddsRow label="+120" record="19-14" winRate="57%" />
            <OddsRow label="+125" record="15-12" winRate="55%" />
            <OddsRow label="+135" record="14-18" winRate="43%" />
            <OddsRow label="+150" record="12-20" winRate="37%" />
            <OddsRow label="+200" record="7-18" winRate="28%" />
            <OddsRow label="+300+" record="3-15" winRate="16%" />
          </div>
        </div>
      </section >
    </div >
  );
}

function OddsRow({ label, record, winRate, status }: { label: string, record: string, winRate: string, status?: 'success' | 'warning' | 'danger' }) {
  return (
    <div className={`flex items-center justify-between p-2 rounded-lg border transition-all hover:bg-secondary/30 ${status === 'success' ? 'border-emerald-500/30 bg-emerald-500/5' :
        status === 'warning' ? 'border-yellow-500/30 bg-yellow-500/5' :
          status === 'danger' ? 'border-destructive/30 bg-destructive/5' : 'border-transparent'
      }`}>
      <span className="font-black text-xs min-w-[60px] tracking-tighter">{label}</span>
      <span className="text-xs font-bold text-muted-foreground font-mono">{record}</span>
      <span className={`text-xs font-black ${parseInt(winRate) > 60 ? 'text-emerald-400' :
          parseInt(winRate) < 40 ? 'text-destructive' : 'text-foreground'
        }`}>{winRate}</span>
    </div>
  );
}
