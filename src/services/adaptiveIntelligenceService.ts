import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

export type AdaptationMode = 'normal' | 'tightened' | 'defensive';

export interface AdaptivePolicy {
  mode: AdaptationMode;
  minEdgeScore: number;
  minConfirmingSignals: number;
  minDataQualityScore: number;
  maxCandidatesPerLane: number;
  blockedMarketTypes: string[];
  signalWeights: {
    lineValue: number;
    lineMovement: number;
    clvProjection: number;
    injuryNews: number;
    matchup: number;
    situational: number;
    marketOverreaction: number;
    volatilityPenalty: number;
    uncertaintyPenalty: number;
  };
  sportAdjustments: Record<string, { volumeMultiplier: number; edgeLift: number }>;
  laneMinEdge: {
    domestic: number;
    soccer: number;
    tennis: number;
    overseas: number;
  };
  notes: string[];
  generatedAt: string;
  sourceWindowDays: number;
}

interface SnapshotRow {
  sport: string;
  league: string;
  category: string;
  market_type: string;
  result: string;
  edge_score: number | null;
  clv_delta: number | null;
  research_payload: any;
  edge_signals: any;
  odds: string | null;
}

let schemaReady = false;

function defaultPolicy(): AdaptivePolicy {
  return {
    mode: 'normal',
    minEdgeScore: 50,
    minConfirmingSignals: 2,
    minDataQualityScore: 60,
    maxCandidatesPerLane: 12,
    blockedMarketTypes: [],
    signalWeights: {
      lineValue: 1,
      lineMovement: 1,
      clvProjection: 1,
      injuryNews: 1,
      matchup: 1,
      situational: 1,
      marketOverreaction: 1,
      volatilityPenalty: 1,
      uncertaintyPenalty: 1,
    },
    sportAdjustments: {},
    laneMinEdge: {
      domestic: 50,
      soccer: 52,
      tennis: 52,
      overseas: 55,
    },
    notes: ['Baseline policy active.'],
    generatedAt: new Date().toISOString(),
    sourceWindowDays: 7,
  };
}

