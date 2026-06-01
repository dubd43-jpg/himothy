"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLiveScores } from "@/components/useLiveScores";
import { computeLiveState, type LivePickState } from "@/lib/livePickStatus";
import { OutrightTournaments } from "@/components/OutrightTournaments";
import { formatGameDateTimeET, formatUpdatedET, TIME_TBD } from "@/lib/datetime";
import {
  ArrowLeft,
  Crown,
  Layers,
  ListChecks,
  ShieldCheck,
  Timer,
  TrendingUp,
  History,
  Activity,
  ExternalLink,
  Clock,
  Zap,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Radio,
  Target,
  Flame,
  DollarSign,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Dices,
  TrendingDown,
  Users,
  Trophy,
} from "lucide-react";

// ─── Power 20 Types ───────────────────────────────────────────────────────────

interface Power20Pick {
  gameId: string; eventName: string; league: string; startTime: string;
  favoriteName: string; favoriteAbbr: string; underdogName: string;
  winProbability: number; moneyline: number | null;
  marketType: 'moneyline' | 'runline' | 'spread';
  selection: string; odds: string; selectionSide?: 'home' | 'away';
  isInjuryClear: boolean; injuryNote: string | null;
}
interface Power20Group {
  group: number; label: string; legs: Power20Pick[];
  estimatedOdds: string; estimatedDecimal: number;
}
interface Power20Parlay {
  label: string; legCount: number; legs: Power20Pick[];
  estimatedOdds: string; estimatedDecimal: number; payoutOnDollar: string;
  avgWinProbability: number;
}
interface Power20Data {
  success: boolean; boardDate: string; generatedAt: string;
  totalScanned: number; picks: Power20Pick[];
  parlayGroups: Power20Group[]; avgWinProbability: number;
  parlay20?: Power20Parlay | null;
  parlay10?: Power20Parlay | null;
  excludedFromRegularCards?: number;
}

// ─── Deep Research Types ──────────────────────────────────────────────────────

interface AtsRecord { wins: number; losses: number; pushes: number; display: string; coverPct: number; }
interface TeamProfile {
  id: string; name: string; abbreviation: string; overallRecord: string | null; homeAwayRecord: string | null;
  ats: AtsRecord | null; winProbability: number | null; moneyline: number | null;
  keyPlayers: string[]; injuredOut: string[]; injuredDoubtful: string[]; injuredQuestionable: string[];
}
interface SharpFlag {
  type: 'sharp-money' | 'fade' | 'rest-edge' | 'b2b' | 'weather' | 'revenge' | 'look-ahead' | 'value';
  label: string;
  side?: 'home' | 'away';
  intensity: 'low' | 'medium' | 'high';
}

interface DeepPick {
  gameId: string; eventName: string; league: string; sport: string; startTime: string;
  homeTeam: TeamProfile; awayTeam: TeamProfile;
  spread: number | null; total: number | null;
  selection: string; selectionSide: 'home' | 'away'; marketType: string;
  odds: string | null; line: string | null;
  confidenceScore: number; tier: string;
  reasonsFor: string[]; reasonsAgainst: string[];
  signals: { winProbabilityGap: number; atsCoverPct: number | null; atsCoverPctOpp: number | null; dataQuality: number; sharpMoneyAligned?: boolean; oppOnB2B?: boolean; reverseLineMovement?: boolean; };
  aiExplanation: { shortReason: string; fullBreakdown: string; keyAngles: string[]; injuryNotes: string; marketNotes: string; riskNotes: string; killCase: string; } | null;
  sharpFlags?: SharpFlag[];
  sharpIntel?: { betting: any; weather: any; rest: any; sharpScore: number; } | null;
  bigGameLabel?: string | null;
  // Highlighted single-biggest-reason banner + deep pitcher stats for MLB picks
  keyFactor?: { category: string; headline: string; detail: string };
  pitcherSpotlight?: {
    picked: { name: string; throws: 'L' | 'R' | null; starts: number; eraL5: number | null; whipL5: number | null; kPer9L5: number | null; hitsPerStart: number | null; lastStartER: number | null; lastStartIP: number | null } | null;
    opp:    { name: string; throws: 'L' | 'R' | null; starts: number; eraL5: number | null; whipL5: number | null; kPer9L5: number | null; hitsPerStart: number | null; lastStartER: number | null; lastStartIP: number | null } | null;
  };
}
interface NrfiPlay {
  gameId: string; eventName: string; league: string; startTime: string;
  awayTeam: string; homeTeam: string; awayPitcher: string; homePitcher: string;
  awayERA: number | null; homeERA: number | null; nrfiScore: number; reason: string; odds: string;
}
interface DailyPicksData {
  success: boolean; boardDate: string; generatedAt: string;
  grandSlam: DeepPick | null; pressurePack: DeepPick[]; vip4Pack: DeepPick[]; parlayPlan: DeepPick[];
  marquee?: DeepPick[];
  nrfi?: NrfiPlay[];
  valuePlays?: DeepPick[];
  asleepPicks?: DeepPick[];
  outrights?: OutrightTournament[];
  totalGamesScanned: number;
}

interface OutrightTournament {
  sportKey: string;
  title: string;
  commenceTime: string | null;
  contenders: { name: string; bestPrice: number | null; bestBook: string | null; consensusProb: number | null }[];
  bookCount: number;
}

// ─── Player Props Types ───────────────────────────────────────────────────────

type PropConf = 'ELITE' | 'HIGH' | 'MEDIUM' | 'LOW';
interface PropRec { stat: string; displayStat: string; seasonAvg: number; recentAvg: number | null; estimatedLine: number; direction: 'over' | 'under'; edgePct: number; confidence: PropConf; reason: string; sgpFriendly: boolean; playerName?: string; }
interface SGPLeg { type: string; description: string; player: string | null; team: string | null; correlation: string; }
interface SGPBuild { label: string; legs: SGPLeg[]; theme: string; rationale: string; estimatedMultiple: number; riskLevel: string; }
interface PlayerPropEdge { athleteId: string; playerName: string; position: string; teamName: string; seasonAvg: Record<string, number>; recentAvg: Record<string, number> | null; usageBoostReason: string | null; propRecs: PropRec[]; }
interface GamePropsData { success: boolean; dataAvailable: boolean; playerProps: PlayerPropEdge[]; sgpBuilds: SGPBuild[]; topProps: (PropRec & { playerName: string })[]; }

// ─── Props & SGP Components ───────────────────────────────────────────────────

function confColor(conf: PropConf) {
  if (conf === 'ELITE') return 'bg-amber-500 text-black';
  if (conf === 'HIGH') return 'bg-emerald-600 text-white';
  if (conf === 'MEDIUM') return 'bg-sky-600 text-white';
  return 'bg-white/10 text-white/50';
}

function PropCard({ rec, playerName }: { rec: PropRec; playerName?: string }) {
  const dir = rec.direction === 'over';
  const edgeAbs = Math.abs(rec.edgePct);
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-black text-white">{playerName || rec.playerName || '—'}</div>
          <div className="text-[10px] text-white/40 font-semibold mt-0.5">
            {dir ? 'OVER' : 'UNDER'} {rec.estimatedLine} {rec.displayStat}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${confColor(rec.confidence)}`}>{rec.confidence}</span>
          <span className={`text-xs font-black ${dir ? 'text-emerald-400' : 'text-red-400'}`}>{dir ? '+' : '-'}{edgeAbs.toFixed(0)}% edge</span>
        </div>
      </div>
      <div className="flex gap-3 text-[10px] text-white/30 font-semibold">
        <span>Season avg: {rec.seasonAvg.toFixed(1)}</span>
        {rec.recentAvg !== null && <span>Recent: {rec.recentAvg.toFixed(1)}</span>}
        <span>Line: ~{rec.estimatedLine}</span>
      </div>
      <p className="text-[11px] text-white/40 leading-relaxed">{rec.reason}</p>
    </div>
  );
}

function SGPCard({ sgp }: { sgp: SGPBuild }) {
  const riskColor = sgp.riskLevel === 'Conservative' ? 'border-emerald-500/20 bg-emerald-500/5' : sgp.riskLevel === 'Aggressive' ? 'border-red-500/20 bg-red-500/5' : 'border-sky-500/20 bg-sky-500/5';
  const approxOdds = sgp.estimatedMultiple >= 2 ? `+${Math.round((sgp.estimatedMultiple - 1) * 100)}` : '-110';
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${riskColor}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-black text-white">{sgp.label}</div>
          <div className="text-[10px] text-white/40 font-semibold mt-0.5">{sgp.theme}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-black text-emerald-400">{approxOdds}</div>
          <div className="text-[10px] text-white/30">{sgp.legs.length} legs</div>
        </div>
      </div>
      <ul className="space-y-1">
        {sgp.legs.map((leg, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-white/60">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            {leg.description}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-white/40 leading-relaxed">{sgp.rationale}</p>
    </div>
  );
}

// ─── H2H Types ────────────────────────────────────────────────────────────────

interface H2HGame {
  gameId: string; date: string; homeTeamAbbr: string; awayTeamAbbr: string;
  homeScore: number; awayScore: number; winner: 'home' | 'away'; margin: number;
  spread: number | null; homeTeamCovered: boolean | null;
  totalLine: number | null; totalResult: 'over' | 'under' | 'push' | null;
  isPlayoffs: boolean;
}
interface RecentGame {
  gameId: string; date: string; opponent: string; isHome: boolean;
  teamScore: number; oppScore: number; won: boolean; margin: number;
  spread: number | null; covered: boolean | null;
  totalLine: number | null; totalResult: 'over' | 'under' | 'push' | null;
}
interface RecentStreak {
  wins: number; losses: number; winStreak: number; lossStreak: number;
  atsWins: number; atsLosses: number; avgMargin: number;
  streakLabel: string; atsStreakLabel: string; totalsLabel: string;
}
interface PlayerGameLine {
  gameId: string; date: string; opponent: string;
  stats: Record<string, number>; statLabels: string[]; won: boolean;
}
interface PlayerVsTeam {
  playerId: string; playerName: string; vsTeamAbbr: string;
  games: PlayerGameLine[]; avgStats: Record<string, number>; trend: string | null;
}
interface H2HData {
  h2hGames: H2HGame[]; homeTeamAbbr: string; awayTeamAbbr: string;
  homeRecent: RecentGame[]; awayRecent: RecentGame[];
  homeStreak: RecentStreak; awayStreak: RecentStreak;
  playerLines: PlayerVsTeam[]; seriesSummary: string | null;
}

// ─── H2H Components ───────────────────────────────────────────────────────────

function H2HGameRow({ game, focusAbbr }: { game: H2HGame; focusAbbr: string }) {
  const focusIsHome = game.homeTeamAbbr === focusAbbr;
  const focusScore = focusIsHome ? game.homeScore : game.awayScore;
  const oppScore = focusIsHome ? game.awayScore : game.homeScore;
  const won = game.winner === (focusIsHome ? 'home' : 'away');
  const covered = focusIsHome ? game.homeTeamCovered : (game.homeTeamCovered !== null ? !game.homeTeamCovered : null);
  const date = game.date ? new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-white/25 w-12 shrink-0">{date}</span>
      <span className={`font-black w-5 shrink-0 ${won ? 'text-emerald-400' : 'text-red-400'}`}>{won ? 'W' : 'L'}</span>
      <span className="text-white/70 font-bold tabular-nums">{focusScore}–{oppScore}</span>
      {game.spread !== null && (
        <span className={`text-[10px] font-bold ${covered === true ? 'text-emerald-400/70' : covered === false ? 'text-red-400/70' : 'text-white/25'}`}>
          {covered === true ? '✓ Covered' : covered === false ? '✗ No cover' : 'ATS ?'}
          {game.spread !== 0 && ` (${game.spread > 0 ? '+' : ''}${game.spread})`}
        </span>
      )}
      {game.totalResult && game.totalLine && (
        <span className={`text-[10px] font-bold ml-auto ${game.totalResult === 'over' ? 'text-orange-400/70' : 'text-sky-400/70'}`}>
          {game.totalResult === 'over' ? '▲' : '▼'} {game.totalLine}
        </span>
      )}
      {game.isPlayoffs && <span className="text-[9px] text-amber-400/60 font-black ml-1">PO</span>}
    </div>
  );
}

function RecentGameRow({ game }: { game: RecentGame }) {
  const date = game.date ? new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-white/25 w-12 shrink-0">{date}</span>
      <span className={`font-black w-5 shrink-0 ${game.won ? 'text-emerald-400' : 'text-red-400'}`}>{game.won ? 'W' : 'L'}</span>
      <span className="text-white/50">{game.isHome ? 'vs' : '@'} {game.opponent}</span>
      <span className="text-white/60 font-bold tabular-nums ml-1">{game.teamScore}–{game.oppScore}</span>
      {game.covered !== null && (
        <span className={`text-[10px] font-bold ml-auto ${game.covered ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
          {game.covered ? '✓' : '✗'} ATS
        </span>
      )}
      {game.totalResult && (
        <span className={`text-[10px] font-bold ${game.covered !== null ? 'ml-1' : 'ml-auto'} ${game.totalResult === 'over' ? 'text-orange-400/60' : 'text-sky-400/60'}`}>
          {game.totalResult === 'over' ? '▲O' : '▼U'}
        </span>
      )}
    </div>
  );
}

