import { NextResponse } from 'next/server';
import { getActiveAdaptivePolicy } from '@/services/adaptiveIntelligenceService';

export async function GET() {
  try {
    const policy = await getActiveAdaptivePolicy();
    return NextResponse.json({
      success: true,
      policy,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Adaptive policy status failed:', error);
    return NextResponse.json({ success: false, error: 'Adaptive policy status failed' }, { status: 500 });
  }
}
