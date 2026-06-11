import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __himoPrisma: PrismaClient | undefined;
}

// Priority order for connection URLs:
// 1. DATABASE_URL_UNPOOLED — direct Neon connection (bypasses PgBouncer pooler that
//    has been failing from Vercel's function IPs). Slower for high concurrency but
//    works when the pooler is unreachable.
// 2. DATABASE_URL — the standard pooler URL.
// connect_timeout=30 gives Neon's cold start (3-7s) enough time to respond instead
// of immediately throwing PrismaClientInitializationError.
function buildUrl(): string {
  const url =
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    '';
  if (!url || url.includes('connect_timeout')) return url;
  return url + (url.includes('?') ? '&' : '?') + 'connect_timeout=30';
}

export const prisma =
  global.__himoPrisma ??
  new PrismaClient({ datasources: { db: { url: buildUrl() } } });

if (process.env.NODE_ENV !== 'production') {
  global.__himoPrisma = prisma;
}

// withRetry — wraps any Prisma call with 3 attempts + 3s backoff.
// Neon cold-starts cause PrismaClientInitializationError on the first TCP
// attempt while compute is resuming. Retrying after 3s almost always succeeds.
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const isInit = err?.constructor?.name === 'PrismaClientInitializationError' ||
        String(err?.message ?? '').includes("Can't reach database");
      if (isInit && i < attempts - 1) {
        await new Promise((res) => setTimeout(res, 3000));
        continue;
      }
      throw err;
    }
  }
  throw new Error('withRetry: exhausted retries');
}
