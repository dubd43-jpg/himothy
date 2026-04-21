import { NextResponse } from 'next/server';
import { fetchLiveSlate } from '@/lib/liveSlate';
import { getRegistryBoardPicks, getBoardMainPick, type RegistryPickRow } from '@/services/pickRegistryService';
import {
  boardDisplayName,
  inferBoardTypeFromContext,
  parseBoardType,
  type BoardType,
  BOARD_OPTIONS,
} from '@/lib/boardSegmentation';

export type ProductType =
  | 'MAIN_PICK'
  | 'CORE_PICK'
  | 'VIP_4_PACK'
  | 'PRESSURE_PACK'
  | 'PARLAY'
  | 'GRAND_SLAM'
  | 'OVERNIGHT'
  | 'OVERSEAS'
  | 'HAILMARY';

export type SectionType = 'main' | 'core' | 'grouped' | 'parlay' | 'live' | 'history';

interface StructuredPick {
  id: string;
  eventName: string;
  awayTeam: string;
  homeTeam: string;
  league: string;
  sport: string;
  startTime: string | null;
  marketType: string;
  selection: string;
  line: string | null;
  odds: string | null;
  sportsbook: string | null;
  reasoning: string | null;
  status: string;
  productType: ProductType;
  sectionType: SectionType;
  groupId: string | null;
  parentProductId: string | null;
  isMainPick: boolean;
  isParlay: boolean;
  boardType: BoardType;
  displayPriority: number;
}

interface GroupedProduct {
  productId: string;
  productType: ProductType;
  productLabel: string;
  status: string;
  picks: StructuredPick[];
}

interface ParlayProduct {
  parlayId: string;
  parlayName: string;
  productLabel: string;
  legs: StructuredPick[];
  totalOdds: string | null;
  riskTier: 'Low' | 'Medium' | 'High';
  status: string;
}

function inferProductType(row: RegistryPickRow): ProductType {
  if (row.isMainPick) return 'MAIN_PICK';
  if (row.category === 'VIP_4_PACK') return 'VIP_4_PACK';
  if (row.category === 'PRESSURE_PACK') return 'PRESSURE_PACK';
  if (row.category === 'PARLAY_PLAN') return 'PARLAY';
  if (row.category === 'HAILMARY') return 'HAILMARY';
  if (row.category === 'GRAND_SLAM') return 'GRAND_SLAM';
  if (row.category === 'OVERNIGHT') return 'OVERNIGHT';
  if (row.category === 'OVERSEAS') return 'OVERSEAS';
  return 'CORE_PICK';
}

function isParlayRow(row: RegistryPickRow) {
  const m = `${row.marketType} ${row.productLine} ${row.category}`.toLowerCase();
  return m.includes('parlay') || row.category === 'PARLAY_PLAN' || row.category === 'HAILMARY';
}

function getStartTime(row: RegistryPickRow): string | null {
  const payload = row.researchPayload || {};
  const value =
    (typeof payload['startTimeUtc'] === 'string' ? payload['startTimeUtc'] : null) ||
    (typeof payload['eventDateUtc'] === 'string' ? payload['eventDateUtc'] : null) ||
    (typeof payload['event_date_utc'] === 'string' ? payload['event_date_utc'] : null);
  return value;
}

function parseAmerican(odds?: string | null) {
  if (!odds) return NaN;
  const m = String(odds).match(/[+-]?\d{3,4}/);
  if (!m) return NaN;
  return Number.parseInt(m[0], 10);
}

function toDecimal(american: number) {
  if (!Number.isFinite(american)) return NaN;
  if (american > 0) return 1 + american / 100;
  return 1 + 100 / Math.abs(american);
}

function toAmerican(decimal: number) {
  if (!Number.isFinite(decimal) || decimal <= 1) return null;
  if (decimal >= 2) return `+${Math.round((decimal - 1) * 100)}`;
  return `-${Math.round(100 / (decimal - 1))}`;
}

function calcParlayOdds(legs: StructuredPick[]) {
  const decimals = legs
    .map((leg) => toDecimal(parseAmerican(leg.odds)))
    .filter((d) => Number.isFinite(d));

  if (decimals.length === 0) return null;

  const total = decimals.reduce((acc, value) => acc * value, 1);
  return toAmerican(total);
}