function PlayerVsTeamCard({ pvt }: { pvt: PlayerVsTeam }) {
  if (pvt.games.length === 0) return null;
  const labels = pvt.games[0].statLabels;
  // Pick top 4 most interesting stats
  const keyStats = ['PTS','AST','REB','3PT','MIN','H','RBI','K','YDS'].filter((s) => labels.includes(s)).slice(0, 4);
  if (keyStats.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-black text-white">{pvt.playerName}</div>
        {pvt.trend && <div className="text-[10px] text-emerald-400/70 font-bold">{pvt.trend}</div>}
      </div>
      {/* Stat labels header */}
      <div className="grid text-[10px] text-white/25 font-black uppercase" style={{ gridTemplateColumns: `1fr repeat(${keyStats.length}, 2.5rem)` }}>
        <span>Date</span>
        {keyStats.map((s) => <span key={s} className="text-right">{s}</span>)}
      </div>
      {pvt.games.slice(0, 4).map((g) => (
        <div key={g.gameId} className="grid text-[11px]" style={{ gridTemplateColumns: `1fr repeat(${keyStats.length}, 2.5rem)` }}>
          <span className="text-white/30">{new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          {keyStats.map((s) => (
            <span key={s} className="text-right font-bold tabular-nums text-white/70">{g.stats[s] ?? '—'}</span>
          ))}
        </div>
      ))}
      {/* Averages row */}
      <div className="grid text-[10px] border-t border-white/5 pt-1.5 font-black" style={{ gridTemplateColumns: `1fr repeat(${keyStats.length}, 2.5rem)` }}>
        <span className="text-white/40 uppercase">Avg vs</span>
        {keyStats.map((s) => (
          <span key={s} className="text-right text-amber-400/80">{pvt.avgStats[s] ?? '—'}</span>
        ))}
      </div>
    </div>
  );
}

function H2HPanel({ data, homeAbbr, awayAbbr }: { data: H2HData; homeAbbr: string; awayAbbr: string }) {
  return (
    <div className="space-y-5 border-t border-white/5 pt-4">
      {/* Series summary */}
      {data.seriesSummary && (
        <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/8 px-3 py-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Series</span>
          <span className="text-xs font-black text-white">{data.seriesSummary}</span>
        </div>
      )}

      {/* H2H games */}
      {data.h2hGames.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-white/30">Last {data.h2hGames.length} Meetings</div>
          <div className="space-y-1.5">
            {data.h2hGames.map((g) => <H2HGameRow key={g.gameId} game={g} focusAbbr={homeAbbr} />)}
          </div>
        </div>
      )}

      {/* Recent form — both teams */}
      <div className="grid grid-cols-2 gap-4">
        {[{ abbr: homeAbbr, recent: data.homeRecent, streak: data.homeStreak },
          { abbr: awayAbbr, recent: data.awayRecent, streak: data.awayStreak }].map(({ abbr, recent, streak }) => (
          <div key={abbr} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{abbr} Last 5</span>
              <span className="text-[9px] font-bold text-white/25">{streak.wins}-{streak.losses}</span>
            </div>
            {streak.streakLabel && (
              <div className="text-[10px] font-bold text-white/50">{streak.streakLabel}</div>
            )}
            {streak.atsStreakLabel && streak.atsStreakLabel !== 'No ATS data' && (
              <div className="text-[10px] font-bold text-sky-400/60">{streak.atsStreakLabel}</div>
            )}
            {streak.totalsLabel && (
              <div className="text-[10px] font-bold text-orange-400/50">{streak.totalsLabel}</div>
            )}
            <div className="space-y-1">
              {recent.slice(0, 5).map((g) => <RecentGameRow key={g.gameId} game={g} />)}
            </div>
          </div>
        ))}
      </div>

      {/* Player vs team */}
      {data.playerLines.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-white/30">Player vs {awayAbbr}</div>
          {data.playerLines.map((pvt) => <PlayerVsTeamCard key={pvt.playerId} pvt={pvt} />)}
        </div>
      )}
    </div>
  );
}

function PropsAndSGPPanel({ gameId, league, homeTeamId, awayTeamId }: {
  gameId: string; league: string; homeTeamId: string; awayTeamId: string;
}) {
  const [propsData, setPropsData] = useState<GamePropsData | null>(null);
  const [h2hData, setH2hData] = useState<H2HData | null>(null);
  const [loadingProps, setLoadingProps] = useState(true);
  const [loadingH2H, setLoadingH2H] = useState(true);
  const [tab, setTab] = useState<'props' | 'h2h'>('h2h');

  const fetchH2H = async (playerIds: string) => {
    if (!homeTeamId || !awayTeamId) { setLoadingH2H(false); return; }
    const url = `/api/research/h2h?league=${encodeURIComponent(league)}&gameId=${encodeURIComponent(gameId)}&homeTeamId=${encodeURIComponent(homeTeamId)}&awayTeamId=${encodeURIComponent(awayTeamId)}${playerIds ? `&playerIds=${encodeURIComponent(playerIds)}` : ''}`;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const d = await r.json();
      if (d.success) setH2hData(d);
    } catch { /* silent */ }
    setLoadingH2H(false);
  };

  useEffect(() => {
    // Start H2H fetch immediately (no player IDs yet)
    fetchH2H('');

    // Fetch player props; when done, re-fetch H2H with player IDs to add player vs team rows
    fetch(`/api/research/player-props?gameId=${encodeURIComponent(gameId)}&league=${encodeURIComponent(league)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setPropsData(d);
          // Enrich H2H with player IDs from top props players (max 5 to avoid overloading)
          const ids: string[] = (d.playerProps as PlayerPropEdge[])
            .filter((p) => p.athleteId)
            .slice(0, 5)
            .map((p) => p.athleteId);
          if (ids.length > 0) {
            setLoadingH2H(true);
            fetchH2H(ids.join(','));
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProps(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, league, homeTeamId, awayTeamId]);

  const loading = loadingProps && loadingH2H;

  if (loading) return (
    <div className="flex items-center gap-2 py-3 text-xs text-white/30">
      <div className="h-3 w-3 rounded-full border border-white/20 border-t-white/60 animate-spin" />
      Loading matchup data...
    </div>
  );

  const hasProps = propsData?.dataAvailable && (propsData.topProps.length > 0 || propsData.sgpBuilds.length > 0);
  const hasH2H = Boolean(h2hData?.h2hGames?.length || h2hData?.homeRecent?.length);

  return (
    <div className="border-t border-white/5 pt-3 space-y-3">
      {/* Tab selector */}
      <div className="flex gap-1">
        {hasH2H && (
          <button type="button" onClick={() => setTab('h2h')}
            className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-all ${tab === 'h2h' ? 'bg-white/10 text-white' : 'text-white/25 hover:text-white/50'}`}>
            H2H &amp; Form
          </button>
        )}
        {hasProps && (
          <button type="button" onClick={() => setTab('props')}
            className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-all ${tab === 'props' ? 'bg-white/10 text-white' : 'text-white/25 hover:text-white/50'}`}>
            Props &amp; SGP
          </button>
        )}
      </div>

      {/* H2H Tab */}
      {tab === 'h2h' && (
        loadingH2H ? (
          <div className="flex items-center gap-2 py-2 text-xs text-white/30">
            <div className="h-3 w-3 rounded-full border border-white/20 border-t-white/60 animate-spin" />
            Loading H2H data...
          </div>
        ) : hasH2H ? (
          <H2HPanel data={h2hData!} homeAbbr={h2hData!.homeTeamAbbr} awayAbbr={h2hData!.awayTeamAbbr} />
        ) : (
          <div className="py-2 text-xs text-white/25">No H2H history available for this matchup yet.</div>
        )
      )}

      {/* Props Tab */}
      {tab === 'props' && (
        loadingProps ? (
          <div className="flex items-center gap-2 py-2 text-xs text-white/30">
            <div className="h-3 w-3 rounded-full border border-white/20 border-t-white/60 animate-spin" />
            Scanning player props...
          </div>
        ) : hasProps ? (
          <div className="space-y-4">
            {propsData!.topProps.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-1.5">
                  <Users className="h-3 w-3" /> Player Props
                </div>
                {propsData!.topProps.slice(0, 4).map((rec, i) => (
                  <PropCard key={i} rec={rec} playerName={rec.playerName} />
                ))}
              </div>
            )}
            {propsData!.sgpBuilds.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-1.5">
                  <Dices className="h-3 w-3" /> SGP Builds
                </div>
                {propsData!.sgpBuilds.map((sgp, i) => <SGPCard key={i} sgp={sgp} />)}
              </div>
            )}
          </div>
        ) : (
          <div className="py-2 text-xs text-white/25">Player stats not available for this game yet.</div>
        )
      )}
    </div>
  );
}

// ─── Sharp Signal Badges ─────────────────────────────────────────────────────

const FLAG_STYLES: Record<SharpFlag['type'], { bg: string; text: string; border: string }> = {
  'sharp-money': { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30' },
  'fade':        { bg: 'bg-sky-500/15',   text: 'text-sky-300',   border: 'border-sky-500/30' },
  'rest-edge':   { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  'b2b':         { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  'weather':     { bg: 'bg-slate-500/15', text: 'text-slate-300',  border: 'border-slate-500/30' },
  'revenge':     { bg: 'bg-red-500/15',   text: 'text-red-300',    border: 'border-red-500/30' },
  'look-ahead':  { bg: 'bg-purple-500/15', text: 'text-purple-300', border: 'border-purple-500/30' },
  'value':       { bg: 'bg-primary/15',   text: 'text-primary',    border: 'border-primary/30' },
};

function SharpSignalBadges({ flags }: { flags: SharpFlag[] }) {
  if (!flags || flags.length === 0) return null;
  // Only show medium/high intensity flags; low are too noisy
  const visible = flags.filter((f) => f.intensity !== 'low');
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((flag, i) => {
        const s = FLAG_STYLES[flag.type];
        return (
          <span key={i} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${s.bg} ${s.text} ${s.border}`}>
            {flag.type === 'sharp-money' && '⚡ '}
            {flag.type === 'fade' && '📉 '}
            {flag.type === 'b2b' && '😴 '}
            {flag.type === 'rest-edge' && '💤 '}
            {flag.type === 'weather' && '🌬 '}
            {flag.label}
          </span>
        );
      })}
    </div>
  );
}

// ─── Live Record Bar ─────────────────────────────────────────────────────────

