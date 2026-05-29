import Link from "next/link";
import {
  TrendingUp, TrendingDown, Activity, AlertTriangle, CheckCircle2, Clock, DollarSign, Flame,
} from "lucide-react";
import type { LivePickState } from "@/lib/livePickStatus";
import { formatGameDateTimeET, TIME_TBD } from "@/lib/datetime";

// ─── Shared pick types ────────────────────────────────────────────────────────

export interface AtsRecord { wins: number; losses: number; pushes: number; display: string; coverPct: number; }
export interface TeamProfile {
  id: string; name: string; abbreviation: string; homeAway: 'home' | 'away'; overallRecord: string | null; homeAwayRecord: string | null;
  ats: AtsRecord | null; winProbability: number | null; moneyline: number | null;
  keyPlayers: string[]; injuredOut: string[]; injuredDoubtful: string[]; injuredQuestionable: string[];
  recentForm: string | null;
  trends?: {
    last5: { wins: number; losses: number };
    last10: { wins: number; losses: number };
    last20: { wins: number; losses: number };
    season: { wins: number; losses: number };
    home: { wins: number; losses: number };
    away: { wins: number; losses: number };
    avgMargin10: number | null;
    trendDirection: 'up' | 'down' | 'flat';
    streak: number;
    ats5?: { wins: number; losses: number; pushes: number; sample: number };
    ats10?: { wins: number; losses: number; pushes: number; sample: number };
    ats20?: { wins: number; losses: number; pushes: number; sample: number };
    atsSeason?: { wins: number; losses: number; pushes: number; sample: number };
    atsHome?: { wins: number; losses: number; pushes: number; sample: number };
    atsAway?: { wins: number; losses: number; pushes: number; sample: number };
    ou5?: { wins: number; losses: number; pushes: number; sample: number };
    ou10?: { wins: number; losses: number; pushes: number; sample: number };
    ou20?: { wins: number; losses: number; pushes: number; sample: number };
    ouSeason?: { wins: number; losses: number; pushes: number; sample: number };
    ouHome?: { wins: number; losses: number; pushes: number; sample: number };
    ouAway?: { wins: number; losses: number; pushes: number; sample: number };
    avgTotal10?: number | null;
  } | null;
}
export interface DeepPick {
  gameId: string; eventName: string; league: string; sport: string; startTime: string;
  homeTeam: TeamProfile; awayTeam: TeamProfile;
  spread: number | null; total: number | null;
  selection: string; selectionSide: "home" | "away"; marketType: string;
  odds: string | null; line: string | null;
  confidenceScore: number; tier: string;
  reasonsFor: string[]; reasonsAgainst: string[];
  signals: {
    winProbabilityGap: number; atsCoverPct: number | null; dataQuality: number;
    sharpMoneyAligned?: boolean; oppOnB2B?: boolean; reverseLineMovement?: boolean; confirmingSignals?: number;
  };
  aiExplanation: {
    shortReason: string; fullBreakdown: string; keyAngles: string[];
    injuryNotes: string; marketNotes: string; riskNotes: string; killCase: string;
  } | null;
  sharpFlags?: { label: string; intensity: string }[];
  bigGameLabel?: string | null;
  isAsleepPick?: boolean;        // lesser-watched league with extra edge — badge it
  asleepBoost?: number;
  tendencyResolution?: {
    market: 'spread' | 'total' | 'moneyline';
    predictedHomeAvgTotal?: number | null;
    predictedAwayAvgTotal?: number | null;
    predictedTotal?: number | null;
    predictedHomeMargin?: number | null;
    predictedAwayMargin?: number | null;
    predictedMargin?: number | null;
    postedLine: number | null;
    edge: number | null;
    lean: 'BET' | 'STAY_AWAY' | 'PASS';
    reasoning: string;
  } | null;
  // Rich sharp/rest/weather context captured at publish — drives the Intel chips.
  sharpIntel?: {
    betting?: {
      sharpFavors?: 'home' | 'away' | null;
      sharpConfidence?: number;
      homeMoneyPct?: number | null;
      awayMoneyPct?: number | null;
      homeBetPct?: number | null;
      awayBetPct?: number | null;
      reverseLineMovement?: boolean;
    };
    rest?: {
      restDiff?: number;
      restAdvantage?: 'home' | 'away' | null;
      restEdge?: number;
      homeIsB2B?: boolean;
      awayIsB2B?: boolean;
    };
    weather?: {
      available?: boolean;
      weatherAlert?: string | null;
      isHighWind?: boolean;
      windSpeedMph?: number | null;
      tempF?: number | null;
      affectsPlay?: boolean;
      favorsTotalsUnder?: boolean;
    };
  } | null;
  oddsInsight?: {
    bestOdds: number | null;
    bestBook: string | null;
    fairProb: number | null;
    valueEdge: number | null;
    isValue: boolean;
  } | null;
  // Historical W/L of OUR own verified picks in this pick's odds price band.
  bucketStats?: {
    bucket: string;
    wins: number;
    losses: number;
    pushes: number;
    total: number;
    winRate: string;
  } | null;
  // Multi-book total line + best over/under prices (only set for total picks).
  totalsInsight?: {
    line: number;
    bestOverPrice: number | null;
    bestUnderPrice: number | null;
    bestOverBook: string | null;
    bestUnderBook: string | null;
    bookCount: number;
  } | null;
}

