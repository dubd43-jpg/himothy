// ============================================================
// HIMOTHY PICK REGISTRY — types only.
//
// NOTE: This file used to ship a hardcoded set of sample/fixture picks
// (fake games, players, odds) plus a simulated audit log. Those were removed
// to keep the site 100% real — nothing fabricated is ever shown to customers.
// Real picks come from the live research engine (deepResearchService) and, once
// a database is connected, from the admin-published pick registry. These exports
// remain as empty arrays so any legacy consumer renders nothing rather than fiction.
// ============================================================

export type PickCategory =
  | "GRAND_SLAM"
  | "PRESSURE_PACK"
  | "VIP_4_PACK"
  | "PARLAY_PLAN"
  | "OVERNIGHT"
  | "PERSONAL_PLAY"
  | "HAILMARY"
  | "OVERSEAS";

export interface Pick {
  id: string;
  category: PickCategory;
  sport: string;
  game: string;
  gameDate?: string;
  gameTime?: string;
  market: string;
  selection: string;
  line: string;
  odds: string;
  confidence: number;
  edge: string;
  risk: string;
  reasoning: string;
  isPremium?: boolean;
  legs?: string[]; // For parlays
  bestUse?: string;
  status?: string;
  fadeReasoning?: string;
}

// No fabricated picks. Real picks flow from the live engine / DB registry.
export const PICK_REGISTRY: Pick[] = [];

// Helper to filter by category
export const getPicksByCategory = (cat: PickCategory) =>
  PICK_REGISTRY.filter(p => p.category === cat);

// Derived exports (empty until real data exists)
export const hailmaryParlays = getPicksByCategory("HAILMARY");
export const tenDollarParlayPlan = getPicksByCategory("PARLAY_PLAN");
export const overseasPicks = getPicksByCategory("OVERSEAS");
export const overnightBets = getPicksByCategory("OVERNIGHT");

export interface AuditLogEntry {
  id: string;
  time: string;
  pick: string;
  action: "published" | "changed" | "removed";
  reason: string;
}

// No simulated audit log — real grading/audit comes from the registry once a DB is set.
export const SIMULATED_AUDIT_LOG: AuditLogEntry[] = [];