interface RecordStats {
  wins: number; losses: number; pushes: number; winPercentage: string; units: number;
}

interface ProductLineStats {
  wins: number; losses: number; pushes: number; pending: number;
  totalPicks: number; units: number; winRate: string;
}

function LiveRecordBar() {
  const [stats, setStats] = useState<{
    overall: { today: RecordStats; last7Days: RecordStats; allTime: RecordStats };
    productLineStats: Record<string, ProductLineStats>;
  } | null>(null);

  // Refresh every 60s so as soon as a game settles, the bar updates without page reload.
  // Per user: "as soon as the game ends, update the stats."
  useEffect(() => {
    const load = () => {
      fetch('/api/records/summary', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (!d.success) return;
          setStats({
            overall: d.stats,
            productLineStats: d.product_line_stats || {},
          });
        })
        .catch(() => {});
    };
    load();
    const i = setInterval(load, 60_000);
    return () => clearInterval(i);
  }, []);

  if (!stats) return null;

  const at = stats.overall.allTime;
  const hasRecord = (at.wins + at.losses) > 0;
  if (!hasRecord) return null;

  // Per user: ONLY Grand Slam, Pressure Pack, and VIP 4-Pack count toward the main
  // "Straights" stat (user prefers "Straights" over "Singles" — sports-betting term).
  // Everything else (Big Games, Personal Pick, Parlays, NRFI, Asleep, Value Plays) is
  // shown separately or just lives on its own tile. This keeps the headline number tied
  // to our flagship core products.
  const lines = stats.productLineStats || {};
  const isCoreSingle = (k: string) => /^(grand slam|pressure pack|vip 4-pack)$/i.test(k);
  const isParlayLine = (k: string) => /parlay|hailmary/i.test(k);
  const isMarqueeLine = (k: string) => /big games|marquee/i.test(k);
  const isPersonalLine = (k: string) => /personal/i.test(k);
  const singles = Object.entries(lines).filter(([k]) => isCoreSingle(k));
  const parlays = Object.entries(lines).filter(([k]) => isParlayLine(k));
  const marquee = Object.entries(lines).filter(([k]) => isMarqueeLine(k));
  const personal = Object.entries(lines).filter(([k]) => isPersonalLine(k));
  const sum = (rows: Array<[string, ProductLineStats]>) => rows.reduce(
    (acc, [, s]) => ({ wins: acc.wins + s.wins, losses: acc.losses + s.losses, pushes: acc.pushes + s.pushes, units: acc.units + s.units }),
    { wins: 0, losses: 0, pushes: 0, units: 0 },
  );
  const singlesAgg = sum(singles);
  const parlaysAgg = sum(parlays);
  const marqueeAgg = sum(marquee);
  const personalAgg = sum(personal);
  const wlPct = (w: number, l: number) => (w + l > 0 ? `${Math.round((w / (w + l)) * 100)}%` : '—');
  const unitStr = (u: number) => `${u >= 0 ? '+' : ''}${u.toFixed(1)}u`;

  return (
    <div className="border-b border-white/5 bg-emerald-950/20 px-4 py-2.5">
      <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <div className="flex items-center gap-1.5">
          <Trophy className="h-3 w-3 text-emerald-400 shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Official HIMOTHY Record</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[10px] font-black tabular-nums">
          <span className="text-white/50">
            Straights <span className="text-white">{singlesAgg.wins}-{singlesAgg.losses}{singlesAgg.pushes > 0 ? `-${singlesAgg.pushes}` : ''}</span>
            <span className="text-emerald-400/70 ml-1">{wlPct(singlesAgg.wins, singlesAgg.losses)}</span>
            <span className={`ml-1 ${singlesAgg.units >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>{unitStr(singlesAgg.units)}</span>
          </span>
          <span className="text-white/50">
            Parlays <span className="text-white">{parlaysAgg.wins}-{parlaysAgg.losses}{parlaysAgg.pushes > 0 ? `-${parlaysAgg.pushes}` : ''}</span>
            <span className="text-emerald-400/70 ml-1">{wlPct(parlaysAgg.wins, parlaysAgg.losses)}</span>
            <span className={`ml-1 ${parlaysAgg.units >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>{unitStr(parlaysAgg.units)}</span>
          </span>
          {(marqueeAgg.wins + marqueeAgg.losses) > 0 && (
            <span className="text-white/50">
              Big Games <span className="text-white">{marqueeAgg.wins}-{marqueeAgg.losses}{marqueeAgg.pushes > 0 ? `-${marqueeAgg.pushes}` : ''}</span>
              <span className="text-emerald-400/70 ml-1">{wlPct(marqueeAgg.wins, marqueeAgg.losses)}</span>
              <span className={`ml-1 ${marqueeAgg.units >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>{unitStr(marqueeAgg.units)}</span>
            </span>
          )}
          {(personalAgg.wins + personalAgg.losses) > 0 && (
            <span className="text-white/50">
              Personal <span className="text-white">{personalAgg.wins}-{personalAgg.losses}{personalAgg.pushes > 0 ? `-${personalAgg.pushes}` : ''}</span>
              <span className="text-emerald-400/70 ml-1">{wlPct(personalAgg.wins, personalAgg.losses)}</span>
              <span className={`ml-1 ${personalAgg.units >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>{unitStr(personalAgg.units)}</span>
            </span>
          )}
          <Link href="/results" className="text-white/30 hover:text-emerald-400 transition-colors underline underline-offset-2">
            Full Record →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Public Money Badge ───────────────────────────────────────────────────────

interface PublicMoneyData {
  success: boolean;
  awayBetPct: number | null;
  homeBetPct: number | null;
  awayMoneyPct: number | null;
  homeMoneyPct: number | null;
  spreadAwayBetPct: number | null;
  spreadHomeBetPct: number | null;
}

function PublicMoneyBadge({ awayTeam, homeTeam, selectionSide, league }: {
  awayTeam: string; homeTeam: string; selectionSide: 'home' | 'away'; league: string;
}) {
  const [pub, setPub] = useState<PublicMoneyData | null>(null);

  useEffect(() => {
    fetch(`/api/research/public-money?awayTeam=${encodeURIComponent(awayTeam)}&homeTeam=${encodeURIComponent(homeTeam)}&league=${encodeURIComponent(league)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d.success) setPub(d); })
      .catch(() => {});
  }, [awayTeam, homeTeam, league]);

  if (!pub) return null;

  const betPct = selectionSide === 'away' ? pub.awayBetPct : pub.homeBetPct;
  const moneyPct = selectionSide === 'away' ? pub.awayMoneyPct : pub.homeMoneyPct;

  if (betPct == null && moneyPct == null) return null;

  const isWithPublic = betPct != null && betPct >= 50;
  const isAgainstPublic = betPct != null && betPct < 45;

  return (
    <div className="flex items-center gap-2 text-[10px] text-white/25 font-semibold">
      <span className="uppercase tracking-wider">Public</span>
      {betPct != null && (
        <span className={isAgainstPublic ? 'text-amber-400/60' : isWithPublic ? 'text-white/35' : 'text-white/25'}>
          {betPct}% bets
        </span>
      )}
      {moneyPct != null && (
        <span className={moneyPct >= 55 ? 'text-emerald-400/50' : 'text-white/25'}>
          {moneyPct}% $
        </span>
      )}
      {isAgainstPublic && <span className="text-amber-400/60">← fade</span>}
    </div>
  );
}

// ─── Deep Research Components ─────────────────────────────────────────────────

// Clean, clickable SUMMARY card. The full breakdown (win %, H2H, props, form, reasons)
// lives on the breakdown page the card links to — the whole card is the click target.
function DeepPickCard({ pick, variant, href, live, lateNewsNote }: { pick: DeepPick; variant: 'grand-slam' | 'pressure' | 'vip' | 'parlay'; href?: string; live?: LivePickState | null; lateNewsNote?: string | null }) {
  const startTime = formatGameDateTimeET(pick.startTime) || TIME_TBD;
  const showLive = !!live && live.state !== 'pre';
  const liveClockStr = live ? [live.period, live.clock && live.clock !== '0:00' ? live.clock : null].filter(Boolean).join(' · ') : '';
  const startMs = pick.startTime ? new Date(pick.startTime).getTime() : null;
  const isPastStart = startMs != null && Date.now() > startMs;
  const shouldShowInProgress = !showLive && isPastStart;

  // BIG result accent: when a pick is graded, the whole card lights up green (won),
  // red (lost), or stays neutral (push). User said "make wins and losses very
  // noticeable — I don't want to hunt for the result." Applies to every single pick.
  const isFinal = !!live && live.state === 'final';
  const finalResult = isFinal ? live!.result : null;
  let accent: string;
  if (finalResult === 'won') {
    accent = 'border-emerald-400/70 bg-gradient-to-br from-emerald-500/[0.18] to-emerald-500/[0.04] shadow-[0_0_30px_-8px_rgba(16,185,129,0.4)]';
  } else if (finalResult === 'lost') {
    accent = 'border-red-500/70 bg-gradient-to-br from-red-500/[0.18] to-red-500/[0.04] shadow-[0_0_30px_-8px_rgba(239,68,68,0.4)]';
  } else if (finalResult === 'push') {
    accent = 'border-white/25 bg-white/[0.05]';
  } else if (variant === 'grand-slam') {
    accent = 'border-primary/40 bg-gradient-to-br from-primary/[0.08] to-transparent';
  } else {
    accent = 'border-white/10 bg-white/[0.03]';
  }

  const inner = (
    <article className={`group relative overflow-hidden rounded-2xl border-2 ${accent} p-5 transition-all ${href ? 'hover:border-primary/50' : ''}`}>
      {/* Giant final-result text — user wants it large and unmissable. Sits behind the
          card content as a watermark, doesn't block any UI. */}
      {finalResult && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
          <div className={`text-7xl md:text-8xl font-black uppercase tracking-tighter ${
            finalResult === 'won' ? 'text-emerald-400/15' :
            finalResult === 'lost' ? 'text-red-500/15' :
            'text-white/10'
          }`}>
            {finalResult === 'won' ? 'WIN' : finalResult === 'lost' ? 'LOSS' : 'PUSH'}
          </div>
        </div>
      )}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-widest text-white/30">
          <span className="truncate">{pick.league} · {pick.awayTeam.name} @ {pick.homeTeam.name}</span>
          <span className="shrink-0">
            {showLive
              ? live!.state === 'live'
                ? <span className="inline-flex items-center gap-1 text-red-400"><span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> Live</span>
                : finalResult === 'won'
                  ? <span className="text-emerald-400 text-sm tracking-widest">FINAL · WIN</span>
                  : finalResult === 'lost'
                    ? <span className="text-red-400 text-sm tracking-widest">FINAL · LOSS</span>
                    : <span className="text-white/50">Final</span>
              : shouldShowInProgress
                ? <span className="text-amber-400/80">In Progress</span>
                : startTime}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-2xl font-black text-white leading-tight md:text-3xl">{pick.selection}</div>
          {pick.odds && (
            <div className="shrink-0 rounded-xl border border-primary/25 bg-primary/10 px-4 py-2 text-xl font-black tabular-nums text-primary">{pick.odds}</div>
          )}
        </div>
        {showLive && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm font-bold tabular-nums">
              <span className="text-white/70">
                {pick.awayTeam.abbreviation} <span className="text-white">{live!.awayScore}</span>
                <span className="text-white/25"> – </span>
                <span className="text-white">{live!.homeScore}</span> {pick.homeTeam.abbreviation}
              </span>
              {liveClockStr && <span className="text-[11px] font-bold italic text-primary">{liveClockStr}</span>}
            </div>
            {live!.meterPct != null && (
              <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    live!.state === 'final'
                      ? live!.result === 'won' ? 'bg-emerald-400' : live!.result === 'push' ? 'bg-white/30' : 'bg-red-500'
                      : live!.trend === 'down' ? 'bg-amber-500' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${live!.meterPct}%` }}
                />
              </div>
            )}
          </div>
        )}
        {/* CONFIDENCE BAND — owner directive: customers should see at a glance which picks
            are slam dunks vs strong vs solid-best-available. Sets expectations + builds trust. */}
        <ConfidenceBand score={pick.confidenceScore} />

        {/* KEY FACTOR — owner directive: every pick must show the SINGLE BIGGEST reason
            we took it, highlighted prominently. Customer sees this BEFORE anything else
            so they immediately know "we like this because of X." */}
        {pick.keyFactor && <KeyFactorBanner factor={pick.keyFactor} />}

        {/* PITCHER SPOTLIGHT — for MLB picks, show both starters' full L5 stats. Critical
            when the KEY FACTOR is the pitcher matchup; useful context for any MLB pick. */}
        {pick.pitcherSpotlight && (pick.pitcherSpotlight.picked || pick.pitcherSpotlight.opp) && (
          <PitcherSpotlight spotlight={pick.pitcherSpotlight} pickedAbbr={pick.homeTeam.abbreviation === pick.selection.split(' ')[0] ? pick.homeTeam.abbreviation : pick.awayTeam.abbreviation} oppAbbr={pick.homeTeam.abbreviation === pick.selection.split(' ')[0] ? pick.awayTeam.abbreviation : pick.homeTeam.abbreviation} highlight={pick.keyFactor?.category === 'pitcher'} />
        )}
        {/* LATE NEWS warning — the cron flags this pick when an OUT/scratch happened
            after morning publish. We WARN, never auto-pull. Customer sees "verify before betting." */}
        {lateNewsNote && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs">
            <span className="text-amber-400 font-black shrink-0">⚠</span>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-amber-300">Late news</div>
              <div className="text-amber-100/85 mt-0.5">{lateNewsNote}</div>
              <div className="text-[10px] text-amber-200/60 mt-1">Verify lineup before betting.</div>
            </div>
          </div>
        )}
        {/* WHY WE LIKE IT — top 4 reasons surface prominently. Customer sees the
            FULL case for the pick before deciding. Especially important on dog flips
            where the win-prob would seem to argue against — the pitcher matchup,
            bullpen, line movement, and tendency reasons need to land FIRST. */}
        {pick.reasonsFor && pick.reasonsFor.length > 0 && (
          <ul className="space-y-1.5 text-[12px] leading-relaxed text-white/75 border-t border-white/5 pt-3">
            {pick.reasonsFor.slice(0, 4).map((r, i) => (
              <li key={i} className="flex gap-2"><span className="text-emerald-400 shrink-0">✓</span><span>{r}</span></li>
            ))}
          </ul>
        )}
        {/* RISKS — surface key reasonsAgainst so the customer sees them too. Honest
            picking shows both sides. Especially important on dog flips where the
            losing streak / opp's hot hitting is real context. */}
        {pick.reasonsAgainst && pick.reasonsAgainst.length > 0 && (
          <ul className="space-y-1.5 text-[12px] leading-relaxed text-white/55 border-t border-white/5 pt-3">
            <li className="text-[10px] font-black uppercase tracking-widest text-amber-400/70">Honest risks</li>
            {pick.reasonsAgainst.slice(0, 2).map((r, i) => (
              <li key={i} className="flex gap-2"><span className="text-amber-400/70 shrink-0">!</span><span>{r}</span></li>
            ))}
          </ul>
        )}
        {/* Sharp-signal badges are methodology (our edge) — back-end only, hidden from customers. */}
        {href && (
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-primary/70 group-hover:text-primary transition-colors">
            {showLive && live!.state === 'final' ? 'View result & breakdown →' : 'View full breakdown →'}
          </div>
        )}
      </div>
    </article>
  );

  if (!href) return inner;
  return href.startsWith('http')
    ? <a href={href} target="_blank" rel="noopener noreferrer" className="block">{inner}</a>
    : <Link href={href} className="block">{inner}</Link>;
}


