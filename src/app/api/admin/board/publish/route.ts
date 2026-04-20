import { NextResponse } from 'next/server';
import { getBoardMainPick, publishRegistryPick } from '@/services/pickRegistryService';
import { getMarketSnapshotForPick, validateAndTrackGame } from '@/lib/validation';
import { evaluateEdgeCandidate } from '@/services/edgeDetectionEngine';
import type { EdgeSignals } from '@/services/edgeDetectionEngine';
import { getActiveAdaptivePolicy } from '@/services/adaptiveIntelligenceService';
import { runCoordinatedBoardAction } from '@/services/agentCoordinationService';
import { assertMarketPublishable } from '@/services/marketRegistryService';

function productLineForCategory(category: string) {
  const map: Record<string, string> = {
    GRAND_SLAM: 'HIMOTHY Grand Slam',
    PRESSURE_PACK: 'Pressure Pack',
    VIP_4_PACK: 'VIP 4-Pack',
    PARLAY_PLAN: 'Parlay Center',
    OVERNIGHT: 'Overnight',
    OVERSEAS: 'Overseas',
    HAILMARY: 'Hailmary',
    PERSONAL_PLAY: 'HIMOTHY CORE',
  };
  return map[category] || 'HIMOTHY CORE';
}

function categoryFromEdgeScore(score: number) {
  if (score >= 80) return 'PERSONAL_PLAY';
  if (score >= 65) return 'PRESSURE_PACK';
  if (score >= 50) return 'PARLAY_PLAN';
  return null;
}

function countConfirmingSignals(signals: EdgeSignals) {
  const checks = [
    signals.lineValue >= 8,
    signals.lineMovement >= 5,
    signals.clvProjection >= 5,
    signals.injuryNews >= 7,
    signals.matchup >= 10,
    signals.situational >= 6,
    signals.marketOverreaction >= 6,
  ];
  return checks.filter(Boolean).length;
}