// Best-price + value line, powered by real multi-sportsbook odds. Shows customers where
// to get the best number (line shopping) and flags genuine value vs the true line.
export function BestPriceLine({ pick }: { pick: DeepPick }) {
  // Total picks get a totals-specific line-shop badge instead of the moneyline best price.
  if (pick.marketType === "total" && pick.totalsInsight) {
    const ti = pick.totalsInsight;
    const isOver = /\bover\b/i.test(pick.selection);
    const price = isOver ? ti.bestOverPrice : ti.bestUnderPrice;
    const book = isOver ? ti.bestOverBook : ti.bestUnderBook;
    if (price == null) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-white/60">
          Best {isOver ? "OVER" : "UNDER"} <span className="text-white tabular-nums">{ti.line}</span> at <span className="text-white tabular-nums">{price > 0 ? "+" : ""}{price}</span>
          {book ? <span className="text-white/35"> · {book}</span> : null}
        </span>
      </div>
    );
  }
  const oi = pick.oddsInsight;
  // The feed pulls moneyline (h2h) prices, so only show best-price/value on ML picks —
  // showing a moneyline number next to a spread pick would be misleading.
  if (!oi || oi.bestOdds == null || pick.marketType !== "moneyline") return null;
  const oddsStr = `${oi.bestOdds > 0 ? "+" : ""}${oi.bestOdds}`;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
      <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-white/60">
        Best price <span className="text-white tabular-nums">{oddsStr}</span>{oi.bestBook ? <span className="text-white/35"> · {oi.bestBook}</span> : null}
      </span>
      {oi.isValue && (
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-400">
          ✓ Value{oi.valueEdge != null ? ` +${oi.valueEdge}%` : ""}
        </span>
      )}
    </div>
  );
}

function confColor(score: number) {
  if (score >= 88) return "text-emerald-400";
  if (score >= 75) return "text-primary";
  return "text-white/70";
}

function Note({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-xl bg-black/20 p-2.5">
      <div className="text-[9px] font-black uppercase tracking-widest text-white/30">{label}</div>
      <p className="text-xs text-white/55 mt-0.5 leading-snug">{body}</p>
    </div>
  );
}