// CONFIDENCE BAND — three-tier label customers see on every pick card. Sets
// expectations honestly: SLAM DUNK is a 96+ "highest conviction", STRONG is 88-95
// "real edge", SOLID is 80-87 "best available — proceed at your conviction." This
// is what customers ASKED for: not every pick is a lock, and we tell them which is which.
function ConfidenceBand({ score }: { score: number }) {
  let label: string, bgCls: string, textCls: string, blurb: string;
  if (score >= 96) {
    label = 'SLAM DUNK';
    bgCls = 'bg-gradient-to-r from-amber-400/20 to-amber-500/10 border-amber-400/40';
    textCls = 'text-amber-300';
    blurb = 'Highest conviction tonight';
  } else if (score >= 88) {
    label = 'STRONG';
    bgCls = 'bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 border-emerald-500/30';
    textCls = 'text-emerald-300';
    blurb = 'Real edge across the data';
  } else {
    label = 'SOLID';
    bgCls = 'bg-gradient-to-r from-sky-500/12 to-sky-500/4 border-sky-500/25';
    textCls = 'text-sky-300';
    blurb = 'Best available — bet at your conviction';
  }
  return (
    <div className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${bgCls}`}>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-black uppercase tracking-widest ${textCls}`}>{label}</span>
        <span className="text-[10px] text-white/40 hidden sm:inline">· {blurb}</span>
      </div>
      <span className={`text-[10px] font-black tabular-nums ${textCls}`}>{score.toFixed(0)}</span>
    </div>
  );
}

// KEY FACTOR BANNER — the single biggest reason we took this pick, surfaced
// prominently above all other reasoning. Owner directive: every pick MUST show
// a clear key-factor explanation so customers immediately know why.
function KeyFactorBanner({ factor }: { factor: { category: string; headline: string; detail: string } }) {
  // Category-driven color (so the bar tells the customer at a glance what kind of edge)
  const stylesByCategory: Record<string, { ring: string; bg: string; iconBg: string; iconColor: string; emoji: string }> = {
    pitcher:        { ring: "border-emerald-400/50", bg: "from-emerald-500/15 to-emerald-500/5", iconBg: "bg-emerald-500/25", iconColor: "text-emerald-300", emoji: "⚾" },
    bullpen:        { ring: "border-amber-400/50",   bg: "from-amber-500/15 to-amber-500/5",     iconBg: "bg-amber-500/25",   iconColor: "text-amber-300",   emoji: "🔥" },
    line_movement:  { ring: "border-sky-400/50",     bg: "from-sky-500/15 to-sky-500/5",         iconBg: "bg-sky-500/25",     iconColor: "text-sky-300",     emoji: "📈" },
    odds_bucket:    { ring: "border-purple-400/50",  bg: "from-purple-500/15 to-purple-500/5",   iconBg: "bg-purple-500/25",  iconColor: "text-purple-300",  emoji: "👁" },
    streak_real:    { ring: "border-rose-400/50",    bg: "from-rose-500/15 to-rose-500/5",       iconBg: "bg-rose-500/25",    iconColor: "text-rose-300",    emoji: "🔥" },
    first_frame:    { ring: "border-cyan-400/50",    bg: "from-cyan-500/15 to-cyan-500/5",       iconBg: "bg-cyan-500/25",    iconColor: "text-cyan-300",    emoji: "⚡" },
    q1_h1:          { ring: "border-cyan-400/50",    bg: "from-cyan-500/15 to-cyan-500/5",       iconBg: "bg-cyan-500/25",    iconColor: "text-cyan-300",    emoji: "⚡" },
    injury:         { ring: "border-red-400/50",     bg: "from-red-500/15 to-red-500/5",         iconBg: "bg-red-500/25",     iconColor: "text-red-300",     emoji: "🏥" },
    ats:            { ring: "border-lime-400/50",    bg: "from-lime-500/15 to-lime-500/5",       iconBg: "bg-lime-500/25",    iconColor: "text-lime-300",    emoji: "📊" },
    value:          { ring: "border-yellow-400/50",  bg: "from-yellow-500/15 to-yellow-500/5",   iconBg: "bg-yellow-500/25",  iconColor: "text-yellow-300",  emoji: "💎" },
    win_prob:       { ring: "border-white/20",       bg: "from-white/[0.05] to-white/[0.01]",    iconBg: "bg-white/10",       iconColor: "text-white/70",    emoji: "🎯" },
  };
  const style = stylesByCategory[factor.category] || stylesByCategory.win_prob;
  return (
    <div className={`rounded-xl border-2 ${style.ring} bg-gradient-to-br ${style.bg} p-3 space-y-2`}>
      <div className="flex items-center gap-2">
        <div className={`flex items-center justify-center h-7 w-7 rounded-lg ${style.iconBg} text-sm`}>{style.emoji}</div>
        <div className="flex flex-col leading-tight">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Key Factor</span>
          <span className={`text-[12px] font-black uppercase tracking-wider ${style.iconColor}`}>{factor.headline}</span>
        </div>
      </div>
      <div className="text-[12px] leading-relaxed text-white/85">{factor.detail}</div>
    </div>
  );
}

