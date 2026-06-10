import { NextResponse } from 'next/server';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';
import { hasDatabase } from '@/lib/hasDatabase';
import { createPickManual } from '@/services/pickRegistryService';
import { logAction } from '@/services/actionLogService';

// ADMIN ONLY. Auto-record a pick that Claude recommended in chat. Triggered whenever
// Claude rates a pick Conf 96+ in conversation — landing it in the registry within
// 60s so the chat recommendation == the official record. Owner directive 2026-06-02:
// "save everything... so we don't have to worry about this anymore."
//
// POST body: {
//   selection: 'Dallas Wings -12.5',
//   gameId: '401856953',
//   eventName: 'Seattle Storm @ Dallas Wings',
//   league: 'WNBA', sport: 'WNBA',
//   homeTeam: 'Dallas Wings', awayTeam: 'Seattle Storm',
//   selectionSide: 'home', marketType: 'spread',
//   line: '-12.5', odds: '-110',
//   tier: 'GRAND_SLAM' | 'PRESSURE_PACK' | 'CHAT_RESEARCH',
//   confidenceScore: 100,
//   reason: 'Reverse line movement, sharps moved 50¢ toward Dallas',
//   startTime: '2026-06-02T00:00:00Z'
// }

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  if (!hasDatabase()) return NextResponse.json({ success: false, error: 'no database' }, { status: 400 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'bad json' }, { status: 400 }); }
  if (!body?.selection || !body?.gameId) {
    return NextResponse.json({ success: false, error: 'selection + gameId required' }, { status: 400 });
  }
  try {
    // FIX 2026-06-03: validate tier + confidence (was unchecked `as any` cast),
    // and dedup against today's registry so re-clicking auto-record doesn't insert
    // duplicate rows. createPickManual bypasses publishRegistryPick's dedup path.
    const ALLOWED_TIERS = new Set(['GRAND_SLAM', 'PRESSURE_PACK', 'VIP_4_PACK', 'PARLAY_PLAN', 'MARQUEE', 'CHAT_RESEARCH', 'PERSONAL_PICK']);
    let tier = ALLOWED_TIERS.has(body.tier) ? body.tier : 'CHAT_RESEARCH';
    const confRaw = Number(body.confidenceScore || 0);
    const confidenceScore = Number.isFinite(confRaw) && confRaw >= 0 && confRaw <= 100 ? confRaw : 0;
    // FIX 2026-06-05 (audit #8 alt-products): enforce tier floors server-side so
    // a chat pick can't be written at GS/Pressure/VIP without meeting confidence.
    // Previous code accepted whatever tier the caller supplied. Auto-demote.
    const TIER_FLOORS: Record<string, number> = {
      GRAND_SLAM: 92, PRESSURE_PACK: 85, VIP_4_PACK: 83, PARLAY_PLAN: 80, MARQUEE: 80, PERSONAL_PICK: 89,
    };
    const floor = TIER_FLOORS[tier];
    if (floor && confidenceScore < floor) {
      // Demote one tier down rather than reject — preserves the recording but stops the inflation.
      const demote: Record<string, string> = {
        GRAND_SLAM: 'PRESSURE_PACK', PRESSURE_PACK: 'VIP_4_PACK', VIP_4_PACK: 'PARLAY_PLAN',
        PARLAY_PLAN: 'CHAT_RESEARCH', MARQUEE: 'CHAT_RESEARCH', PERSONAL_PICK: 'CHAT_RESEARCH',
      };
      console.warn(`[chat-pick] demoting ${tier} → ${demote[tier]} (conf ${confidenceScore} < floor ${floor})`);
      tier = demote[tier];
    }

    const gameIdStr = String(body.gameId);
    const selectionStr = String(body.selection);
    const startISO = body.startTime || new Date().toISOString();

    // Dedup check — anyone already recorded this gameId+selection today?
    const { prisma } = await import('@/lib/prisma');
    const etDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(startISO)).replace(/-/g, '-');
    try {
      const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM himothy_pick_registry WHERE event_id = $1 AND lower(selection) = lower($2) AND board_date = $3::date LIMIT 1`,
        gameIdStr, selectionStr, etDateStr,
      );
      if (existing.length > 0) {
        return NextResponse.json({ success: true, duplicate: true, id: existing[0].id });
      }
    } catch { /* dedup check non-blocking; if it fails we still try the insert */ }

    const pick = {
      gameId: gameIdStr,
      eventName: body.eventName || `${body.awayTeam} @ ${body.homeTeam}`,
      league: body.league || 'MLB',
      sport: body.sport || body.league || 'MLB',
      startTime: startISO,
      homeTeam: { name: body.homeTeam || '', abbreviation: '', moneyline: null, winProbability: null },
      awayTeam: { name: body.awayTeam || '', abbreviation: '', moneyline: null, winProbability: null },
      selection: selectionStr,
      selectionSide: body.selectionSide === 'away' ? 'away' : 'home',
      marketType: body.marketType || 'moneyline',
      line: body.line || null,
      odds: body.odds || null,
      tier,
      confidenceScore,
      reasonsFor: body.reason ? [body.reason] : [],
    };
    const id = await createPickManual(pick as any);
    await logAction({
      action: 'CHAT_PICK_AUTO_RECORDED', actor: 'claude',
      subject: `${pick.gameId}|${pick.selection}`,
      summary: `Auto-recorded ${pick.tier} pick: ${pick.selection} (conf ${pick.confidenceScore})`,
      details: { pickId: id, ...pick, reason: body.reason },
    });
    return NextResponse.json({ success: true, id });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
}