function Chip({ icon: Icon, label, tone }: { icon: any; label: string; tone: "good" | "bad" | "neutral" }) {
  const cls = tone === "good" ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-300"
    : tone === "bad" ? "border-red-500/25 bg-red-500/5 text-red-300"
    : "border-white/10 bg-white/[0.03] text-white/55";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

// Compact deep-history trend card for a team — last 10 SU, home/away split, current
// streak, trend direction, and avg margin over the last 10. Built from the team's full
// season schedule (typically 3+ months of completed games).
function TrendCard({ team, label, dim }: { team: TeamProfile; label: string; dim?: boolean }) {
  const t = team.trends;
  if (!t) return null;
  const ha = team.homeAway === "home" ? t.home : t.away;
  const haLabel = team.homeAway === "home" ? "At home" : "On road";
  const streakLabel = t.streak > 0 ? `W${t.streak}` : t.streak < 0 ? `L${Math.abs(t.streak)}` : "—";
  const streakColor = t.streak > 0 ? "text-emerald-400" : t.streak < 0 ? "text-red-400" : "text-white/40";
  const dirColor = t.trendDirection === "up" ? "text-emerald-400" : t.trendDirection === "down" ? "text-amber-400" : "text-white/40";
  const dirLabel = t.trendDirection === "up" ? "Heating up" : t.trendDirection === "down" ? "Cooling off" : "Steady";
  return (
    <div className={`rounded-xl border ${dim ? "border-white/8 bg-white/[0.02]" : "border-primary/25 bg-primary/[0.05]"} p-3`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={`text-[10px] font-black uppercase tracking-widest ${dim ? "text-white/40" : "text-primary"}`}>{label}</span>
        <span className="text-[10px] font-black text-white/60">{team.abbreviation}</span>
      </div>
      <div className="grid grid-cols-2 gap-y-1 text-[11px] font-bold">
        <div className="text-white/40">Last 10 SU</div><div className="text-right tabular-nums text-white">{t.last10.wins}-{t.last10.losses}</div>
        <div className="text-white/40">{haLabel}</div><div className="text-right tabular-nums text-white/70">{ha.wins}-{ha.losses}</div>
        <div className="text-white/40">Streak</div><div className={`text-right tabular-nums ${streakColor}`}>{streakLabel}</div>
        <div className="text-white/40">Trend</div><div className={`text-right ${dirColor}`}>{dirLabel}</div>
        {t.avgMargin10 != null && <>
          <div className="text-white/40">Avg margin</div>
          <div className="text-right tabular-nums text-white/70">{t.avgMargin10 > 0 ? "+" : ""}{t.avgMargin10}</div>
        </>}
      </div>
      {(t.ats10?.sample || t.ou10?.sample) ? (
        <div className="mt-2 pt-2 border-t border-white/5 grid grid-cols-2 gap-y-1 text-[11px] font-bold">
          {t.ats10 && t.ats10.sample > 0 && <>
            <div className="text-white/40">ATS L10</div>
            <div className="text-right tabular-nums text-amber-300">{t.ats10.wins}-{t.ats10.losses}{t.ats10.pushes ? `-${t.ats10.pushes}` : ""}</div>
          </>}
          {t.ou10 && t.ou10.sample > 0 && <>
            <div className="text-white/40">O/U L10</div>
            <div className="text-right tabular-nums text-sky-300">{t.ou10.wins}O-{t.ou10.losses}U{t.ou10.pushes ? `-${t.ou10.pushes}` : ""}</div>
          </>}
          {t.avgTotal10 != null && <>
            <div className="text-white/40">Avg total L10</div>
            <div className="text-right tabular-nums text-white/70">{t.avgTotal10}</div>
          </>}
        </div>
      ) : null}
    </div>
  );
}

// ─── Live status + win meter (shared) ─────────────────────────────────────────

function liveClock(live: LivePickState) {
  const showClock = live.clock && live.clock !== "0:00" && live.clock !== "0.00";
  return [live.period, showClock ? live.clock : null].filter(Boolean).join(" · ");
}

function StatusPill({ live }: { live: LivePickState }) {
  if (live.state === "live")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-red-400">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> Live
      </span>
    );
  if (live.state === "final") {
    if (live.result === "won")
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-400/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-emerald-300">
          ✓ Won
        </span>
      );
    if (live.result === "lost")
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-500/50 bg-red-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-red-400">
          ✗ Lost
        </span>
      );
    if (live.result === "push")
      return (
        <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white/60">
          Push
        </span>
      );
    // Final but ungradable live (props/NRFI graded later by the registry).
    return (
      <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white/50">
        Final
      </span>
    );
  }
  return null;
}

