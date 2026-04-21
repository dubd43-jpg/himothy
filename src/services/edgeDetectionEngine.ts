import { buildResearchDossier } from '@/services/researchEngine';
import { scoreBetAngle } from '@/services/scoringModel';
import { LEAGUE_URLS } from '@/lib/validation';
import { AdaptivePolicy, getActiveAdaptivePolicy } from '@/services/adaptiveIntelligenceService';
import { generateExplanation } from '@/services/aiGenerator';

export type ResearchLane = 'domestic' | 'soccer' | 'tennis' | 'overseas';

export const RESEARCH_LANE_LEAGUES: Record<ResearchLane, string[]> = {
  domestic: [
    'NFL',
    'NBA',
    'MLB',
    'NHL',
    'NCAA Basketball',
    'NCAA',
    'College Basketball',
  ],
  soccer: [
    'Soccer - EPL',
    'Soccer - La Liga',
    'Soccer - Serie A',
    'Soccer - Bundesliga',
    'Soccer - Ligue 1',
    'Soccer - Champions League',
  ],
  tennis: ['Tennis - ATP', 'Tennis - WTA', 'Tennis'],
  overseas: ['Italy Serie A', 'Denmark Superliga', 'Poland Ekstraklasa', 'Romania Liga 1', 'Netherlands Eredivisie'],
};

export interface EdgeSignals {
  lineValue: number;
  lineMovement: number;
  clvProjection: number;
  injuryNews: number;
  matchup: number;
  situational: number;
  marketOverreaction: number;
  volatilityPenalty: number;
  uncertaintyPenalty: number;
}

export interface EdgeEvaluation {
  edgeScore: number;
  signals: EdgeSignals;
  confirmingSignals: number;
  dataQualityScore: number;
  shouldPublish: boolean;
  targetProductLine: 'HIMOTHY CORE' | 'Pressure Pack' | 'Parlay Center' | 'PASS';
  reasoningSummary: string;
  riskSummary: string;
  projectedClosingOdds: string | null;
  clvProjectionDelta: number | null;
}

export interface MarketContext {
  gameId: string;
  sport: string;
  league: string;
  eventName: string;
  marketType: string;
  selection: string;
  line?: string | null;
  odds?: string | null;
  marketOpenOdds?: string | null;
  lane: ResearchLane;
}

export interface EdgeScanCandidate {
  gameId: string;
  eventName: string;
  sport: string;
  league: string;
  lane: ResearchLane;
  homeTeam: string;
  awayTeam: string;
  marketType: string;
  selection: string;
  line: string | null;
  odds: string | null;
  marketOpenOdds: string | null;
  startTime: string;
  edge: EdgeEvaluation;
}

export interface EdgeScanLaneResult {
  lane: ResearchLane;
  leagues: string[];
  candidates: EdgeScanCandidate[];
  rejectedLowData: number;
}

function parseAmericanOdds(odds?: string | null) {
  if (!odds) return NaN;
  const match = String(odds).match(/[+-]?\d{3,4}/);
  if (!match) return NaN;
  const val = Number.parseInt(match[0], 10);
  return Number.isFinite(val) ? val : NaN;
}

