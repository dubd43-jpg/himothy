import { NextResponse } from 'next/server';
import { PICK_REGISTRY, Pick, PickCategory } from '@/lib/picksData';
import { validateAndTrackGame } from '@/lib/validation';
import { getRegistryBoardPicks } from '@/services/pickRegistryService';

function toPickShape(row: any): Pick {
  return {
    id: row.id,
    category: row.category,
    sport: row.sport,
    game: row.eventName,
    gameDate: row.boardDate,
    market: row.marketType,
    selection: row.selection,
    line: row.line || '-',
    odds: row.odds || '-',
    confidence: typeof row.confidenceTier === 'number' ? row.confidenceTier : 0,
    edge: row.confidenceTier || 'Verified',
    risk: row.status === 'locked' || row.status === 'graded' || row.status === 'archived' ? 'Locked' : 'Managed',
    reasoning: row.reasoningSummary || 'Validated daily entry from HIMOTHY Pick Registry.',
    status: row.result,
  };
}

function matchesFallbackFilter(pick: Pick, category?: string, sport?: string) {
  const categoryMatch = !category || pick.category === (category as PickCategory);
  const sportMatch = !sport || pick.sport.toLowerCase() === sport.toLowerCase();
  return categoryMatch && sportMatch;
}

function buildFallbackResults(category?: string, sport?: string) {
  const fallbackBoardDate = new Date().toISOString().slice(0, 10);
  return PICK_REGISTRY.filter((pick) => matchesFallbackFilter(pick, category, sport)).map((pick) => ({
    pick,
    preValidation: {
      game_valid: true,
      safe_to_publish: true,
      status: 'watching',
      result: 'pending',
      publish_time: null,
      lock_time: null,
      is_locked: false,
      lifecycle_state: 'watching',
      edge_score: 0,
      edge_signals: {},
      clv_projection: null,
      clv_delta: null,
      is_main_pick: false,
      main_pick_reason: null,
      reason_if_invalid: null,
      source: 'static-fallback',
    },
    tracking: null,
    registry: {
      id: pick.id,
      productLine: 'static-registry',
      boardDate: fallbackBoardDate,
      projectedClosingOdds: null,
      closingOdds: null,
      isMainPick: false,
      mainPickReason: null,
    },
  }));
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const category = typeof body.category === 'string' ? body.category : undefined;
    const sport = typeof body.sport === 'string' ? body.sport : undefined;
    const boardDate = typeof body.boardDate === 'string' ? body.boardDate : undefined;
    const candidatePicks = Array.isArray(body.picks) ? (body.picks as Pick[]) : [];

    // Candidate mode is used internally for pre-publish validation only.
    if (candidatePicks.length > 0 && body.mode === 'validate-candidates') {
      const results = await Promise.all(candidatePicks.map(async (p) => {
        try {
          return await validateAndTrackGame(p);
        } catch (err) {
          console.error('Single pick validation failed:', err);
          return {
            pick: p,
            preValidation: {
              game_valid: false,
              safe_to_publish: false,
              reason_if_invalid: 'System timeout or upstream error during validation.',
            },
            tracking: null,
          };
        }
      }));

      return NextResponse.json({ success: true, source: 'candidate-validation', results });
    }

    const boardRows = await getRegistryBoardPicks({ boardDate, category, sport });
    if (boardRows.length === 0) {
      return NextResponse.json({ success: true, source: 'static-fallback', results: buildFallbackResults(category, sport) });
    }

    const results = boardRows.map((row) => ({
      pick: toPickShape(row),
      preValidation: {
        game_valid: true,
        safe_to_publish: true,
        status: row.status,
        result: row.result,
        publish_time: row.publishTime,
        lock_time: row.lockTime,
        is_locked: row.isLocked,
        lifecycle_state: row.status,
        edge_score: row.edgeScore || 0,
        edge_signals: row.edgeSignals || {},
        clv_projection: row.clvAtPublish,
        clv_delta: row.clvDelta,
        is_main_pick: row.isMainPick,
        main_pick_reason: row.mainPickReason,
        reason_if_invalid: null,
      },
      tracking: null,
      registry: {
        id: row.id,
        productLine: row.productLine,
        boardDate: row.boardDate,
        projectedClosingOdds: row.projectedClosingOdds,
        closingOdds: row.closingOdds,
        isMainPick: row.isMainPick,
        mainPickReason: row.mainPickReason,
      },
    }));

    return NextResponse.json({ success: true, source: 'db-registry', results });
  } catch (error) {
    console.error("Error in slate validation:", error);
    return NextResponse.json({ success: true, source: 'static-fallback', results: buildFallbackResults() });
  }
}
