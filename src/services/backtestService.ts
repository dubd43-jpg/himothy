// BACKTEST + CALIBRATION FRAMEWORK
//
// The single highest-impact thing we can do for win rate. Right now we
// hand-tune signal weights based on intuition. Without backtests, we don't
// know if any of those weights actually predict winners.
//
// This service does three things:
//
// 1. CALIBRATION — plot predicted confidence vs ACTUAL win rate from graded
//    picks. A perfectly calibrated 85 should win 85% of the time. If our 85s
//    only win 70%, we're overconfident → cap conf scores down.
//
// 2. SIGNAL ROI ATTRIBUTION — for each signal the engine collects (park
//    factor, devig, sharp money, bullpen, ref crew, etc.), compute the win
//    rate on picks WHERE THAT SIGNAL FIRED versus picks where it didn't.
//    The signals with negative or zero ROI delta are noise. Drop them.
//    The high-ROI ones get more weight.
//
// 3. TIER ROI — measure W/L/units by tier (Grand Slam, Pressure, VIP, Parlay)
//    so we can see WHICH PRODUCTS actually have edge vs which are slot-filled.
//
// Reads from himothy_pick_registry — every graded pick we've ever recorded.

import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';

interface RegistryRow {
  id: string;
  board_date: Date;
  category: string;
  league: string;
  market_type: string;
  selection: string;
  odds: string | null;
  edge_score: number | null;
  result: string;
  research_payload: any;
}

function americanToUnits(odds: string | null, result: string): number {
  if (result !== 'win' && result !== 'loss') return 0;
  const m = String(odds || '').match(/[+-]?\d{2,4}/);
  if (!m) return result === 'win' ? 1 : -1;
  const n = Number(m[0]);
  if (!isFinite(n) || n === 0) return result === 'win' ? 1 : -1;
  if (result === 'loss') return -1;
  return n > 0 ? n / 100 : 100 / Math.abs(n);
}

export interface CalibrationBucket {
  confidenceBand: string;     // e.g. "80-84"
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  predictedWinRate: number;   // midpoint of the band (e.g. 82)
  actualWinRate: number | null;
  miscalibration: number | null;  // actual - predicted; negative = overconfident
  units: number;
}

export interface SignalRoiRow {
  signalName: string;
  picksWithSignal: number;
  picksWithoutSignal: number;
  winRateWith: number | null;
  winRateWithout: number | null;
  winRateDelta: number | null;     // with - without (positive = signal helps)
  unitsWith: number;
  unitsWithout: number;
  roiDelta: number | null;         // units/pick delta
  verdict: 'predictive' | 'neutral' | 'noise';
}

export interface TierRoiRow {
  category: string;
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  units: number;
  winRate: number | null;
  roi: number | null;
}

export interface BacktestResult {
  asOf: string;
  windowDays: number;
  totalPicks: number;
  totalDecided: number;
  calibration: CalibrationBucket[];
  signalRoi: SignalRoiRow[];
  tierRoi: TierRoiRow[];
  recommendations: string[];
}

// ─── Calibration ──────────────────────────────────────────────────────────

function bandFor(score: number): string {
  if (score >= 95) return '95-100';
  if (score >= 90) return '90-94';
  if (score >= 85) return '85-89';
  if (score >= 80) return '80-84';
  if (score >= 75) return '75-79';
  if (score >= 70) return '70-74';
  if (score >= 60) return '60-69';
  return '<60';
}
function bandMidpoint(band: string): number {
  if (band === '95-100') return 97.5;
  if (band === '90-94') return 92;
  if (band === '85-89') return 87;
  if (band === '80-84') return 82;
  if (band === '75-79') return 77;
  if (band === '70-74') return 72;
  if (band === '60-69') return 65;
  return 50;
}

