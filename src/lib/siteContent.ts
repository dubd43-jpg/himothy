// Site content store — owner-editable text fields keyed by string (e.g. "site.banner.message",
// "home.hero.title"). Pages read with getContent(key, default); the admin /admin/content page
// writes via setContent. Auto-creates its table on first use, like the registry.

import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';

let _ready = false;
async function ensureContentSchema() {
  if (_ready || !hasDatabase()) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS himothy_site_content (
        "key" TEXT PRIMARY KEY,
        "value" TEXT NOT NULL DEFAULT '',
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    _ready = true;
  } catch (err) {
    console.error('[siteContent] ensureContentSchema failed', err);
  }
}

// Per-request in-memory cache so a single render doesn't requery the same keys repeatedly.
// (Cleared between requests by Next's module isolation.)
const reqCache = new Map<string, string>();

export async function getContent(key: string, fallback = ''): Promise<string> {
  if (!hasDatabase()) return fallback;
  if (reqCache.has(key)) return reqCache.get(key)!;
  await ensureContentSchema();
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
      `SELECT "value" FROM himothy_site_content WHERE "key" = $1 LIMIT 1`,
      key,
    );
    const value = rows[0]?.value ?? fallback;
    reqCache.set(key, value);
    return value;
  } catch {
    return fallback;
  }
}

export async function setContent(key: string, value: string): Promise<void> {
  if (!hasDatabase()) return;
  await ensureContentSchema();
  await prisma.$executeRawUnsafe(
    `INSERT INTO himothy_site_content ("key", "value", "updated_at") VALUES ($1, $2, NOW())
     ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updated_at" = NOW()`,
    key, value,
  );
  reqCache.delete(key);
}

export async function listContent(): Promise<Array<{ key: string; value: string; updatedAt: string }>> {
  if (!hasDatabase()) return [];
  await ensureContentSchema();
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "key", "value", "updated_at" FROM himothy_site_content ORDER BY "key" ASC`,
  );
  return rows.map((r) => ({ key: r.key, value: r.value, updatedAt: String(r.updated_at) }));
}

// The fields the admin page surfaces by default — owner can add more keys ad-hoc. Grouped for
// the UI. Defaults are what each page renders when the field hasn't been set yet.
export const CONTENT_FIELDS: Array<{ group: string; key: string; label: string; hint?: string; default: string; multiline?: boolean }> = [
  { group: 'Banner (top of every page)', key: 'site.banner.enabled', label: 'Show banner?', hint: 'Type "true" to show, anything else hides it.', default: 'false' },
  { group: 'Banner (top of every page)', key: 'site.banner.message', label: 'Banner message', hint: 'Customer-facing announcement. Plain text.', default: '', multiline: true },
  { group: 'Brand', key: 'site.name', label: 'Site name', default: 'HIMOTHY Plays & Parlays' },
  { group: 'Brand', key: 'site.tagline', label: 'Tagline', default: 'Daily sports picks, parlays, and edges', multiline: true },
  { group: 'Home', key: 'home.hero.title', label: 'Home hero title', default: 'Daily Picks. Real Record. No Bullshit.', multiline: true },
  { group: 'Home', key: 'home.hero.subhead', label: 'Home hero subheadline', default: 'Built on tendencies, not gut takes. Verified record since 2026-05-27.', multiline: true },
  { group: 'Pricing', key: 'pricing.headline', label: 'Pricing headline', default: '', multiline: true },
  { group: 'Pricing', key: 'pricing.bullets', label: 'Pricing value bullets (one per line)', default: '', multiline: true },
  { group: 'SEO defaults', key: 'seo.default.title', label: 'Default page title template', hint: 'e.g. "%s | HIMOTHY Plays & Parlays". Leave empty to keep code default.', default: '' },
  { group: 'SEO defaults', key: 'seo.default.description', label: 'Default meta description', default: '', multiline: true },
];
