import { NextResponse } from 'next/server';
import { LEAGUE_URLS } from '@/lib/validation';

export async function GET() {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  
  // Only check these major leagues for the live scoreboard to keep it fast
  const activeLeagues = ["NBA", "NFL", "MLB", "NHL", "Soccer - EPL", "Soccer - La Liga", "Soccer - Serie A", "Soccer - Bundesliga", "Soccer - Ligue 1"];

  try {
    const fetchLeagueGames = async (name: string, url: string) => {
      try {
        const res = await fetch(`${url}/scoreboard?dates=${dateStr}`, { cache: "no-store" });
        if (!res.ok) return [];
        const data = await res.json();
        
        return (data.events || []).map((event: any) => {
          const comp = event.competitions?.[0];
          const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
          const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
          
          return {
            id: event.id,
            league: name,
            homeTeam: home?.team?.displayName || 'Home',
            awayTeam: away?.team?.displayName || 'Away',
            homeScore: parseInt(home?.score || '0'),
            awayScore: parseInt(away?.score || '0'),
            status: event.status?.type?.detail || event.status?.type?.description || 'Scheduled',
            clock: event.status?.displayClock || '',
            isLive: event.status?.type?.state === 'in',
            isFinal: event.status?.type?.state === 'post' || event.status?.type?.completed
          };
        });
      } catch {
        return [];
      }
    };

    const allLeaguesResults = await Promise.all(
      activeLeagues.map(name => fetchLeagueGames(name, LEAGUE_URLS[name]))
    );

    const flatGames = allLeaguesResults.flat();
    
    // Sort: Live first, then Final, then Scheduled
    const sortedGames = flatGames.sort((a, b) => {
      if (a.isLive && !b.isLive) return -1;
      if (!a.isLive && b.isLive) return 1;
      if (a.isFinal && !b.isFinal) return 1;
      if (!a.isFinal && b.isFinal) return -1;
      return 0;
    });

    return NextResponse.json({
      success: true,
      games: sortedGames.slice(0, 12), // Don't overwhelm the UI
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ success: false, games: [] }, { status: 500 });
  }
}
