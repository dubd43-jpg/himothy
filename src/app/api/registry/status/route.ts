import { NextResponse } from 'next/server';
import { PICK_REGISTRY } from '@/lib/picksData';
import { validateAndTrackGame } from '@/lib/validation';

export async function GET() {
  try {
    // Audit the entire registry for publication safety
    const auditResults = await Promise.all(PICK_REGISTRY.map(async (p) => {
      try {
        const validation = await validateAndTrackGame(p);
        return { 
          id: p.id, 
          category: p.category, 
          safe: validation.preValidation.safe_to_publish,
          audit: validation.preValidation.sanity_audit,
          staleness: validation.preValidation.freshness_audit.data_status
        };
      } catch (err) {
        return { id: p.id, category: p.category, safe: false, audit: null, staleness: "unknown" };
      }
    }));

    const stats = {
      total_checked: auditResults.length,
      passed: auditResults.filter(r => r.safe).length,
      suppressed: auditResults.filter(r => !r.safe).length,
      roster_failures: auditResults.filter(r => r.audit && !r.audit.player_availability).length,
      time_mismatches: auditResults.filter(r => r.audit && !r.audit.time_sanity).length,
      stale_items: auditResults.filter(r => r.staleness === "stale").length,
      last_audit: new Date().toISOString()
    };

    // Group by category
    const categories: Record<string, number> = {
      GRAND_SLAM: 0,
      PRESSURE_PACK: 0,
      VIP_4_PACK: 0,
      PARLAY_PLAN: 0,
      OVERNIGHT: 0,
      PERSONAL_PLAY: 0,
      HAILMARY: 0,
      OVERSEAS: 0
    };

    auditResults.forEach(r => {
      if (r.safe) {
        categories[r.category]++;
      }
    });

    return NextResponse.json({ 
      success: true, 
      counts: categories,
      audit_stats: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
