import { NextResponse } from 'next/server';
import { archiveClosedBoards, getDailyBoardRecords, getRegistryArchive } from '@/services/pickRegistryService';
import {
  clampToOfficialStartDate,
  getOfficialTrackingLabel,
  OFFICIAL_TRACKING_START_DATE,
  OFFICIAL_TRACKING_TIMEZONE,
} from '@/lib/officialTracking';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || undefined;
  const productLine = searchParams.get('productLine') || undefined;
  const fromRaw = searchParams.get('from') || undefined;
  const from = fromRaw ? clampToOfficialStartDate(fromRaw) : undefined;
  const to = searchParams.get('to') || undefined;
  const page = Number.parseInt(searchParams.get('page') || '1', 10);
  const pageSize = Number.parseInt(searchParams.get('pageSize') || '20', 10);

  await archiveClosedBoards();
  const [archive, dailyRecords] = await Promise.all([
    getRegistryArchive({ page, pageSize, category, productLine, from, to }),
    getDailyBoardRecords({ from, to, page, pageSize: Math.min(pageSize, 50) }),
  ]);

  return NextResponse.json({
    success: true,
    archive: archive.picks,
    dailyRecords,
    pagination: archive.pagination,
    integrityMode: true,
    officialStartDate: OFFICIAL_TRACKING_START_DATE,
    officialTrackingLabel: getOfficialTrackingLabel(),
    timezone: OFFICIAL_TRACKING_TIMEZONE,
    message: 'Registry-backed archive ledger',
  });
}
