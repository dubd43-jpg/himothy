import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __himoPrisma: PrismaClient | undefined;
}

export const prisma = global.__himoPrisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__himoPrisma = prisma;
}