function dedupeById(rows: StructuredPick[]) {
  const seen = new Set<string>();
  const out: StructuredPick[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function toStructured(row: RegistryPickRow): StructuredPick {
  const away = row.awayTeam || row.eventName.split(' vs ')[0] || 'Away';
  const home = row.homeTeam || row.eventName.split(' vs ')[1] || 'Home';
  const edgeWeight = row.edgeScore || 0;
  const type = inferProductType(row);
  const boardType = inferBoardTypeFromContext({
    sport: row.sport,
    league: row.league,
    category: row.category,
    productLine: row.productLine,
  });

  return {
    id: row.id,
    eventName: row.eventName,
    awayTeam: away,
    homeTeam: home,
    league: row.league || row.sport,
    sport: row.sport,
    startTime: getStartTime(row),
    marketType: row.marketType,
    selection: row.selection,
    line: row.line,
    odds: row.odds,
    sportsbook: row.sportsbook,
    reasoning: row.reasoningSummary,
    status: row.result === 'pending' ? row.status : row.result,
    productType: type,
    sectionType: 'core',
    groupId: null,
    parentProductId: null,
    isMainPick: row.isMainPick,
    isParlay: isParlayRow(row),
    boardType,
    displayPriority: (row.isMainPick ? 1000 : 0) + edgeWeight,
  };
}

function toFallbackCorePick(game: Awaited<ReturnType<typeof fetchLiveSlate>>[number], index: number): StructuredPick {
  const boardType = inferBoardTypeFromContext({
    sport: game.sport,
    league: game.league,
  });

  return {
    id: `fallback-${game.id}-${index}`,
    eventName: `${game.awayTeam} vs ${game.homeTeam}`,
    awayTeam: game.awayTeam,
    homeTeam: game.homeTeam,
    league: game.league,
    sport: game.sport,
    startTime: game.startTime || null,
    marketType: game.line ? 'Spread' : 'Moneyline',
    selection: game.line ? `${game.awayTeam} ${game.line}` : `${game.awayTeam} ML`,
    line: game.line,
    odds: game.odds,
    sportsbook: game.oddsSource,
    reasoning: 'Live board fallback candidate. Official board appears after publish.',
    status: game.isLive ? 'live' : 'scheduled',
    productType: 'CORE_PICK',
    sectionType: 'core',
    groupId: null,
    parentProductId: null,
    isMainPick: false,
    isParlay: false,
    boardType,
    displayPriority: 20,
  };
}

function groupProductLabel(type: ProductType) {
  if (type === 'VIP_4_PACK') return 'VIP 4-Pack';
  if (type === 'PRESSURE_PACK') return 'Pressure Pack';
  return 'Grouped Product';
}

function parlayLabel(type: ProductType) {
  if (type === 'HAILMARY') return 'Hailmary Parlay';
  return 'Parlay Center Build';
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const boardDate = url.searchParams.get('boardDate') || undefined;
    const board = parseBoardType(url.searchParams.get('board'));

    if (!process.env.DATABASE_URL) {
      const fallbackGames = await fetchLiveSlate({ maxGames: 16 });
      const core = fallbackGames
        .filter((g) => !g.isFinal && g.verified)
        .slice(0, 8)
        .map(toFallbackCorePick)
        .filter((pick) => pick.boardType === board);

      return NextResponse.json({
        success: true,
        source: 'live-fallback-no-db',
        board,
        boardLabel: boardDisplayName(board),
        boardOptions: BOARD_OPTIONS,
        boardDate: boardDate || new Date().toISOString().slice(0, 10),
        sections: {
          mainPick: null,
          corePicks: core,
          groupedProducts: [],
          parlayProducts: [],
        },
        counts: {
          officialStraightPicks: core.length,
          officialGroupedProducts: 0,
          parlays: 0,
          totalUniquePicks: core.length,
        },
      });
    }

    const [rows, mainRow] = await Promise.all([
      getRegistryBoardPicks({ boardDate }),
      getBoardMainPick(boardDate),
    ]);

    if (rows.length === 0) {
      const fallbackGames = await fetchLiveSlate({ maxGames: 16 });
      const core = fallbackGames
        .filter((g) => !g.isFinal && g.verified)
        .slice(0, 8)
        .map(toFallbackCorePick)
        .filter((pick) => pick.boardType === board);

      return NextResponse.json({
        success: true,
        source: 'live-fallback',
        board,
        boardLabel: boardDisplayName(board),
        boardOptions: BOARD_OPTIONS,
        boardDate: boardDate || new Date().toISOString().slice(0, 10),
        sections: {
          mainPick: null,
          corePicks: core,
          groupedProducts: [],
          parlayProducts: [],
        },
        counts: {
          officialStraightPicks: core.length,
          officialGroupedProducts: 0,
          parlays: 0,
          totalUniquePicks: core.length,
        },
      });
    }

    const all = dedupeById(rows.map(toStructured)).sort((a, b) => b.displayPriority - a.displayPriority);
    const boardRows = all.filter((pick) => pick.boardType === board);

    const mainPickCandidate = mainRow ? all.find((p) => p.id === mainRow.id) || null : null;
    const mainPick = board === 'north-american' && mainPickCandidate?.boardType === 'north-american' ? mainPickCandidate : null;
    const mainId = mainPick?.id || null;

    const remaining = boardRows.filter((p) => p.id !== mainId);

    const parlayRows = remaining.filter((p) => p.isParlay);
    const nonParlayRows = remaining.filter((p) => !p.isParlay);

    const groupedTypes = new Set<ProductType>(board === 'north-american' ? ['VIP_4_PACK', 'PRESSURE_PACK'] : []);
    const groupedPool = nonParlayRows.filter((p) => groupedTypes.has(p.productType));

    const groupedProducts: GroupedProduct[] = [];
    for (const type of ['VIP_4_PACK', 'PRESSURE_PACK'] as ProductType[]) {
      let picks = groupedPool.filter((p) => p.productType === type).sort((a, b) => b.displayPriority - a.displayPriority);
      if (type === 'VIP_4_PACK') picks = picks.slice(0, 4);
      if (picks.length === 0) continue;

      const productId = `${type}-${boardDate || picks[0].id}`;
      groupedProducts.push({
        productId,
        productType: type,
        productLabel: groupProductLabel(type),
        status: picks.some((p) => p.status === 'live') ? 'live' : 'pending',
        picks: picks.map((p) => ({ ...p, sectionType: 'grouped', groupId: productId })),
      });
    }

    const groupedIds = new Set(groupedProducts.flatMap((product) => product.picks.map((pick) => pick.id)));

    const corePicks = nonParlayRows
      .filter((p) => !groupedIds.has(p.id))
      .map((p) => ({ ...p, sectionType: 'core' as SectionType }));

    const parlayProducts: ParlayProduct[] = [];
    for (const type of ['PARLAY', 'HAILMARY'] as ProductType[]) {
      const legs = parlayRows.filter((p) => p.productType === type).sort((a, b) => b.displayPriority - a.displayPriority);
      if (legs.length === 0) continue;
      const parlayId = `${type}-${boardDate || legs[0].id}`;
      parlayProducts.push({
        parlayId,
        parlayName: parlayLabel(type),
        productLabel: type,
        legs: legs.map((leg) => ({ ...leg, sectionType: 'parlay', parentProductId: parlayId })),
        totalOdds: calcParlayOdds(legs),
        riskTier: type === 'HAILMARY' ? 'High' : 'Medium',
        status: legs.some((l) => l.status === 'live') ? 'live' : 'pending',
      });
    }

    const uniqueIds = new Set<string>();
    if (mainPick) uniqueIds.add(mainPick.id);
    corePicks.forEach((p) => uniqueIds.add(p.id));
    groupedProducts.forEach((g) => g.picks.forEach((p) => uniqueIds.add(p.id)));
    parlayProducts.forEach((p) => p.legs.forEach((l) => uniqueIds.add(l.id)));

    const straightCount = (mainPick ? 1 : 0) + corePicks.length + groupedProducts.reduce((sum, g) => sum + g.picks.length, 0);

    return NextResponse.json({
      success: true,
      source: 'registry',
      board,
      boardLabel: boardDisplayName(board),
      boardOptions: BOARD_OPTIONS,
      boardDate: boardDate || rows[0]?.boardDate || new Date().toISOString().slice(0, 10),
      sections: {
        mainPick,
        corePicks,
        groupedProducts,
        parlayProducts,
      },
      counts: {
        officialStraightPicks: straightCount,
        officialGroupedProducts: groupedProducts.length,
        parlays: parlayProducts.length,
        totalUniquePicks: uniqueIds.size,
      },
    });
  } catch (error) {
    console.error('Structured board failed', error);
    return NextResponse.json({ success: false, error: 'Board unavailable' }, { status: 500 });
  }
}
