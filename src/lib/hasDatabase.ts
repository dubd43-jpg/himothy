/**
 * Returns true only when a REAL Postgres connection string is configured.
 *
 * The .env.local file ships with a placeholder ("your_postgres_connection_string_here").
 * A non-empty placeholder used to make every DB-backed route try to connect, throw a
 * PrismaClientInitializationError, and return HTTP 500 — which is why the picks board
 * and the record dashboard were blank. We now treat anything that is not a valid
 * postgres URL as "no database", so the app cleanly falls back to live research picks.
 */
export function hasDatabase(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return false;
  return /^postgres(ql)?:\/\/.+/i.test(url);
}
