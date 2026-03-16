import { NextResponse } from 'next/server';
import { getLiveGradedStats } from '@/services/gradingEngine';

/**
 * Persistent Running Record Engine - AUTOMATION MODE
 * Automatically grades picks against live ESPN API results.
 */

export async function GET() {
  try {
    const liveStats = await getLiveGradedStats();
    
    // We can also overlay some "Seed" data if we ever need to establish 
    // a pre-launch history, but for true automation we trust the engine.
    
    return NextResponse.json(liveStats);
  } catch (error) {
    console.error("Grading Engine Error:", error);
    return NextResponse.json({ 
      success: false, 
      stats: null,
      error: "Engine synchronization failed" 
    }, { status: 500 });
  }
}
