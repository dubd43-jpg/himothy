/**
 * Returns true only when a REAL Postgres connection string is configured.
 *
 * Checks DATABASE_URL_UNPOOLED first (direct Neon connection, bypasses PgBouncer)
 * then falls back to DATABASE_URL.
 */
export function hasDatabase(): boolean {
  const url = (
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_URL
  )?.trim();
  if (!url) return false;
  return /^postgres(ql)?:\/\/.+/i.test(url);
}
