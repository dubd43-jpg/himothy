import { NextResponse } from 'next/server';
import { getOrComputeBoard } from '@/services/dailyBoardCache';
import { getPeriodMarketsForGame, scorePeriodMarkets, type PeriodPlay } from '@/services/periodMarketsService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Scan every game in today's frozen slate, pull each game's period markets (1H / 2H /
// quarter / hockey period), score them with the same tendency engine that drives the
// full-game picks, and return the top edges. Lives at /api/research/period-plays.
//
// Output: { plays: PeriodPlay[], totalGamesScanned, source }. Top plays first.
export async function GET() {
  try {
    // Pull every game from every board so this surfaces NBA/NFL halves, NHL periods,
    // soccer 1H/2H — not just the main NA board.
    const boards = ['north-american', 'soccer'] as const;
    const slates = await Promise.all(boards.map((b) => getOrComputeBoard(b)));

    const allPlays: PeriodPlay[] = [];
    let totalScanned = 0;

    for (const slate of slates) {
      const games = [
        slate?.grandSlam, ...(slate?.pressurePack || []), ...(slate?.vip4Pack || []),
        ...(slate?.parlayPlan || []), ...(slate?.marquee || []), ...(slate?.asleepPicks || []),
      ].filter(Boolean);

      for (const game of games as any[]) {
        totalScanned++;
        const markets = await getPeriodMarketsForGame(game.league, game.awayTeam?.name, game.homeTeam?.name);
        if (!markets || markets.markets.length === 0) continue;

        const homeAvg = game.homeTeam?.trends?.avgTotal10 || null;
        const awayAvg = game.awayTeam?.trends?.avgTotal10 || null;
        const avgTotalCombined = homeAvg != null && awayAvg != null ? (homeAvg + awayAvg) / 2 : (homeAvg ?? awayAvg);

        const plays = scorePeriodMarkets(markets.markets, {
          gameId: game.gameId,
          eventName: game.eventName,
          league: game.league,
          startTime: game.startTime || null,
          awayTeam: game.awayTeam.name,
          homeTeam: game.homeTeam.name,
          avgTotalCombined,
          homeOu10: game.homeTeam?.trends?.ou10 || null,
          awayOu10: game.awayTeam?.trends?.ou10 || null,
        });
        allPlays.push(...plays);
      }
    }
    allPlays.sort((a, b) => b.edgeScore - a.edgeScore);
    return NextResponse.json({
      success: true,
      plays: allPlays.slice(0, 20),
      totalGamesScanned: totalScanned,
      totalPlays: allPlays.length,
    });
  } catch (err: any) {
    console.error('[period-plays] route error', err);
    return NextResponse.json({ success: false, error: err?.message || 'period-plays scan failed' }, { status: 500 });
  }
}
