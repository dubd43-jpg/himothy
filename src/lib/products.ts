// Product catalog — single source of truth for what we sell, how much, and which Stripe
// Price IDs back each one. Prices are env-driven so we can roll out new pricing without
// code changes (just update env vars in Vercel and the new prices go live instantly).
//
// IMPORTANT: After creating products in the Stripe dashboard, paste each Price ID into
// the matching env var. Without these env vars set, checkout for that product will 404
// safely instead of charging the wrong amount.

export type ProductKey =
  | 'grand_slam'           // HIMOTHY Grand Slam — the rare near-lock daily flagship
  | 'himothy_personal'     // HIMOTHY Personal Pick — user's personal pick, usually playoff props
  | 'pressure_pack'
  | 'vip_4_pack'
  | 'power_20'
  | 'power_10';

export type PriceInterval = 'one_day' | 'one_week' | 'one_month' | 'one_year';

export interface ProductPrice {
  interval: PriceInterval;
  /** Stripe Price ID, env-driven (e.g., STRIPE_PRICE_HIMOTHY_MONTH). Empty = not for sale yet. */
  stripePriceId: string;
  /** Display price in cents — used for UI only; Stripe enforces the real price. */
  amountCents: number;
  /** "month" / "year" → recurring subscription. "one_day" / "one_week" → one-time charge. */
  isRecurring: boolean;
  /** Days of access this purchase grants (used for one-time charges to set accessUntil). */
  accessDays?: number;
}

// Universal 14-day free trial on every recurring subscription. Card-required so the
// conversion rate is ~24% (vs ~5% on no-card trials) AND chargeback risk stays low.
// Day/week passes never trial — they're one-time, customer pays immediately.
export const TRIAL_DAYS = 14;

export interface Product {
  key: ProductKey;
  name: string;
  shortDescription: string;
  longDescription: string;
  /** Sort order on the /pricing page (lower = earlier). */
  sortOrder: number;
  prices: ProductPrice[];
}

const env = (k: string) => process.env[k] || '';

// The full catalog. Add/remove products by editing this file; Stripe Price IDs are still
// env-driven so each environment (preview / production) can have its own pricing.
export const PRODUCTS: Product[] = [
  // Sorted by quality — highest conviction first, volume/play products last. Price ladder
  // mirrors the ranking exactly so Pressure Pack > VIP 4-Pack always holds.
  {
    key: 'himothy_personal',
    name: 'HIMOTHY Personal Pick',
    shortDescription: "The single best prop across every sport tonight. Standalone only.",
    longDescription: "One pick per night, max. The engine scans every player prop on every game — NBA over/unders, NFL anytime TDs, NHL shots, MLB strikeouts, college hoops + football, every sport on the slate — and surfaces the single highest-edge prop of all. Only fires when there's a real edge. The most exclusive product on the site: NOT in the 14-day trial, NOT bundled with anything, NOT a yearly perk. Standalone purchase only.",
    sortOrder: 1,
    prices: [
      // LAUNCH PRICING — designed to acquire 5-10x more customers in the first 90 days
      // than premium pricing would. Raise on new customers in 60-90 days once a verified
      // record + testimonials exist. Existing subscribers get grandfathered.
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_PERSONAL_DAY'),   amountCents: 799,   isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_PERSONAL_WEEK'),  amountCents: 2499,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_PERSONAL_MONTH'), amountCents: 3499,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_PERSONAL_YEAR'),  amountCents: 27900, isRecurring: true },
    ],
  },
  {
    key: 'grand_slam',
    name: 'HIMOTHY Grand Slam',
    shortDescription: "Our top algorithmic pick of the day. Rare drops.",
    longDescription: "The single best play the engine produces — posted only on days with full signal confluence (66%+ win prob, 8+ confirming signals, no key injuries). Most weeks we sit out rather than force a play. When the Grand Slam drops, it's the play we feel strongest about all month.",
    sortOrder: 2,
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
    shortDescription: "Picks #2 and #3 — almost Grand Slam quality. Daily.",
    longDescription: "If we had three top plays today, the best becomes the Grand Slam and the next two land here. Right up on Grand Slam confidence; the only difference is we don't want to risk the Grand Slam standing alone, so these get released together. Two plays, both fully reasoned, daily before slate lock.",
    sortOrder: 3,
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
    shortDescription: "Volume play — the 4 lowest-confidence plays of the day.",
    longDescription: "If we had 7 top plays today, the bottom 4 land here. Not the highest-conviction picks — these are the volume tier, designed to give bettors a real spread of action across the night. Cheaper than Pressure Pack because the picks are less confident, but you get twice the volume (4 picks vs 2).",
    sortOrder: 4,
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
    shortDescription: "Daily 20-leg moonshot parlay. Something to play with.",
    longDescription: "The daily 20-leg parlay built fresh every morning. All legs capped at -450 so payouts stay real. Small stake, big upside if it hits — designed as the casual play, not a serious bankroll product.",
    sortOrder: 5,
    prices: [
      // Per user spec: monthly capped around $10 ("something to play with")
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_P20_DAY'),   amountCents: 199,  isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_P20_WEEK'),  amountCents: 499,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_P20_MONTH'), amountCents: 999,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_P20_YEAR'),  amountCents: 7900, isRecurring: true },
    ],
  },
  {
    key: 'power_10',
    name: 'Power 10 Parlay',
    shortDescription: "Daily 10-leg parlay. Even cheaper.",
    longDescription: "The daily 10-leg parlay. Same engine as Power 20 but fewer legs, much higher hit rate, smaller payout range. The everyday casual version.",
    sortOrder: 6,
    prices: [
      // Per user spec: monthly capped around $5
      { interval: 'one_day',   stripePriceId: env('STRIPE_PRICE_P10_DAY'),   amountCents: 99,   isRecurring: false, accessDays: 1 },
      { interval: 'one_week',  stripePriceId: env('STRIPE_PRICE_P10_WEEK'),  amountCents: 299,  isRecurring: false, accessDays: 7 },
      { interval: 'one_month', stripePriceId: env('STRIPE_PRICE_P10_MONTH'), amountCents: 499,  isRecurring: true },
      { interval: 'one_year',  stripePriceId: env('STRIPE_PRICE_P10_YEAR'),  amountCents: 3900, isRecurring: true },
    ],
  },
];

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

// What ProductKeys a particular site feature requires. Used by the access-gate helpers
// to decide whether to show the picks or the upgrade CTA.
export const PRODUCT_KEY_BY_FEATURE: Record<string, ProductKey> = {
  grandSlam: 'grand_slam',
  himothyPersonal: 'himothy_personal',
  pressurePack: 'pressure_pack',
  vip4Pack: 'vip_4_pack',
  power20: 'power_20',
  power10: 'power_10',
};
