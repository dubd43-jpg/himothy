"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLiveScores } from "@/components/useLiveScores";
import { computeLiveState, type LivePickState } from "@/lib/livePickStatus";
import { OutrightTournaments } from "@/components/OutrightTournaments";
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
  selection: string; odds: string;
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

function LiveRecordBar() {
  const [stats, setStats] = useState<{ today: RecordStats; last7Days: RecordStats; allTime: RecordStats } | null>(null);

  useEffect(() => {
    fetch('/api/records/summary', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d.success && d.stats) setStats(d.stats); })
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const at = stats.allTime;
  const l7 = stats.last7Days;
  const hasRecord = (at.wins + at.losses) > 0;
  if (!hasRecord) return null;

  const unitStr = (u: number) => `${u >= 0 ? '+' : ''}${u.toFixed(1)}u`;

  return (
    <div className="border-b border-white/5 bg-emerald-950/20 px-4 py-2.5">
      <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <div className="flex items-center gap-1.5">
          <Trophy className="h-3 w-3 text-emerald-400 shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Official Record</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[10px] font-black tabular-nums">
          <span className="text-white/50">
            All-Time <span className="text-white">{at.wins}-{at.losses}{at.pushes > 0 ? `-${at.pushes}` : ''}</span>
            <span className="text-emerald-400/70 ml-1">{at.winPercentage}</span>
            <span className="text-white/30 ml-1">{unitStr(at.units)}</span>
          </span>
          <span className="text-white/50 hidden sm:inline">
            Last 7 <span className="text-white">{l7.wins}-{l7.losses}</span>
            <span className="text-emerald-400/70 ml-1">{l7.winPercentage}</span>
          </span>
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
function DeepPickCard({ pick, variant, href, live }: { pick: DeepPick; variant: 'grand-slam' | 'pressure' | 'vip' | 'parlay'; href?: string; live?: LivePickState | null }) {
  const startTime = pick.startTime ? new Date(pick.startTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'TBD';
  const accent = variant === 'grand-slam'
    ? 'border-primary/40 bg-gradient-to-br from-primary/[0.08] to-transparent'
    : 'border-white/10 bg-white/[0.03]';
  const showLive = !!live && live.state !== 'pre';
  const liveClockStr = live ? [live.period, live.clock && live.clock !== '0:00' ? live.clock : null].filter(Boolean).join(' · ') : '';
  // Fallback when the live-scoreboard feed has no match for this gameId (common on
  // soccer/tennis/MMA where /api/scores/live only polls the big-4 leagues). If startTime
  // is in the past and we have no live data, display "In Progress" instead of frozen
  // text like "3 PM" — that's what users reported as "stuck on old time."
  const startMs = pick.startTime ? new Date(pick.startTime).getTime() : null;
  const isPastStart = startMs != null && Date.now() > startMs;
  const shouldShowInProgress = !showLive && isPastStart;

  const inner = (
    <article className={`group relative overflow-hidden rounded-2xl border ${accent} p-5 transition-all ${href ? 'hover:border-primary/50' : ''}`}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-widest text-white/30">
          <span className="truncate">{pick.league} · {pick.awayTeam.name} @ {pick.homeTeam.name}</span>
          <span className="shrink-0">
            {showLive
              ? live!.state === 'live'
                ? <span className="inline-flex items-center gap-1 text-red-400"><span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> Live</span>
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
        {pick.sharpFlags && pick.sharpFlags.length > 0 && <SharpSignalBadges flags={pick.sharpFlags} />}
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


function CompactParlayLeg({ pick, index }: { pick: DeepPick; index: number }) {
  const oddsTextCls = pick.odds && pick.odds.startsWith('+') ? 'text-emerald-400' : 'text-sky-400';
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <div className="w-5 h-5 shrink-0 rounded-full bg-orange-500/20 flex items-center justify-center text-[10px] font-black text-orange-400">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-white truncate">{pick.selection}</div>
        <div className="text-[11px] text-white/40">{pick.awayTeam.name} @ {pick.homeTeam.name} · {pick.league}</div>
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

function Power20Leg({ pick, index }: { pick: Power20Pick; index: number }) {
  const oddsPos = pick.odds.startsWith('+');
  const mktColor = pick.marketType === 'runline' ? 'text-amber-400' : pick.marketType === 'spread' ? 'text-sky-400' : 'text-white/60';
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-all">
      <div className="w-6 h-6 shrink-0 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-black text-white/40">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-white truncate">{pick.selection}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-white/30 truncate">{pick.underdogName} · {pick.league}</span>
          {!pick.isInjuryClear && (
            <span className="text-[9px] text-amber-400/70 font-bold shrink-0">⚠ INJ</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <WinProbBadge pct={pick.winProbability} />
        <span className={`text-sm font-black tabular-nums ${oddsPos ? 'text-emerald-400' : 'text-white/60'}`}>{pick.odds}</span>
      </div>
    </div>
  );
}

function Power20Section() {
  const [data, setData] = useState<Power20Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeGroup, setActiveGroup] = useState(0);

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

        {activeParlay && (
          <div className="rounded-2xl border-2 border-emerald-400/30 bg-gradient-to-br from-emerald-400/[0.05] to-white/[0.02] p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black uppercase tracking-widest text-emerald-400">{activeParlay.label}</div>
                <div className="text-[11px] text-white/40 font-semibold mt-1">
                  {activeParlay.legCount}-leg parlay · Avg win prob {activeParlay.avgWinProbability.toFixed(1)}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-black text-emerald-400 tabular-nums">{activeParlay.estimatedOdds}</div>
                <div className="text-[11px] text-white/30 font-bold">{activeParlay.payoutOnDollar}</div>
              </div>
            </div>
            <div className="space-y-2">
              {activeParlay.legs.map((leg, i) => (
                <Power20Leg key={leg.gameId + leg.selection} pick={leg} index={i} />
              ))}
            </div>
            <div className="pt-2 border-t border-white/5 text-[10px] text-white/30 font-semibold leading-relaxed">
              All heavy favorites. None of these legs duplicate picks on your regular cards. Verify lines at your book before placing.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DeepResearchSection({ board }: { board: string }) {
  const [data, setData] = useState<DailyPicksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const liveMap = useLiveScores();

  const load = async (force = false) => {
    if (force) setRefreshing(true);
    else { setData(null); setLoading(true); }
    try {
      const params = new URLSearchParams({ board });
      if (force) params.set('refresh', 'true');
      const res = await fetch(`/api/research/daily-picks?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setData(json);
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
      {/* Live-update notice */}
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/80 leading-snug">
          Live — picks update through the day and can change up to ~15 min before game time.
        </p>
      </div>
      {/* Meta bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-widest text-white/30">
          Updated {new Date(data.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}{refreshing ? ' · refreshing…' : ''}
        </div>
        <button type="button" onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white/30 hover:text-white/60 transition-colors disabled:opacity-40">
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Main board → category tiles (click in to see that category's picks). */}
      {board === 'north-american' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CategoryTile href="/himothy-picks" icon={Crown} title="HIMOTHY Personal Pick" count={1} unit="prop" restingLabel="Best prop across every sport" />
          <CategoryTile href="/grand-slam" icon={Crown} title="HIMOTHY 1-Pick Grand Slam" count={data.grandSlam ? 1 : 0} unit="pick" restingLabel="Resting today" />
          <CategoryTile href="/pressure-pack" icon={Flame} title="HIMOTHY 2-Pick Pressure Pack" count={data.pressurePack.length} unit="pick" />
          <CategoryTile href="/vip-picks" icon={ShieldCheck} title="HIMOTHY VIP 4-Pack" count={data.vip4Pack.length} unit="pick" />
          <CategoryTile href="/parlay-plan" icon={DollarSign} title="$10 Parlay Plan" count={data.parlayPlan.length} unit="leg" restingLabel="Not enough legs today" />
          <CategoryTile href="/big-games" icon={Trophy} title="Tonight's Big Games" count={data.marquee?.length ?? 0} unit="game" restingLabel="No big game today" />
          <CategoryTile href="/nrfi" icon={Radio} title="NRFI — No Runs 1st" count={data.nrfi?.length ?? 0} unit="game" />
          <CategoryTile href="/value" icon={Target} title="Value Plays — real edge" count={data.valuePlays?.length ?? 0} unit="edge" restingLabel="No value today — sit out" />
          <CategoryTile href="/edges" icon={TrendingUp} title="Tonight's Edges — top signals" count={(data.valuePlays?.length ?? 0) + (data.grandSlam ? 1 : 0) + data.pressurePack.length + data.vip4Pack.length + data.parlayPlan.length} unit="signal" />
          <CategoryTile href="/trends" icon={Flame} title="Hot Tendencies — ATS & O/U" count={(data.grandSlam ? 1 : 0) + data.pressurePack.length + data.vip4Pack.length + data.parlayPlan.length + (data.marquee?.length ?? 0)} unit="game" restingLabel="Pulling recent results" />
          <CategoryTile href="/asleep" icon={Flame} title="Asleep Picks — quiet markets" count={data.asleepPicks?.length ?? 0} unit="play" restingLabel="No quiet edges right now" />
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
              <DeepPickCard key={pick.gameId} pick={pick} variant="vip" href={`/pick/${pick.gameId}?board=${board}&from=/picks?board=${board}`} live={computeLiveState(pick, liveMap[pick.gameId])} />
            ))}
          </div>
        </section>
      ) : (data.outrights && data.outrights.length > 0) ? (
        /* Individual (golf) / Racing — show outright tournament contenders */
        <OutrightTournaments tournaments={data.outrights} />
      ) : (
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-8 text-center text-white/30 text-sm font-semibold">
          No picks on this board today. Check back once more games are scheduled.
        </div>
      )}
    </div>
  );
}

// Category tile for the Today's board — shows the count and links into that category's
// page (where the picks live). Keeps the hub from showing every pick wide open, and is
// the unit that gets locked per-subscription later.
function CategoryTile({ href, icon: Icon, title, count, unit, restingLabel }: { href: string; icon: any; title: string; count: number; unit: string; restingLabel?: string }) {
  const has = count > 0;
  return (
    <Link href={href} className="group flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all hover:border-primary/50">
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <div className="text-sm font-black uppercase tracking-tight text-white truncate">{title}</div>
          <div className="text-[11px] font-bold mt-0.5">
            {has ? <span className="text-emerald-400">{count} {unit}{count > 1 ? 's' : ''} today</span> : <span className="text-white/30">{restingLabel || 'None today'}</span>}
          </div>
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
  if (!value) return "TBD";
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "TBD";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  return (
    <article className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-950/60 via-amber-900/30 to-slate-900 p-6 shadow-xl md:p-8">
      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />

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
  );
}

function PickCard({ pick }: { pick: BoardPick }) {
  const sc = statusConfig(pick.status);
  const StatusIcon = sc.icon;
  return (
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
  );
}

function CompactPickRow({ pick, index }: { pick: BoardPick; index: number }) {
  const sc = statusConfig(pick.status);
  const StatusIcon = sc.icon;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-all">
      <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-black text-white/40 shrink-0">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-white truncate">{pick.awayTeam} vs {pick.homeTeam}</div>
        <div className="text-[11px] text-white/50 font-semibold">{pick.selection} · {pick.marketType}</div>
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
