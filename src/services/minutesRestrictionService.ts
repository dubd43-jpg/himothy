// NBA / WNBA MINUTES RESTRICTION DETECTION
//
// A star labeled "Q" doesn't tell you much anymore. The real question is:
// will they play 18 min on a soft cap (effectively useless for totals) or
// their normal 34 min? ESPN player news exposes the language ("expected to
// play 20-25 min", "minutes restriction", "on a soft cap").
//
// We parse the most recent news items for the team's flagged stars and surface
// any minutes restriction we detect. Returned values feed extraSignalsService
// — caps confidence and adjusts the totals nudge.

const NEWS_TTL_MS = 30 * 60 * 1000;
const newsCache = new Map<string, { data: PlayerNewsInsight[]; at: number }>();

export interface MinutesRestriction {
  playerName: string;
  estimatedMinutesMax: number;    // upper cap from the news language
  source: 'news-headline' | 'news-body';
  rawText: string;
}

export interface PlayerNewsInsight {
  playerName: string;
  posted: string;                 // ISO
  hasMinutesRestriction: boolean;
  restriction: MinutesRestriction | null;
  rulingOut: boolean;             // "won't play" / "ruled out"
}

// Look for minutes patterns in news text. Returns a max-minutes estimate.
const MIN_PATTERNS: Array<{ re: RegExp; estimator: (m: RegExpMatchArray) => number }> = [
  // "20-25 minutes", "20 to 25 minutes"
  { re: /(\d{1,2})\s*(?:-|to)\s*(\d{1,2})\s*minutes/i, estimator: (m) => Number(m[2]) },
  // "minutes restriction" / "soft cap" without specific number → assume 20-min cap
  { re: /(?:minutes? restriction|soft cap|minute(?:s)? cap|restricted minutes)/i, estimator: () => 22 },
  // "limited to X minutes"
  { re: /limited to (\d{1,2})\s*minutes/i, estimator: (m) => Number(m[1]) },
  // "play under X minutes"
  { re: /under (\d{1,2}) minutes/i, estimator: (m) => Number(m[1]) },
  // "expected to play 25 minutes" (cap = 25)
  { re: /(?:expected to play|capped at|wil play around) (\d{1,2}) minutes/i, estimator: (m) => Number(m[1]) },
];

function detectRestriction(text: string): MinutesRestriction | null {
  if (!text) return null;
  for (const p of MIN_PATTERNS) {
    const m = text.match(p.re);
    if (m) {
      return {
        playerName: '', // caller fills in
        estimatedMinutesMax: p.estimator(m),
        source: 'news-body',
        rawText: m[0],
      };
    }
  }
  return null;
}

const RULE_OUT_RE = /\b(ruled out|won't play|will not play|out for|inactive)\b/i;

// Pull ESPN player news for one team's roster. Returns insights for any
// player whose recent news has a minutes-restriction clue.
//
// ESPN endpoint: site.api.espn.com/apis/site/v2/sports/basketball/nba/news?team=X
// — returns a flat news feed for the league filtered by team.
export async function getMinutesRestrictionsForTeam(league: 'NBA' | 'WNBA', teamAbbrOrId: string): Promise<PlayerNewsInsight[]> {
  if (!teamAbbrOrId) return [];
  const key = `${league}|${teamAbbrOrId}`;
  const cached = newsCache.get(key);
  if (cached && Date.now() - cached.at < NEWS_TTL_MS) return cached.data;

  const sport = league === 'NBA' ? 'basketball/nba' : 'basketball/wnba';
  let url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/news?limit=50`;
  // ESPN accepts team ID; if the caller passed an abbr, the team filter won't
  // work and we'll still get back league-wide news (we'll match by team in
  // the headline). Either way it's the best free signal.
  if (/^\d+$/.test(teamAbbrOrId)) url += `&team=${teamAbbrOrId}`;

  let articles: any[] = [];
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    articles = data?.articles || [];
  } catch { return []; }

  const insights: PlayerNewsInsight[] = [];
  for (const a of articles.slice(0, 30)) {
    const headline = a.headline || a.title || '';
    const body = (a.description || '') + ' ' + (a.story || '');
    const text = `${headline}. ${body}`;
    // Pull player names from `categories` (ESPN tags athletes per article).
    const cats: any[] = a.categories || [];
    const athletes = cats.filter((c: any) => c.type === 'athlete').map((c: any) => c.athlete?.displayName).filter(Boolean);
    if (athletes.length === 0) {
      // Fall back: pull a Capitalized-First-Last name from the headline.
      const nameMatch = headline.match(/\b([A-Z][a-z]+(?:[\s'-][A-Z][a-z]+){1,2})\b/);
      if (nameMatch) athletes.push(nameMatch[1]);
    }
    for (const name of athletes) {
      const rest = detectRestriction(text);
      if (rest) {
        rest.playerName = name;
        insights.push({
          playerName: name,
          posted: a.published || a.lastModified || '',
          hasMinutesRestriction: true,
          restriction: rest,
          rulingOut: RULE_OUT_RE.test(text),
        });
      } else if (RULE_OUT_RE.test(text)) {
        insights.push({
          playerName: name,
          posted: a.published || a.lastModified || '',
          hasMinutesRestriction: false,
          restriction: null,
          rulingOut: true,
        });
      }
    }
  }

  // Dedupe by player + keep the most recent insight per player.
  const byPlayer = new Map<string, PlayerNewsInsight>();
  for (const i of insights) {
    const existing = byPlayer.get(i.playerName);
    if (!existing || new Date(i.posted).getTime() > new Date(existing.posted).getTime()) {
      byPlayer.set(i.playerName, i);
    }
  }
  const result = Array.from(byPlayer.values());
  newsCache.set(key, { data: result, at: Date.now() });
  return result;
}

// Caller helper: given a roster's key player names + the team news insights,
// return any insights whose player matches our flagged stars.
export function flaggedStarsWithRestrictions(keyPlayers: string[], insights: PlayerNewsInsight[]): PlayerNewsInsight[] {
  if (!Array.isArray(keyPlayers) || keyPlayers.length === 0) return [];
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  const keyNames = keyPlayers.map(normalize);
  return insights.filter((i) => {
    const norm = normalize(i.playerName);
    return keyNames.some((k) => norm.includes(k) || k.includes(norm));
  });
}
