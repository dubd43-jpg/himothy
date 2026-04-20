import { refreshLiveOpsSnapshot } from '@/services/liveOpsService';

export interface IngestionDailyResult {
  gamesAdded: number;
  gamesUpdated: number;
  oddsUpdated: number;
  injuriesUpdated: number;
}

export async function runSchedulesIngestion(sport: string, date: Date): Promise<IngestionDailyResult> {
  const snapshot = await refreshLiveOpsSnapshot({
    reason: `ingestion-schedules-${sport}`,
    maxStaleSeconds: 120,
  });

  const upcoming = snapshot.games.filter((game) => game.startTime && new Date(game.startTime).getTime() > Date.now()).length;

  return {
    gamesAdded: 0,
    gamesUpdated: upcoming,
    oddsUpdated: snapshot.lineChangeCount,
    injuriesUpdated: 0
  };
}

export async function runOddsIngestion(): Promise<IngestionDailyResult> {
  const snapshot = await refreshLiveOpsSnapshot({
    reason: 'ingestion-odds',
    maxStaleSeconds: 60,
  });

  return {
    gamesAdded: 0,
    gamesUpdated: 0,
    oddsUpdated: snapshot.lineChangeCount,
    injuriesUpdated: 0
  };
}

export async function runInjuryUpdates(): Promise<IngestionDailyResult> {
  await refreshLiveOpsSnapshot({
    reason: 'ingestion-injuries',
    maxStaleSeconds: 180,
  });

  return {
    gamesAdded: 0,
    gamesUpdated: 0,
    oddsUpdated: 0,
    injuriesUpdated: 0
  };
}
