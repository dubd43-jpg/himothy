export type BoardType =
  | 'north-american'
  | 'soccer'
  | 'tennis'
  | 'combat'
  | 'individual'
  | 'racing'
  | 'global'
  | 'overseas';

// Customer-facing labels. Expanded to cover every Hard Rock-style market category.
export const BOARD_OPTIONS: Array<{ key: BoardType; label: string }> = [
  { key: 'north-american', label: 'HIMOTHY Board' },
  { key: 'soccer', label: 'Soccer' },
  { key: 'tennis', label: 'Tennis' },
  { key: 'combat', label: 'UFC / Boxing' },
  { key: 'individual', label: 'Golf' },
  { key: 'racing', label: 'Racing' },
  { key: 'global', label: 'Global' },
];

const SOCCER_KEYWORDS = ['soccer', 'epl', 'mls', 'la liga', 'serie a', 'bundesliga', 'ligue 1', 'champions league'];
const TENNIS_KEYWORDS = ['tennis', 'atp', 'wta', 'grand slam'];
const NORTH_AMERICA_KEYWORDS = ['nba', 'nfl', 'nhl', 'mlb', 'wnba', 'ncaa', 'college basketball', 'college football'];

const CATEGORY_BOARD_MAP: Record<string, BoardType> = {
  GRAND_SLAM: 'north-american',
  PRESSURE_PACK: 'north-american',
  VIP_4_PACK: 'north-american',
  PARLAY_PLAN: 'north-american',
  PERSONAL_PLAY: 'north-american',
  HAILMARY: 'north-american',
  OVERSEAS: 'overseas',
  OVERNIGHT: 'tennis',
};

function normalize(input?: string | null) {
  return String(input || '').toLowerCase();
}

function hasAnyKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function inferBoardTypeFromContext(args: {
  sport?: string | null;
  league?: string | null;
  category?: string | null;
  productLine?: string | null;
}) {
  const categoryKey = String(args.category || '').trim();
  if (categoryKey && CATEGORY_BOARD_MAP[categoryKey]) {
    return CATEGORY_BOARD_MAP[categoryKey];
  }

  const text = [args.sport, args.league, args.category, args.productLine].map(normalize).join(' | ');

  if (hasAnyKeyword(text, SOCCER_KEYWORDS)) return 'soccer' as BoardType;
  if (hasAnyKeyword(text, TENNIS_KEYWORDS)) return 'tennis' as BoardType;
  if (hasAnyKeyword(text, NORTH_AMERICA_KEYWORDS)) return 'north-american' as BoardType;
  return 'overseas' as BoardType;
}

export function parseBoardType(raw: string | null | undefined): BoardType {
  const value = normalize(raw);
  if (value === 'north-america' || value === 'north_american' || value === 'northamerican') return 'north-american';
  if (value === 'soccer') return 'soccer';
  if (value === 'tennis') return 'tennis';
  if (value === 'combat') return 'combat';
  if (value === 'individual') return 'individual';
  if (value === 'racing') return 'racing';
  if (value === 'global') return 'global';
  if (value === 'overseas') return 'overseas';
  return 'north-american';
}

export function boardDisplayName(board: BoardType) {
  if (board === 'north-american') return 'HIMOTHY Board';
  if (board === 'soccer') return 'Soccer';
  if (board === 'tennis') return 'Tennis';
  if (board === 'combat') return 'UFC / Boxing';
  if (board === 'individual') return 'Golf';
  if (board === 'racing') return 'Racing';
  if (board === 'global') return 'Global';
  return 'Overseas';
}
