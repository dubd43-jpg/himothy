import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lightweight DB ping. Runs every 4 minutes so Neon never reaches its 5-minute
// idle-suspension threshold. The connect_timeout=30 in prisma.ts means this also
// acts as a cold-start waker — if Neon was suspended, this waits up to 30s for
// it to resume rather than immediately throwing PrismaClientInitializationError.
export async function GET() {
  if (!hasDatabase()) {
    return NextResponse.json({ ok: true, skipped: 'no-db' });
  }
  try {
    const result = await prisma.$queryRaw<[{ now: Date }]>`SELECT NOW() as now`;
    return NextResponse.json({ ok: true, ts: result[0]?.now });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
