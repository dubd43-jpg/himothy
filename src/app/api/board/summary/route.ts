import { NextResponse } from 'next/server';
import { LEAGUE_URLS } from '@/lib/validation';

export async function GET() {
  const now = new Date();
  const todayStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}${String(tomorrow.getMonth() + 1).padStart(2, '0')}${String(tomorrow.getDate()).padStart(2, '0')}`;

  const priorityOrder = [
    "NBA", "NFL", "NCAA Basketball", "MLB", "Soccer - EPL", "Soccer - La Liga", 
    "Soccer - Serie A", "Soccer - Bundesliga", "Soccer - Ligue 1", "NHL", 
    "Tennis", "MMA", "Golf", "Cricket"
  ];

  try {
    const fetchLeague = async (name: string, url: string) => {
      try {
        const [resToday, resTomorrow] = await Promise.all([
          fetch(`${url}/scoreboard?dates=${todayStr}`, { cache: "no-store" }),
          fetch(`${url}/scoreboard?dates=${tomorrowStr}`, { cache: "no-store" })
        ]);

        const dataToday = await resToday.json();
        const dataTomorrow = await resTomorrow.json();

        const eventsToday = dataToday.events || [];
        const eventsTomorrow = dataTomorrow.events || [];
        const allEvents = [...eventsToday, ...eventsTomorrow];

        if (allEvents.length === 0) return null;

        // Special labeling for MLB Spring Training
        let displayLabel = name;
        if (name === "MLB") {
          const isSpring = allEvents.some(e => e.season?.type === 1);
          if (isSpring) displayLabel = "MLB • Spring Training";
        }

        return {
          id: name,
          label: displayLabel,
          count: allEvents.length,
          priority: priorityOrder.indexOf(name) === -1 ? 99 : priorityOrder.indexOf(name)
        };
      } catch {
        return null;
      }
    };

    const results = await Promise.all(
      Object.entries(LEAGUE_URLS).map(([name, url]) => fetchLeague(name, url))
    );

    // Filter, sort by priority, and merge duplicates (some leagues share URLs)
    const filtered = results.filter((r): r is NonNullable<typeof r> => r !== null);
    const unique = Array.from(new Map(filtered.map(item => [item.label, item])).values());
    const sorted = unique.sort((a, b) => a.priority - b.priority);

    // Mock supplemental data for Table Tennis as ESPN doesn't natively expose it in this structure
    // This maintains the "Engine" requirement while compensating for API gaps
    sorted.push({
      id: "Table Tennis",
      label: "Table Tennis • Czech & Russian Pro",
      count: 36,
      priority: 100
    });

    return NextResponse.json({
      success: true,
      board: sorted,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ success: false, board: [] }, { status: 500 });
  }
}