function computeCalibration(rows: RegistryRow[]): CalibrationBucket[] {
  const map = new Map<string, CalibrationBucket>();
  for (const r of rows) {
    const conf = r.edge_score == null ? 50 : Number(r.edge_score);
    const band = bandFor(conf);
    if (!map.has(band)) {
      map.set(band, {
        confidenceBand: band,
        picks: 0, wins: 0, losses: 0, pushes: 0,
        predictedWinRate: bandMidpoint(band),
        actualWinRate: null, miscalibration: null, units: 0,
      });
    }
    const b = map.get(band)!;
    b.picks++;
    if (r.result === 'win') b.wins++;
    else if (r.result === 'loss') b.losses++;
    else if (r.result === 'push') b.pushes++;
    b.units += americanToUnits(r.odds, r.result);
  }
  for (const b of Array.from(map.values())) {
    const decided = b.wins + b.losses;
    if (decided > 0) {
      b.actualWinRate = Number(((b.wins / decided) * 100).toFixed(1));
      b.miscalibration = Number((b.actualWinRate - b.predictedWinRate).toFixed(1));
    }
    b.units = Number(b.units.toFixed(2));
  }
  // Sort bands DESC by predicted (95-100 → <60)
  return Array.from(map.values()).sort((a, b) => b.predictedWinRate - a.predictedWinRate);
}

// ─── Signal ROI attribution ──────────────────────────────────────────────

const SIGNAL_PROBES: Array<{ name: string; test: (payload: any) => boolean }> = [
  { name: 'park_factor_present', test: (p) => !!p?.extraSignals?.park },
  { name: 'park_hitter_friendly', test: (p) => (p?.extraSignals?.park?.runs ?? 100) >= 105 },
  { name: 'park_pitcher_friendly', test: (p) => (p?.extraSignals?.park?.runs ?? 100) <= 95 },
  { name: 'venue_altitude_high', test: (p) => p?.extraSignals?.venue?.altitude === 'high' },
  { name: 'devig_edge_positive_2pt', test: (p) => {
      const d = p?.extraSignals?.devig;
      if (!d || p?.modelProjectedWinProb == null) return false;
      const fair = p.selectionSide === 'home' ? d.homeFair : d.awayFair;
      return (p.modelProjectedWinProb - fair) >= 0.02;
  }},
  { name: 'sharp_money_aligned', test: (p) => p?.signals?.sharpMoneyAligned === true },
  { name: 'reverse_line_movement', test: (p) => p?.signals?.reverseLineMovement === true },
  { name: 'sharp_line_detected', test: (p) => p?.signals?.sharpLineDetected === true },
  { name: 'line_moved_toward_us', test: (p) => (p?.signals?.mlMovementForSide ?? 0) >= 10 },
  { name: 'line_moved_against_us', test: (p) => (p?.signals?.mlMovementForSide ?? 0) <= -10 },
  { name: 'opp_b2b', test: (p) => p?.signals?.oppOnB2B === true },
  { name: 'rest_advantage', test: (p) => p?.signals?.restAdvantage === true },
  { name: 'opp_bullpen_gassed', test: (p) => p?.extraSignals?.bullpen?.opp?.exhaustion === 'gassed' },
  { name: 'our_bullpen_gassed', test: (p) => p?.extraSignals?.bullpen?.picked?.exhaustion === 'gassed' },
  { name: 'umpire_pro_total', test: (p) => p?.extraSignals?.umpire?.totalsLean === 'over' },
  { name: 'umpire_anti_total', test: (p) => p?.extraSignals?.umpire?.totalsLean === 'under' },
  { name: 'ref_crew_pro_total', test: (p) => {
      const adj = p?.extraSignals?.referees?.totalsAdjustment;
      return adj != null && adj >= 1;
  }},
  { name: 'ats_pick_side_strong', test: (p) => (p?.signals?.atsCoverPct ?? 0) >= 60 },
  { name: 'opp_ats_weak', test: (p) => (p?.signals?.atsCoverPctOpp ?? 50) <= 40 },
  { name: 'star_questionable_pick_side', test: (p) => !!p?.starQuestionablePickSide },
  { name: 'star_questionable_opp_side', test: (p) => !!p?.starQuestionableOppSide },
  { name: 'mlb_pitcher_era_diff_2pt', test: (p) => {
      const our = p?.signals?.pickedPitcherEraL5 ?? 0;
      const opp = p?.signals?.oppPitcherEraL5 ?? 0;
      return our > 0 && opp > 0 && (opp - our) >= 2;
  }},
  { name: 'recent_form_hot', test: (p) => (p?.signals?.recentFormStreak ?? 0) >= 3 },
  { name: 'recent_form_cold', test: (p) => (p?.signals?.recentFormStreak ?? 0) <= -3 },
  { name: 'weather_wind_strong', test: (p) => Math.abs(p?.signals?.weatherWindNudge ?? 0) >= 0.5 },
  { name: 'travel_severe_penalty', test: (p) => p?.extraSignals?.travel?.bodyClockPenalty === 'severe' },
];

