import { NextResponse } from 'next/server';
import { Pick } from '@/lib/picksData';
import { validateAndTrackGame } from '@/lib/validation';
import { getRegistryBoardPicks } from '@/services/pickRegistryService';
import { fetchLiveSlate } from '@/lib/liveSlate';

const FALLBACK_CATEGORIES = [
  'GRAND_SLAM',
  'PRESSURE_PACK',
  'VIP_4_PACK',
  'PARLAY_PLAN',
  'OVERNIGHT',
  'PERSONAL_PLAY',
  'HAILMARY',
  'OVERSEAS',
] as const;

function provisionalCategoryForGame(index: number, league: string) {
  const lower = league.toLowerCase();
  if (lower.includes('soccer')) return 'OVERSEAS';
  if (lower.includes('tennis')) return 'OVERNIGHT';
  return FALLBACK_CATEGORIES[index % FALLBACK_CATEGORIES.length];
}

function buildLiveFallbackResults(args: { category?: string; sport?: string; boardDate?: string; games: Awaited<ReturnType<typeof fetchLiveSlate>> }) {
  const { category, sport, boardDate, games } = args;
  const fallbackBoardDate = boardDate || new Date().toISOString().slice(0, 10);

  return games
    .filter((game) => !game.isFinal && game.verified)
    .filter((game) => !sport || game.league.toLowerCase().includes(sport.toLowerCase()) || game.sport.toLowerCase().includes(sport.toLowerCase()))
    .slice(0, 24)
    .map((game, idx) => {
      const provisionalCategory = category || provisionalCategoryForGame(idx, game.league);
      const pick: Pick = {
        id: `live-${game.id}-${idx}`,
        category: provisionalCategory as Pick['category'],
        sport: game.league,
        game: `${game.awayTeam} vs ${game.homeTeam}`,
        gameDate: fallbackBoardDate,
        gameTime: game.startTime,
        market: game.line ? 'Spread' : 'Moneyline',
        selection: game.line ? `${game.awayTeam} vs ${game.homeTeam} • ${game.awayTeam} ${game.line}` : `${game.awayTeam} vs ${game.homeTeam} • ${game.awayTeam} ML`,
        line: game.line || '-',
        odds: game.odds || '-',
        confidence: game.oddsAvailable ? 7.2 : 6.2,
        edge: game.oddsAvailable ? 'Live Board Candidate' : 'Monitoring',
        risk: 'Managed',
        reasoning: game.oddsAvailable
          ? `Live fallback candidate from verified ${game.league} feed. Publish through admin board for official tracking.`
          : `Game verified on live slate; odds not currently available from feed.`,
        status: game.status,
      };

      return {
        pick,
        preValidation: {
          game_valid: true,
          sport: game.sport,
          league: game.league,
          home_team: game.homeTeam,
          away_team: game.awayTeam,
          event_date_utc: game.startTime || new Date().toISOString(),
          display_time_local: game.startTime
            ? new Date(game.startTime).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })
            : 'TBD',
          safe_to_publish: true,
          status: game.isLive ? 'live' : 'scheduled',
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
          source: 'live-slate-fallback',
        },
        tracking: null,
        registry: {
          id: pick.id,
          productLine: 'live-slate-fallback',
          boardDate: fallbackBoardDate,
          projectedClosingOdds: null,
          closingOdds: null,
          isMainPick: false,
          mainPickReason: null,
        },
      };
    })
    .filter((entry) => !category || entry.pick.category === category);
}

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
      const games = await fetchLiveSlate({ maxGames: 30 });
      return NextResponse.json({
        success: true,
        source: 'live-slate-fallback',
        results: buildLiveFallbackResults({ category, sport, boardDate, games }),
      });
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
    const games = await fetchLiveSlate({ maxGames: 18 }).catch(() => []);
    return NextResponse.json({
      success: true,
      source: 'live-slate-fallback',
      results: buildLiveFallbackResults({ games }),
    });
  }
}
