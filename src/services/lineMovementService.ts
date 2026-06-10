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
    // Time-series snapshots for VELOCITY detection (sharp money / steam moves).
    // We append every time we see new odds; capped at ~24h rolling per event.
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS himothy_line_snapshots (
        id BIGSERIAL PRIMARY KEY,
        event_id TEXT NOT NULL,
        league TEXT NOT NULL,
        home_ml INTEGER,
        away_ml INTEGER,
        spread NUMERIC,
        total NUMERIC,
        captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_line_snapshots_event ON himothy_line_snapshots (event_id, captured_at DESC)`);
    _schemaReady = true;
  } catch (err) {
    console.error('[lineMovementService] ensureSchema failed', err);
  }
}

// Append a fresh snapshot every time we see odds. Cheap, append-only. Read back
// via getVelocity() to spot moves in the last 15 / 60 minutes.
export async function appendSnapshot(eventId: string, league: string, snap: OddsSnapshot) {
  if (!hasDatabase() || !eventId) return;
  await ensureSchema();
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO himothy_line_snapshots (event_id, league, home_ml, away_ml, spread, total)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      eventId, league,
      snap.homeML ?? null, snap.awayML ?? null,
      snap.spread ?? null, snap.total ?? null,
    );
  } catch (err) {
    // Best-effort — never throw out of the engine path.
    console.error('[lineMovementService] appendSnapshot failed', err);
  }
}

export interface LineVelocity {
  hasRecent: boolean;            // did we have any snapshot in the last hour?
  sinceMinutes: number | null;   // how recent is the comparison point
  mlDeltaForSide: number;        // current vs snapshot N min ago for the picked side
  spreadDeltaForSide: number;
  totalDelta: number;
  isSteamMove: boolean;          // > ~10c in <= 15min = textbook steam
}

export async function getVelocity(
  eventId: string,
  current: OddsSnapshot,
  pickedSide: 'home' | 'away',
  windowMinutes: number = 15,
): Promise<LineVelocity> {
  if (!hasDatabase() || !eventId) {
    return { hasRecent: false, sinceMinutes: null, mlDeltaForSide: 0, spreadDeltaForSide: 0, totalDelta: 0, isSteamMove: false };
  }
  await ensureSchema();
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT home_ml, away_ml, spread, total, EXTRACT(EPOCH FROM (NOW() - captured_at)) AS age_sec
       FROM himothy_line_snapshots
       WHERE event_id = $1 AND captured_at <= NOW() - INTERVAL '${windowMinutes} minutes'
       ORDER BY captured_at DESC
       LIMIT 1`,
      eventId,
    );
    if (rows.length === 0) {
      return { hasRecent: false, sinceMinutes: null, mlDeltaForSide: 0, spreadDeltaForSide: 0, totalDelta: 0, isSteamMove: false };
    }
    const past = rows[0];
    const sinceMinutes = Math.round(Number(past.age_sec || 0) / 60);
    const ourPastMl = pickedSide === 'home' ? past.home_ml : past.away_ml;
    const ourCurMl = pickedSide === 'home' ? current.homeML : current.awayML;
    const mlDelta = (ourCurMl != null && ourPastMl != null) ? Number(ourCurMl) - Number(ourPastMl) : 0;
    // Spread movement for picked side. Positive = line moved TOWARD picked side.
    const spreadFlip = pickedSide === 'away' ? -1 : 1;
    const spreadDelta = (current.spread != null && past.spread != null) ? (Number(current.spread) - Number(past.spread)) * spreadFlip : 0;
    const totalDelta = (current.total != null && past.total != null) ? Number(current.total) - Number(past.total) : 0;
    const isSteamMove = Math.abs(mlDelta) >= 10 || Math.abs(spreadDelta) >= 1;
    return {
      hasRecent: true,
      sinceMinutes,
      mlDeltaForSide: Math.round(mlDelta),
      spreadDeltaForSide: Number(spreadDelta.toFixed(1)),
      totalDelta: Number(totalDelta.toFixed(1)),
      isSteamMove,
    };
  } catch {
    return { hasRecent: false, sinceMinutes: null, mlDeltaForSide: 0, spreadDeltaForSide: 0, totalDelta: 0, isSteamMove: false };
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