// PITCHER SPOTLIGHT — both starters' deep L5 stats. Highlighted when the KEY FACTOR
// is the pitcher matchup (the whole point of this block for those picks).
function PitcherSpotlight({ spotlight, pickedAbbr, oppAbbr, highlight }: {
  spotlight: NonNullable<DeepPick['pitcherSpotlight']>;
  pickedAbbr: string;
  oppAbbr: string;
  highlight: boolean;
}) {
  const cell = (p: NonNullable<NonNullable<DeepPick['pitcherSpotlight']>['picked']>, label: string, ourSide: boolean) => {
    const eraTone = p.eraL5 == null ? 'text-white/30' : p.eraL5 <= 2.5 ? 'text-emerald-400' : p.eraL5 <= 3.5 ? 'text-sky-400' : p.eraL5 <= 4.5 ? 'text-white/70' : 'text-red-400';
    return (
      <div className={`flex-1 min-w-0 ${ourSide ? '' : 'opacity-90'}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{label}</span>
          <span className="text-[9px] font-bold text-white/30">{p.throws ? `${p.throws}HP` : ''}</span>
        </div>
        <div className="text-sm font-black text-white truncate mt-0.5">{p.name}</div>
        <div className="grid grid-cols-3 gap-1 mt-1.5 text-[10px]">
          <div className="rounded bg-white/[0.04] px-1.5 py-1">
            <div className="text-[8px] text-white/30 uppercase">ERA L{p.starts}</div>
            <div className={`font-black tabular-nums ${eraTone}`}>{p.eraL5?.toFixed(2) ?? '—'}</div>
          </div>
          <div className="rounded bg-white/[0.04] px-1.5 py-1">
            <div className="text-[8px] text-white/30 uppercase">WHIP</div>
            <div className="font-black tabular-nums text-white/80">{p.whipL5?.toFixed(2) ?? '—'}</div>
          </div>
          <div className="rounded bg-white/[0.04] px-1.5 py-1">
            <div className="text-[8px] text-white/30 uppercase">K/9</div>
            <div className="font-black tabular-nums text-white/80">{p.kPer9L5?.toFixed(1) ?? '—'}</div>
          </div>
        </div>
        {p.lastStartER != null && p.lastStartIP != null && (
          <div className="mt-1 text-[10px] text-white/40">
            Last start: <span className="font-bold text-white/65">{p.lastStartER} ER / {p.lastStartIP.toFixed(1)} IP</span>
          </div>
        )}
      </div>
    );
  };
  if (!spotlight.picked && !spotlight.opp) return null;
  return (
    <div className={`rounded-xl border ${highlight ? 'border-emerald-400/40 bg-emerald-500/[0.04]' : 'border-white/10 bg-white/[0.02]'} p-3 space-y-2`}>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/50">
        <span>⚾ Pitcher Matchup</span>
        {highlight && <span className="text-emerald-300/70 text-[9px]">· this is why we picked it</span>}
      </div>
      <div className="flex items-stretch gap-3 divide-x divide-white/8">
        {spotlight.picked && cell(spotlight.picked, `${pickedAbbr} (us)`, true)}
        {spotlight.opp && <div className="pl-3">{cell(spotlight.opp, oppAbbr, false)}</div>}
      </div>
    </div>
  );
}

function CompactParlayLeg({ pick, index }: { pick: DeepPick; index: number }) {
  const oddsTextCls = pick.odds && pick.odds.startsWith('+') ? 'text-emerald-400' : 'text-sky-400';
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <div className="w-5 h-5 shrink-0 rounded-full bg-orange-500/20 flex items-center justify-center text-[10px] font-black text-orange-400">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-white truncate">{pick.selection}</div>
        <div className="text-[11px] text-white/40 truncate">{pick.awayTeam.name} @ {pick.homeTeam.name} · {pick.league}</div>
        {formatGameDateTimeET(pick.startTime) && (
          <div className="text-[10px] text-white/30">{formatGameDateTimeET(pick.startTime)}</div>
        )}
      </div>
      {pick.odds && <span className={`text-sm font-black tabular-nums ${oddsTextCls}`}>{pick.odds}</span>}
    </div>
  );
}

// ─── Power 20 Component ───────────────────────────────────────────────────────

function WinProbBadge({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-emerald-500 text-black' : pct >= 70 ? 'bg-sky-500 text-white' : 'bg-white/10 text-white/60';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums ${color}`}>{pct.toFixed(0)}%</span>
  );
}

// Compute per-leg state from live scores — Power20 had no per-leg display, customer
// couldn't tell which leg killed a parlay. Now every leg shows live/final + win/loss.
function gradePower20Leg(leg: Power20Pick, liveMap: Record<string, any>): 'won' | 'lost' | 'push' | 'live' | 'pre' {
  const g = liveMap[leg.gameId];
  if (!g) return 'pre';
  if (!g.isFinal && g.isLive) return 'live';
  if (!g.isFinal) return 'pre';
  if (g.homeScore === g.awayScore) return 'push';
  if (leg.selectionSide !== 'home' && leg.selectionSide !== 'away') return 'pre';
  const ourSideWon = leg.selectionSide === 'home' ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
  return ourSideWon ? 'won' : 'lost';
}

function Power20Leg({ pick, index, live }: { pick: Power20Pick; index: number; live?: any }) {
  const oddsPos = pick.odds.startsWith('+');
  const result: 'won' | 'lost' | 'push' | 'live' | 'pre' = live ? gradePower20Leg(pick, { [pick.gameId]: live }) : 'pre';
  // Per-leg accent based on outcome — customer immediately sees which leg lost.
  let accent = 'border-white/8 bg-white/[0.02]';
  let badge: { txt: string; cls: string } | null = null;
  if (result === 'won') {
    accent = 'border-emerald-400/60 bg-emerald-500/[0.08]';
    badge = { txt: 'W', cls: 'bg-emerald-500 text-black' };
  } else if (result === 'lost') {
    accent = 'border-red-500/60 bg-red-500/[0.08]';
    badge = { txt: 'L', cls: 'bg-red-500 text-white' };
  } else if (result === 'push') {
    accent = 'border-white/15 bg-white/[0.04]';
    badge = { txt: 'PUSH', cls: 'bg-white/20 text-white/70' };
  } else if (result === 'live') {
    accent = 'border-amber-400/40 bg-amber-500/[0.05]';
    badge = { txt: 'LIVE', cls: 'bg-amber-500 text-black' };
  }
  const scoreLine = live && (live.isLive || live.isFinal)
    ? `${pick.underdogName?.split(' ').pop() || 'AWAY'} ${live.awayScore ?? 0}–${live.homeScore ?? 0}`
    : null;
  // Build a short why-we-like-it from the data we have — Power20Pick doesn't carry
  // reasonsFor, but we can synthesize one from winProbability + market + injury status.
  const whyLine = `${pick.winProbability.toFixed(0)}% implied win probability${!pick.isInjuryClear && pick.injuryNote ? ` · ${pick.injuryNote}` : ''}`;

  // Wrap in Link so every Power 20 leg is clickable to the detail view.
  return (
    <Link href={`/pick/${pick.gameId}?from=power20`} className="block">
      <div className={`flex items-center gap-3 rounded-xl border-2 p-3 transition-all hover:bg-white/[0.06] ${accent}`}>
        <div className="w-6 h-6 shrink-0 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-black text-white/40">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-xs font-bold text-white truncate">{pick.selection}</div>
            {badge && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${badge.cls}`}>{badge.txt}</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-white/30 truncate">{pick.underdogName} · {pick.league}</span>
            {!pick.isInjuryClear && (
              <span className="text-[9px] text-amber-400/70 font-bold shrink-0">⚠ INJ</span>
            )}
          </div>
          {scoreLine ? (
            <div className="text-[10px] text-white/50 truncate font-mono">{scoreLine}</div>
          ) : formatGameDateTimeET(pick.startTime) && (
            <div className="text-[10px] text-white/30 truncate">{formatGameDateTimeET(pick.startTime)}</div>
          )}
          <div className="text-[10px] text-white/40 mt-1 truncate">{whyLine}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <WinProbBadge pct={pick.winProbability} />
          <span className={`text-sm font-black tabular-nums ${oddsPos ? 'text-emerald-400' : 'text-white/60'}`}>{pick.odds}</span>
        </div>
      </div>
    </Link>
  );
}

// Given a parlay's legs and the live scoreboard, return the aggregate result:
// 'won' (every leg final + winning), 'lost' (ANY leg final + losing), 'pending' (still
// games left), 'push' (everything settled at a push). User's rule: a single losing
// leg sinks the whole parlay — no need to wait for the rest.
function gradeParlayLegs(legs: Power20Pick[], liveMap: Record<string, any>): 'won' | 'lost' | 'pending' | 'push' {
  let anyPending = false;
  let anyLost = false;
  let allPush = true;
  for (const leg of legs) {
    const g = liveMap[leg.gameId];
    if (!g || (!g.isFinal && !g.isLive)) { anyPending = true; allPush = false; continue; }
    if (!g.isFinal) { anyPending = true; allPush = false; continue; }
    if (g.homeScore === g.awayScore) continue; // tie/extras — skip for now
    // Grade the picked SIDE correctly. The leg now carries selectionSide (home/away), so we
    // check whether OUR side won — not "did anyone win" (the old bug marked every non-tie
    // game a win regardless of which team we were on). If selectionSide is missing (older
    // cached data), fall back to leaving the leg pending rather than guessing a win.
    if (leg.selectionSide !== 'home' && leg.selectionSide !== 'away') {
      anyPending = true; allPush = false; continue;
    }
    const ourSideWon = leg.selectionSide === 'home' ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
    allPush = false;
    if (!ourSideWon) anyLost = true;
  }
  if (anyLost) return 'lost';
  if (anyPending) return 'pending';
  if (allPush) return 'push';
  return 'won';
}

function Power20Section() {
  const [data, setData] = useState<Power20Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeGroup, setActiveGroup] = useState(0);
  const liveMap = useLiveScores();

  const load = async (force = false) => {
    if (force) setRefreshing(true);
    else { setData(null); setLoading(true); }
    try {
      const params = force ? '?refresh=true' : '';
      const res = await fetch(`/api/research/power20${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setData(json);
    } catch (e) {
      console.error('Power 20 fetch failed', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/8 bg-white/[0.02] p-8 flex items-center justify-center gap-3">
        <div className="h-5 w-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        <span className="text-sm text-white/40 font-semibold">Scanning all leagues for heavy favorites...</span>
      </div>
    );
  }

  if (!data || data.picks.length === 0) {
    return (
      <div className="rounded-3xl border border-white/8 bg-white/[0.02] p-8 text-center text-white/30 text-sm font-semibold">
        No heavy favorites found today. Check back once more games are scheduled.
      </div>
    );
  }

  const parlay20 = data.parlay20;
  const parlay10 = data.parlay10;
  const activeParlay = activeGroup === 0 ? parlay20 : parlay10;

  // One full 20-leg parlay + a 10-leg variant. Both are heavy chalk and dedupe against
  // the regular cards — same game is OK, same EXACT pick is not.
  return (
    <div className="space-y-8">
      {/* Meta bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="text-[10px] font-black uppercase tracking-widest text-white/30">
            {data.picks.length} favorites found · {data.totalScanned} games scanned · Avg win prob {data.avgWinProbability.toFixed(1)}%
          </div>
          {data.excludedFromRegularCards ? (
            <div className="text-[10px] text-white/20 font-semibold">
              {data.excludedFromRegularCards} excluded (already on the regular cards)
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white/30 hover:text-white/60 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> Rescan
        </button>
      </div>

      {/* Two-parlay toggle: Power 20 (moonshot) vs Power 10 (daily play) */}
      <div>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {[parlay20, parlay10].map((p, i) => {
            if (!p) return <div key={i} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-center text-xs text-white/30">Not enough chalk</div>;
            const active = activeGroup === i;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setActiveGroup(i)}
                className={`rounded-2xl border p-4 transition-all text-left ${
                  active ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-white/8 bg-white/[0.02] hover:border-white/15'
                }`}
              >
                <div className="text-[10px] font-black uppercase tracking-widest text-white/50">{p.label}</div>
                <div className={`text-2xl font-black tabular-nums mt-1 ${active ? 'text-emerald-400' : 'text-white'}`}>{p.estimatedOdds}</div>
                <div className="text-[10px] text-white/40 font-bold mt-1">{p.legCount} legs · {p.payoutOnDollar}</div>
              </button>
            );
          })}
        </div>

        {activeParlay && (() => {
          // Parlay aggregate result — user's rule: any single losing leg = whole parlay loss.
          const parlayResult = gradeParlayLegs(activeParlay.legs, liveMap);
          const containerAccent =
            parlayResult === 'won' ? 'border-emerald-400/70 bg-gradient-to-br from-emerald-500/[0.18] to-emerald-500/[0.04] shadow-[0_0_40px_-8px_rgba(16,185,129,0.5)]' :
            parlayResult === 'lost' ? 'border-red-500/80 bg-gradient-to-br from-red-500/[0.22] to-red-500/[0.04] shadow-[0_0_40px_-8px_rgba(239,68,68,0.5)]' :
            parlayResult === 'push' ? 'border-white/25 bg-white/[0.05]' :
            'border-emerald-400/30 bg-gradient-to-br from-emerald-400/[0.05] to-white/[0.02]';
          const headerColor =
            parlayResult === 'won' ? 'text-emerald-400' :
            parlayResult === 'lost' ? 'text-red-400' :
            'text-emerald-400';
          return (
            <div className={`relative overflow-hidden rounded-2xl border-2 p-5 space-y-4 ${containerAccent}`}>
              {/* BIG aggregate result watermark — user wants wins and losses very visible */}
              {parlayResult !== 'pending' && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
                  <div className={`text-8xl md:text-9xl font-black uppercase tracking-tighter ${
                    parlayResult === 'won' ? 'text-emerald-400/12' :
                    parlayResult === 'lost' ? 'text-red-500/15' :
                    'text-white/10'
                  }`}>
                    {parlayResult === 'won' ? 'WIN' : parlayResult === 'lost' ? 'LOSS' : 'PUSH'}
                  </div>
                </div>
              )}
              <div className="relative flex items-center justify-between gap-3">
                <div>
                  <div className={`text-sm font-black uppercase tracking-widest ${headerColor}`}>{activeParlay.label}</div>
                  <div className="text-[11px] text-white/40 font-semibold mt-1">
                    {activeParlay.legCount}-leg parlay · Avg win prob {activeParlay.avgWinProbability.toFixed(1)}%
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-3xl font-black tabular-nums ${headerColor}`}>{activeParlay.estimatedOdds}</div>
                  <div className="text-[11px] text-white/30 font-bold">{activeParlay.payoutOnDollar}</div>
                </div>
              </div>
              <div className="relative space-y-2">
                {activeParlay.legs.map((leg, i) => (
                  <Power20Leg key={leg.gameId + leg.selection} pick={leg} index={i} live={liveMap[leg.gameId]} />
                ))}
              </div>
              <div className="relative pt-2 border-t border-white/5 text-[10px] text-white/30 font-semibold leading-relaxed">
                All heavy favorites. None of these legs duplicate picks on your regular cards. Verify lines at your book before placing.
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function DeepResearchSection({ board }: { board: string }) {
  const [data, setData] = useState<DailyPicksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const liveMap = useLiveScores();
  // Late-news flags — fetched once on mount and refreshed every 5 min. Maps event_id →
  // human-readable note ("Late news 22:45 UTC: Player X (OUT)"). Pick cards show a
  // ⚠ badge + a warning line when a flag is present for their gameId.
  const [lateNewsFlags, setLateNewsFlags] = useState<Record<string, string>>({});
  useEffect(() => {
    const loadLate = () => {
      fetch('/api/picks/late-news', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (d?.success) setLateNewsFlags(d.flags || {}); })
        .catch(() => {});
    };
    loadLate();
    const iv = setInterval(loadLate, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);
  // Per-section stats (W-L, units, streak). Fetched from /api/records/summary, mapped to
  // each category tile so users see "Pressure Pack 12-5 (70%) +3.2u · 🔥 3W" inline.
  const [productStats, setProductStats] = useState<Record<string, TileStats>>({});

  useEffect(() => {
    const loadStats = () => {
      fetch('/api/records/summary', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (!d.success) return;
          const next: Record<string, TileStats> = {};
          for (const [k, v] of Object.entries(d.product_line_stats || {}) as Array<[string, any]>) {
            next[k] = {
              wins: v.wins || 0, losses: v.losses || 0, pushes: v.pushes || 0,
              winRate: v.winRate || '0.0%',
              units: typeof v.units === 'number' ? v.units : 0,
              streak: v.streak || { type: null, count: 0 },
            };
          }
          setProductStats(next);
        })
        .catch(() => {});
    };
    loadStats();
    // Same 60s cadence as LiveRecordBar so per-tile stats update as soon as games settle.
    const i = setInterval(loadStats, 60_000);
    return () => clearInterval(i);
  }, []);

  // Map registry product-line name → CategoryTile title. The registry uses the productLine
  // we wrote when recording the pick (see recordBoardService.ts). Keep this lookup table
  // aligned with the labels used in `<CategoryTile>` below.
  const statsFor = (productLine: string): TileStats | null => productStats[productLine] || null;

  const load = async (force = false) => {
    if (force) setRefreshing(true);
    else { setData(null); setLoading(true); }
    try {
      const params = new URLSearchParams({ board });
      if (force) params.set('refresh', 'true');
      const res = await fetch(`/api/research/daily-picks?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) return;
      // Cross-board asleep: on the main board, the Asleep Picks section should pull from
      // EVERY board's asleep-flagged picks too (tennis, MMA, cricket, AFL, MLS, Liga MX
      // etc.) — per user, "asleep is stuff people aren't even thinking about." Fetch the
      // other boards in parallel and merge their picks into asleepPicks for the main view.
      if (board === 'north-american') {
        const otherBoards = ['soccer', 'tennis', 'combat', 'global'];
        const otherResults = await Promise.allSettled(
          otherBoards.map((b) => fetch(`/api/research/daily-picks?board=${b}`, { cache: 'no-store' }).then((r) => r.json()))
        );
        const crossBoardAsleep: any[] = [];
        for (const r of otherResults) {
          if (r.status !== 'fulfilled' || !r.value?.success) continue;
          // Pull EVERY non-NA pick into asleep — these whole boards ARE asleep markets.
          // Tennis, MMA, cricket, AFL, second-tier soccer — the user's "nobody's thinking
          // about it" stuff.
          const picks = [r.value.grandSlam, ...(r.value.pressurePack || []), ...(r.value.vip4Pack || []), ...(r.value.parlayPlan || []), ...(r.value.asleepPicks || [])]
            .filter(Boolean);
          crossBoardAsleep.push(...picks);
        }
        // Merge with the NA board's own asleep picks, dedupe by gameId, cap at 12.
        const existing = new Set((json.asleepPicks || []).map((p: any) => p?.gameId));
        for (const p of crossBoardAsleep) {
          if (!p?.gameId || existing.has(p.gameId)) continue;
          existing.add(p.gameId);
          (json.asleepPicks ||= []).push(p);
        }
        json.asleepPicks = (json.asleepPicks || [])
          .sort((a: any, b: any) => (b?.confidenceScore || 0) - (a?.confidenceScore || 0))
          .slice(0, 12);
      }
      setData(json);
    } catch (e) {
      console.error('Deep research fetch failed', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // Keep up with the world: re-run the research every 2 minutes so picks reflect
    // live odds, lineup, and injury changes right up until game time.
    const interval = setInterval(() => load(true), 120000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/8 bg-white/[0.02] p-8 flex items-center justify-center gap-3">
        <div className="h-5 w-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        <span className="text-sm text-white/40 font-semibold">Running deep research across all leagues...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-300/60 font-semibold">
        Research scan unavailable. Check back shortly.
      </div>
    );
  }

  const hasPicks = data.grandSlam || data.pressurePack.length > 0 || data.vip4Pack.length > 0 || data.parlayPlan.length > 0;
  const flatPicks = [data.grandSlam, ...data.pressurePack, ...data.vip4Pack, ...data.parlayPlan].filter((p): p is DeepPick => Boolean(p));

  return (
    <div className="space-y-6">
      {/* Per-league line-update window. House rule: each league's lines can move up
          to 15 min before THAT league's first game. NFL locks when first NFL game
          starts, NBA locks when first NBA game tips, etc. — independent per sport. */}
      <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.05] px-3 py-2">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300/90 leading-snug">
          Lines update up to 15 min before each league's first game (per-sport). NFL locks at first NFL game, NBA at first NBA game, etc.
        </p>
      </div>
      {/* Meta bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-widest text-white/30">
          Updated {formatUpdatedET(data.generatedAt)}{refreshing ? ' · refreshing…' : ''}
        </div>
        <button type="button" onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white/30 hover:text-white/60 transition-colors disabled:opacity-40">
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Main board layout:
          1. 3 BIG HERO TILES — Grand Slam, Pressure Pack, VIP 4-Pack (the flagship straights)
          2. Secondary row — Personal Pick + $10 Parlay Plan (still prominent)
          3. Footer link strip — everything else (Big Games, NRFI, Value, Edges, Tendencies, Asleep, Period Plays)
          Each tile/link routes to its own dedicated page so every section has room to breathe. */}
      {board === 'north-american' ? (
        <div className="space-y-6">
          {/* 1. HERO TILES — the 3 flagship straights products */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <HeroTile href="/grand-slam" icon={Crown} title="Grand Slam" subtitle="1 single pick" count={data.grandSlam ? 1 : 0} unit="pick" accent="emerald" restingLabel="Resting today" stats={statsFor('Grand Slam')} showStreak />
            <HeroTile href="/pressure-pack" icon={Flame} title="Pressure Pack" subtitle="2 picks" count={data.pressurePack.length} unit="pick" accent="amber" stats={statsFor('Pressure Pack')} />
            <HeroTile href="/vip-picks" icon={ShieldCheck} title="VIP 4-Pack" subtitle="4 picks" count={data.vip4Pack.length} unit="pick" accent="sky" stats={statsFor('VIP 4-Pack')} />
          </div>

          {/* HOW TO BET — the flagship products are STRAIGHTS (single bets). Tell customers not
              to parlay them; the $10 Parlay Plan is the only parlay product. */}
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-3">
            <p className="text-xs md:text-sm leading-relaxed text-white/75">
              <span className="font-black uppercase tracking-wide text-amber-300">Bet the Grand Slam, Pressure Pack &amp; VIP as straights</span> — single bets, one ticket each.{" "}
              <span className="font-black text-white">Don&apos;t parlay them.</span> Every play is priced to win on its own; combining them into a parlay just stacks the juice against you. The{" "}
              <Link href="/parlay-plan" className="font-black text-primary hover:underline">$10 Parlay Plan</Link>{" "}is the only product built for parlays.
            </p>
          </div>

          {/* 2. SECONDARY ROW — Sport Parlays + Parlay Plan (swapped with Personal Pick per owner) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CategoryTile href="/sport-parlays" icon={Layers} title="Sport Parlays" count={(data as any).sportParlays?.length ?? 0} unit="parlay" restingLabel="Built across tonight's full slate" stats={statsFor('Sport Parlays')} />
            <CategoryTile href="/parlay-plan" icon={DollarSign} title="$10 Parlay Plan" count={data.parlayPlan.length} unit="leg" restingLabel="Not enough legs today" stats={statsFor('Parlay Center')} />
          </div>

          {/* 3. FOOTER LINK STRIP — only products that actually have content tonight.
              Empty/dead products (Value Plays, Period Plays, Big Games when no playoffs,
              Trends) are hidden when count is 0 — no more "click for nothing" tiles. */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-3 pl-1">More on tonight's board</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              <FooterLink href="/himothy-picks" icon={Crown} title="HIMOTHY Personal Pick" count={1} />
              {(data.marquee?.length ?? 0) > 0 && (
                <FooterLink href="/big-games" icon={Trophy} title="Big Games" count={data.marquee?.length ?? 0} />
              )}
              {(data.nrfi?.length ?? 0) > 0 && (
                <FooterLink href="/nrfi" icon={Radio} title="NRFI" count={data.nrfi?.length ?? 0} />
              )}
              {(data.valuePlays?.length ?? 0) > 0 && (
                <FooterLink href="/value" icon={Target} title="Value Plays" count={data.valuePlays?.length ?? 0} />
              )}
              {(data.asleepPicks?.length ?? 0) > 0 && (
                <FooterLink href="/asleep" icon={Flame} title="Sleeper Picks" count={data.asleepPicks?.length ?? 0} />
              )}
              <FooterLink href="/stats" icon={Trophy} title="Full Record" count={null} />
            </div>
          </div>
        </div>
      ) : hasPicks ? (
        /* Soccer / Tennis / Overseas — flat "Picks We Like" (no product tiers) */
        <section>
          <div className="mb-4 flex items-center gap-3">
            <Target className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-black uppercase tracking-widest text-primary">Picks We Like</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {flatPicks.map((pick) => (
              <DeepPickCard key={pick.gameId} pick={pick} variant="vip" href={`/pick/${pick.gameId}?board=${board}&from=/picks?board=${board}`} live={computeLiveState(pick, liveMap[pick.gameId])} lateNewsNote={lateNewsFlags[pick.gameId] || null} />
            ))}
          </div>
        </section>
      ) : (data.outrights && data.outrights.length > 0) ? (
        /* Individual (golf) / Racing — show outright tournament contenders */
        <OutrightTournaments tournaments={data.outrights} />
      ) : (
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-8 text-center space-y-2">
          <div className="text-white/50 text-sm font-bold">
            {(data as any)?.emptyReason || 'No picks on this board today.'}
          </div>
          <div className="text-white/30 text-xs">
            We only ship when the data is there. Check back once more games are scheduled.
          </div>
        </div>
      )}
    </div>
  );
}

// Category tile for the Today's board — shows the count and links into that category's
// page (where the picks live). Keeps the hub from showing every pick wide open, and is
// the unit that gets locked per-subscription later.
interface TileStats {
  wins: number; losses: number; pushes: number;
  winRate: string;
  units: number;
  streak: { type: 'W' | 'L' | null; count: number };
}

// HERO TILE — used for the 3 flagship straights (Grand Slam, Pressure Pack, VIP 4-Pack).
// Bigger padding, larger title, gradient accent, prominent stats. Distinct from the
// secondary CategoryTile so the flagship products dominate the page.
function HeroTile({ href, icon: Icon, title, subtitle, count, unit, restingLabel, stats, accent, showStreak }: {
  href: string; icon: any; title: string; subtitle: string;
  count: number; unit: string; restingLabel?: string; stats?: TileStats | null;
  accent: 'emerald' | 'amber' | 'sky' | 'primary';
  showStreak?: boolean;  // streaks only render where this is true — per user, Grand Slam only
}) {
  const has = count > 0;
  const hasStats = stats && (stats.wins + stats.losses) > 0;
  const accentMap: Record<typeof accent, string> = {
    emerald: 'border-emerald-400/30 bg-gradient-to-br from-emerald-500/[0.08] to-transparent hover:border-emerald-400/60 hover:shadow-[0_25px_60px_-15px_rgba(16,185,129,0.4)]',
    amber:   'border-amber-400/30 bg-gradient-to-br from-amber-500/[0.08] to-transparent hover:border-amber-400/60 hover:shadow-[0_25px_60px_-15px_rgba(245,158,11,0.4)]',
    sky:     'border-sky-400/30 bg-gradient-to-br from-sky-500/[0.08] to-transparent hover:border-sky-400/60 hover:shadow-[0_25px_60px_-15px_rgba(56,189,248,0.4)]',
    primary: 'border-primary/30 bg-gradient-to-br from-primary/[0.08] to-transparent hover:border-primary/60 hover:shadow-[0_25px_60px_-15px_rgba(212,168,67,0.4)]',
  };
  const iconColor: Record<typeof accent, string> = {
    emerald: 'text-emerald-400', amber: 'text-amber-400', sky: 'text-sky-400', primary: 'text-primary',
  };
  return (
    <Link href={href} className={`group relative overflow-hidden rounded-3xl border-2 ${accentMap[accent]} p-6 md:p-7 transition-all flex flex-col gap-4 min-h-[180px]`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`shrink-0 rounded-2xl bg-white/5 p-3 ${iconColor[accent]}`}><Icon className="h-7 w-7" /></div>
        <span className="text-xl font-black text-white/30 group-hover:text-white/70 transition-colors">→</span>
      </div>
      <div>
        <div className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white leading-tight">{title}</div>
        <div className="text-[11px] font-black uppercase tracking-widest text-white/40 mt-1">{subtitle}</div>
      </div>
      <div className="mt-auto">
        {has ? (
          <div className="text-base font-black text-emerald-400">{count} {unit}{count > 1 ? 's' : ''} today</div>
        ) : (
          <div className="text-base font-bold text-white/30">{restingLabel || 'None today'}</div>
        )}
        {hasStats && (
          <div className="flex items-center gap-2 mt-2 text-xs font-black tabular-nums">
            <span className="text-white/50">{stats!.wins}-{stats!.losses}{stats!.pushes > 0 ? `-${stats!.pushes}` : ''}</span>
            <span className="text-white/25">·</span>
            <span className="text-white/50">{stats!.winRate}</span>
            <span className="text-white/25">·</span>
            <span className={stats!.units >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {stats!.units >= 0 ? '+' : ''}{stats!.units.toFixed(1)}u
            </span>
            {showStreak && stats!.streak.type && stats!.streak.count >= 2 && (
              <>
                <span className="text-white/25">·</span>
                <span className={stats!.streak.type === 'W' ? 'text-emerald-400 inline-flex items-center gap-0.5' : 'text-red-400 inline-flex items-center gap-0.5'}>
                  {stats!.streak.type === 'W' ? '🔥' : '🥶'} {stats!.streak.count}{stats!.streak.type}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

// FOOTER LINK — compact pill for secondary tools / data pages.
function FooterLink({ href, icon: Icon, title, count }: { href: string; icon: any; title: string; count: number | null }) {
  return (
    <Link href={href} className="group flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 hover:border-white/20 hover:bg-white/[0.05] transition-all">
      <Icon className="h-3.5 w-3.5 shrink-0 text-white/40 group-hover:text-white/70 transition-colors" />
      <span className="text-xs font-black uppercase tracking-wider text-white/60 group-hover:text-white truncate flex-1 transition-colors">{title}</span>
      {count != null && count > 0 && (
        <span className="text-[10px] font-black tabular-nums text-emerald-400 shrink-0">{count}</span>
      )}
    </Link>
  );
}

function CategoryTile({ href, icon: Icon, title, count, unit, restingLabel, stats }: { href: string; icon: any; title: string; count: number; unit: string; restingLabel?: string; stats?: TileStats | null }) {
  const has = count > 0;
  const hasStats = stats && (stats.wins + stats.losses) > 0;
  return (
    <Link href={href} className="group flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all hover:border-primary/50">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="shrink-0 rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black uppercase tracking-tight text-white truncate">{title}</div>
          <div className="text-[11px] font-bold mt-0.5">
            {has ? <span className="text-emerald-400">{count} {unit}{count > 1 ? 's' : ''} today</span> : <span className="text-white/30">{restingLabel || 'None today'}</span>}
          </div>
          {hasStats && (
            <div className="flex items-center gap-2 mt-1.5 text-[10px] font-black tabular-nums">
              <span className="text-white/40">{stats!.wins}-{stats!.losses}{stats!.pushes > 0 ? `-${stats!.pushes}` : ''}</span>
              <span className="text-white/30">·</span>
              <span className="text-white/40">{stats!.winRate}</span>
              <span className="text-white/30">·</span>
              <span className={stats!.units >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}>
                {stats!.units >= 0 ? '+' : ''}{stats!.units.toFixed(1)}u
              </span>
              {/* Streaks intentionally NOT shown here — per user, only Grand Slam shows a streak. */}
            </div>
          )}
        </div>
      </div>
      <span className="shrink-0 text-lg font-black text-primary/50 group-hover:text-primary transition-colors">→</span>
    </Link>
  );
}

interface BoardPick {
  id: string;
  eventName: string;
  awayTeam: string;
  homeTeam: string;
  league: string;
  sport: string;
  startTime: string | null;
  marketType: string;
  selection: string;
  line: string | null;
  odds: string | null;
  sportsbook: string | null;
  reasoning: string | null;
  status: string;
  productType: string;
  sectionType: string;
  groupId: string | null;
  parentProductId: string | null;
  isMainPick: boolean;
  isParlay: boolean;
  displayPriority: number;
}

interface GroupedProduct {
  productId: string;
  productType: string;
  productLabel: string;
  status: string;
  picks: BoardPick[];
}

interface ParlayProduct {
  parlayId: string;
  parlayName: string;
  productLabel: string;
  legs: BoardPick[];
  totalOdds: string | null;
  riskTier: string;
  status: string;
}

interface StructuredBoardResponse {
  success: boolean;
  source: string;
  board: string;
  boardLabel: string;
  boardOptions?: Array<{ key: string; label: string }>;
  boardDate: string;
  sections: {
    mainPick: BoardPick | null;
    corePicks: BoardPick[];
    groupedProducts: GroupedProduct[];
    parlayProducts: ParlayProduct[];
  };
  counts: {
    officialStraightPicks: number;
    officialGroupedProducts: number;
    parlays: number;
    totalUniquePicks: number;
  };
}

function formatStartTime(value: string | null) {
  return formatGameDateTimeET(value) || TIME_TBD;
}

function statusConfig(value: string) {
  const s = value.toLowerCase();
  if (s === "win") return { label: "WIN", icon: CheckCircle2, cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" };
  if (s === "loss") return { label: "LOSS", icon: XCircle, cls: "bg-red-500/20 text-red-400 border-red-500/30" };
  if (s === "live") return { label: "LIVE", icon: Radio, cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" };
  if (s === "push") return { label: "PUSH", icon: AlertCircle, cls: "bg-slate-500/20 text-slate-400 border-slate-500/30" };
  return { label: "PENDING", icon: Clock, cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
}

function oddsColor(odds: string | null) {
  if (!odds) return "text-slate-400";
  const n = Number.parseInt(odds.replace(/[^0-9-+]/g, ""), 10);
  if (n > 0) return "text-emerald-400";
  return "text-sky-400";
}

const SPORTSBOOK_LINKS: Record<string, string> = {
  DraftKings: "https://www.draftkings.com",
  FanDuel: "https://www.fanduel.com",
  BetMGM: "https://www.betmgm.com",
  Caesars: "https://www.caesarssportsbook.com",
  "Hard Rock": "https://www.hardrock.bet",
  ESPN: "https://www.espnbet.com",
};

function BookLink({ book }: { book: string | null }) {
  if (!book) return <span className="text-slate-500 text-xs">Book TBD</span>;
  const url = Object.entries(SPORTSBOOK_LINKS).find(([k]) => book.toLowerCase().includes(k.toLowerCase()))?.[1];
  if (!url) return <span className="text-slate-400 text-xs font-semibold">{book}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
    >
      {book} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function MainPickCard({ pick }: { pick: BoardPick }) {
  const sc = statusConfig(pick.status);
  const StatusIcon = sc.icon;
  // Big, unmissable result — same treatment as every other single bet. Once graded the whole
  // card lights up green (won) / red (lost) with a giant watermark behind the content.
  const s = (pick.status || "").toLowerCase();
  const graded = s === "win" || s === "loss";
  const cardAccent =
    s === "win" ? "border-emerald-400/70 bg-gradient-to-br from-emerald-950/70 via-emerald-900/30 to-slate-900 shadow-[0_0_46px_-10px_rgba(16,185,129,0.55)]" :
    s === "loss" ? "border-red-500/80 bg-gradient-to-br from-red-950/70 via-red-900/30 to-slate-900 shadow-[0_0_46px_-10px_rgba(239,68,68,0.55)]" :
    "border-amber-500/30 bg-gradient-to-br from-amber-950/60 via-amber-900/30 to-slate-900 shadow-xl";
  return (
    <Link href={`/pick-by-id/${pick.id}`} className="block">
    <article className={`relative overflow-hidden rounded-3xl border p-6 md:p-8 ${cardAccent} hover:border-amber-400/60 transition-all`}>
      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />
      {graded && (
        <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center select-none">
          <div className={`text-8xl md:text-9xl font-black uppercase tracking-tighter ${s === "win" ? "text-emerald-400/[0.10]" : "text-red-500/[0.12]"}`}>
            {s === "win" ? "WON" : "LOST"}
          </div>
        </div>
      )}

      <div className="relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-400" />
            <span className="text-xs font-black uppercase tracking-widest text-amber-400">Main Pick</span>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wider ${sc.cls}`}>
            <StatusIcon className="h-3 w-3" /> {sc.label}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-sm font-bold text-white/50 uppercase tracking-wider">
              {pick.awayTeam} vs {pick.homeTeam}
            </div>
            <div className="mt-2 text-3xl font-black text-white md:text-4xl">{pick.selection}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/50">
              <span className="rounded-full bg-white/5 px-2 py-0.5 font-semibold">{pick.league || pick.sport}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatStartTime(pick.startTime)}</span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 font-semibold">{pick.marketType}</span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {pick.odds && (
              <div className={`rounded-2xl border border-current/20 bg-current/10 px-5 py-3 text-4xl font-black tabular-nums ${oddsColor(pick.odds)}`}>
                {pick.odds}
              </div>
            )}
            {pick.line && (
              <div className="rounded-xl bg-white/5 px-3 py-1.5 text-lg font-black text-white/70">
                Line: {pick.line}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <BookLink book={pick.sportsbook} />
        </div>

        {pick.reasoning && pick.reasoning !== "Live board fallback candidate. Official board appears after publish." && (
          <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-amber-400/60 mb-1">Analysis</div>
            <p className="text-sm font-medium text-white/70 leading-relaxed">{pick.reasoning}</p>
          </div>
        )}
      </div>
    </article>
    </Link>
  );
}

function PickCard({ pick }: { pick: BoardPick }) {
  const sc = statusConfig(pick.status);
  const StatusIcon = sc.icon;
  return (
    <Link href={`/pick-by-id/${pick.id}`} className="block">
    <article className="flex flex-col rounded-2xl border border-white/8 bg-white/[0.03] p-5 gap-4 hover:border-white/15 hover:bg-white/[0.05] transition-all">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
            {pick.league || pick.sport}
          </div>
          <div className="mt-1 text-xs font-bold text-white/60">
            {pick.awayTeam} vs {pick.homeTeam}
          </div>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${sc.cls}`}>
          <StatusIcon className="h-2.5 w-2.5" /> {sc.label}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="text-xl font-black text-white leading-tight">{pick.selection}</div>
        {pick.odds && (
          <div className={`shrink-0 rounded-xl border border-current/20 bg-current/10 px-3 py-1.5 text-xl font-black tabular-nums ${oddsColor(pick.odds)}`}>
            {pick.odds}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-white/40 border-t border-white/5 pt-3">
        <span className="font-semibold">{pick.marketType}</span>
        {pick.line && <span>· Line {pick.line}</span>}
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatStartTime(pick.startTime)}</span>
        <span className="ml-auto"><BookLink book={pick.sportsbook} /></span>
      </div>

      {pick.reasoning && pick.reasoning !== "Live board fallback candidate. Official board appears after publish." && (
        <p className="text-xs text-white/40 leading-relaxed border-t border-white/5 pt-3">{pick.reasoning}</p>
      )}
    </article>
    </Link>
  );
}

function CompactPickRow({ pick, index }: { pick: BoardPick; index: number }) {
  const sc = statusConfig(pick.status);
  const StatusIcon = sc.icon;
  return (
    <Link href={`/pick-by-id/${pick.id}`} className="block">
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-all">
      <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-black text-white/40 shrink-0">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-white truncate">{pick.awayTeam} vs {pick.homeTeam}</div>
        <div className="text-[11px] text-white/50 font-semibold">{pick.selection} · {pick.marketType}</div>
        {formatGameDateTimeET(pick.startTime) && (
          <div className="text-[10px] text-white/30 truncate">{formatGameDateTimeET(pick.startTime)}</div>
        )}
      </div>
      {pick.odds && (
        <div className={`shrink-0 rounded-lg px-2 py-1 text-sm font-black tabular-nums ${oddsColor(pick.odds)}`}>
          {pick.odds}
        </div>
      )}
      <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${sc.cls}`}>
        <StatusIcon className="h-2.5 w-2.5" /> {sc.label}
      </span>
    </div>
    </Link>
  );
}

function ParlayCard({ parlay }: { parlay: ParlayProduct }) {
  const sc = statusConfig(parlay.status);
  const StatusIcon = sc.icon;
  const riskColor =
    parlay.riskTier === "High" ? "text-red-400 border-red-500/30 bg-red-500/10" :
    parlay.riskTier === "Medium" ? "text-amber-400 border-amber-500/30 bg-amber-500/10" :
    "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-base font-black text-white">{parlay.parlayName}</h3>
        <div className="flex items-center gap-2 text-xs">
          <span className={`rounded-full border px-2 py-0.5 font-black uppercase text-[10px] ${riskColor}`}>
            {parlay.riskTier} Risk
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${sc.cls}`}>
            <StatusIcon className="h-2.5 w-2.5" /> {sc.label}
          </span>
          {parlay.totalOdds && (
            <span className={`rounded-xl border border-current/20 bg-current/10 px-3 py-1 text-base font-black tabular-nums ${oddsColor(parlay.totalOdds)}`}>
              {parlay.totalOdds}
            </span>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {parlay.legs.map((leg, i) => (
          <CompactPickRow key={leg.id} pick={leg} index={i} />
        ))}
      </div>
    </article>
  );
}

function isLiveSlateFallback(source: string | undefined) {
  return source?.includes("live-slate") || source?.includes("fallback");
}

function PicksHubPageClient() {
  const searchParamsRef = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const [selectedBoard, setSelectedBoard] = useState(() => {
    if (typeof window === "undefined") return "north-american";
    return (new URLSearchParams(window.location.search).get("board") || "north-american").toLowerCase();
  });

  const [board, setBoard] = useState<StructuredBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchBoard = async () => {
      try {
        const res = await fetch(`/api/board/structured?board=${encodeURIComponent(selectedBoard)}`, { cache: "no-store" });
        const json = (await res.json()) as StructuredBoardResponse;
        if (mounted && json.success) setBoard(json);
      } catch (error) {
        console.error("Structured board fetch failed", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchBoard();
    const interval = setInterval(fetchBoard, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, [selectedBoard]);

  const counts = board?.counts || { officialStraightPicks: 0, officialGroupedProducts: 0, parlays: 0, totalUniquePicks: 0 };
  const mainPick = board?.sections.mainPick || null;
  const corePicks = board?.sections.corePicks || [];
  const groupedProducts = board?.sections.groupedProducts || [];
  const parlayProducts = board?.sections.parlayProducts || [];
  const isFallback = isLiveSlateFallback(board?.source);
  const hasOfficialPicks = !isFallback && counts.totalUniquePicks > 0;

  const isPower20 = selectedBoard === 'power20';

  const boardOptions = [
    ...(board?.boardOptions || [
      { key: "north-american", label: "HIMOTHY Board" },
      { key: "soccer", label: "Soccer" },
      { key: "tennis", label: "Tennis" },
      { key: "combat", label: "UFC / Boxing" },
      { key: "individual", label: "Golf" },
      { key: "racing", label: "Racing" },
      { key: "global", label: "Global" },
    ]),
    { key: "power20", label: "⚡ Power 20" },
  ];

  return (
    <div className="min-h-screen bg-background text-white pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-background/70 backdrop-blur-xl px-4 py-4 md:px-8">
        <div className="mx-auto max-w-7xl flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <Image src="/logo-badge.png" alt="HIMOTHY PLAYS AND PARLAYS" width={36} height={36} className="rounded-full border border-primary/40" />
            <span className="hidden sm:block text-sm font-black uppercase tracking-tight leading-none">HIMOTHY <span className="text-primary italic">Plays &amp; Parlays</span></span>
          </Link>
          <div className="flex items-center gap-4 md:gap-6">
            <Link href="/live-sports-board" className="text-xs font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
              Live Scores
            </Link>
            <Link href="/results" className="text-xs font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
              Results
            </Link>
          </div>
        </div>
      </header>

      {/* Live record bar — visible to all customers */}
      <LiveRecordBar />

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">

        {/* Board selector */}
        <div className="mb-8">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-3">Select Board</div>
          <nav className="flex flex-wrap gap-2">
            {boardOptions.map((option) => {
              const active = selectedBoard === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    setSelectedBoard(option.key);
                    setBoard(null);
                    setLoading(true);
                    window.history.replaceState(null, "", `/picks?board=${option.key}`);
                  }}
                  className={`rounded-full border px-5 py-2 text-xs font-black uppercase tracking-wider transition-all ${
                    active
                      ? "border-white bg-white text-black"
                      : "border-white/10 bg-white/[0.03] text-white/50 hover:border-white/30 hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Power 20 view */}
        {isPower20 && (
          <section>
            <div className="mb-6 flex items-center gap-3">
              <Zap className="h-5 w-5 text-emerald-400" />
              <div>
                <h2 className="text-sm font-black uppercase tracking-widest text-white">Power 20 — Heavy Favorites</h2>
                <p className="text-[10px] text-white/30 font-semibold mt-0.5">
                  Top 20 highest win-probability favorites · grouped into 4 mini-parlays · all sports all leagues
                </p>
              </div>
            </div>
            <Power20Section />
          </section>
        )}

        {/* Standard board view */}
        {!isPower20 && (
          <>
        {/* Board notice */}
        {!loading && isFallback && (
          <div className="mb-8 flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
            <Zap className="h-5 w-5 shrink-0 text-primary mt-0.5" />
            <div>
              <div className="text-sm font-black text-primary">Today's HIMOTHY Board</div>
              <p className="mt-1 text-xs text-white/50 leading-relaxed">
                Today's plays — the Grand Slam, Pressure Pack, VIP 4-Pack, and $10 Parlay Plan below. Every play comes with the reason we like it.
              </p>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
              <span className="text-sm font-semibold text-white/40">Loading board...</span>
            </div>
          </div>
        )}

        {!loading && (
          <main className="space-y-10">

            {/* 1. Main Pick — always first when it exists */}
            {selectedBoard === "north-american" && mainPick && (
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Crown className="h-5 w-5 text-amber-400" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Main Pick</h2>
                </div>
                <MainPickCard pick={mainPick} />
              </section>
            )}

            {/* 2. Core Picks / Research Picks */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-white/50" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-white/60">
                    Today's Picks
                  </h2>
                </div>
                {hasOfficialPicks && <span className="text-xs text-white/30 font-semibold">{corePicks.length} picks</span>}
              </div>

              {/* Always use the live-engine view — it's the frozen-slate-for-the-day
                  source of truth. The registry-backed view fell out of sync because the
                  morning cron recorded picks BEFORE the engine fixes shipped today. */}
              <DeepResearchSection board={selectedBoard} />
            </section>

            {/* 3. Grouped Products (VIP / Pressure) — only show if the registry has more
                detailed groupings than what DeepResearchSection already renders. Disabled
                for now so we don't double-render or show stale registry counts. */}
            {false && groupedProducts.length > 0 && (
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Layers className="h-5 w-5 text-white/50" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Packages</h2>
                </div>
                <div className="space-y-5">
                  {groupedProducts.map((product) => (
                    <article key={product.productId} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-base font-black text-white">{product.productLabel}</h3>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-white/50">
                          {product.picks.length} picks
                        </span>
                      </div>
                      <div className="space-y-2">
                        {product.picks.map((pick, i) => (
                          <CompactPickRow key={pick.id} pick={pick} index={i} />
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* 4. Parlays */}
            {false && parlayProducts.length > 0 && (
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-white/50" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Parlays</h2>
                </div>
                <div className="space-y-4">
                  {parlayProducts.map((parlay) => (
                    <ParlayCard key={parlay.parlayId} parlay={parlay} />
                  ))}
                </div>
              </section>
            )}

            {/* History links */}
            <section>
              <div className="mb-4 flex items-center gap-2">
                <History className="h-5 w-5 text-white/50" />
                <h2 className="text-sm font-black uppercase tracking-widest text-white/60">History</h2>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {[
                  { href: "/results", label: "Results Ledger", desc: "Full win/loss record" },
                  { href: "/results-history", label: "Pick History", desc: "Every pick ever published" },
                  { href: "/results-archive", label: "Archive", desc: "Historical results by date" },
                ].map(({ href, label, desc }) => (
                  <Link
                    key={href}
                    href={href}
                    className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 hover:border-white/20 hover:bg-white/[0.05] transition-all group"
                  >
                    <div className="text-sm font-black text-white group-hover:text-primary transition-colors">{label}</div>
                    <div className="mt-1 text-xs text-white/30 font-medium">{desc}</div>
                  </Link>
                ))}
              </div>
            </section>

          </main>
        )}

        {/* Footer meta */}
        {!loading && (
          <div className="mt-10 flex flex-wrap items-center gap-4 text-[10px] font-semibold uppercase tracking-widest text-white/20">
            <span className="flex items-center gap-1.5"><Timer className="h-3 w-3" /> {board?.source || "—"}</span>
            <span className="flex items-center gap-1.5"><TrendingUp className="h-3 w-3" /> Board: {board?.boardDate || "—"}</span>
            <span className="flex items-center gap-1.5"><Zap className="h-3 w-3" /> Auto-refresh 30s</span>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

export default function PicksHubPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <span className="text-sm font-semibold text-white/40">Loading board...</span>
        </div>
      </div>
    }>
      <PicksHubPageClient />
    </Suspense>
  );
}