function oddsToProb(american: number) {
  if (!Number.isFinite(american) || american === 0) return 0.5;
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

function probToAmerican(prob: number) {
  const p = Math.min(Math.max(prob, 0.01), 0.99);
  if (p >= 0.5) return Math.round((-100 * p) / (1 - p));
  return Math.round((100 * (1 - p)) / p);
}

function impliedEdgeScore(projectedProb: number, marketProb: number) {
  const diffPctPoints = (projectedProb - marketProb) * 100;
  return Math.max(0, Math.min(25, diffPctPoints * 2.5));
}

function lineMovementScore(openOdds: number, currentOdds: number) {
  if (!Number.isFinite(openOdds) || !Number.isFinite(currentOdds)) return 0;
  const move = Math.abs(currentOdds - openOdds);
  return Math.max(0, Math.min(15, move / 10));
}

function toProductLine(score: number): EdgeEvaluation['targetProductLine'] {
  if (score >= 80) return 'HIMOTHY CORE';
  if (score >= 65) return 'Pressure Pack';
  if (score >= 50) return 'Parlay Center';
  return 'PASS';
}

function countConfirmingSignals(signals: EdgeSignals) {
  return [
    signals.lineValue >= 8,
    signals.lineMovement >= 5,
    signals.clvProjection >= 5,
    signals.injuryNews >= 7,
    signals.matchup >= 10,
    signals.situational >= 6,
    signals.marketOverreaction >= 6,
  ].filter(Boolean).length;
}

function laneMarketPriority(lane: ResearchLane) {
  if (lane === 'soccer') return ['total', 'moneyline', 'spread', 'team-total', 'alt-line', 'correlated-parlay'];
  if (lane === 'tennis') return ['moneyline', 'spread', 'total', 'alt-line', 'correlated-parlay'];
  if (lane === 'overseas') return ['spread', 'moneyline', 'total', 'team-total', 'alt-line', 'correlated-parlay'];
  return ['spread', 'total', 'moneyline', 'team-total', 'player-prop', 'alt-line', 'correlated-parlay'];
}

function inferLaneFromLeague(league: string): ResearchLane {
  for (const lane of Object.keys(RESEARCH_LANE_LEAGUES) as ResearchLane[]) {
    if (RESEARCH_LANE_LEAGUES[lane].includes(league)) return lane;
  }
  return 'domestic';
}

function dataQualityScore(context: MarketContext) {
  let score = 0;
  if (context.eventName) score += 20;
  if (context.selection) score += 20;
  if (context.odds) score += 25;
  if (context.marketOpenOdds) score += 15;
  if (context.line) score += 10;
  if (context.marketType) score += 10;
  return score;
}

function parseSpread(details?: string | null) {
  if (!details) return null;
  const m = details.match(/[+-]\d+(\.\d+)?/);
  return m ? m[0] : null;
}

function parseTotal(overUnder?: number) {
  if (typeof overUnder !== 'number') return null;
  return `${overUnder}`;
}

function generateDefaultMarketCandidates(args: {
  gameId: string;
  league: string;
  lane: ResearchLane;
  eventName: string;
  awayName: string;
  homeName: string;
  oddsDetails: string | null;
  totalLine: string | null;
}) {
  const { gameId, league, lane, eventName, awayName, homeName, oddsDetails, totalLine } = args;
  const markets: MarketContext[] = [];

  const push = (marketType: string, selection: string, line: string | null, odds: string | null) => {
    markets.push({
      gameId,
      sport: league,
      league,
      lane,
      eventName,
      marketType,
      selection,
      line,
      odds,
      marketOpenOdds: odds,
    });
  };

  const spread = parseSpread(oddsDetails);
  const odds = oddsDetails;

  if (!odds) {
    // No verified odds in feed: do not fabricate markets.
    return markets;
  }

  push('Moneyline', `${awayName} ML`, null, odds);
  push('Moneyline', `${homeName} ML`, null, odds);

  if (spread) {
    push('Spread', `${awayName} ${spread}`, spread, odds);
    push('Spread', `${homeName} ${spread.startsWith('-') ? spread.replace('-', '+') : `-${spread.replace('+', '')}`}`, spread, odds);
  }

  if (totalLine) {
    push('Total', `Over ${totalLine}`, totalLine, odds);
    push('Total', `Under ${totalLine}`, totalLine, odds);
  }

  return markets;
}

function generateExtendedMarketCandidates(event: any, lane: ResearchLane, baseMarkets: MarketContext[]) {
  const feedMarkets = event?.oddsMarkets;
  if (!Array.isArray(feedMarkets) || feedMarkets.length === 0) {
    return baseMarkets;
  }

  const extended: MarketContext[] = [...baseMarkets];
  for (const market of feedMarkets) {
    const marketType = market?.type || market?.marketType || 'Other Market';
    const selection = market?.selection || market?.name || 'Selection';
    const odds = typeof market?.odds === 'string' ? market.odds : null;
    const line = typeof market?.line === 'string' ? market.line : null;
    extended.push({
      ...baseMarkets[0],
      lane,
      marketType,
      selection,
      odds,
      marketOpenOdds: odds,
      line,
    });
  }

  return extended;
}

function chooseBestMarketsForGame(candidates: EdgeScanCandidate[], lane: ResearchLane) {
  if (candidates.length === 0) return [];
  const priorities = laneMarketPriority(lane);

  const ranked = [...candidates].sort((a, b) => {
    const scoreDiff = b.edge.edgeScore - a.edge.edgeScore;
    if (scoreDiff !== 0) return scoreDiff;
    const aIdx = priorities.findIndex((key) => a.marketType.toLowerCase().includes(key));
    const bIdx = priorities.findIndex((key) => b.marketType.toLowerCase().includes(key));
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  return ranked.slice(0, 1);
}

export async function evaluateEdgeCandidate(
  context: MarketContext,
  options?: { policy?: AdaptivePolicy }
): Promise<EdgeEvaluation> {
  const research = await buildResearchDossier(context.gameId);
  const policy = options?.policy;

  const marketLine = Number.isFinite(Number.parseFloat(context.line || ''))
    ? Number.parseFloat(context.line || '0')
    : 0;
  const projectedLine = marketLine + (research.sharpEdgeDetected ? 1.5 : 0.5);

  const model = await scoreBetAngle(
    {
      gameId: context.gameId,
      marketType: context.marketType,
      selection: context.selection,
      projectedLine,
      marketLine,
    },
    research
  );

  const currentAmerican = parseAmericanOdds(context.odds);
  const openAmerican = parseAmericanOdds(context.marketOpenOdds);

  const marketProb = oddsToProb(currentAmerican);
  const projectedProb = Math.min(0.99, marketProb + model.edgeValue / 100);
  const projectedCloseAmerican = probToAmerican(projectedProb);

  const lineValue = impliedEdgeScore(projectedProb, marketProb);
  const lineMovement = lineMovementScore(openAmerican, currentAmerican);
  const clvProjection = Number.isFinite(currentAmerican)
    ? Math.max(0, Math.min(15, Math.abs(currentAmerican - projectedCloseAmerican) / 8))
    : 0;
  const injuryNews = research.context.injuries?.home?.length || research.context.injuries?.away?.length ? 10 : 4;
  const matchup = Math.max(0, Math.min(15, model.confidenceScore * 1.4));
  const situational = research.context.situational?.restDays === 0 ? 10 : 5;
  const marketOverreaction = research.context.marketMovement?.publicMoneyPercentage > 65 ? 10 : 5;
  const volatilityPenalty = Math.max(0, Math.min(12, model.volatilityScore));
  const uncertaintyPenalty = research.context.injuries?.home?.some((p: any) => p.status === 'QUESTIONABLE') ? 8 : 4;

  const rawScore =
    lineValue * (policy?.signalWeights?.lineValue || 1) +
    lineMovement * (policy?.signalWeights?.lineMovement || 1) +
    clvProjection * (policy?.signalWeights?.clvProjection || 1) +
    injuryNews * (policy?.signalWeights?.injuryNews || 1) +
    matchup * (policy?.signalWeights?.matchup || 1) +
    situational * (policy?.signalWeights?.situational || 1) +
    marketOverreaction * (policy?.signalWeights?.marketOverreaction || 1) -
    volatilityPenalty * (policy?.signalWeights?.volatilityPenalty || 1) -
    uncertaintyPenalty * (policy?.signalWeights?.uncertaintyPenalty || 1);

  const edgeScore = Math.max(0, Math.min(100, Math.round(rawScore)));
  const targetProductLine = toProductLine(edgeScore);

  const signals: EdgeSignals = {
    lineValue: Number(lineValue.toFixed(1)),
    lineMovement: Number(lineMovement.toFixed(1)),
    clvProjection: Number(clvProjection.toFixed(1)),
    injuryNews: Number(injuryNews.toFixed(1)),
    matchup: Number(matchup.toFixed(1)),
    situational: Number(situational.toFixed(1)),
    marketOverreaction: Number(marketOverreaction.toFixed(1)),
    volatilityPenalty: Number(volatilityPenalty.toFixed(1)),
    uncertaintyPenalty: Number(uncertaintyPenalty.toFixed(1)),
  };

  const confirmingSignals = countConfirmingSignals(signals);
  const quality = dataQualityScore(context);
  const publishable = edgeScore >= 50 && confirmingSignals >= 2 && quality >= 60;

  // Generate AI reasoning only for publishable candidates to save API calls
  let reasoningSummary = `Edge score ${edgeScore}: ${context.marketType} on ${context.eventName} shows measurable price inefficiency.`;
  let riskSummary = 'Volatility and uncertainty penalties are applied automatically. If closing value weakens, keep size controlled.';

  if (publishable && process.env.ANTHROPIC_API_KEY) {
    try {
      const ai = await generateExplanation(context.gameId, research, model);
      if (ai.shortReason && ai.shortReason !== 'Model identified a price inefficiency on this market based on edge signals.') {
        reasoningSummary = ai.shortReason;
        riskSummary = ai.riskNotes || riskSummary;
      }
    } catch {
      // keep fallback reasoning
    }
  }

  return {
    edgeScore,
    signals,
    confirmingSignals,
    dataQualityScore: quality,
    shouldPublish: publishable,
    targetProductLine,
    reasoningSummary,
    riskSummary,
    projectedClosingOdds: Number.isFinite(projectedCloseAmerican)
      ? `${projectedCloseAmerican > 0 ? '+' : ''}${projectedCloseAmerican}`
      : null,
    clvProjectionDelta: Number.isFinite(currentAmerican)
      ? Number((projectedCloseAmerican - currentAmerican).toFixed(1))
      : null,
  };
}

function dateKey(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function extractOddsDetail(comp: any) {
  const node = comp?.odds?.[0];
  const details = node?.details || null;
  const overUnder = node?.overUnder;
  let line: string | null = null;

  if (typeof overUnder === 'number') {
    line = `${overUnder}`;
  } else if (typeof details === 'string') {
    const spread = details.match(/[+-]\d+(\.\d+)?/);
    line = spread ? spread[0] : null;
  }

  return {
    odds: typeof details === 'string' ? details : null,
    line,
  };
}

export async function scanEdgeBoard(leagues: string[]) {
  const now = new Date();
  const date = dateKey(now);
  const allCandidates: EdgeScanCandidate[] = [];
  let rejectedLowData = 0;
  const policy = await getActiveAdaptivePolicy();

  for (const league of leagues) {
    const base = LEAGUE_URLS[league];
    if (!base) continue;

    try {
      const res = await fetch(`${base}/scoreboard?dates=${date}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      const events = data.events || [];

      for (const event of events) {
        const comp = event.competitions?.[0];
        const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
        const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
        if (!home || !away) continue;
        const lane = inferLaneFromLeague(league);

        const odds = extractOddsDetail(comp);

        const eventName = event.name || `${away.team.displayName} vs ${home.team.displayName}`;
        const defaultMarkets = generateDefaultMarketCandidates({
          gameId: String(event.id),
          league,
          lane,
          eventName,
          awayName: away.team.displayName,
          homeName: home.team.displayName,
          oddsDetails: odds.odds,
          totalLine: odds.line,
        });
        const allMarkets = generateExtendedMarketCandidates(event, lane, defaultMarkets);

        const perGame: EdgeScanCandidate[] = [];
        for (const context of allMarkets) {
          const normalizedMarket = context.marketType.toLowerCase();
          if (policy.blockedMarketTypes.some((blocked) => normalizedMarket.includes(blocked.toLowerCase()))) {
            continue;
          }

          const edge = await evaluateEdgeCandidate(context, { policy });
          if (edge.dataQualityScore < policy.minDataQualityScore) {
            rejectedLowData += 1;
            continue;
          }
          const laneThreshold = policy.laneMinEdge[context.lane];
          if (!edge.shouldPublish || edge.edgeScore < laneThreshold || edge.confirmingSignals < policy.minConfirmingSignals) {
            continue;
          }

          perGame.push({
            gameId: context.gameId,
            eventName: context.eventName,
            sport: context.sport,
            league: context.league,
            lane,
            homeTeam: home.team.displayName,
            awayTeam: away.team.displayName,
            marketType: context.marketType,
            selection: context.selection,
            line: context.line || null,
            odds: context.odds || null,
            marketOpenOdds: context.marketOpenOdds || null,
            startTime: event.date,
            edge,
          });
        }

        allCandidates.push(...chooseBestMarketsForGame(perGame, lane));
      }
    } catch {
      continue;
    }
  }

  allCandidates.sort((a, b) => b.edge.edgeScore - a.edge.edgeScore);

  const bySportCount: Record<string, number> = {};
  const selected: EdgeScanCandidate[] = [];
  const defaultSportCap = Math.max(2, Math.ceil(policy.maxCandidatesPerLane / 2));
  const totalCap = policy.maxCandidatesPerLane * 4;

  for (const candidate of allCandidates) {
    if (selected.length >= totalCap) break;

    const sport = candidate.sport;
    const adjustment = policy.sportAdjustments[sport] || { volumeMultiplier: 1, edgeLift: 0 };
    const sportCap = Math.max(1, Math.round(defaultSportCap * adjustment.volumeMultiplier));
    const current = bySportCount[sport] || 0;
    if (current >= sportCap) continue;

    // Keep standards strict; only tighten weak sports.
    const laneThreshold = policy.laneMinEdge[candidate.lane];
    const requiredEdge = Math.max(policy.minEdgeScore, laneThreshold, laneThreshold + (adjustment.edgeLift || 0));
    if (candidate.edge.edgeScore < requiredEdge) continue;

    selected.push(candidate);
    bySportCount[sport] = current + 1;
  }

  return { candidates: selected, rejectedLowData };
}

export async function scanEdgeLane(lane: ResearchLane): Promise<EdgeScanLaneResult> {
  const leagues = RESEARCH_LANE_LEAGUES[lane];
  const result = await scanEdgeBoard(leagues);
  const laneCandidates = result.candidates.filter((c) => c.lane === lane);

  return {
    lane,
    leagues,
    candidates: laneCandidates,
    rejectedLowData: result.rejectedLowData,
  };
}

export async function scanAllResearchLanes(): Promise<Record<ResearchLane, EdgeScanLaneResult>> {
  const entries = await Promise.all(
    (Object.keys(RESEARCH_LANE_LEAGUES) as ResearchLane[]).map(async (lane) => [lane, await scanEdgeLane(lane)] as const)
  );

  return Object.fromEntries(entries) as Record<ResearchLane, EdgeScanLaneResult>;
}
