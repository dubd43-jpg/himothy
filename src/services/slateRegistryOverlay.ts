// SLATE → REGISTRY OVERLAY
//
// The slate cache is intentionally frozen once per day (so we don't burn
// expensive engine recomputes on every pageview). But the signal-watch cron
// updates the REGISTRY whenever a worker flags a pick — confidence cap, alert
// level, alert reasons, etc.
//
// Without this overlay the customer's /api/research/daily-picks pageview shows
// stale conf numbers because the cache hasn't been recomputed. The owner's
// directive 2026-06-05: "We need to make sure that updates and the site shows
// it no matter what the stale thing is doing."
//
// This helper walks every pick on the slate, looks up its registry row by
// (event_id, selection), and copies these fields ONTO the pick:
//   - confidenceScore (from edge_score)
//   - lineAlertLevel ('watch' / 'yellow' / 'red')
//   - lineAlertReasons (string[])
//   - lineMoveCents (number)
//   - preAlertConfidence (number — original score before the cap)
//
// No engine recompute. No regen race. Just registry → slate field projection.

import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';

interface RegistryFlatRow {
  event_id: string | null;
  selection: string;
  edge_score: number | null;
  line_alert_level: string | null;
  line_move_cents: number | null;
  pre_alert_edge_score: number | null;
  signal_alert_reasons: any;
}

function normalizeKey(eventId: string | null | undefined, selection: string | null | undefined): string {
  const norm = String(selection || '').toLowerCase().replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim();
  return `${String(eventId || '').trim()}|${norm}`;
}

// Pull today's registry rows once per call. Returns a Map keyed by (event_id|selection).
async function buildRegistryMap(): Promise<Map<string, RegistryFlatRow>> {
  const out = new Map<string, RegistryFlatRow>();
  if (!hasDatabase()) return out;
  try {
    const rows = await prisma.$queryRawUnsafe<RegistryFlatRow[]>(
      `SELECT event_id, selection, edge_score,
              line_alert_level, line_move_cents,
              pre_alert_edge_score, signal_alert_reasons
         FROM himothy_pick_registry
        WHERE board_date = (NOW() AT TIME ZONE 'America/New_York')::date
          AND status IN ('published','locked')`,
    );
    for (const r of rows) {
      out.set(normalizeKey(r.event_id, r.selection), r);
    }
  } catch (err) {
    console.error('[slateOverlay] registry read failed', err);
  }
  return out;
}

function applyRowToPick(pick: any, row: RegistryFlatRow): void {
  if (!pick) return;
  if (row.edge_score != null) {
    pick.confidenceScore = Number(row.edge_score);
  }
  if (row.line_alert_level) {
    pick.lineAlertLevel = row.line_alert_level;
    pick.preAlertConfidence = row.pre_alert_edge_score != null ? Number(row.pre_alert_edge_score) : null;
    pick.lineAlertReasons = Array.isArray(row.signal_alert_reasons) ? row.signal_alert_reasons : [];
    pick.lineMoveCents = row.line_move_cents != null ? Number(row.line_move_cents) : null;
  } else {
    // Explicitly clear any stale flag fields the cached pick might have.
    pick.lineAlertLevel = null;
    pick.lineAlertReasons = [];
    pick.lineMoveCents = null;
  }
}

// Apply the overlay to a complete slate result (the shape returned by
// runDeepResearchForBoard / getOrComputeBoard). Mutates in place AND returns
// the same reference so callers can chain it inside their filter pipeline.
export async function applyRegistryOverlay(slate: any): Promise<any> {
  if (!slate) return slate;
  const map = await buildRegistryMap();
  if (map.size === 0) return slate;

  const patchPick = (pick: any) => {
    if (!pick?.gameId) return;
    const row = map.get(normalizeKey(pick.gameId, pick.selection));
    if (row) applyRowToPick(pick, row);
  };

  if (slate.grandSlam) patchPick(slate.grandSlam);
  for (const key of ['pressurePack', 'vip4Pack', 'parlayPlan', 'marquee', 'asleepPicks', 'nrfi']) {
    if (Array.isArray(slate[key])) slate[key].forEach(patchPick);
  }
  // Any other product arrays that may show up later — be defensive.
  for (const key of Object.keys(slate)) {
    const v = slate[key];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item && typeof item === 'object' && item.gameId) patchPick(item);
      }
    }
  }
  return slate;
}
