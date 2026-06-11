import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 35;

function maskUrl(url: string | undefined): string {
  if (!url) return '(not set)';
  // Show only the host part, mask credentials
  const m = url.match(/(@[^\/]+)/);
  if (m) return `...${m[1].substring(0, 60)}`;
  const m2 = url.match(/^(postgres(?:ql)?:\/\/[^@]{0,10})/i);
  if (m2) return `${m2[1]}... (${url.length} chars)`;
  return `(${url.length} chars, no @ found)`;
}

export async function GET(req: Request) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const urls = {
    DATABASE_URL_UNPOOLED: maskUrl(process.env.DATABASE_URL_UNPOOLED),
    POSTGRES_PRISMA_URL: maskUrl(process.env.POSTGRES_PRISMA_URL),
    DATABASE_URL: maskUrl(process.env.DATABASE_URL),
  };
  try {
    const result = await prisma.$queryRaw<[{ now: Date }]>`SELECT NOW() as now`;
    return NextResponse.json({ ok: true, ts: result[0]?.now, urls });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).substring(0, 300), urls }, { status: 500 });
  }
}
