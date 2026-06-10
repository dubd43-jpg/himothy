// LATE SCRATCH / CONFIRMED LINEUP WATCHER
//
// Hits ESPN team roster + injury endpoints near tip-off to detect a STARTER who
// just went OUT after the slate was published. Engine wires this into scoring
// (auto-flag the pick) and the late-news cron uses it to push notifications.

import { LEAGUE_URLS } from '@/lib/validation';

export interface LateScratch {
  league: string;
  teamId: string;
  teamName: string;
  playerName: string;
  position?: string;
  status: 'OUT' | 'DOUBTFUL' | 'GAME-TIME DECISION';
  source: 'espn-injury' | 'espn-summary';
  detectedAt: string;
}

export interface LateScratchResult {
  scratches: LateScratch[];
  confirmedStartersAvailable: boolean;
  reason: string | null;
}

const OUT_STATES = new Set(['out', 'inactive', 'suspended']);
const DOUBTFUL_STATES = new Set(['doubtful', 'questionable']);

async function fetchInjuriesForTeam(league: string, teamId: string): Promise<any[]> {
  const baseUrl = LEAGUE_URLS[league];
  if (!baseUrl) return [];
  try {
    const res = await fetch(`${baseUrl}/teams/${teamId}/injuries`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return data?.items || data?.injuries || [];
  } catch { return []; }
}

async function fetchGameSummary(league: string, gameId: string) {
  const baseUrl = LEAGUE_URLS[league];
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/summary?event=${gameId}`, { cache: 'no-store' });
    return res.ok ? res.json() : null;
  } catch { return null; }
}

function classifyStatus(raw: any): 'OUT' | 'DOUBTFUL' | 'GAME-TIME DECISION' | null {
  const s = String(raw?.status?.name || raw?.status?.type || raw?.type?.description || raw?.status || '').toLowerCase();
  if (OUT_STATES.has(s) || s.includes('out')) return 'OUT';
  if (DOUBTFUL_STATES.has(s)) return 'DOUBTFUL';
  if (s.includes('game-time') || s.includes('game time') || s.includes('gtd')) return 'GAME-TIME DECISION';
  return null;
}

// Returns scratches affecting either side of the game. `keyPlayerNames` lets the
// engine pass in the picked side's star names so we can specifically flag if our
// guy is out (the most actionable signal).
export async function detectLateScratches(
  gameId: string,
  league: string,
  keyPlayerNames: string[] = [],
): Promise<LateScratchResult> {
  const summary = await fetchGameSummary(league, gameId);
  if (!summary) return { scratches: [], confirmedStartersAvailable: false, reason: null };

  const comp = summary?.header?.competitions?.[0] || summary?.competitions?.[0];
  const competitors = comp?.competitors || [];
  const teams = competitors.map((c: any) => ({
    id: String(c?.team?.id || c?.id || ''),
    name: c?.team?.displayName || c?.team?.name || 'Team',
  })).filter((t: any) => t.id);

  const scratches: LateScratch[] = [];
  for (const team of teams) {
    const injuries = await fetchInjuriesForTeam(league, team.id);
    for (const inj of injuries) {
      const status = classifyStatus(inj);
      if (!status) continue;
      const playerName = inj?.athlete?.displayName || inj?.athlete?.fullName || inj?.player?.displayName || '';
      if (!playerName) continue;
      scratches.push({
        league, teamId: team.id, teamName: team.name,
        playerName, position: inj?.athlete?.position?.abbreviation,
        status, source: 'espn-injury', detectedAt: new Date().toISOString(),
      });
    }
  }

  const confirmedStartersAvailable = (summary?.boxscore?.players?.length || 0) > 0
    || comp?.status?.type?.state === 'in';

  // Build the breakdown reason — highlight if a key player on the picked side is OUT.
  const normalizedKeys = new Set(keyPlayerNames.map((n) => n.toLowerCase()));
  const ourSideHits = scratches.filter((s) => s.status === 'OUT' && normalizedKeys.has(s.playerName.toLowerCase()));

  let reason: string | null = null;
  if (ourSideHits.length > 0) {
    reason = `Late scratch — ${ourSideHits.map((s) => s.playerName).join(', ')} OUT for ${ourSideHits[0].teamName}. Re-check this pick before betting.`;
  } else if (scratches.some((s) => s.status === 'OUT')) {
    const outs = scratches.filter((s) => s.status === 'OUT').slice(0, 3).map((s) => `${s.playerName} (${s.teamName})`);
    reason = `Confirmed out: ${outs.join(', ')}.`;
  }

  return { scratches, confirmedStartersAvailable, reason };
}
