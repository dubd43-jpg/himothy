import { NextResponse } from 'next/server';
import { refreshLiveOpsSnapshot } from '@/services/liveOpsService';

export async function GET() {
  try {
    const snapshot = await refreshLiveOpsSnapshot({
      reason: 'api-games-today',
      maxStaleSeconds: 120,
    });
    const activeGames = snapshot.games.filter((game) => !game.isFinal && game.verified);

    const researchByGame = new Map(snapshot.topCandidates.map((candidate) => [candidate.gameId, candidate]));

    const suggestedLegs = activeGames.slice(0, 12).map((game) => ({
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