// The "are we winning the bet" meter — fills green when we're covering, shrinks and
// turns amber/red as we trail. When final it locks to won (full green) / lost (empty red).
export function LiveMeter({ live, picked }: { live: LivePickState; picked: string }) {
  if (live.meterPct == null) return null;
  const isFinal = live.state === "final";
  const barColor = isFinal
    ? live.result === "won" ? "from-emerald-500 to-emerald-400"
      : live.result === "push" ? "from-white/25 to-white/35"
      : "from-red-600 to-red-500"
    : live.trend === "down" ? "from-amber-500 to-red-500" : "from-primary to-emerald-400";
  const labelColor = isFinal
    ? live.result === "won" ? "text-emerald-400" : live.result === "lost" ? "text-red-400" : "text-white/40"
    : live.trend === "down" ? "text-amber-400" : "text-emerald-400";
  const label = isFinal
    ? live.result === "won" ? "Pick won ✓" : live.result === "push" ? "Push" : "Pick lost"
    : live.trend === "up" ? "Live — we're covering" : live.trend === "down" ? "Live — trailing" : "Live — even";
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest mb-1.5">
        <span className={labelColor}>{label}</span>
        <span className="text-white/40">{picked}</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700`} style={{ width: `${live.meterPct}%` }} />
      </div>
    </div>
  );
}

// ─── Compact, clickable SUMMARY card (used on category pages) ──────────────────

export function PickSummaryCard({ pick, href, index, live, hideResultWatermark }: { pick: DeepPick; href: string; index?: number; live?: LivePickState | null; hideResultWatermark?: boolean }) {
  const startTime = formatGameDateTimeET(pick.startTime) || TIME_TBD;
  const showLive = !!live && live.state !== "pre";
  // A graded straight should SHOUT its result — same prominence as the parlay watermark.
  const finalResult = live?.state === "final" ? live.result : null;
  const cardAccent =
    finalResult === "won" ? "border-emerald-400/70 bg-gradient-to-br from-emerald-500/[0.16] to-emerald-500/[0.03] shadow-[0_0_36px_-10px_rgba(16,185,129,0.55)]" :
    finalResult === "lost" ? "border-red-500/80 bg-gradient-to-br from-red-500/[0.20] to-red-500/[0.03] shadow-[0_0_36px_-10px_rgba(239,68,68,0.55)]" :
    finalResult === "push" ? "border-white/25 bg-white/[0.05]" :
    "border-white/10 bg-white/[0.03] hover:border-primary/50";
  return (
    <Link href={href} className="block group">
      <article className={`relative overflow-hidden rounded-2xl border p-5 transition-all ${cardAccent}`}>
        {!hideResultWatermark && (finalResult === "won" || finalResult === "lost") && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
            <div className={`text-7xl md:text-8xl font-black uppercase tracking-tighter ${finalResult === "won" ? "text-emerald-400/[0.10]" : "text-red-500/[0.12]"}`}>
              {finalResult === "won" ? "WON" : "LOST"}
            </div>
          </div>
        )}
        <div className="relative">
        <div className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-widest text-white/30">
          <span className="truncate">
            {typeof index === "number" && <span className="text-primary">#{index + 1} · </span>}
            {pick.league} · {pick.awayTeam.name} @ {pick.homeTeam.name}
          </span>
          <span className="shrink-0">{showLive ? <StatusPill live={live!} /> : startTime}</span>
        </div>
        {pick.isAsleepPick && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" /> Asleep Pick · {pick.league}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="text-2xl font-black text-white leading-tight md:text-3xl">{pick.selection}</div>
          {pick.odds && <div className="shrink-0 rounded-xl border border-primary/25 bg-primary/10 px-4 py-2 text-xl font-black tabular-nums text-primary">{pick.odds}</div>}
        </div>

        {showLive && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm font-bold tabular-nums">
              <span className="text-white/70">
                {pick.awayTeam.abbreviation} <span className="text-white">{live!.awayScore}</span>
                <span className="text-white/25"> – </span>
                <span className="text-white">{live!.homeScore}</span> {pick.homeTeam.abbreviation}
              </span>
              {liveClock(live!) && <span className="text-[11px] font-bold text-primary italic normal-case">{liveClock(live!)}</span>}
            </div>
            {live!.meterPct != null && (
              <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    live!.state === "final"
                      ? live!.result === "won" ? "bg-emerald-400" : live!.result === "push" ? "bg-white/30" : "bg-red-500"
                      : live!.trend === "down" ? "bg-amber-500" : "bg-emerald-400"
                  }`}
                  style={{ width: `${live!.meterPct}%` }}
                />
              </div>
            )}
          </div>
        )}

        {(pick.oddsInsight?.bestOdds != null || (pick.marketType === "total" && pick.totalsInsight)) && <div className="mt-3"><BestPriceLine pick={pick} /></div>}

        <PickedSideTendency pick={pick} />

        <div className="mt-3 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-primary/70 group-hover:text-primary transition-colors">
          {live?.state === "final" ? "View result & breakdown →" : "View full breakdown →"}
        </div>
        </div>
      </article>
    </Link>
  );
}

