import { NextResponse } from 'next/server';
import { LEAGUE_URLS } from '@/lib/validation';

/**
 * League Transaction Ingestion Engine
 * Monitors transactions: trades, signings, releases, G-League moves.
 * Ensures the system never suggests a pick for a player who was traded or released.
 */

interface Transaction {
  id: string;
  type: string;
  description: string;
  date: string;
  athletes: Array<{
    id: string;
    fullName: string;
    teamId?: string;
  }>;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport') || 'NBA';
  
  const leagueUrl = LEAGUE_URLS[sport];
  if (!leagueUrl) {
    return NextResponse.json({ success: false, error: 'Sport not supported' }, { status: 400 });
  }

  try {
    // ESPN Transactions Endpoint
    const res = await fetch(`${leagueUrl}/transactions`, { cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ success: false, transactions: [] });
    
    const data = await res.json();
    const rawTransactions = data.transactions || [];

    const mapped: Transaction[] = rawTransactions.map((t: any) => ({
      id: t.id || Math.random().toString(36).substr(2, 9),
      type: t.type?.description || 'Transaction',
      description: t.description,
      date: t.date,
      athletes: t.athletes?.map((a: any) => ({
        id: a.id,
        fullName: a.fullName,
        teamId: a.team?.id
      })) || []
    }));

    // Filter for TODAY'S critical moves (Trades, Free Agent signings, Releases)
    const criticalTypes = ['Trade', 'Signing', 'Release', 'Waiver', 'Promotion', 'Demotion'];
    const activeMoves = mapped.filter(t => criticalTypes.some(type => t.type.includes(type)));

    return NextResponse.json({
      success: true,
      sport,
      count: activeMoves.length,
      transactions: activeMoves,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Transaction sync failed' }, { status: 500 });
  }
}
