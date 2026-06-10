// Product catalog — single source of truth for what we sell, how much, and which Stripe
// Price IDs back each one. Prices are env-driven so we can roll out new pricing without
// code changes (just update env vars in Vercel and the new prices go live instantly).
//
// NEW STRUCTURE (2026):
//   HIMOTHY PACKAGE — cross-sport flagship: Grand Slam + 2-Pick Pressure Pack + 4-Pack
//   SPORT PACKAGES  — per-sport: up to 7 picks (any market type) + optional system parlay
//   ALL-SPORTS BUNDLE — every sport package at best price
//
// Legacy individual products (grand_slam, pressure_pack, vip_4_pack, power_20, power_10)
// are kept in ProductKey and DB for existing subscribers but hidden from /pricing.

export type ProductKey =
  // ── NEW PACKAGES (shown on /pricing) ───────────────────────────────────────
  | 'himothy_package'      // HIMOTHY flagship: GS + Pressure Pack + 4-Pack, cross-sport
  | 'nba_package'          // NBA: up to 7 picks + optional parlay
  | 'mlb_package'          // MLB: up to 7 picks (spreads/totals/NRFI/props) + optional parlay
  | 'nhl_package'
  | 'nfl_package'
  | 'ncaa_package'         // NCAA (basketball + football)
  | 'wnba_package'
  | 'soccer_package'       // All soccer leagues
  | 'tennis_package'       // ATP / WTA
  | 'ufc_package'          // UFC / Boxing / MMA
  | 'golf_package'         // PGA / LIV — pick to win, not full field
  | 'all_sports_bundle'    // Every sport package at bundle price
  // ── LEGACY INDIVIDUAL (hidden from /pricing, active for existing subscribers) ──
  | 'grand_slam'
  | 'himothy_personal'
  | 'pressure_pack'
  | 'vip_4_pack'
  | 'power_20'
  | 'power_10'
  // ── FREE / ACCESS KEYS (not sold directly) ─────────────────────────────────
  | 'parlay_plan'
  | 'sport_parlays'
  | 'big_games'
  | 'sleeper_picks'
  | 'nrfi'
  | 'value_plays'
  | 'period_plays';

export type PriceInterval = 'one_day' | 'one_week' | 'one_month' | 'one_year';

export interface ProductPrice {
  interval: PriceInterval;
  stripePriceId: string;
  amountCents: number;
  isRecurring: boolean;
  accessDays?: number;
}

export const TRIAL_DAYS = 14;

export interface Product {
  key: ProductKey;
  name: string;
  shortDescription: string;
  longDescription: string;
  sortOrder: number;
  /** Which sport board this package routes to (null = cross-sport HIMOTHY board) */
  sportBoard?: string | null;
  /** Feature tags shown on the package card */
  features: string[];
  /** If true, shown on /pricing. False = legacy/hidden. */
  showOnPricing: boolean;
  prices: ProductPrice[];
}

const env = (k: string) => process.env[k] || '';

