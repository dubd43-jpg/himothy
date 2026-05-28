import { NextResponse } from 'next/server';
import { recoverMissedRegistryPicks } from '@/services/recordBoardService';
import { gradeRegistryBoard } from '@/services/pickRegistryService';
import { hasDatabase } from '@/lib/hasDatabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Diagnostic + manual trigger for the frozen-slate recovery. Safe by design: it only
// records picks the frozen slate proves we published (win or lose), and dedup prevents
// double-recording. Returns a per-date report so we can see exactly what each frozen
// board contained and what got restored. No secret needed — it can't fabricate picks.
export async function GET() {
  if (!hasDatabase()) {
    return NextResponse.json({ success: false, error: 'no database connected' }, { status: 400 });
  }
  try {
    const result = await recoverMissedRegistryPicks({ force: true });
    await gradeRegistryBoard();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[debug/recover] failed', err);
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}
