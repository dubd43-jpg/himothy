export interface IngestionDailyResult {
  gamesAdded: number;
  gamesUpdated: number;
  oddsUpdated: number;
  injuriesUpdated: number;
}

export async function runSchedulesIngestion(sport: string, date: Date): Promise<IngestionDailyResult> {
  // Stub for calling an external sports data provider (e.g. Sportradar, The-Odds-API)
  console.log(`[Ingestion] Pulling schedules for ${sport} on ${date.toISOString()}`);
  
  return {
    gamesAdded: 4,
    gamesUpdated: 1,
    oddsUpdated: 0,
    injuriesUpdated: 0
  };
}

export async function runOddsIngestion(): Promise<IngestionDailyResult> {
  // Pulling odds and creating snapshots
  console.log(`[Ingestion] Refreshing odds...`);
  
  return {
    gamesAdded: 0,
    gamesUpdated: 0,
    oddsUpdated: 14,
    injuriesUpdated: 0
  };
}

export async function runInjuryUpdates(): Promise<IngestionDailyResult> {
  // Pulling injury reports
  console.log(`[Ingestion] Refreshing injury statuses...`);
  
  return {
    gamesAdded: 0,
    gamesUpdated: 0,
    oddsUpdated: 0,
    injuriesUpdated: 5
  };
}