function computeSignalRoi(rows: RegistryRow[]): SignalRoiRow[] {
  const out: SignalRoiRow[] = [];
  const decidedRows = rows.filter((r) => r.result === 'win' || r.result === 'loss');
  for (const probe of SIGNAL_PROBES) {
    const withRows = decidedRows.filter((r) => probe.test(r.research_payload));
    const withoutRows = decidedRows.filter((r) => !probe.test(r.research_payload));
    const winRateWith = withRows.length === 0 ? null : Number(((withRows.filter((r) => r.result === 'win').length / withRows.length) * 100).toFixed(1));
    const winRateWithout = withoutRows.length === 0 ? null : Number(((withoutRows.filter((r) => r.result === 'win').length / withoutRows.length) * 100).toFixed(1));
    const unitsWith = withRows.reduce((s, r) => s + americanToUnits(r.odds, r.result), 0);
    const unitsWithout = withoutRows.reduce((s, r) => s + americanToUnits(r.odds, r.result), 0);
    const winRateDelta = winRateWith != null && winRateWithout != null ? Number((winRateWith - winRateWithout).toFixed(1)) : null;
    const roiDelta = withRows.length > 0 && withoutRows.length > 0
      ? Number((((unitsWith / withRows.length) - (unitsWithout / withoutRows.length)) * 100).toFixed(1))
      : null;
    let verdict: 'predictive' | 'neutral' | 'noise' = 'neutral';
    if (winRateDelta != null && roiDelta != null) {
      if (winRateDelta >= 3 && roiDelta >= 2) verdict = 'predictive';
      else if (winRateDelta <= -2 || roiDelta <= -2) verdict = 'noise';
    }
    out.push({
      signalName: probe.name,
      picksWithSignal: withRows.length,
      picksWithoutSignal: withoutRows.length,
      winRateWith, winRateWithout, winRateDelta,
      unitsWith: Number(unitsWith.toFixed(2)),
      unitsWithout: Number(unitsWithout.toFixed(2)),
      roiDelta,
      verdict,
    });
  }
  // Sort by abs(winRateDelta) DESC — most predictive (or anti-predictive) first.
  return out.sort((a, b) => Math.abs(b.winRateDelta ?? 0) - Math.abs(a.winRateDelta ?? 0));
}

// ─── Tier ROI ─────────────────────────────────────────────────────────────

function computeTierRoi(rows: RegistryRow[]): TierRoiRow[] {
  const map = new Map<string, TierRoiRow>();
  for (const r of rows) {
    const cat = r.category || 'OTHER';
    if (!map.has(cat)) {
      map.set(cat, { category: cat, picks: 0, wins: 0, losses: 0, pushes: 0, units: 0, winRate: null, roi: null });
    }
    const b = map.get(cat)!;
    b.picks++;
    if (r.result === 'win') b.wins++;
    else if (r.result === 'loss') b.losses++;
    else if (r.result === 'push') b.pushes++;
    b.units += americanToUnits(r.odds, r.result);
  }
  for (const b of Array.from(map.values())) {
    const decided = b.wins + b.losses;
    b.winRate = decided === 0 ? null : Number(((b.wins / decided) * 100).toFixed(1));
    b.roi = b.picks === 0 ? null : Number(((b.units / b.picks) * 100).toFixed(1));
    b.units = Number(b.units.toFixed(2));
  }
  return Array.from(map.values()).sort((a, b) => (b.roi ?? -999) - (a.roi ?? -999));
}

