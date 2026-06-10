import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';
import { getEtDateKey } from '@/lib/officialTracking';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// FAST pick-by-id lookup. The breakdown page used to chain 6+ deep-research API
// calls (one per board) to find a pick, taking 5-10 seconds. The registry has
// every published pick stored with its full research payload — this endpoint
// reads ONE row from Postgres and returns it as a DeepPick-shaped object.
//
// Fallback: if no registry hit (e.g. specialty product not yet recorded), the
// caller can still chain to the slow path. But for >95% of clicks this is <100ms.

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const gameId = url.searchParams.get('gameId');
    const selection = url.searchParams.get('selection');
    if (!gameId) return NextResponse.json({ success: false, error: 'gameId required' }, { status: 400 });
    if (!hasDatabase()) return NextResponse.json({ success: false, error: 'database not configured' }, { status: 503 });

    // Match by event_id (preferred) + optional selection. Pull today's board first,
    // fall back to most-recent board if not found (links from yesterday should
    // still resolve so the breakdown isn't a dead-end).
    const today = getEtDateKey();
    let rows: any[];
    // Normalize selection: strip extra whitespace, normalize em-dash, lowercase.
    // Bug fix 2026-06-04: URLs encoded em-dash differently than registry storage
    // caused exact-match lookups to fail and fall through to wrong-pick guesses.
    const normalizeSel = (s: string) => s.replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
    if (selection) {
      const normSel = normalizeSel(selection);
      // STAGE 1 — exact match on today's board
      rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM himothy_pick_registry
         WHERE event_id = $1
           AND lower(regexp_replace(selection, '[—–]', '-', 'g')) = $2
           AND board_date = $3::date
           AND status NOT IN ('void')
         ORDER BY publish_time DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        String(gameId), normSel, today,
      );
      // STAGE 2 — exact match on any board (for cross-day deep links)
      if (rows.length === 0) {
        rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM himothy_pick_registry
           WHERE event_id = $1 AND lower(regexp_replace(selection, '[—–]', '-', 'g')) = $2
             AND status NOT IN ('void')
           ORDER BY publish_time DESC NULLS LAST, created_at DESC
           LIMIT 1`,
          String(gameId), normSel,
        );
      }
      // STAGE 2.5 — fuzzy match (substring containment, case-insensitive). Picks
      // up "Padres TT Under 4.5" matching "San Diego Padres Team Total Under 4.5"
      // and similar formatting variants.
      if (rows.length === 0) {
        rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM himothy_pick_registry
           WHERE event_id = $1 AND board_date = $2::date AND status NOT IN ('void')
             AND (
               lower(regexp_replace(selection, '[—–]', '-', 'g')) LIKE '%' || $3 || '%'
               OR $3 LIKE '%' || lower(regexp_replace(selection, '[—–]', '-', 'g')) || '%'
             )
           ORDER BY publish_time DESC NULLS LAST, created_at DESC
           LIMIT 1`,
          String(gameId), today, normSel,
        );
      }
      // FIX 2026-06-06 (owner directive — wrong-pick silent substitution):
      // STAGE 3 used to fall back to the highest-priority pick on the same game
      // (which is why clicking "Padres Team Total Under" loaded "Mets ML").
      // That silent substitution is removed. If the caller passed a selection
      // and nothing matched (even fuzzy), we return 404 so the breakdown page
      // can show "pick not found" instead of showing the wrong pick.
      if (rows.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'pick not found',
          gameId, selection,
        }, { status: 404 });
      }
    } else {
      // No selection given — order by PRODUCT PRIORITY so Grand Slam beats every
      // other same-game pick, then Pressure Pack, VIP, Parlay, Marquee, etc.
      // Bug 2026-06-04: clicking Knights ML (Grand Slam) was surfacing a same-game
      // Under-pick row. The previous rule (just deprioritize player_props) wasn't
      // enough — we now explicitly rank by category priority.
      const CATEGORY_PRIORITY = `
        CASE category
          WHEN 'GRAND_SLAM'    THEN 0
          WHEN 'PRESSURE_PACK' THEN 1
          WHEN 'VIP_4_PACK'    THEN 2
          WHEN 'PARLAY_PLAN'   THEN 3
          WHEN 'MARQUEE'       THEN 4
          WHEN 'PERSONAL_PICK' THEN 5
          WHEN 'ASLEEP_PICKS'  THEN 6
          WHEN 'VALUE_PLAYS'   THEN 7
          WHEN 'PERIOD_PLAYS'  THEN 8
          WHEN 'NRFI'          THEN 9
          ELSE 99
        END
      `;
      rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM himothy_pick_registry
         WHERE event_id = $1 AND board_date = $2::date AND status NOT IN ('void')
         ORDER BY ${CATEGORY_PRIORITY} ASC,
                  (CASE WHEN market_type = 'player_prop' THEN 1 ELSE 0 END) ASC,
                  publish_time DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        String(gameId), today,
      );
      if (rows.length === 0) {
        rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM himothy_pick_registry
           WHERE event_id = $1 AND status NOT IN ('void')
           ORDER BY ${CATEGORY_PRIORITY} ASC,
                    (CASE WHEN market_type = 'player_prop' THEN 1 ELSE 0 END) ASC,
                    publish_time DESC NULLS LAST, created_at DESC
           LIMIT 1`,
          String(gameId),
        );
      }
    }
    const row = rows[0];
    if (!row) return NextResponse.json({ success: true, pick: null });

    // Hydrate a DeepPick-shaped object. Pull rich fields out of research_payload
    // when present; otherwise fall back to the flat columns.
    const payload = (typeof row.research_payload === 'object' && row.research_payload) || {};
    const reasonsFor: string[] = Array.isArray((payload as any).reasonsFor) ? (payload as any).reasonsFor : (row.reasoning_summary ? [row.reasoning_summary] : []);
    const reasonsAgainst: string[] = Array.isArray((payload as any).reasonsAgainst) ? (payload as any).reasonsAgainst : (row.risk_summary ? [row.risk_summary] : []);

    const pick = {
      gameId: row.event_id,
      eventName: row.event_name,
      league: row.league,
      sport: row.sport,
      startTime: (payload as any).startTime || (payload as any).startTimeUtc || (payload as any).eventDateUtc || null,
      homeTeam: (payload as any).homeTeam || { id: '', name: row.home_team || 'Home', abbreviation: '', moneyline: null, winProbability: null },
      awayTeam: (payload as any).awayTeam || { id: '', name: row.away_team || 'Away', abbreviation: '', moneyline: null, winProbability: null },
      spread: (payload as any).spread ?? null,
      total: (payload as any).total ?? null,
      selection: row.selection,
      selectionSide: (payload as any).selectionSide || 'home',
      marketType: row.market_type,
      odds: row.odds,
      line: row.line,
      confidenceScore: Number((payload as any).confidenceScore ?? row.edge_score ?? 75),
      tier: row.confidence_tier || row.category || 'CORE',
      reasonsFor,
      reasonsAgainst,
      signals: (payload as any).signals || { winProbabilityGap: 0, atsCoverPct: null, dataQuality: row.edge_score ?? 70 },
      aiExplanation: (payload as any).aiExplanation || null,
      sharpFlags: (payload as any).sharpFlags || [],
      bigGameLabel: (payload as any).bigGameLabel || null,
      sharpIntel: (payload as any).sharpIntel || null,
      tendencyResolution: (payload as any).tendencyResolution || null,
      isAsleepPick: (payload as any).isAsleepPick || false,
    };
    return NextResponse.json({ success: true, pick });
  } catch (error: any) {
    console.error('picks/lookup failed', error);
    return NextResponse.json({ success: false, error: 'lookup failed', detail: String(error?.message || error) }, { status: 500 });
  }
}
