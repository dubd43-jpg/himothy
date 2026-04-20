import { LEAGUE_URLS } from '@/lib/validation';

export interface MarketQuote {
  sportsbook: string;
  odds: string;
  line: string | null;
  lineTimestampUtc: string;
  freshnessMinutes: number;
  source: 'espn' | 'the-odds-api';
}

export interface MultiBookMarketSnapshot {
  quotes: MarketQuote[];
  bestQuote: MarketQuote | null;
}

interface OddsEventContext {
  sport: string;
  eventId?: string | null;
  game?: string;
  marketType?: string;
}

const PREFERRED_SPORTSBOOKS = ['DraftKings', 'FanDuel', 'BetMGM', 'Caesars Sportsbook', 'Hard Rock Bet'];

function toDateKey(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeSportsbookName(name: string) {
  const raw = name.trim();
  if (!raw) return 'Unknown';

  const table: Array<[RegExp, string]> = [
    [/draft\s*kings?/i, 'DraftKings'],
    [/fanduel/i, 'FanDuel'],
    [/bet\s*mgm/i, 'BetMGM'],
    [/caesars?/i, 'Caesars Sportsbook'],
    [/hard\s*rock/i, 'Hard Rock Bet'],
    [/espn\s*bet/i, 'ESPN BET'],
    [/points?bet/i, 'PointsBet'],
  ];

  for (const [pattern, normalized] of table) {
    if (pattern.test(raw)) return normalized;
  }
  return raw;
}

function parseLine(details: string | null, overUnder: unknown) {
  if (typeof overUnder === 'number') return `${overUnder}`;
  if (!details) return null;
  const spread = details.match(/[+-]\d+(\.\d+)?/);
  return spread ? spread[0] : null;
}

function freshnessMinutes(ts: Date) {
  return Math.max(0, Math.floor((Date.now() - ts.getTime()) / 60000));
}

function dedupeQuotes(quotes: MarketQuote[]) {
  const map = new Map<string, MarketQuote>();
  for (const quote of quotes) {
    const key = `${quote.sportsbook}|${quote.odds}|${quote.line || 'NA'}`;
    const current = map.get(key);
    if (!current || current.freshnessMinutes > quote.freshnessMinutes) {
      map.set(key, quote);
    }
  }
  return Array.from(map.values());
}

function chooseBestQuote(quotes: MarketQuote[]) {
  if (quotes.length === 0) return null;

  const ranked = [...quotes].sort((a, b) => {
    const aRank = PREFERRED_SPORTSBOOKS.indexOf(a.sportsbook);
    const bRank = PREFERRED_SPORTSBOOKS.indexOf(b.sportsbook);
    const aScore = aRank === -1 ? 999 : aRank;
    const bScore = bRank === -1 ? 999 : bRank;
    if (aScore !== bScore) return aScore - bScore;
    return a.freshnessMinutes - b.freshnessMinutes;
  });

  return ranked[0] || null;
}

async function fetchEspnQuotes(context: OddsEventContext): Promise<MarketQuote[]> {
  const now = new Date();
  const windows = [-1, 0, 1].map((offset) => {
    const d = new Date(now);
    d.setDate(now.getDate() + offset);
    return toDateKey(d);
  });

  const pickTeams = (context.game || '').split(/\s+vs\.?\s+/i).map((x) => x.trim().toLowerCase()).filter(Boolean);

  for (const date of windows) {
    const base = LEAGUE_URLS[context.sport] || LEAGUE_URLS['NBA'];
    try {
      const res = await fetch(`${base}/scoreboard?dates=${date}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      const events = data.events || [];

      let event = null;
      if (context.eventId) {
        event = events.find((e: any) => String(e.id) === String(context.eventId));
      }

      if (!event && pickTeams.length > 0) {
        event = events.find((e: any) => {
          const home = e.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.displayName?.toLowerCase() || '';
          const away = e.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'away')?.team?.displayName?.toLowerCase() || '';
          return pickTeams.some((team) => home.includes(team) || away.includes(team));
        });
      }

      if (!event) continue;

      const comp = event.competitions?.[0];
      const oddsNode = comp?.odds?.[0];
      const details = typeof oddsNode?.details === 'string' ? oddsNode.details : null;
      const sportsbook = normalizeSportsbookName(oddsNode?.provider?.name || oddsNode?.provider?.displayName || oddsNode?.source || 'ESPN Feed');
      const ts = oddsNode?.timestamp ? new Date(oddsNode.timestamp) : now;

      if (!details) return [];

      return [
        {
          sportsbook,
          odds: details,
          line: parseLine(details, oddsNode?.overUnder),
          lineTimestampUtc: ts.toISOString(),
          freshnessMinutes: freshnessMinutes(ts),
          source: 'espn',
        },
      ];
    } catch {
      continue;
    }
  }

  return [];
}

function toOddsApiSportKey(sport: string) {
  const map: Record<string, string> = {
    NBA: 'basketball_nba',
    NFL: 'americanfootball_nfl',
    MLB: 'baseball_mlb',
    NHL: 'icehockey_nhl',
  };
  return map[sport] || null;
}

async function fetchTheOddsApiQuotes(context: OddsEventContext): Promise<MarketQuote[]> {
  const apiKey = process.env.THE_ODDS_API_KEY;
  const sportKey = toOddsApiSportKey(context.sport);
  if (!apiKey || !sportKey) return [];

  try {
    const markets = ['h2h', 'spreads', 'totals'];
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${encodeURIComponent(apiKey)}&regions=us&markets=${markets.join(',')}&oddsFormat=american&dateFormat=iso`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const pickTeams = (context.game || '').split(/\s+vs\.?\s+/i).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const event = data.find((item: any) => {
      const home = String(item?.home_team || '').toLowerCase();
      const away = String(item?.away_team || '').toLowerCase();
      return pickTeams.length === 0 || pickTeams.some((team) => home.includes(team) || away.includes(team));
    });

    if (!event) return [];

    const quotes: MarketQuote[] = [];
    const books = Array.isArray(event.bookmakers) ? event.bookmakers : [];

    for (const book of books) {
      const bookName = normalizeSportsbookName(String(book?.title || 'Unknown'));
      const updated = book?.last_update ? new Date(book.last_update) : new Date();
      const marketsList = Array.isArray(book?.markets) ? book.markets : [];

      for (const market of marketsList) {
        const outcomes = Array.isArray(market?.outcomes) ? market.outcomes : [];
        for (const outcome of outcomes) {
          const price = outcome?.price;
          if (!Number.isFinite(price)) continue;
          const odds = `${price > 0 ? '+' : ''}${price}`;
          quotes.push({
            sportsbook: bookName,
            odds,
            line: typeof outcome?.point === 'number' ? `${outcome.point}` : null,
            lineTimestampUtc: updated.toISOString(),
            freshnessMinutes: freshnessMinutes(updated),
            source: 'the-odds-api',
          });
        }
      }
    }

    return dedupeQuotes(quotes);
  } catch {
    return [];
  }
}

export async function getMultiBookMarketSnapshot(context: OddsEventContext): Promise<MultiBookMarketSnapshot> {
  const [espnQuotes, oddsApiQuotes] = await Promise.all([
    fetchEspnQuotes(context),
    fetchTheOddsApiQuotes(context),
  ]);

  const quotes = dedupeQuotes([...oddsApiQuotes, ...espnQuotes]);
  const bestQuote = chooseBestQuote(quotes);

  return { quotes, bestQuote };
}
