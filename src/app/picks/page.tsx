"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { LiveScoreBoard } from "@/components/LiveScoreBoard";

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
interface Power20Data {
  success: boolean; boardDate: string; generatedAt: string;
  totalScanned: number; picks: Power20Pick[];
  parlayGroups: Power20Group[]; avgWinProbability: number;
}

// ─── Deep Research Types ──────────────────────────────────────────────────────

interface AtsRecord { wins: number; losses: number; pushes: number; display: string; coverPct: number; }
interface TeamProfile {
  name: string; abbreviation: string; overallRecord: string | null; homeAwayRecord: string | null;
  ats: AtsRecord | null; winProbability: number | null; moneyline: number | null;
  keyPlayers: string[]; injuredOut: string[]; injuredDoubtful: string[]; injuredQuestionable: string[];
}
interface DeepPick {
  gameId: string; eventName: string; league: string; sport: string; startTime: string;
  homeTeam: TeamProfile; awayTeam: TeamProfile;
  spread: number | null; total: number | null;
  selection: string; selectionSide: 'home' | 'away'; marketType: string;
  odds: string | null; line: string | null;
  confidenceScore: number; tier: string;
  reasonsFor: string[]; reasonsAgainst: string[];
  signals: { winProbabilityGap: number; atsCoverPct: number | null; atsCoverPctOpp: number | null; dataQuality: number; };
  aiExplanation: { shortReason: string; fullBreakdown: string; keyAngles: string[]; injuryNotes: string; marketNotes: string; riskNotes: string; killCase: string; } | null;
}
interface DailyPicksData {
  success: boolean; boardDate: string; generatedAt: string;
  grandSlam: DeepPick | null; pressurePack: DeepPick[]; vip4Pack: DeepPick[]; parlayPlan: DeepPick[];
  totalGamesScanned: number;
}

// ─── Player Props Types ───────────────────────────────────────────────────────

type PropConf = 'ELITE' | 'HIGH' | 'MEDIUM' | 'LOW';
interface PropRec { stat: string; displayStat: string; seasonAvg: number; recentAvg: number | null; estimatedLine: number; direction: 'over' | 'under'; edgePct: number; confidence: PropConf; reason: string; sgpFriendly: boolean; playerName?: string; }
interface SGPLeg { type: string; description: string; player: string | null; team: string | null; correlation: string; }
interface SGPBuild { label: string; legs: SGPLeg[]; theme: string; rationale: string; estimatedMultiple: number; riskLevel: string; }
interface PlayerPropEdge { playerName: string; position: string; teamName: string; seasonAvg: Record<string, number>; recentAvg: Record<string, number> | null; usageBoostReason: string | null; propRecs: PropRec[]; }
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

function PropsAndSGPPanel({ gameId, league }: { gameId: string; league: string }) {
  const [data, setData] = useState<GamePropsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch(`/api/research/player-props?gameId=${encodeURIComponent(gameId)}&league=${encodeURIComponent(league)}`, { cache: 'no-store' });
        const json = await res.json();
        if (json.success) setData(json);
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    run();
  }, [gameId, league]);

  if (loading) return (
    <div className="flex items-center gap-2 py-3 text-xs text-white/30">
      <div className="h-3 w-3 rounded-full border border-white/20 border-t-white/60 animate-spin" />
      Scanning player props...
    </div>
  );

  if (!data || !data.dataAvailable) return (
    <div className="py-3 text-xs text-white/30 font-semibold">Player stats not available for this game yet.</div>
  );

  return (
    <div className="space-y-4 border-t border-white/5 pt-4">
      {/* Top Props */}
      {data.topProps.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-1.5">
            <Users className="h-3 w-3" /> Player Props
          </div>
          <div className="space-y-2">
            {data.topProps.slice(0, 4).map((rec, i) => (
              <PropCard key={i} rec={rec} playerName={rec.playerName} />
            ))}
          </div>
        </div>
      )}

      {/* SGP Builds */}
      {data.sgpBuilds.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-1.5">
            <Dices className="h-3 w-3" /> SGP Builds
          </div>
          <div className="space-y-2">
            {data.sgpBuilds.map((sgp, i) => (
              <SGPCard key={i} sgp={sgp} />
            ))}
          </div>
        </div>
      )}
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