function isNorthAmericaMainPickEligible(sportOrLeague: string) {
  const normalized = (sportOrLeague || '').toLowerCase();
  return (
    normalized.includes('nba') ||
    normalized.includes('nfl') ||
    normalized.includes('mlb') ||
    normalized.includes('nhl') ||
    normalized.includes('wnba') ||
    normalized.includes('ncaa') ||
    normalized.includes('college basketball') ||
    normalized.includes('mls')
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const picks = Array.isArray(body?.picks) ? body.picks : [];
    const boardDate = typeof body?.boardDate === 'string' ? body.boardDate : undefined;
    const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'publish picks';
    const pregameOnly = body?.pregameOnly !== false;
    const maxOddsFreshnessMinutes = Number.isFinite(Number(body?.maxOddsFreshnessMinutes))
      ? Number(body.maxOddsFreshnessMinutes)
      : 15;

    if (picks.length === 0) {
      return NextResponse.json({ success: false, error: 'No picks provided' }, { status: 400 });
    }

    const coordinated = await runCoordinatedBoardAction(
      {
        action: 'publish',
        boardDate,
        reason,
        agent: 'api-admin-board-publish',
      },
      async ({ boardDate: coordinatedBoardDate }) => {
        const hasMainPickCandidate = picks.some((pick: any) => pick.isMainPick === true);
        const existingMainPick = hasMainPickCandidate ? await getBoardMainPick(coordinatedBoardDate) : null;
        const policy = await getActiveAdaptivePolicy();

        const results = await Promise.all(
          picks.map(async (pick: any) => {
            if (pick.isMainPick === true && existingMainPick) {
              return {
                success: false,
                reason: `Main Pick already exists for this board (${existingMainPick.id}). Only one Main Pick is allowed per board.`,
                pick,
              };
            }

            if (pick.isMainPick === true && !isNorthAmericaMainPickEligible(String(pick.sport || pick.league || ''))) {
              return {
                success: false,
                reason: 'Main Pick rejected: Main Pick is restricted to North America leagues only. Soccer/overseas picks can still be published as regular spots.',
                pick,
              };
            }

            const marketGate = await assertMarketPublishable({
              marketType: String(pick.market || ''),
              isMainPick: pick.isMainPick === true,
            });
            if (!marketGate.ok) {
              return {
                success: false,
                reason: marketGate.reason || 'Market is not publishable under current registry rules.',
                pick,
                marketRule: marketGate.rule,
              };
            }

        const validation = await validateAndTrackGame(pick);
        if (!validation.preValidation.safe_to_publish) {
          return {
            success: false,
            reason: validation.preValidation.reason_if_invalid || 'Validation failed',
            pick,
          };
        }

        const marketSnapshot = await getMarketSnapshotForPick({
          sport: pick.sport,
          eventId: validation.tracking?.game_id || null,
          game: pick.game,
        });

        if (!marketSnapshot.verifiedEvent) {
          return {
            success: false,
            reason: 'Data integrity gate failed: event could not be verified from live schedule feed.',
            pick,
          };
        }

        if (marketSnapshot.eventStatus === 'postponed' || marketSnapshot.eventStatus === 'canceled') {
          return {
            success: false,
            reason: `Data integrity gate failed: event status is ${marketSnapshot.eventStatus}.`,
            pick,
            marketSnapshot,
          };
        }

        if (pregameOnly && marketSnapshot.eventDateUtc && new Date(marketSnapshot.eventDateUtc).getTime() <= Date.now()) {
          return {
            success: false,
            reason: 'Data integrity gate failed: event already started for pregame publish flow.',
            pick,
            marketSnapshot,
          };
        }

        if (!marketSnapshot.odds || !marketSnapshot.sportsbookSource) {
          return {
            success: false,
            reason: 'Data integrity gate failed: live sportsbook line/source unavailable.',
            pick,
            marketSnapshot,
          };
        }

        if (marketSnapshot.freshnessMinutes > maxOddsFreshnessMinutes) {
          return {
            success: false,
            reason: `Data integrity gate failed: sportsbook line is stale (${marketSnapshot.freshnessMinutes}m old).`,
            pick,
            marketSnapshot,
          };
        }

        const edge = await evaluateEdgeCandidate(
          {
            gameId: validation.tracking?.game_id || `${pick.sport}-${pick.game}`,
            sport: pick.sport,
            league: pick.sport,
            eventName: pick.game,
            marketType: pick.market,
            selection: pick.selection,
            line: marketSnapshot.line || pick.line,
            odds: marketSnapshot.odds,
            marketOpenOdds: pick.marketOpenOdds || pick.openOdds || marketSnapshot.odds,
            lane: pick.lane || (pick.sport?.toLowerCase().includes('soccer') ? 'soccer' : pick.sport?.toLowerCase().includes('tennis') ? 'tennis' : 'domestic'),
          },
          { policy }
        );

        const lane = pick.lane || (pick.sport?.toLowerCase().includes('soccer') ? 'soccer' : pick.sport?.toLowerCase().includes('tennis') ? 'tennis' : 'domestic');
        const marketTypeNormalized = String(pick.market || '').toLowerCase();
        const sportAdjustment = policy.sportAdjustments[pick.sport] || { volumeMultiplier: 1, edgeLift: 0 };
        const edgeSignalsPayload = edge.signals as unknown as Record<string, unknown>;

        if (policy.blockedMarketTypes.some((blocked) => marketTypeNormalized.includes(blocked.toLowerCase()))) {
          return {
            success: false,
            reason: `Adaptive policy blocked this market type due to recent underperformance (${pick.market}).`,
            pick,
            edge,
          };
        }

        const laneMinEdge = policy.laneMinEdge[(lane as keyof typeof policy.laneMinEdge)] || policy.minEdgeScore;
        const requiredEdge = Math.max(50, policy.minEdgeScore, laneMinEdge + (sportAdjustment.edgeLift || 0));

        if (!edge.shouldPublish || edge.edgeScore < requiredEdge || edge.confirmingSignals < policy.minConfirmingSignals || edge.dataQualityScore < policy.minDataQualityScore) {
          return {
            success: false,
            reason: `Adaptive edge filter rejected this pick (edge ${edge.edgeScore}, signals ${edge.confirmingSignals}, quality ${edge.dataQualityScore}).`,
            pick,
            edge,
            policy,
          };
        }

        const derivedCategory = categoryFromEdgeScore(edge.edgeScore);
        if (!derivedCategory) {
          return {
            success: false,
            reason: 'Pick did not qualify for any publishable edge tier.',
            pick,
            edge,
          };
        }

        let mainPickReason: string | null = null;
        if (pick.isMainPick === true) {
          const confirmingSignals = countConfirmingSignals(edge.signals);
          const riskAcceptable = edge.signals.volatilityPenalty <= 10 && edge.signals.uncertaintyPenalty <= 8;
          const strongLineValue = edge.signals.lineValue >= 10;
          const hasClearReason = edge.reasoningSummary.trim().length >= 24;

          if (edge.edgeScore < 85) {
            return {
              success: false,
              reason: `Main Pick rejected: edge score ${edge.edgeScore} is below required 85.`,
              pick,
              edge,
            };
          }

          if (confirmingSignals < 3) {
            return {
              success: false,
              reason: `Main Pick rejected: only ${confirmingSignals} confirming signals detected (minimum 3 required).`,
              pick,
              edge,
            };
          }

          if (!riskAcceptable) {
            return {
              success: false,
              reason: 'Main Pick rejected: risk profile is outside acceptable limits.',
              pick,
              edge,
            };
          }

          if (!strongLineValue || !hasClearReason) {
            return {
              success: false,
              reason: 'Main Pick rejected: line inefficiency explanation is not strong enough.',
              pick,
              edge,
            };
          }

          mainPickReason = `Top Edge approved with score ${edge.edgeScore} and ${confirmingSignals} confirming signals.`;
        }

            const published = await publishRegistryPick({
          boardDate: coordinatedBoardDate,
          category: pick.category || derivedCategory,
          productLine: pick.productLine || edge.targetProductLine || productLineForCategory(derivedCategory),
          sport: pick.sport,
          league: pick.sport,
          eventId: validation.tracking?.game_id || null,
          eventName: pick.game,
          homeTeam: validation.preValidation.home_team || null,
          awayTeam: validation.preValidation.away_team || null,
          marketType: pick.market,
          selection: pick.selection,
          line: marketSnapshot.line || pick.line,
          odds: marketSnapshot.odds,
          sportsbook: marketSnapshot.sportsbookSource,
          confidenceTier: String(pick.confidence ?? ''),
          reasoningSummary: pick.reasoning || edge.reasoningSummary || null,
          riskSummary: edge.riskSummary,
          researchPayload: {
            fadeReasoning: pick.fadeReasoning || null,
            validationScore: validation.preValidation.validation_score || 0,
            statusAtPublish: validation.preValidation.status,
            edgeSignals: edgeSignalsPayload,
            edgeTargetProductLine: edge.targetProductLine,
            lane,
            adaptivePolicyMode: policy.mode,
            lineTimestampUtc: marketSnapshot.lineTimestampUtc,
            oddsFreshnessMinutes: marketSnapshot.freshnessMinutes,
            sportsbookQuotes: marketSnapshot.sportsbookQuotes || [],
            eventStatusAtPublish: marketSnapshot.eventStatus,
          },
          edgeScore: edge.edgeScore,
          edgeSignals: edgeSignalsPayload,
          marketOpenOdds: pick.marketOpenOdds || pick.openOdds || marketSnapshot.odds || null,
          projectedClosingOdds: edge.projectedClosingOdds,
          clvAtPublish: edge.clvProjectionDelta,
          isMainPick: pick.isMainPick === true,
          mainPickReason,
          status: 'published',
          isPublic: true,
        });

            return { success: true, published, edge };
          })
        );

        return {
          published: results.filter((r) => r.success).length,
          rejected: results.filter((r) => !r.success).length,
          results,
        };
      }
    );

    return NextResponse.json({
      success: true,
      boardDate: coordinated.boardDate,
      published: coordinated.result.published,
      rejected: coordinated.result.rejected,
      results: coordinated.result.results,
      coordination: {
        before: coordinated.before,
        after: coordinated.after,
      },
    });
  } catch (error) {
    console.error('Publish flow failed:', error);
    const message = error instanceof Error ? error.message : 'Publish flow failed';
    if (message.includes('COORDINATION_CONFLICT')) {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }
    if (message.includes('COORDINATION_BLOCKED') || message.includes('Duplicate pick blocked') || message.includes('Publish blocked')) {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Publish flow failed' }, { status: 500 });
  }
}
