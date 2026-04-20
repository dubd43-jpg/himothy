import { prisma } from '@/lib/prisma';

export type GradingStrategy = 'moneyline' | 'spread' | 'total' | 'unsupported';

export interface MarketRegistryRule {
  marketKey: string;
  displayName: string;
  gradingStrategy: GradingStrategy;
  enabledForPublish: boolean;
  supportsMainPick: boolean;
  minDataQualityScore: number;
  updatedAt: string;
}

const DEFAULT_RULES: Array<Omit<MarketRegistryRule, 'updatedAt'>> = [
  {
    marketKey: 'moneyline',
    displayName: 'Moneyline',
    gradingStrategy: 'moneyline',
    enabledForPublish: true,
    supportsMainPick: true,
    minDataQualityScore: 60,
  },
  {
    marketKey: 'spread',
    displayName: 'Spread',
    gradingStrategy: 'spread',
    enabledForPublish: true,
    supportsMainPick: true,
    minDataQualityScore: 60,
  },
  {
    marketKey: 'total',
    displayName: 'Total',
    gradingStrategy: 'total',
    enabledForPublish: true,
    supportsMainPick: true,
    minDataQualityScore: 60,
  },
  {
    marketKey: 'player-prop',
    displayName: 'Player Prop',
    gradingStrategy: 'unsupported',
    enabledForPublish: false,
    supportsMainPick: false,
    minDataQualityScore: 75,
  },
  {
    marketKey: 'team-total',
    displayName: 'Team Total',
    gradingStrategy: 'unsupported',
    enabledForPublish: false,
    supportsMainPick: false,
    minDataQualityScore: 70,
  },
  {
    marketKey: 'alt-line',
    displayName: 'Alt Line',
    gradingStrategy: 'unsupported',
    enabledForPublish: false,
    supportsMainPick: false,
    minDataQualityScore: 75,
  },
  {
    marketKey: 'correlated-parlay',
    displayName: 'Correlated Parlay',
    gradingStrategy: 'unsupported',
    enabledForPublish: false,
    supportsMainPick: false,
    minDataQualityScore: 80,
  },
];

let schemaReady = false;

function normalizeText(input: string) {
  return input.trim().toLowerCase();
}

export function normalizeMarketKey(marketType: string) {
  const text = normalizeText(marketType);
  if (text.includes('moneyline') || text === 'ml') return 'moneyline';
  if (text.includes('spread') || text.includes('handicap')) return 'spread';
  if (text.includes('total') || text.includes('over') || text.includes('under')) return 'total';
  if (text.includes('team total')) return 'team-total';
  if (text.includes('player prop') || text.includes('prop')) return 'player-prop';
  if (text.includes('alt')) return 'alt-line';
  if (text.includes('correlated')) return 'correlated-parlay';
  return text;
}

async function ensureMarketRegistrySchema() {
  if (schemaReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS himothy_market_registry (
      market_key TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      grading_strategy TEXT NOT NULL,
      enabled_for_publish BOOLEAN NOT NULL DEFAULT FALSE,
      supports_main_pick BOOLEAN NOT NULL DEFAULT FALSE,
      min_data_quality_score INTEGER NOT NULL DEFAULT 60,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  for (const rule of DEFAULT_RULES) {
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO himothy_market_registry (
          market_key,
          display_name,
          grading_strategy,
          enabled_for_publish,
          supports_main_pick,
          min_data_quality_score,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (market_key) DO NOTHING
      `,
      rule.marketKey,
      rule.displayName,
      rule.gradingStrategy,
      rule.enabledForPublish,
      rule.supportsMainPick,
      rule.minDataQualityScore
    );
  }

  schemaReady = true;
}

function toRule(row: any): MarketRegistryRule {
  return {
    marketKey: row.market_key,
    displayName: row.display_name,
    gradingStrategy: row.grading_strategy,
    enabledForPublish: Boolean(row.enabled_for_publish),
    supportsMainPick: Boolean(row.supports_main_pick),
    minDataQualityScore: Number(row.min_data_quality_score || 60),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

export async function getMarketRegistryRule(marketType: string): Promise<MarketRegistryRule | null> {
  await ensureMarketRegistrySchema();
  const key = normalizeMarketKey(marketType);

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT market_key, display_name, grading_strategy, enabled_for_publish, supports_main_pick, min_data_quality_score, updated_at
      FROM himothy_market_registry
      WHERE market_key = $1
      LIMIT 1
    `,
    key
  );

  return rows[0] ? toRule(rows[0]) : null;
}

export async function listMarketRegistryRules() {
  await ensureMarketRegistrySchema();

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT market_key, display_name, grading_strategy, enabled_for_publish, supports_main_pick, min_data_quality_score, updated_at
      FROM himothy_market_registry
      ORDER BY market_key ASC
    `
  );

  return rows.map(toRule);
}

export async function assertMarketPublishable(input: {
  marketType: string;
  isMainPick?: boolean;
  requiredDataQualityScore?: number;
}) {
  const rule = await getMarketRegistryRule(input.marketType);
  if (!rule) {
    return {
      ok: false,
      reason: `Market not registered: ${input.marketType}. Add to himothy_market_registry before publishing.`,
      rule: null,
    };
  }

  if (!rule.enabledForPublish) {
    return {
      ok: false,
      reason: `Market blocked for publish: ${rule.displayName}.`,
      rule,
    };
  }

  if (rule.gradingStrategy === 'unsupported') {
    return {
      ok: false,
      reason: `Market blocked: no deterministic grading strategy for ${rule.displayName}.`,
      rule,
    };
  }

  if (input.isMainPick === true && !rule.supportsMainPick) {
    return {
      ok: false,
      reason: `Main Pick blocked: ${rule.displayName} is not eligible for Main Pick status.`,
      rule,
    };
  }

  if (typeof input.requiredDataQualityScore === 'number' && input.requiredDataQualityScore < rule.minDataQualityScore) {
    return {
      ok: false,
      reason: `Data quality too low for ${rule.displayName}. Required ${rule.minDataQualityScore}, got ${input.requiredDataQualityScore}.`,
      rule,
    };
  }

  return { ok: true, reason: null, rule };
}