function DeepPickCard({ pick, variant }: { pick: DeepPick; variant: 'grand-slam' | 'pressure' | 'vip' | 'parlay' }) {
  const [showProps, setShowProps] = useState(false);

  const borderCls = variant === 'grand-slam' ? 'border-amber-500/40' : variant === 'pressure' ? 'border-purple-500/40' : variant === 'vip' ? 'border-emerald-500/20' : 'border-orange-500/20';
  const bgCls = variant === 'grand-slam' ? 'bg-gradient-to-br from-amber-950/60 via-amber-900/20 to-slate-900' : variant === 'pressure' ? 'bg-gradient-to-br from-purple-950/50 via-purple-900/20 to-slate-900' : 'bg-white/[0.03]';
  const glowCls = variant === 'grand-slam' ? 'bg-amber-500/10' : variant === 'pressure' ? 'bg-purple-500/10' : '';
  const oddsTextCls = pick.odds && pick.odds.startsWith('+') ? 'text-emerald-400' : 'text-sky-400';

  const startTime = pick.startTime ? new Date(pick.startTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'TBD';
  const reason = pick.aiExplanation?.shortReason || pick.reasonsFor[0] || null;

  return (
    <article className={`relative overflow-hidden rounded-2xl border ${borderCls} ${bgCls} p-5`}>
      {glowCls && <div className={`absolute -top-8 -right-8 h-32 w-32 rounded-full blur-3xl ${glowCls} pointer-events-none`} />}

      <div className="relative z-10 space-y-3">
        {/* Matchup context */}
        <div className="text-[10px] font-black uppercase tracking-widest text-white/30">
          {pick.league} · {pick.awayTeam.name} @ {pick.homeTeam.name} · {startTime}
        </div>

        {/* THE PICK */}
        <div className="flex items-center justify-between gap-3">
          <div className="text-2xl font-black text-white leading-tight md:text-3xl">{pick.selection}</div>
          {pick.odds && (
            <div className={`shrink-0 rounded-xl border border-current/20 bg-current/10 px-4 py-2 text-2xl font-black tabular-nums ${oddsTextCls}`}>
              {pick.odds}
            </div>
          )}
        </div>

        {/* One reason */}
        {reason && (
          <p className="text-xs text-white/50 leading-relaxed">{reason}</p>
        )}

        {/* Public money — subtle, loads async */}
        <PublicMoneyBadge
          awayTeam={pick.awayTeam.name}
          homeTeam={pick.homeTeam.name}
          selectionSide={pick.selectionSide}
          league={pick.league}
        />

        {/* Props & SGP panel */}
        {showProps && <PropsAndSGPPanel gameId={pick.gameId} league={pick.league} />}

        {/* Props toggle */}
        <button
          type="button"
          onClick={() => setShowProps(!showProps)}
          className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${showProps ? 'text-sky-400 hover:text-sky-300' : 'text-white/20 hover:text-white/50'}`}
        >
          <Users className="h-3 w-3" />
          {showProps ? 'Hide Props' : 'Props & SGP'}
        </button>
      </div>
    </article>
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

  const group = data.parlayGroups[activeGroup];

  return (
    <div className="space-y-8">
      {/* Meta bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="text-[10px] font-black uppercase tracking-widest text-white/30">
            {data.picks.length} favorites found · {data.totalScanned} games scanned · Avg win prob {data.avgWinProbability.toFixed(1)}%
          </div>
          <div className="text-[10px] text-white/20 font-semibold">
            {data.parlayGroups.length} mini-parlays built · 5 legs each
          </div>
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

      {/* Parlay group tabs */}
      <div>
        <div className="flex flex-wrap gap-2 mb-5">
          {data.parlayGroups.map((g, i) => {
            const active = activeGroup === i;
            const decColor = g.estimatedDecimal >= 5 ? 'text-emerald-400' : g.estimatedDecimal >= 2.5 ? 'text-sky-400' : 'text-white/50';
            return (
              <button
                key={g.group}
                type="button"
                onClick={() => setActiveGroup(i)}
                className={`rounded-2xl border px-4 py-2.5 transition-all text-left ${
                  active
                    ? 'border-white/20 bg-white/[0.08]'
                    : 'border-white/8 bg-white/[0.02] hover:border-white/15'
                }`}
              >
                <div className="text-[10px] font-black uppercase tracking-wider text-white/40">{g.label}</div>
                <div className={`text-lg font-black tabular-nums mt-0.5 ${decColor}`}>{g.estimatedOdds}</div>
                <div className="text-[10px] text-white/20 font-semibold mt-0.5">{g.legs.length} legs</div>
              </button>
            );
          })}
        </div>

        {/* Active group legs */}
        {group && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-xs font-black text-white">{group.label}</div>
                <div className="text-[10px] text-white/30 font-semibold mt-0.5">
                  Estimated parlay: <span className="text-emerald-400 font-black">{group.estimatedOdds}</span>
                  {' '}· Place on DraftKings / FanDuel SGP+
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-white tabular-nums">{group.estimatedOdds}</div>
                <div className="text-[10px] text-white/30">{(group.estimatedDecimal).toFixed(2)}x</div>
              </div>
            </div>
            <div className="space-y-2">
              {group.legs.map((leg, i) => (
                <Power20Leg key={leg.gameId} pick={leg} index={i} />
              ))}
            </div>
            <div className="pt-2 border-t border-white/5 text-[10px] text-white/20 font-semibold leading-relaxed">
              These are the highest win-probability favorites on today's slate. Each leg has ≥63% win prob per ESPN model.
              Injury notes shown where applicable. Always verify lines at your book before placing.
            </div>
          </div>
        )}
      </div>

      {/* Full 20 list toggle */}
      <details className="group">
        <summary className="cursor-pointer list-none flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors">
          <ChevronDown className="h-3 w-3 group-open:hidden" />
          <ChevronUp className="h-3 w-3 hidden group-open:block" />
          All {data.picks.length} Favorites
        </summary>
        <div className="mt-3 space-y-2">
          {data.picks.map((pick, i) => (
            <Power20Leg key={pick.gameId} pick={pick} index={i} />
          ))}
        </div>
      </details>
    </div>
  );
}

function DeepResearchSection({ board }: { board: string }) {
  const [data, setData] = useState<DailyPicksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => { load(); }, [board]);

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

  return (
    <div className="space-y-10">
      {/* Meta bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-widest text-white/30">
          {data.totalGamesScanned} games scanned · {data.boardDate} · {new Date(data.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
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

      {!hasPicks && (
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-8 text-center text-white/30 text-sm font-semibold">
          No qualifying picks found for today's slate. Check back once more games are scheduled.
        </div>
      )}

      {/* Grand Slam */}
      {data.grandSlam && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <Crown className="h-5 w-5 text-amber-400" />
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-amber-400">HIMOTHY Grand Slam</h2>
              <p className="text-[10px] text-white/30 font-semibold mt-0.5">The strongest play of the day — only drops when we really feel it</p>
            </div>
          </div>
          <DeepPickCard pick={data.grandSlam} variant="grand-slam" />
        </section>
      )}

      {/* Pressure Pack */}
      {data.pressurePack.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <Flame className="h-5 w-5 text-purple-400" />
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-purple-400">HIMOTHY 2-Pick Pressure Pack</h2>
              <p className="text-[10px] text-white/30 font-semibold mt-0.5">Our 2 strongest plays — when it's time to apply pressure, it's here</p>
            </div>
          </div>
          <div className="space-y-4">
            {data.pressurePack.map((pick) => (
              <DeepPickCard key={pick.gameId} pick={pick} variant="pressure" />
            ))}
          </div>
        </section>
      )}

      {/* VIP 4-Pack */}
      {data.vip4Pack.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-emerald-400">HIMOTHY VIP 4-Pack</h2>
              <p className="text-[10px] text-white/30 font-semibold mt-0.5">Your daily foundation — clean action, consistent value</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.vip4Pack.map((pick) => (
              <DeepPickCard key={pick.gameId} pick={pick} variant="vip" />
            ))}
          </div>
        </section>
      )}

      {/* $10 Parlay Plan */}
      {data.parlayPlan.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <DollarSign className="h-5 w-5 text-orange-400" />
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-orange-400">$10 Parlay Plan</h2>
              <p className="text-[10px] text-white/30 font-semibold mt-0.5">Strategic parlays for the flip chasers — not wild guesses, calculated risks</p>
            </div>
          </div>
          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.03] p-5 space-y-2">
            {data.parlayPlan.map((pick, i) => (
              <CompactParlayLeg key={pick.gameId} pick={pick} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
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
      { key: "north-american", label: "North American" },
      { key: "soccer", label: "Soccer" },
      { key: "tennis", label: "Tennis" },
      { key: "overseas", label: "Overseas" },
    ]),
    { key: "power20", label: "⚡ Power 20" },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-white pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-black/60 backdrop-blur-xl px-4 py-4 md:px-8">
        <div className="mx-auto max-w-7xl flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <div className="hidden md:flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Live · Refreshes every 30s</span>
          </div>
          <Link href="/results" className="text-xs font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
            Results
          </Link>
        </div>
      </header>

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
        {/* Stats strip */}
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Official Picks", val: counts.officialStraightPicks },
            { label: "Packages", val: counts.officialGroupedProducts },
            { label: "Parlays", val: counts.parlays },
            { label: "Total Picks", val: counts.totalUniquePicks },
          ].map(({ label, val }) => (
            <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-white/30">{label}</div>
              <div className="mt-1 text-3xl font-black text-white">{loading ? "—" : val}</div>
            </div>
          ))}
        </div>

        {/* Fallback notice */}
        {!loading && isFallback && (
          <div className="mb-8 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <div className="text-sm font-black text-amber-300">Today's Live Slate — No Official Picks Published Yet</div>
              <p className="mt-1 text-xs text-amber-400/70 leading-relaxed">
                These are today's scheduled games with available odds from ESPN. Official picks will replace this view once the board is published for the day.
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

            {/* 0. Deep Research — tier-based picks */}
            <section>
              <div className="mb-6 flex items-center gap-3">
                <Target className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest text-white">Today's Research Picks</h2>
                  <p className="text-[10px] text-white/30 font-semibold mt-0.5">
                    12-signal deep scan · ATS records · win probability · injury-adjusted
                  </p>
                </div>
              </div>
              <DeepResearchSection board={selectedBoard} />
            </section>

            <div className="border-t border-white/5" />

            {/* 1. Main Pick */}
            {selectedBoard === "north-american" && (
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Crown className="h-5 w-5 text-amber-400" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-white/60">
                    {hasOfficialPicks ? "Main Pick" : "Today's Top Game"}
                  </h2>
                </div>
                {mainPick ? (
                  <MainPickCard pick={mainPick} />
                ) : corePicks.length > 0 ? (
                  <MainPickCard pick={corePicks[0]} />
                ) : (
                  <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-8 text-center text-white/30 text-sm font-semibold">
                    No picks available for this board yet.
                  </div>
                )}
              </section>
            )}

            {/* 2. Core Picks / Today's Games */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-white/50" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-white/60">
                    {hasOfficialPicks ? "Core Picks" : "Today's Games"}
                  </h2>
                </div>
                <span className="text-xs text-white/30 font-semibold">{corePicks.length} picks</span>
              </div>

              {corePicks.length === 0 ? (
                <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-8 text-center text-white/30 text-sm font-semibold">
                  No core picks for this board today.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {(selectedBoard === "north-american" && !isFallback ? corePicks : corePicks).map((pick) => (
                    <PickCard key={pick.id} pick={pick} />
                  ))}
                </div>
              )}
            </section>

            {/* 3. Grouped Products (VIP / Pressure) */}
            {groupedProducts.length > 0 && (
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
            {parlayProducts.length > 0 && (
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

            {/* 5. Live Scores */}
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Activity className="h-5 w-5 text-white/50" />
                <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Live Scores</h2>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                <LiveScoreBoard />
              </div>
            </section>

            {/* 6. History links */}
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
