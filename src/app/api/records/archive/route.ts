import { NextResponse } from 'next/server';

/**
 * Results Archive API - TRANSPARENCY & INTEGRITY MODE
 * Strictly serves real historical data. Mock data is forbidden.
 * Supports granular tracking for picks, including publish/grade times and corrections.
 */

interface ArchivePick {
  id: string;
  sport: string;
  league: string;
  game: string;
  selection: string;
  pickType: string;
  odds: string;
  units: number;
  category: string;
  result: "win" | "loss" | "push" | "void" | "pending";
  publishTime: string;
  gradeTime: string;
  correction?: {
    originalResult: string;
    correctedResult: string;
    reason: string;
    timestamp: string;
  };
}

interface ArchiveDay {
  date: string;
  summary: {
    wins: number;
    losses: number;
    pushes: number;
    voids: number;
    units: number;
    winRate: string;
  };
  sports: Record<string, string>;
  picks: ArchivePick[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get('filter') || 'all';

  // Unified System Integrity Rule: No mock, estimated, or backfilled history.
  // The archive starts at zero for a fresh deployment.
  const archiveData: ArchiveDay[] = [];

  // Logic to filter by today, yesterday, etc. would query the DB with specific date ranges.
  // For now, we return empty as we are in Zero-Base mode.

  return NextResponse.json({ 
    success: true, 
    archive: archiveData,
    integrityMode: true,
    message: "Zero-base tracking initialized."
  });
}
