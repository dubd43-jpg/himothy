import { NextResponse } from 'next/server';
import { refreshLiveOpsSnapshot } from '@/services/liveOpsService';
import { inferBoardTypeFromContext, parseBoardType } from '@/lib/boardSegmentation';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const board = parseBoardType(url.searchParams.get('board'));

    const snapshot = await refreshLiveOpsSnapshot({
      reason: 'api-games-today',
      maxStaleSeconds: 120,
    });
    const activeGames = snapshot.games.filter(
      (game) =>
        !game.isFinal &&
        game.verified &&
        inferBoardTypeFromContext({ sport: game.sport, league: game.league }) === board
    );

    const researchByGame = new Map(snapshot.topCandidates.map((candidate) => [candidate.gameId, candidate]));

    const suggestedLegs = activeGames
      .filter((game) => {
        const candidate = researchByGame.get(game.id);
        return Boolean(
          candidate &&
            candidate.edge?.shouldPublish &&
            Number(candidate.edge?.edgeScore || 0) >= 62 &&
            Number(candidate.edge?.dataQualityScore || 0) >= 65
        );
      })
      .slice(0, 12)
      .map((game) => ({
      research: researchByGame.get(game.id)
        ? {
            edgeScore: researchByGame.get(game.id)?.edge.edgeScore || 0,
            marketType: researchByGame.get(game.id)?.marketType || null,
            selection: researchByGame.get(game.id)?.selection || null,
            reasoningSummary: researchByGame.get(game.id)?.edge.reasoningSummary || null,
            riskSummary: researchByGame.get(game.id)?.edge.riskSummary || null,
          }
        : null,
      id: game.id,
      label: `${game.awayTeam} vs ${game.homeTeam} • ${game.awayTeam} ML`,
      game: `${game.awayTeam} vs ${game.homeTeam}`,
      odds: game.oddsAvailable ? game.odds : 'Odds unavailable',
      sport: game.league,
      externalLink: game.externalLink,
      status: game.status,
      startTime: game.startTime,
      oddsSource: game.oddsSource,
      lineTimestampUtc: game.lineTimestampUtc,
      freshnessMinutes: game.freshnessMinutes,
      oddsAvailable: game.oddsAvailable,
    }));

    return NextResponse.json({
      success: true,
      games: activeGames,
      suggestedLegs,
      refresh: {
        generatedAt: snapshot.generatedAt,
        refreshed: snapshot.refreshed,
        ageSeconds: snapshot.ageSeconds,
        upcomingGames: snapshot.upcomingGameCount,
        researchReady: snapshot.researchReadyCount,
        lineChanges: snapshot.lineChangeCount,
      },
      board,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        games: [],
        suggestedLegs: [],
      },
      { status: 500 }
    );
  }
}