// Compact tendency chip on the summary card — shows the picked side's ATS or O/U record
// over their most-recent window so the edge that drove the pick is visible at a glance.
// (Only renders when the data actually exists — silent on cards that don't have it yet.)
function PickedSideTendency({ pick }: { pick: DeepPick }) {
  const picked = pick.selectionSide === "home" ? pick.homeTeam : pick.awayTeam;
  const t = picked.trends;
  if (!t) return null;

  // For spread/runline picks: surface the team's ATS L10 record (or L5 fallback).
  // For total picks: surface the team's O/U L10 record on the picked side.
  // For moneyline picks: lean on the L10 SU record + trend direction.
  const chips: Array<{ label: string; value: string; tone: string }> = [];
  const fmt = (b: { wins: number; losses: number; pushes: number; sample: number } | undefined) =>
    b && b.sample > 0 ? `${b.wins}-${b.losses}${b.pushes ? `-${b.pushes}` : ""}` : null;

  if (pick.marketType === "spread") {
    const ats = fmt(t.ats10) || fmt(t.ats5);
    if (ats) chips.push({ label: `${picked.abbreviation} ATS L10`, value: ats, tone: "text-amber-300 border-amber-400/30 bg-amber-400/10" });
  } else if (pick.marketType === "total") {
    const isOver = /\bover\b/i.test(pick.selection);
    const ou = t.ou10 || t.ou5;
    if (ou && ou.sample > 0) {
      const w = isOver ? ou.wins : ou.losses;
      const l = isOver ? ou.losses : ou.wins;
      chips.push({ label: `${picked.abbreviation} ${isOver ? "Over" : "Under"} L10`, value: `${w}-${l}`, tone: "text-sky-300 border-sky-400/30 bg-sky-400/10" });
    }
  } else {
    // ML default — L10 SU + direction
    if (t.last10 && (t.last10.wins + t.last10.losses) > 0) {
      const dir = t.trendDirection === "up" ? " · ↑" : t.trendDirection === "down" ? " · ↓" : "";
      chips.push({ label: `${picked.abbreviation} L10 SU${dir}`, value: `${t.last10.wins}-${t.last10.losses}`, tone: "text-primary border-primary/30 bg-primary/10" });
    }
  }
  if (chips.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {chips.map((c, i) => (
        <span key={i} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${c.tone}`}>
          {c.label} <span className="text-white tabular-nums">{c.value}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Tendency math (resolves conflicting team trends → BET / STAY AWAY / PASS) ─

function TendencyMath({ pick }: { pick: DeepPick }) {
  const t = pick.tendencyResolution;
  if (!t) return null;

  const tone = t.lean === 'BET'
    ? { bg: 'bg-emerald-400/10', border: 'border-emerald-400/30', text: 'text-emerald-400', label: '✓ BET — math agrees' }
    : t.lean === 'STAY_AWAY'
      ? { bg: 'bg-amber-400/10', border: 'border-amber-400/30', text: 'text-amber-400', label: '⚠ STAY AWAY — book has it right' }
      : { bg: 'bg-white/[0.04]', border: 'border-white/10', text: 'text-white/50', label: 'Not enough data' };

  const home = pick.homeTeam.abbreviation;
  const away = pick.awayTeam.abbreviation;

  // Build the math row that explains how we got the predicted number.
  const math: { label: string; value: string }[] = [];
  if (t.market === 'total') {
    if (t.predictedHomeAvgTotal != null) math.push({ label: `${home} avg total (L10)`, value: t.predictedHomeAvgTotal.toFixed(1) });
    if (t.predictedAwayAvgTotal != null) math.push({ label: `${away} avg total (L10)`, value: t.predictedAwayAvgTotal.toFixed(1) });
    if (t.predictedTotal != null) math.push({ label: 'Projected total', value: t.predictedTotal.toFixed(1) });
    if (t.postedLine != null) math.push({ label: 'Posted line', value: t.postedLine.toFixed(1) });
  } else if (t.market === 'spread') {
    if (t.predictedHomeMargin != null) math.push({ label: 'Projected home margin', value: t.predictedHomeMargin > 0 ? `+${t.predictedHomeMargin}` : String(t.predictedHomeMargin) });
    if (t.postedLine != null) math.push({ label: `Picked-side line`, value: t.postedLine > 0 ? `+${t.postedLine}` : String(t.postedLine) });
  } else {
    if (t.predictedHomeMargin != null) math.push({ label: 'Projected home margin', value: t.predictedHomeMargin > 0 ? `+${t.predictedHomeMargin}` : String(t.predictedHomeMargin) });
  }

  return (
    <div className={`rounded-2xl border-2 ${tone.border} ${tone.bg} p-4 space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <div className={`text-[11px] font-black uppercase tracking-widest ${tone.text}`}>Tendency Math</div>
        <div className={`text-[10px] font-black uppercase tracking-widest ${tone.text}`}>{tone.label}</div>
      </div>
      <p className="text-sm text-white/70 leading-relaxed">{t.reasoning}</p>
      {math.length > 0 && (
        <div className="grid grid-cols-2 gap-y-1.5 text-[11px] font-bold pt-1">
          {math.map((m, i) => (
            <div key={i} className="contents">
              <div className="text-white/40">{m.label}</div>
              <div className="text-right tabular-nums text-white">{m.value}</div>
            </div>
          ))}
          {t.edge != null && (
            <div className="contents">
              <div className="text-white/40 pt-2 border-t border-white/5 mt-1">Edge vs line</div>
              <div className={`text-right tabular-nums pt-2 border-t border-white/5 mt-1 ${t.edge > 0 ? 'text-emerald-400' : t.edge < 0 ? 'text-rose-400' : 'text-white/50'}`}>
                {t.edge > 0 ? '+' : ''}{t.edge.toFixed(1)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── The full single-pick breakdown ───────────────────────────────────────────

export function PickBreakdown({ pick, live }: { pick: DeepPick; live?: LivePickState | null }) {
  const picked = pick.selectionSide === "home" ? pick.homeTeam : pick.awayTeam;
  const opp = pick.selectionSide === "home" ? pick.awayTeam : pick.homeTeam;
  const pickedWin = picked.winProbability;
  const time = formatGameDateTimeET(pick.startTime) || null;
  const sigs = pick.signals || ({} as DeepPick["signals"]);
  const showLive = !!live && live.state !== "pre";

  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-white/[0.02] px-5 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40">
          <span>{pick.league}</span>
          {showLive ? (
            <span className="flex items-center gap-2 normal-case tracking-normal">
              <StatusPill live={live!} />
              <span className="font-bold tabular-nums text-white/60">
                {pick.awayTeam.abbreviation} {live!.awayScore}–{live!.homeScore} {pick.homeTeam.abbreviation}
              </span>
              {liveClock(live!) && <span className="font-bold italic text-primary">{liveClock(live!)}</span>}
            </span>
          ) : time ? (
            <span className="flex items-center gap-1 text-white/30"><Clock className="h-3 w-3" /> {time}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/30">HIMOTHY rating</span>
          <span className={`text-lg font-black ${confColor(pick.confidenceScore)}`}>{pick.confidenceScore}<span className="text-[10px] text-white/30">/100</span></span>
          {typeof sigs.confirmingSignals === "number" && <span className="text-[10px] font-bold text-white/30">· {sigs.confirmingSignals} signals</span>}
        </div>
      </div>

      <div className="p-5 space-y-5">
        <div>
          <div className="text-xs font-semibold text-white/40">{pick.eventName}</div>
          <div className="mt-1 text-3xl font-black text-white">{pick.selection}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold">
            {pick.odds ? <span className="text-primary">{pick.odds}</span> : pick.line ? <span className="text-white/40">{pick.line}</span> : null}
            <span className="text-white/30 uppercase text-[11px] tracking-widest">{pick.marketType}</span>
            <span className="text-[10px] text-white/25 normal-case tracking-normal font-medium">
              {pick.marketType === "moneyline" ? "current line — verify at your book" : "standard -110 — verify at your book"}
            </span>
          </div>
          {(pick.oddsInsight?.bestOdds != null || (pick.marketType === "total" && pick.totalsInsight)) && <div className="mt-3"><BestPriceLine pick={pick} /></div>}
        </div>

        {showLive && live!.meterPct != null ? (
          <LiveMeter live={live!} picked={picked.abbreviation} />
        ) : pickedWin != null ? (
          <div>
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">
              <span>Our read — {picked.abbreviation} to win</span>
              <span className="text-emerald-400">{pickedWin.toFixed(1)}%</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400" style={{ width: `${Math.min(100, Math.max(0, pickedWin))}%` }} />
            </div>
          </div>
        ) : null}

        {(picked.trends || opp.trends) && (
          <div>
            <div className="text-[11px] font-black uppercase tracking-widest text-white/40 mb-2 flex items-center gap-2">
              <Activity className="h-3 w-3 text-primary" /> Trends · this season
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {picked.trends && <TrendCard team={picked} label="OUR PICK" />}
              {opp.trends && <TrendCard team={opp} label="OPPONENT" dim />}
            </div>
          </div>
        )}

        {pick.tendencyResolution && <TendencyMath pick={pick} />}

        {pick.reasonsFor.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-emerald-400 mb-2">
              <CheckCircle2 className="h-3.5 w-3.5" /> Why we like this pick
            </div>
            <ul className="space-y-1.5">
              {pick.reasonsFor.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-white/70 leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /> {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {pick.aiExplanation && (
          <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-4 space-y-3">
            <div className="text-[11px] font-black uppercase tracking-widest text-primary">HIMOTHY Breakdown</div>
            {pick.aiExplanation.fullBreakdown && <p className="text-sm text-white/70 leading-relaxed">{pick.aiExplanation.fullBreakdown}</p>}
            {pick.aiExplanation.keyAngles?.length > 0 && (
              <ul className="space-y-1">
                {pick.aiExplanation.keyAngles.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-white/55"><span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" /> {a}</li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {pick.aiExplanation.injuryNotes && <Note label="Injuries" body={pick.aiExplanation.injuryNotes} />}
              {pick.aiExplanation.marketNotes && <Note label="Market" body={pick.aiExplanation.marketNotes} />}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {pickedWin != null && opp.winProbability != null && (
            <Chip icon={TrendingUp} label={`Win edge ${Math.abs(pickedWin - opp.winProbability).toFixed(0)} pts`} tone="good" />
          )}
          {picked.recentForm && <Chip icon={Activity} label={`${picked.abbreviation}: ${picked.recentForm}`} tone="neutral" />}
          {picked.ats && <Chip icon={TrendingUp} label={`${picked.abbreviation} ATS ${picked.ats.display} (${picked.ats.coverPct.toFixed(0)}%)`} tone="neutral" />}
          {sigs.sharpMoneyAligned && <Chip icon={DollarSign} label="Sharp money agrees" tone="good" />}
          {sigs.reverseLineMovement && <Chip icon={TrendingUp} label="Reverse line move" tone="good" />}
          {sigs.oppOnB2B && <Chip icon={Activity} label={`${opp.abbreviation} on back-to-back`} tone="good" />}
          {opp.injuredOut.length > 0 && <Chip icon={AlertTriangle} label={`${opp.abbreviation} out: ${opp.injuredOut.slice(0, 1).join(", ")}`} tone="good" />}
          {picked.injuredOut.length > 0 && <Chip icon={AlertTriangle} label={`${picked.abbreviation} out: ${picked.injuredOut.slice(0, 1).join(", ")}`} tone="bad" />}
          {(pick.sharpFlags || []).slice(0, 2).map((f, i) => <Chip key={i} icon={Flame} label={f.label} tone="neutral" />)}
          {pick.bucketStats && pick.bucketStats.total > 0 && (() => {
            const rate = parseFloat(pick.bucketStats.winRate);
            const tone: "good" | "bad" | "neutral" = rate >= 60 ? "good" : rate <= 40 ? "bad" : "neutral";
            const range = pick.bucketStats.bucket.match(/\(([^)]+)\)/)?.[1] || pick.bucketStats.bucket;
            return <Chip icon={Activity} label={`${range} bucket: ${pick.bucketStats.wins}-${pick.bucketStats.losses} (${pick.bucketStats.winRate})`} tone={tone} />;
          })()}
          {/* Sharp / public money split on the picked side */}
          {(() => {
            const si = pick.sharpIntel;
            if (!si?.betting) return null;
            const side = pick.selectionSide;
            const moneyPct = side === 'home' ? si.betting.homeMoneyPct : si.betting.awayMoneyPct;
            const betPct = side === 'home' ? si.betting.homeBetPct : si.betting.awayBetPct;
            if (moneyPct == null || betPct == null) return null;
            const sharpOnOurSide = si.betting.sharpFavors === side && (si.betting.sharpConfidence ?? 0) >= 55;
            const tone: "good" | "bad" | "neutral" = sharpOnOurSide ? "good" : moneyPct < 40 ? "bad" : "neutral";
            return <Chip icon={DollarSign} label={`Sharps ${moneyPct}% · Public ${betPct}%`} tone={tone} />;
          })()}
          {/* Reverse line movement */}
          {pick.sharpIntel?.betting?.reverseLineMovement && (
            <Chip icon={TrendingUp} label="Reverse line movement" tone="good" />
          )}
          {/* Rest edge */}
          {(() => {
            const r = pick.sharpIntel?.rest;
            if (!r || r.restAdvantage == null || (r.restEdge ?? 0) < 1) return null;
            const onOurSide = r.restAdvantage === pick.selectionSide;
            return <Chip icon={Activity} label={`${Math.abs(r.restDiff ?? 0)}d rest edge`} tone={onOurSide ? "good" : "bad"} />;
          })()}
          {/* Weather alert */}
          {pick.sharpIntel?.weather?.weatherAlert && (
            <Chip icon={AlertTriangle} label={pick.sharpIntel.weather.weatherAlert} tone={pick.sharpIntel.weather.affectsPlay ? "bad" : "neutral"} />
          )}
        </div>

        {(pick.reasonsAgainst.length > 0 || pick.aiExplanation?.killCase) && (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-amber-400 mb-2">
              <TrendingDown className="h-3.5 w-3.5" /> The risk — staying 100% real
            </div>
            {pick.aiExplanation?.killCase && <p className="text-sm text-white/55 leading-relaxed mb-2">{pick.aiExplanation.killCase}</p>}
            <ul className="space-y-1.5">
              {pick.reasonsAgainst.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-white/50 leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/60" /> {r}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}