async function ensurePolicySchema() {
  if (schemaReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS himothy_adaptive_policy (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      policy_json JSONB NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_himo_adaptive_policy_created_at
    ON himothy_adaptive_policy(created_at DESC);
  `);

  schemaReady = true;
}

function safePct(n: number, d: number) {
  if (d <= 0) return 0;
  return (n / d) * 100;
}

function inferLane(payload: any): 'domestic' | 'soccer' | 'tennis' | 'overseas' {
  const lane = payload?.lane;
  if (lane === 'soccer' || lane === 'tennis' || lane === 'overseas') return lane;
  return 'domestic';
}

function computeUnits(result: string, odds?: string | null) {
  if (result === 'win') {
    const o = Number.parseFloat(String(odds || '').replace('+', ''));
    if (!Number.isFinite(o) || o === 0) return 1;
    if (o > 0) return o / 100;
    return 100 / Math.abs(o);
  }
  if (result === 'loss') return -1;
  return 0;
}

export async function getActiveAdaptivePolicy(): Promise<AdaptivePolicy> {
  await ensurePolicySchema();

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT policy_json
      FROM himothy_adaptive_policy
      ORDER BY created_at DESC
      LIMIT 1
    `
  );

  if (!rows[0]?.policy_json) return defaultPolicy();

  const parsed = rows[0].policy_json as AdaptivePolicy;
  return {
    ...defaultPolicy(),
    ...parsed,
    signalWeights: {
      ...defaultPolicy().signalWeights,
      ...(parsed?.signalWeights || {}),
    },
    sportAdjustments: {
      ...defaultPolicy().sportAdjustments,
      ...(parsed?.sportAdjustments || {}),
    },
    laneMinEdge: {
      ...defaultPolicy().laneMinEdge,
      ...(parsed?.laneMinEdge || {}),
    },
  };
}

type SignalKey = keyof AdaptivePolicy['signalWeights'];

function toWeight(score: number) {
  return Number(Math.min(1.2, Math.max(0.8, score)).toFixed(2));
}

function getSignalValue(signals: any, key: SignalKey) {
  const value = signals?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function learnSignalWeights(rows: SnapshotRow[]) {
  const base = defaultPolicy().signalWeights;
  const signalKeys = Object.keys(base) as SignalKey[];
  const graded = rows.filter((row) => row.result === 'win' || row.result === 'loss');
  const wins = graded.filter((row) => row.result === 'win').length;
  const losses = graded.filter((row) => row.result === 'loss').length;
  const baseline = wins + losses > 0 ? wins / (wins + losses) : 0.5;

  const learned: AdaptivePolicy['signalWeights'] = { ...base };
  const diagnostics: Record<string, { highSample: number; highWinRate: number; weight: number }> = {};

  for (const key of signalKeys) {
    const scored = graded
      .map((row) => ({
        result: row.result,
        value: getSignalValue(row.edge_signals || row.research_payload?.edgeSignals, key),
      }))
      .sort((a, b) => b.value - a.value);

    if (scored.length < 12) {
      diagnostics[key] = {
        highSample: scored.length,
        highWinRate: Number((baseline * 100).toFixed(1)),
        weight: learned[key],
      };
      continue;
    }

    const topN = Math.max(3, Math.floor(scored.length * 0.25));
    const highBand = scored.slice(0, topN);
    const highWins = highBand.filter((item) => item.result === 'win').length;
    const highWinRate = highBand.length ? highWins / highBand.length : baseline;
    const delta = highWinRate - baseline;

    learned[key] = toWeight(1 + delta);
    diagnostics[key] = {
      highSample: highBand.length,
      highWinRate: Number((highWinRate * 100).toFixed(1)),
      weight: learned[key],
    };
  }

  return {
    learned,
    diagnostics,
    baselineWinRate: Number((baseline * 100).toFixed(1)),
  };
}

export async function reviewAndAdaptPolicy(windowDays = 7) {
  await ensurePolicySchema();

  const rows = await prisma.$queryRawUnsafe<SnapshotRow[]>(
    `
      SELECT sport, league, category, market_type, result, edge_score, clv_delta, research_payload, edge_signals, odds
      FROM himothy_pick_registry
      WHERE board_date >= NOW()::date - ($1::int || ' days')::interval
        AND status IN ('graded','archived')
        AND is_public = TRUE
      ORDER BY board_date DESC, publish_time DESC NULLS LAST
    `,
    windowDays
  );

  if (rows.length < 8) {
    return {
      policy: await getActiveAdaptivePolicy(),
      diagnostics: {
        sampleSize: rows.length,
        message: 'Insufficient graded sample for adaptation. Keeping current policy.',
      },
      updated: false,
    };
  }

  let wins = 0;
  let losses = 0;
  let units = 0;
  let clvTracked = 0;
  let clvBeat = 0;

  const byMarket: Record<string, { count: number; wins: number; losses: number; clvTracked: number; clvBeat: number }> = {};
  const bySport: Record<string, { count: number; wins: number; losses: number; clvTracked: number; clvBeat: number }> = {};
  const byLeague: Record<string, { count: number; wins: number; losses: number; clvTracked: number; clvBeat: number }> = {};
  const byCategory: Record<string, { count: number; wins: number; losses: number; clvTracked: number; clvBeat: number }> = {};
  const byLane: Record<'domestic' | 'soccer' | 'tennis' | 'overseas', { count: number; wins: number; losses: number }> = {
    domestic: { count: 0, wins: 0, losses: 0 },
    soccer: { count: 0, wins: 0, losses: 0 },
    tennis: { count: 0, wins: 0, losses: 0 },
    overseas: { count: 0, wins: 0, losses: 0 },
  };

  for (const row of rows) {
    const sport = row.sport || 'unknown';
    const league = row.league || 'unknown';
    const category = row.category || 'unknown';
    const market = row.market_type || 'unknown';
    if (!byMarket[market]) {
      byMarket[market] = { count: 0, wins: 0, losses: 0, clvTracked: 0, clvBeat: 0 };
    }
    if (!bySport[sport]) {
      bySport[sport] = { count: 0, wins: 0, losses: 0, clvTracked: 0, clvBeat: 0 };
    }
    if (!byLeague[league]) {
      byLeague[league] = { count: 0, wins: 0, losses: 0, clvTracked: 0, clvBeat: 0 };
    }
    if (!byCategory[category]) {
      byCategory[category] = { count: 0, wins: 0, losses: 0, clvTracked: 0, clvBeat: 0 };
    }

    const lane = inferLane(row.research_payload);
    byLane[lane].count += 1;
    byMarket[market].count += 1;
    bySport[sport].count += 1;
    byLeague[league].count += 1;
    byCategory[category].count += 1;

    if (row.result === 'win') {
      wins += 1;
      units += computeUnits(row.result, row.odds);
      byMarket[market].wins += 1;
      byLane[lane].wins += 1;
      bySport[sport].wins += 1;
      byLeague[league].wins += 1;
      byCategory[category].wins += 1;
    } else if (row.result === 'loss') {
      losses += 1;
      units += computeUnits(row.result, row.odds);
      byMarket[market].losses += 1;
      byLane[lane].losses += 1;
      bySport[sport].losses += 1;
      byLeague[league].losses += 1;
      byCategory[category].losses += 1;
    }

    if (row.clv_delta != null) {
      clvTracked += 1;
      byMarket[market].clvTracked += 1;
      bySport[sport].clvTracked += 1;
      byLeague[league].clvTracked += 1;
      byCategory[category].clvTracked += 1;
      if (row.clv_delta < 0) {
        clvBeat += 1;
        byMarket[market].clvBeat += 1;
        bySport[sport].clvBeat += 1;
        byLeague[league].clvBeat += 1;
        byCategory[category].clvBeat += 1;
      }
    }
  }

  const winRate = safePct(wins, wins + losses);
  const clvBeatRate = safePct(clvBeat, clvTracked);

  let mode: AdaptationMode = 'normal';
  if (winRate < 43 || units < -6 || (clvTracked >= 10 && clvBeatRate < 45)) mode = 'defensive';
  else if (winRate < 48 || units < -3 || (clvTracked >= 10 && clvBeatRate < 50)) mode = 'tightened';

  const policy = defaultPolicy();
  policy.mode = mode;
  policy.sourceWindowDays = windowDays;

  if (mode === 'tightened') {
    policy.minEdgeScore = 58;
    policy.minConfirmingSignals = 3;
    policy.minDataQualityScore = 65;
    policy.maxCandidatesPerLane = 8;
    policy.notes = ['Underperformance detected. Tightening thresholds and reducing volume.'];
  }

  if (mode === 'defensive') {
    policy.minEdgeScore = 65;
    policy.minConfirmingSignals = 4;
    policy.minDataQualityScore = 70;
    policy.maxCandidatesPerLane = 5;
    policy.notes = ['Defensive mode active. Only highest-quality opportunities are allowed.'];
  }

  const blocked: string[] = [];
  for (const [market, stat] of Object.entries(byMarket)) {
    const mWinRate = safePct(stat.wins, stat.wins + stat.losses);
    const mClvBeat = safePct(stat.clvBeat, stat.clvTracked);
    if (stat.count >= 8 && (mWinRate < 40 || (stat.clvTracked >= 5 && mClvBeat < 45))) {
      blocked.push(market);
    }
  }

  policy.blockedMarketTypes = blocked;

  const signalLearning = learnSignalWeights(rows);
  policy.signalWeights = signalLearning.learned;

  // Sport strategy: never lower standards, only adjust volume up for strong sports and tighten weak sports.
  const sportAdjustments: Record<string, { volumeMultiplier: number; edgeLift: number }> = {};
  for (const [sport, stat] of Object.entries(bySport)) {
    const sportWin = safePct(stat.wins, stat.wins + stat.losses);
    const sportClv = safePct(stat.clvBeat, stat.clvTracked);
    if (stat.count >= 6 && sportWin >= 55 && (stat.clvTracked < 5 || sportClv >= 52)) {
      sportAdjustments[sport] = { volumeMultiplier: 1.35, edgeLift: 0 };
      policy.notes.push(`${sport} volume increased due to stable performance without lowering edge standards.`);
      continue;
    }

    if (stat.count >= 6 && (sportWin < 45 || (stat.clvTracked >= 5 && sportClv < 48))) {
      sportAdjustments[sport] = { volumeMultiplier: 0.7, edgeLift: 5 };
      policy.notes.push(`${sport} tightened due to underperformance: lower volume, higher edge requirement.`);
      continue;
    }

    sportAdjustments[sport] = { volumeMultiplier: 1, edgeLift: 0 };
  }

  policy.sportAdjustments = sportAdjustments;

  // Lane-level selective tightening
  for (const [lane, stat] of Object.entries(byLane) as Array<[keyof typeof byLane, { count: number; wins: number; losses: number }]>) {
    const laneWin = safePct(stat.wins, stat.wins + stat.losses);
    if (stat.count >= 6 && laneWin < 45) {
      policy.laneMinEdge[lane] = Math.max(policy.laneMinEdge[lane], policy.minEdgeScore + 5);
      policy.notes.push(`${lane} lane tightened due to recent underperformance.`);
    }
  }

  policy.notes.push(`Signal learning baseline win rate: ${signalLearning.baselineWinRate}%`);

  policy.generatedAt = new Date().toISOString();

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO himothy_adaptive_policy (id, mode, policy_json, notes, created_at)
      VALUES ($1, $2, $3::jsonb, $4, NOW())
    `,
    randomUUID(),
    policy.mode,
    JSON.stringify(policy),
    policy.notes.join(' ')
  );

  return {
    policy,
    diagnostics: {
      sampleSize: rows.length,
      winRate: Number(winRate.toFixed(1)),
      units: Number(units.toFixed(2)),
      clvBeatRate: Number(clvBeatRate.toFixed(1)),
      blockedMarkets: blocked,
      signalLearning: signalLearning.diagnostics,
      bySport,
      byLeague,
      byCategory,
      sportAdjustments,
    },
    updated: true,
  };
}