// ─── Recommendations ──────────────────────────────────────────────────────

function buildRecommendations(cal: CalibrationBucket[], signalRoi: SignalRoiRow[], tiers: TierRoiRow[]): string[] {
  const recs: string[] = [];

  // Calibration: any band >10pt miscalibrated with >=20 picks
  for (const b of cal) {
    if (b.miscalibration != null && Math.abs(b.miscalibration) >= 10 && b.picks >= 20) {
      const verb = b.miscalibration > 0 ? 'UNDERCONFIDENT' : 'OVERCONFIDENT';
      recs.push(`Conf band ${b.confidenceBand}: ${verb} by ${Math.abs(b.miscalibration).toFixed(1)}pt over ${b.picks} picks. Predicted ~${b.predictedWinRate.toFixed(0)}%, actual ${b.actualWinRate}%. Consider ${b.miscalibration > 0 ? 'raising' : 'lowering'} the score range.`);
    }
  }

  // Signals: top 3 predictive + top 3 noise (with adequate sample)
  const predictive = signalRoi.filter((s) => s.verdict === 'predictive' && s.picksWithSignal >= 20).slice(0, 3);
  for (const s of predictive) {
    recs.push(`SIGNAL "${s.signalName}" is PREDICTIVE: +${s.winRateDelta}pt win-rate vs without, +${s.roiDelta}pt ROI. Consider weighting this signal higher.`);
  }
  const noise = signalRoi.filter((s) => s.verdict === 'noise' && s.picksWithSignal >= 20).slice(0, 3);
  for (const s of noise) {
    recs.push(`SIGNAL "${s.signalName}" looks like NOISE: ${s.winRateDelta}pt win-rate delta. Consider removing or inverting.`);
  }

  // Tiers: any tier with negative ROI over significant sample
  for (const t of tiers) {
    if (t.roi != null && t.roi < -3 && t.picks >= 25) {
      recs.push(`TIER "${t.category}": negative ROI (${t.roi}%) over ${t.picks} graded picks. Audit this product's rules.`);
    }
  }

  if (recs.length === 0) {
    recs.push('Sample sizes are still low for confident recommendations. Backtest will sharpen as more picks settle.');
  }
  return recs;
}

// ─── Public entry point ───────────────────────────────────────────────────

export async function runBacktest(windowDays = 60): Promise<BacktestResult> {
  if (!hasDatabase()) {
    return {
      asOf: new Date().toISOString(), windowDays, totalPicks: 0, totalDecided: 0,
      calibration: [], signalRoi: [], tierRoi: [],
      recommendations: ['Database not configured.'],
    };
  }
  const rows = await prisma.$queryRawUnsafe<RegistryRow[]>(
    `SELECT id, board_date, category, league, market_type, selection, odds,
            edge_score, result, research_payload
       FROM himothy_pick_registry
      WHERE board_date >= NOW() - INTERVAL '${windowDays} days'
        AND status IN ('published','locked','graded','archived','settled')
        AND result IN ('win','loss','push')`,
  ).catch(() => [] as RegistryRow[]);

  const decided = rows.filter((r) => r.result === 'win' || r.result === 'loss');
  const calibration = computeCalibration(rows);
  const signalRoi = computeSignalRoi(rows);
  const tierRoi = computeTierRoi(rows);

  return {
    asOf: new Date().toISOString(),
    windowDays,
    totalPicks: rows.length,
    totalDecided: decided.length,
    calibration,
    signalRoi,
    tierRoi,
    recommendations: buildRecommendations(calibration, signalRoi, tierRoi),
  };
}
