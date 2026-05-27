// Hard Rock Bet quick-link helpers.
//
// We don't have Hard Rock's official affiliate URL pattern yet (user is going to sign up
// for that later). Until then, every "Open in Hard Rock" button just deep-links into the
// app/site with the team name in the URL query — Hard Rock's web app will land on its
// homepage at minimum, and if their app accepts a `search=` param it'll pre-fill the
// search box. Better than nothing, and the user said explicitly: ship the search version
// now, swap to affiliate URLs later when they have credentials.
//
// When swapping to affiliate: change `HARD_ROCK_BASE` to the affiliate-stamped URL and
// add the affiliate-ID query parameter. All consumers go through `buildHardRockUrl()`
// so a single edit here updates every pick card on the site.

const HARD_ROCK_BASE = 'https://app.hardrock.bet/';

// Sport hint maps our internal league names to Hard Rock's typical category slugs. If
// the URL lands and Hard Rock supports a `sport=` param it'll filter accordingly; if not,
// it's a benign no-op.
const SPORT_HINT: Record<string, string> = {
  'MLB': 'baseball',
  'NBA': 'basketball',
  'WNBA': 'basketball',
  'NCAA Basketball': 'basketball',
  'NFL': 'football',
  'College Football': 'football',
  'NHL': 'hockey',
  'Tennis - ATP': 'tennis',
  'Tennis - WTA': 'tennis',
  'MMA - UFC': 'mma',
  'MMA - PFL': 'mma',
  'Boxing': 'boxing',
  'Golf - PGA': 'golf',
  'Golf - LIV': 'golf',
  'F1': 'motorsports',
  'NASCAR': 'motorsports',
};

export interface HardRockLinkInput {
  homeTeam?: string | null;
  awayTeam?: string | null;
  league?: string | null;
  selection?: string | null;
}

export function buildHardRockUrl({ homeTeam, awayTeam, league, selection }: HardRockLinkInput): string {
  const params = new URLSearchParams();
  // Prefer matchup form ("Yankees Red Sox") since Hard Rock's search picks up both
  // teams' names and ranks the matching event near the top.
  const teams = [awayTeam, homeTeam].filter(Boolean).join(' ').trim();
  const q = teams || (selection || '').replace(/\s*(ML|over|under|\+\d+(\.\d+)?|-\d+(\.\d+)?)\s*/gi, '').trim();
  if (q) params.set('search', q);
  if (league && SPORT_HINT[league]) params.set('sport', SPORT_HINT[league]);
  const qs = params.toString();
  return qs ? `${HARD_ROCK_BASE}?${qs}` : HARD_ROCK_BASE;
}
