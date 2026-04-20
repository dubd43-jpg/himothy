import { NextResponse } from 'next/server';
import { reviewAndAdaptPolicy } from '@/services/adaptiveIntelligenceService';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const windowDays = Number.isFinite(Number(body.windowDays)) ? Number(body.windowDays) : 7;

    const result = await reviewAndAdaptPolicy(windowDays);

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Adaptive policy review failed:', error);
    return NextResponse.json({ success: false, error: 'Adaptive policy review failed' }, { status: 500 });
  }
}
