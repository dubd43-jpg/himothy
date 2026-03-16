export interface Pick {
  id: string;
  gameId: string;
  marketType: string;
  selection: string;
  lineTaken: number;
  oddsTaken: number;
  sport: string;
}

export interface SportsbookLinkConfig {
  mode: 'GENERIC_LINK' | 'COPY_SLIP' | 'DEEP_LINK';
  sportsbookName: string;
  baseUrl: string;
}

export function generateSportsbookLink(pick: Pick, config: SportsbookLinkConfig) {
  if (config.mode === 'DEEP_LINK') {
    // E.g. Hard Rock Bet specific deep linking structure map
    // Would look up in sportsbook_links table
    return `${config.baseUrl}/deep-link?sport=${pick.sport}&market=${pick.marketType}&selection=${pick.selection}`;
  }
  
  if (config.mode === 'GENERIC_LINK') {
    // Broad routing
    return `${config.baseUrl}/${pick.sport.toLowerCase()}`;
  }
  
  return null;
}

export function generateCopySlipText(picks: Pick[]) {
  return picks.map(p => `[${p.sport}] ${p.selection} (${p.marketType}) @ ${p.lineTaken ?? p.oddsTaken}`).join('\n');
}
