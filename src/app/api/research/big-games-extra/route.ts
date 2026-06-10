import { NextResponse } from 'next/server';
import { LEAGUE_URLS } from '@/lib/validation';
import { buildPreGameProps } from '@/services/preGamePropsService';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Big Games multi-angle enrichment. Given a list of `gameId|league` pairs (the marquee
// games from today's slate), fetch each game's competition data and surface every prop
// edge the engine finds — over/under player props with edge >= 35. Returned as
// minimal DeepPick-shaped objects so the existing /big-games card renders them.
//
// Owner directive 2026-06-03: "if you find ten things out of the big game, put them
// on there." No artificial cap per game.

interface ExtraPick {
  gameId: string;
  eventName: string;
  league: string;
  sport: string;
  startTime: string;
  homeTeam: { name: string; abbreviation: string };
  awayTeam: { name: string; abbreviation: string };
  selection: string;
  selectionSide: 'home' | 'away';
  marketType: string;
  odds: string | null;
  line: string | null;
  confidenceScore: number;
  tier: string;
  reasonsFor: string[];
  reasonsAgainst: string[];
  bigGameLabel?: string | null;
  // Minimal-but-required signals shape for the existing renderer.
  signals: { winProbabilityGap: number; atsCoverPct: number | null; dataQuality: number };
  aiExplanation: null;
}

function etDateStr(offset = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const d = Number(parts.find((p) => p.type === 'day')?.value);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + offset);
  return `${base.getUTCFullYear()}${String(base.getUTCMonth() + 1).padStart(2, '0')}${String(base.getUTCDate()).padStart(2, '0')}`;
}

async function findEvent(gameId: string, league: string) {
  const baseUrl = LEAGUE_URLS[league];
  if (!baseUrl) return null;
  // Probe today + yesterday + tomorrow ET — handles late games and timezone edges.
  for (const offset of [0, -1, 1]) {
    try {
      const res = await fetch(`${baseUrl}/scoreboard?dates=${etDateStr(offset)}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      const event = (data.events || []).find((e: any) => String(e.id) === String(gameId));
      if (event) return event;
    } catch { /* keep trying */ }
  }
  return null;
}

function marketLabel(market: string): string {
  // Map internal market keys to clean customer-facing strings.
  const m: Record<string, string> = {
    points: 'Points', rebounds: 'Rebounds', assists: 'Assists', threes: '3-PT Made',
    pra: 'Pts+Reb+Ast', pr: 'Pts+Reb', pa: 'Pts+Ast', ra: 'Reb+Ast',
    hits: 'Hits', total_bases: 'Total Bases', rbis: 'RBIs', runs: 'Runs',
    strikeouts: 'Strikeouts', home_runs: 'Home Runs',
    shots_on_goal: 'Shots on Goal', goals: 'Goals', saves: 'Saves',
  };
  return m[market] || market.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const pairs = (url.searchParams.get('games') || '').split(',').filter(Boolean);
    if (pairs.length === 0) {
      return NextResponse.json({ success: true, picks: [] });
    }

    const allExtras: ExtraPick[] = [];

    // Each input is `${gameId}|${league}` — limit to 6 games defensively to keep this
    // endpoint under the function timeout.
    for (const pair of pairs.slice(0, 6)) {
      const [gameId, league] = pair.split('|');
      if (!gameId || !league) continue;
      const event = await findEvent(gameId, league);
      if (!event) continue;

      const comp = event.competitions?.[0];
      if (!comp) continue;
      const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
      const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
      const homeName = home?.team?.displayName || 'Home';
      const awayName = away?.team?.displayName || 'Away';
      const homeAbbr = home?.team?.abbreviation || 'HOME';
      const awayAbbr = away?.team?.abbreviation || 'AWAY';
      const startTime = event.date || comp.date || '';
      const eventName = `${awayName} @ ${homeName}`;

      // bigGameLabel comes back as a string when ESPN flags it (Finals / Champ / Playoffs).
      // We re-derive it cheaply here so the badge renders even if the primary pick already
      // has it set elsewhere.
      const notes: string[] = [
        ...((Array.isArray(comp?.notes) ? comp.notes : []) as any[]),
      ].map((n) => String(n?.headline || '')).filter(Boolean);
      const bigGameLabel = notes[0] || null;

      let propRes;
      try {
        propRes = await buildPreGameProps(gameId, eventName, league, comp);
      } catch {
        continue;
      }
      if (!propRes?.propEdges?.length) continue;

      // Convert every prop edge >= 35 score (already filtered by buildPreGameProps) to a
      // DeepPick-shaped row. The /big-games page renders these alongside the primary
      // marquee picks — same component, different shape.
      for (const edge of propRes.propEdges) {
        const isHomePlayer = edge.side === 'home';
        const teamAbbr = isHomePlayer ? homeAbbr : awayAbbr;
        const overUnder = edge.recommended === 'over' ? 'OVER' : 'UNDER';
        const lineStr = edge.marketLine != null ? String(edge.marketLine) : 'TBD';
        const odds = edge.recommended === 'over'
          ? (edge.marketOverPrice != null ? String(edge.marketOverPrice) : null)
          : (edge.marketUnderPrice != null ? String(edge.marketUnderPrice) : null);

        allExtras.push({
          gameId,
          eventName,
          league,
          sport: league,
          startTime,
          homeTeam: { name: homeName, abbreviation: homeAbbr },
          awayTeam: { name: awayName, abbreviation: awayAbbr },
          selection: `${edge.playerName} ${overUnder} ${lineStr} ${marketLabel(edge.market)}`,
          selectionSide: isHomePlayer ? 'home' : 'away',
          marketType: 'Player Prop',
          odds,
          line: lineStr,
          confidenceScore: edge.edgeScore,
          tier: edge.edgeScore >= 80 ? 'PRIMARY' : 'EDGE',
          reasonsFor: [
            `${edge.playerName} (${teamAbbr}) projects ${edge.projection} on a ${lineStr} line — that's the gap we want.`,
            edge.l5Avg != null && edge.l10Avg != null
              ? `Last 5: ${edge.l5Avg} · Last 10: ${edge.l10Avg}${edge.seasonAvg != null ? ` · Season: ${edge.seasonAvg}` : ''}.`
              : null,
            edge.hitRateL10 != null
              ? `Hit rate over the line in his last 10: ${edge.hitRateL10}%.`
              : null,
          ].filter(Boolean) as string[],
          reasonsAgainst: [],
          bigGameLabel,
          signals: { winProbabilityGap: 0, atsCoverPct: null, dataQuality: edge.edgeScore },
          aiExplanation: null,
        });
      }
    }

    // Sort by edge score so the strongest angles surface first.
    allExtras.sort((a, b) => b.confidenceScore - a.confidenceScore);

    return NextResponse.json({ success: true, picks: allExtras });
  } catch (error) {
    console.error('big-games-extra failed', error);
    return NextResponse.json({ success: false, error: 'Failed to enrich Big Games.' }, { status: 500 });
  }
}