export const PRODUCTS: Product[] = [
  // ── HIMOTHY PACKAGE — flagship cross-sport ────────────────────────────────
  {
    key: 'himothy_package',
    name: 'HIMOTHY Package',
    shortDescription: 'Best picks across every sport. Grand Slam → Pressure Pack → 4-Pack.',
    longDescription: 'The HIMOTHY flagship. Ranked best to last: the Grand Slam (top pick of the day), the 2-Pick Pressure Pack, and the 4-Pack round out 7 plays. Cross-sport — whatever sport has the edge that day, it lands here. System generates a parlay when the edge is real.',
    sortOrder: 1,
    sportBoard: null,
    features: ['Grand Slam (best pick)', '2-Pick Pressure Pack', '4-Pack plays', 'System parlay when earned', 'All sports'],
    showOnPricing: true,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_HIMO_PKG_DAY'),   amountCents: 2499,  isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_HIMO_PKG_WEEK'),  amountCents: 6499,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_HIMO_PKG_MONTH'), amountCents: 9999,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_HIMO_PKG_YEAR'),  amountCents: 69900, isRecurring: true },
    ],
  },
  // ── SPORT PACKAGES ────────────────────────────────────────────────────────
  // ── SPORT PACKAGES — all share the same Stripe price IDs (STRIPE_PRICE_SPORT_*)
  // The productKey is stored as metadata on the Stripe session so our app knows
  // which sport the customer bought, but Stripe only needs one product/price set.
  {
    key: 'nba_package',
    name: 'NBA Package',
    shortDescription: 'Up to 7 NBA picks + optional parlay. Best pick first.',
    longDescription: 'All our NBA plays for the day — spreads, totals, player props, anything with an edge. Sorted best to worst. System parlay included when the engine builds one.',
    sortOrder: 2,
    sportBoard: 'north-american',
    features: ['Up to 7 picks', 'Spreads · Totals · Props', 'Best pick first', 'Optional system parlay'],
    showOnPricing: true,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_SPORT_DAY'),   amountCents: 1499,  isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_SPORT_WEEK'),  amountCents: 3999,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_SPORT_MONTH'), amountCents: 4999,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_SPORT_YEAR'),  amountCents: 34900, isRecurring: true },
    ],
  },
  {
    key: 'mlb_package',
    name: 'MLB Package',
    shortDescription: 'Up to 7 MLB picks + optional parlay. NRFI, F5, props included.',
    longDescription: 'All our MLB plays — run lines, totals, F5, NRFI, player props (strikeouts, hits, RBI). Whatever the engine finds for that day\'s slate. Best pick first.',
    sortOrder: 3,
    sportBoard: 'north-american',
    features: ['Up to 7 picks', 'Run lines · Totals · F5 · NRFI', 'Player props', 'Best pick first', 'Optional system parlay'],
    showOnPricing: true,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_SPORT_DAY'),   amountCents: 1499,  isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_SPORT_WEEK'),  amountCents: 3999,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_SPORT_MONTH'), amountCents: 4999,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_SPORT_YEAR'),  amountCents: 34900, isRecurring: true },
    ],
  },
  {
    key: 'nhl_package',
    name: 'NHL Package',
    shortDescription: 'Up to 7 NHL picks + optional parlay. Puck lines, totals, props.',
    longDescription: 'All our NHL plays — puck lines, totals, period plays, player props (shots, goals, assists). Best pick first.',
    sortOrder: 4,
    sportBoard: 'north-american',
    features: ['Up to 7 picks', 'Puck lines · Totals · Periods', 'Player props', 'Best pick first', 'Optional system parlay'],
    showOnPricing: true,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_SPORT_DAY'),   amountCents: 1499,  isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_SPORT_WEEK'),  amountCents: 3999,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_SPORT_MONTH'), amountCents: 4999,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_SPORT_YEAR'),  amountCents: 34900, isRecurring: true },
    ],
  },
  {
    key: 'nfl_package',
    name: 'NFL Package',
    shortDescription: 'Up to 7 NFL picks + optional parlay. Spreads, totals, props.',
    longDescription: 'All our NFL plays for the week — spreads, totals, player props (TDs, yards, receptions). Best pick first.',
    sortOrder: 5,
    sportBoard: 'north-american',
    features: ['Up to 7 picks', 'Spreads · Totals · Props', 'Best pick first', 'Optional system parlay'],
    showOnPricing: true,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_SPORT_DAY'),   amountCents: 1499,  isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_SPORT_WEEK'),  amountCents: 3999,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_SPORT_MONTH'), amountCents: 4999,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_SPORT_YEAR'),  amountCents: 34900, isRecurring: true },
    ],
  },
  {
    key: 'soccer_package',
    name: 'Soccer Package',
    shortDescription: 'Up to 7 picks across all leagues — EPL, Champions League, MLS + more.',
    longDescription: 'All our soccer picks — moneylines, totals, BTTS, halftime/fulltime, player props. Every major league worldwide. Best pick first.',
    sortOrder: 6,
    sportBoard: 'soccer',
    features: ['Up to 7 picks', 'ML · Totals · BTTS · Props', 'EPL · UCL · MLS · La Liga + more', 'Best pick first', 'Optional system parlay'],
    showOnPricing: true,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_SPORT_DAY'),   amountCents: 1499,  isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_SPORT_WEEK'),  amountCents: 3999,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_SPORT_MONTH'), amountCents: 4999,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_SPORT_YEAR'),  amountCents: 34900, isRecurring: true },
    ],
  },
  {
    key: 'tennis_package',
    name: 'Tennis Package',
    shortDescription: 'Up to 7 picks — ATP/WTA. Surface edges, serve stats, H2H.',
    longDescription: 'All our tennis picks — moneylines and set spreads factoring surface edge, serve stats, and head-to-head history. Best pick first.',
    sortOrder: 7,
    sportBoard: 'tennis',
    features: ['Up to 7 picks', 'ATP · WTA · ITF', 'ML · Set lines', 'Surface + fatigue analysis', 'Best pick first'],
    showOnPricing: true,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_SPORT_DAY'),   amountCents: 1499,  isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_SPORT_WEEK'),  amountCents: 3999,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_SPORT_MONTH'), amountCents: 4999,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_SPORT_YEAR'),  amountCents: 34900, isRecurring: true },
    ],
  },
  {
    key: 'ufc_package',
    name: 'UFC / Boxing',
    shortDescription: 'Up to 7 picks — UFC, Boxing, MMA. Fighter analysis, not full cards.',
    longDescription: 'Our combat sports picks — we give you the fighter we like and why. Style matchups, finishing rates, ring rust, takedown defense. No full-card lists, just the fights with a real edge.',
    sortOrder: 8,
    sportBoard: 'combat',
    features: ['Up to 7 picks', 'UFC · Boxing · MMA', 'Fighter edge analysis', 'No fluff — just the pick', 'Best pick first'],
    showOnPricing: true,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_SPORT_DAY'),   amountCents: 1499,  isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_SPORT_WEEK'),  amountCents: 3999,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_SPORT_MONTH'), amountCents: 4999,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_SPORT_YEAR'),  amountCents: 34900, isRecurring: true },
    ],
  },
  {
    key: 'golf_package',
    name: 'Golf Package',
    shortDescription: 'Our pick to win — not a full field list. Just the edge.',
    longDescription: 'Golf picks when the engine finds a real edge. We give you the player we like and exactly why — course history, strokes-gained trends, form, weather. No top-20 lists.',
    sortOrder: 9,
    sportBoard: 'individual',
    features: ['Pick to win', 'Course history + form', 'Strokes-gained analysis', 'PGA · LIV', 'No full-field noise'],
    showOnPricing: true,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_SPORT_DAY'),   amountCents: 1499,  isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_SPORT_WEEK'),  amountCents: 3999,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_SPORT_MONTH'), amountCents: 4999,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_SPORT_YEAR'),  amountCents: 34900, isRecurring: true },
    ],
  },
  {
    key: 'ncaa_package',
    name: 'NCAA Package',
    shortDescription: 'Up to 7 college picks — basketball + football. Spreads + totals.',
    longDescription: 'All our NCAA plays — college basketball and football spreads, totals, and player props. Best pick first.',
    sortOrder: 10,
    sportBoard: 'north-american',
    features: ['Up to 7 picks', 'Basketball · Football', 'Spreads · Totals · Props', 'Best pick first', 'Optional system parlay'],
    showOnPricing: true,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_SPORT_DAY'),   amountCents: 1499,  isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_SPORT_WEEK'),  amountCents: 3999,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_SPORT_MONTH'), amountCents: 4999,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_SPORT_YEAR'),  amountCents: 34900, isRecurring: true },
    ],
  },
  {
    key: 'wnba_package',
    name: 'WNBA Package',
    shortDescription: 'Up to 7 WNBA picks + optional parlay. Spreads, totals, props.',
    longDescription: 'All our WNBA plays — spreads, totals, and player props. Best pick first.',
    sortOrder: 11,
    sportBoard: 'north-american',
    features: ['Up to 7 picks', 'Spreads · Totals · Props', 'Best pick first', 'Optional system parlay'],
    showOnPricing: true,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_SPORT_DAY'),   amountCents: 1499,  isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_SPORT_WEEK'),  amountCents: 3999,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_SPORT_MONTH'), amountCents: 4999,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_SPORT_YEAR'),  amountCents: 34900, isRecurring: true },
    ],
  },
  // ── ALL-SPORTS BUNDLE ────────────────────────────────────────────────────
  {
    key: 'all_sports_bundle',
    name: 'All-Sports Bundle',
    shortDescription: 'Every sport package + the HIMOTHY Package. Best price.',
    longDescription: 'Get everything: HIMOTHY Package (GS + Pressure + 4-Pack) plus all sport packages — NBA, MLB, NHL, NFL, Soccer, Tennis, UFC, Golf, NCAA, WNBA. Everything we produce, every day.',
    sortOrder: 12,
    sportBoard: null,
    features: ['HIMOTHY Package included', 'All 10 sport packages', 'Every pick we produce', 'Best value — save vs. buying individually'],
    showOnPricing: true,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_BUNDLE_DAY'),   amountCents: 7999,  isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_BUNDLE_WEEK'),  amountCents: 19999, isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_BUNDLE_MONTH'), amountCents: 29999, isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_BUNDLE_YEAR'),  amountCents: 199900, isRecurring: true },
    ],
  },
  // ── LEGACY (hidden from /pricing, kept for existing subscribers) ─────────
  {
    key: 'himothy_personal',
    name: 'HIMOTHY Personal Pick',
    shortDescription: 'Best prop across every sport tonight.',
    longDescription: 'Legacy product — standalone daily prop pick.',
    sortOrder: 99,
    sportBoard: null,
    features: [],
    showOnPricing: false,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_PERSONAL_DAY'),   amountCents: 799,   isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_PERSONAL_WEEK'),  amountCents: 2499,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_PERSONAL_MONTH'), amountCents: 3499,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_PERSONAL_YEAR'),  amountCents: 27900, isRecurring: true },
    ],
  },
  {
    key: 'grand_slam',
    name: 'HIMOTHY Grand Slam',
    shortDescription: 'Legacy: top algorithmic pick of the day.',
    longDescription: 'Legacy product — now included in HIMOTHY Package.',
    sortOrder: 99,
    sportBoard: null,
    features: [],
    showOnPricing: false,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_GRAND_SLAM_DAY'),   amountCents: 599,   isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_GRAND_SLAM_WEEK'),  amountCents: 1999,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_GRAND_SLAM_MONTH'), amountCents: 2499,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_GRAND_SLAM_YEAR'),  amountCents: 19900, isRecurring: true },
    ],
  },
  {
    key: 'pressure_pack',
    name: '2-Pick Pressure Pack',
    shortDescription: 'Legacy: picks #2 and #3.',
    longDescription: 'Legacy product — now included in HIMOTHY Package.',
    sortOrder: 99,
    sportBoard: null,
    features: [],
    showOnPricing: false,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_PRESSURE_DAY'),   amountCents: 499,   isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_PRESSURE_WEEK'),  amountCents: 1499,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_PRESSURE_MONTH'), amountCents: 1999,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_PRESSURE_YEAR'),  amountCents: 15900, isRecurring: true },
    ],
  },
  {
    key: 'vip_4_pack',
    name: 'VIP 4-Pack',
    shortDescription: 'Legacy: 4-pack daily plays.',
    longDescription: 'Legacy product — now included in HIMOTHY Package.',
    sortOrder: 99,
    sportBoard: null,
    features: [],
    showOnPricing: false,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_VIP_DAY'),   amountCents: 399,   isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_VIP_WEEK'),  amountCents: 999,   isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_VIP_MONTH'), amountCents: 1499,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_VIP_YEAR'),  amountCents: 11900, isRecurring: true },
    ],
  },
  {
    key: 'power_20',
    name: 'Power 20 Parlay',
    shortDescription: 'Legacy parlay product.',
    longDescription: 'Legacy product — retired.',
    sortOrder: 99,
    sportBoard: null,
    features: [],
    showOnPricing: false,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_P20_DAY'),   amountCents: 199,  isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_P20_WEEK'),  amountCents: 499,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_P20_MONTH'), amountCents: 999,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_P20_YEAR'),  amountCents: 7900, isRecurring: true },
    ],
  },
  {
    key: 'power_10',
    name: 'Power 10 Parlay',
    shortDescription: 'Legacy parlay product.',
    longDescription: 'Legacy product — retired.',
    sortOrder: 99,
    sportBoard: null,
    features: [],
    showOnPricing: false,
    prices: [
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_P10_DAY'),   amountCents: 99,   isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_P10_WEEK'),  amountCents: 299,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_P10_MONTH'), amountCents: 499,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_P10_YEAR'),  amountCents: 3900, isRecurring: true },
    ],
  },
];

