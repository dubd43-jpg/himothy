import { NextRequest, NextResponse } from 'next/server';
import { getLiveGradedStats } from '@/services/gradingEngine';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateQuery = searchParams.get('date');
    
    let targetDate = new Date();
    if (dateQuery) {
      targetDate = new Date(dateQuery);
    }

    const stats = await getLiveGradedStats(targetDate);
    
    return NextResponse.json(stats);
  } catch (error) {
    console.error("History API Error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch history" }, { status: 500 });
  }
}
