// Turns one of our picks + the live game feed into a customer-facing status:
// is it upcoming / live / final, the current score + clock, a live "are we winning
// the bet" meter (0-100), and once final, whether the pick won or lost.
// Pure functions only — no React — so it's safe to use anywhere.

export interface LiveGame {
  id: string;
  isLive: boolean;
  isFinal: boolean;
  isScheduled: boolean;
  homeScore: number;
  awayScore: number;
  period: string;
  clock: string;
  homeTeam: string;
  awayTeam: string;
}

// Minimal shape we need from a pick to grade it (kept structural to avoid imports).
export interface GradablePick {
  league: string;
  selection: string;
  selectionSide: "home" | "away";
  marketType: string;
  spread: number | null;
  total: number | null;
}

export interface LivePickState {
  state: "pre" | "live" | "final";
  awayScore: number;
  homeScore: number;
  period: string;
  clock: string;
  /** 0-100 "are we winning the bet" meter. null when the market can't be graded live (props/NRFI). */
  meterPct: number | null;
  /** Final grade once the game is over. */
  result: "won" | "lost" | "push" | null;
  /** Live direction while in progress. */
  trend: "up" | "down" | "even" | null;
  /** Name of the team currently/finally ahead (null if tied). */
  leaderName: string | null;
  /** True if we could map this market to a live meter / final grade. */
  gradable: boolean;
}

type Market = "spread" | "moneyline" | "total-over" | "total-under" | "other";

function trailingNumber(s: string): number | null {
  const m = s.match(/([+-]?\d+(?:\.\d+)?)\s*$/);
  return m ? Number.parseFloat(m[1]) : null;
}

function signedNumber(s: string): number | null {
  const m = s.match(/([+-]\d+(?:\.\d+)?)/);
  return m ? Number.parseFloat(m[1]) : null;
}

function detectMarket(pick: GradablePick): Market {
  const sel = (pick.selection || "").toLowerCase();
  const mt = (pick.marketType || "").toLowerCase();
  // WORD-BOUNDARY checks below so team names containing "under" (e.g. "Thunder") aren't
  // misclassified as totals.
  if (/\bnrfi\b/.test(sel) || /\bno runs\b/.test(sel) || mt.includes("nrfi")) return "other";
  if (/\bover\b/.test(sel) || mt === "over") return "total-over";
  if (/\bunder\b/.test(sel) || mt === "under") return "total-under";
  if (mt.includes("total")) return /\bunder\b/.test(sel) ? "total-under" : "total-over";
  if (/\bml\b/.test(sel) || /\bmoneyline\b/.test(sel) || sel.includes("money line") || mt === "ml" || mt.includes("moneyline")) return "moneyline";
  if (signedNumber(pick.selection || "") != null || mt.includes("spread") || mt.includes("run line") || mt.includes("runline") || mt.includes("puck")) return "spread";
  return "other";
}

// How many "meter points" one unit of margin is worth, per sport. Low-scoring sports
// move the meter more per run/goal; high-scoring sports move it less per point.
function marginScale(league: string): number {
  const l = (league || "").toLowerCase();
  if (l.includes("mlb") || l.includes("baseball")) return 14;
  if (l.includes("nhl") || l.includes("hockey")) return 16;
  if (l.includes("soccer")) return 20;
  return 3.2; // NBA / WNBA / NFL / college
}

function clampMeter(pct: number): number {
  return Math.max(4, Math.min(98, pct));
}

export function computeLiveState(pick: GradablePick, g: LiveGame | undefined | null): LivePickState | null {
  if (!g) return null;
  const state: LivePickState["state"] = g.isLive ? "live" : g.isFinal ? "final" : "pre";

  const pickedScore = pick.selectionSide === "home" ? g.homeScore : g.awayScore;
  const oppScore = pick.selectionSide === "home" ? g.awayScore : g.homeScore;
  const rawMargin = pickedScore - oppScore;
  const totalScore = g.homeScore + g.awayScore;

  const market = detectMarket(pick);
  let coverMargin: number | null = null;

  if (market === "moneyline") {
    coverMargin = rawMargin;
  } else if (market === "spread") {
    // Prefer the number printed in the selection (e.g. "Team -1.5"); fall back to pick.spread.
    let sp = signedNumber(pick.selection || "");
    if (sp == null && typeof pick.spread === "number") {
      // pick.spread is the home spread by convention; flip for the away side.
      sp = pick.selectionSide === "home" ? pick.spread : -pick.spread;
    }
    coverMargin = sp != null ? rawMargin + sp : rawMargin;
  } else if (market === "total-over") {
    const line = trailingNumber(pick.selection || "") ?? pick.total;
    if (line != null) coverMargin = totalScore - line;
  } else if (market === "total-under") {
    const line = trailingNumber(pick.selection || "") ?? pick.total;
    if (line != null) coverMargin = line - totalScore;
  }

  const gradable = coverMargin != null;
  const k = marginScale(pick.league);

  let meterPct: number | null = null;
  let result: LivePickState["result"] = null;
  let trend: LivePickState["trend"] = null;

  if (coverMargin != null) {
    if (state === "final") {
      result = coverMargin > 0 ? "won" : coverMargin < 0 ? "lost" : "push";
      meterPct = result === "won" ? 100 : result === "lost" ? 0 : 50;
    } else if (state === "live") {
      meterPct = clampMeter(50 + coverMargin * k);
      trend = coverMargin > 0 ? "up" : coverMargin < 0 ? "down" : "even";
    }
  }

  const leaderName =
    g.homeScore === g.awayScore ? null : g.homeScore > g.awayScore ? g.homeTeam : g.awayTeam;

  return {
    state,
    awayScore: g.awayScore,
    homeScore: g.homeScore,
    period: g.period || "",
    clock: g.clock || "",
    meterPct,
    result,
    trend,
    leaderName,
    gradable,
  };
}
