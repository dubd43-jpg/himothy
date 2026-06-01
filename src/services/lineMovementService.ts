// Line-movement tracking — the closest free proxy to "where's the money?"
//
// Without a paid public-betting feed (Action Network paywalled the splits),
// line movement is the cleanest sharp signal we can build ourselves:
//   - Store the OPENING odds the first time we ever see a game
//   - On subsequent views, compare CURRENT odds to opening
//   - If line moved TOWARD a side (e.g., we like -150 fav, line went to -135),
//     the market is correcting in our favor — sharp action
//   - If line moved AWAY from our side, the public is piling on or sharps fading us
//
// Storage: himothy_line_history table, one row per (event_id, market_type) capture.
// Cost: zero extra API calls (we already fetch scoreboard odds in processGame).

import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady || !hasDatabase()) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS himothy_line_history (
        event_id TEXT NOT NULL,
        league TEXT NOT NULL,
        market_type TEXT NOT NULL,
        opening_home_ml INTEGER,
        opening_away_ml INTEGER,
        opening_spread NUMERIC,
        opening_total NUMERIC,
        captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (event_id, market_type)
      )
    `);
    _schemaReady = true;
  } catch (err) {
    console.error('[lineMovementService] ensureSchema failed', err);
  }
}

export interface OddsSnapshot {
  homeML: number | null;
  awayML: number | null;
  spread: number | null;
  total: number | null;
}

export interface LineMovement {
  // Movement on the ML for the picked side, in American-odds points.
  // Positive = line moved TOWARD the picked side (sharp action our way; we get worse
  // price now but the market is agreeing with us). Negative = moved AWAY (public
  // piling on the other side, or sharps fading us). 0 = no movement / no opening data.
  mlMovementForSide: number;
  // Spread movement from picked side's perspective. Positive = line moved TOWARD us.
  spreadMovementForSide: number;
  // Total movement — positive = total moved UP (over getting steam)
  totalMovement: number;
  hasOpening: boolean;
}

// Try to store opening odds. Insert-only (ON CONFLICT DO NOTHING) so the opening
// stays frozen — we never overwrite the opening with later odds.
export async function captureOpeningOdds(
  eventId: string,
  league: string,
  snapshot: OddsSnapshot,
): Promise<void> {
  if (!hasDatabase() || !eventId) return;
  await ensureSchema();
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO himothy_line_history (event_id, league, market_type, opening_home_ml, opening_away_ml, opening_spread, opening_total)
       VALUES ($1, $2, 'game', $3, $4, $5, $6)
       ON CONFLICT (event_id, market_type) DO NOTHING`,
      eventId, league,
      snapshot.homeML ?? null,
      snapshot.awayML ?? null,
      snapshot.spread ?? null,
      snapshot.total ?? null,
    );
  } catch (err) {
    console.error('[lineMovementService] captureOpeningOdds failed', err);
  }
}

// Look up opening odds for this event. Returns null if we never captured one.
export async function getOpeningOdds(eventId: string): Promise<OddsSnapshot | null> {
  if (!hasDatabase() || !eventId) return null;
  await ensureSchema();
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT opening_home_ml, opening_away_ml, opening_spread, opening_total
       FROM himothy_line_history
       WHERE event_id = $1 AND market_type = 'game'
       LIMIT 1`,
      eventId,
    );
    const r = rows[0];
    if (!r) return null;
    return {
      homeML: r.opening_home_ml != null ? Number(r.opening_home_ml) : null,
      awayML: r.opening_away_ml != null ? Number(r.opening_away_ml) : null,
      spread: r.opening_spread != null ? Number(r.opening_spread) : null,
      total: r.opening_total != null ? Number(r.opening_total) : null,
    };
  } catch {
    return null;
  }
}

// Compute movement for the picked side. Both opening and current required; returns
// {hasOpening:false} if we never captured an opening for this game.
export function computeMovement(
  opening: OddsSnapshot | null,
  current: OddsSnapshot,
  pickedSide: 'home' | 'away',
): LineMovement {
  if (!opening) {
    return { mlMovementForSide: 0, spreadMovementForSide: 0, totalMovement: 0, hasOpening: false };
  }

  // ML movement: for our side, positive American odds going more negative (e.g., +130 → +110)
  // OR negative going more negative (e.g., -110 → -130) = line moved TOWARD us (we're shorter
  // now, meaning bookmaker thinks we're more likely to win than at open).
  // The magnitude is "how many American-odds points shorter we got":
  //   opening +130, current +110 → +20 toward us (shorter dog)
  //   opening -110, current -130 → +20 toward us (longer fav)
  //   opening -110, current -100 → -10 away from us (the public faded us)
  const openingPicked = pickedSide === 'home' ? opening.homeML : opening.awayML;
  const currentPicked = pickedSide === 'home' ? current.homeML : current.awayML;
  let mlMovementForSide = 0;
  if (openingPicked != null && currentPicked != null) {
    // Both in the same direction (both positive or both negative) — simple delta
    if ((openingPicked > 0) === (currentPicked > 0)) {
      // For positive (dog): smaller positive = movement toward us → delta is opening - current
      // For negative (fav): more negative = movement toward us → delta is |current| - |opening|
      if (openingPicked > 0) mlMovementForSide = openingPicked - currentPicked;
      else mlMovementForSide = Math.abs(currentPicked) - Math.abs(openingPicked);
    } else {
      // Sign flip — e.g., opened +105 (dog), now -105 (fav). Massive movement TOWARD us.
      // Or opened -105 (fav), now +105 (dog). Massive AWAY movement.
      if (openingPicked > 0 && currentPicked < 0) {
        // Went from dog to favorite — heavy money on our side
        mlMovementForSide = openingPicked + Math.abs(currentPicked);
      } else {
        // Went from favorite to dog — getting faded
        mlMovementForSide = -(Math.abs(openingPicked) + currentPicked);
      }
    }
  }

  // Spread movement: from picked side's perspective. If we picked -1.5 and line moves
  // to -1 (less steep), that's MOVEMENT AWAY (people fading us). If -1.5 moves to -2
  // (steeper), MOVEMENT TOWARD us.
  let spreadMovementForSide = 0;
  if (opening.spread != null && current.spread != null) {
    const openingPickedSpread = pickedSide === 'home' ? opening.spread : -opening.spread;
    const currentPickedSpread = pickedSide === 'home' ? current.spread : -current.spread;
    // More negative = steeper favorite = movement toward us if we picked the fav side
    spreadMovementForSide = openingPickedSpread - currentPickedSpread;
  }

  // Total movement: positive = total went UP (over getting steam)
  const totalMovement = (opening.total != null && current.total != null)
    ? current.total - opening.total
    : 0;

  return {
    mlMovementForSide: Number(mlMovementForSide.toFixed(0)),
    spreadMovementForSide: Number(spreadMovementForSide.toFixed(1)),
    totalMovement: Number(totalMovement.toFixed(1)),
    hasOpening: true,
  };
}