export const ALL_PRODUCT_KEYS: ProductKey[] = PRODUCTS.map((p) => p.key);

export function findProduct(key: ProductKey): Product | undefined {
  return PRODUCTS.find((p) => p.key === key);
}

export function findPriceByStripeId(stripePriceId: string): { product: Product; price: ProductPrice } | null {
  for (const product of PRODUCTS) {
    const price = product.prices.find((pr) => pr.stripePriceId === stripePriceId);
    if (price) return { product, price };
  }
  return null;
}

// Visible products for /pricing (sorted by sortOrder)
export const PRICING_PRODUCTS = PRODUCTS.filter((p) => p.showOnPricing).sort((a, b) => a.sortOrder - b.sortOrder);

export const PRODUCT_KEY_BY_FEATURE: Record<string, ProductKey> = {
  grandSlam: 'grand_slam',
  himothyPersonal: 'himothy_personal',
  pressurePack: 'pressure_pack',
  vip4Pack: 'vip_4_pack',
  power20: 'power_20',
  power10: 'power_10',
  // New packages
  himothyPackage: 'himothy_package',
  nbaPackage: 'nba_package',
  mlbPackage: 'mlb_package',
  nhlPackage: 'nhl_package',
  nflPackage: 'nfl_package',
  soccerPackage: 'soccer_package',
  tennisPackage: 'tennis_package',
  ufcPackage: 'ufc_package',
  golfPackage: 'golf_package',
  ncaaPackage: 'ncaa_package',
  wnbaPackage: 'wnba_package',
  allSportsBundle: 'all_sports_bundle',
};
