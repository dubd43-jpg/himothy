// MMA / UFC deep signals service.
// Data: ESPN MMA API (free) + static fighter stance/style analysis.
//
// Signals:
//   Fighter stance: orthodox vs southpaw (southpaw matchups skew outcomes)
//   Finishing rate (KO%, Sub%) — determines if we should bet method markets
//   Takedown offense % vs opponent takedown defense %
//   Significant strike accuracy + differential
//   Ring rust — time since last fight (60+ days = notable; 180+ = real factor)
//   Performance after a knockout loss (chin concern / psychological)
//   Fighter age + experience gap at this level
//   Reach advantage
//   Finish rate in fights going to decision (stamina/cardio signal)

import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const ESPN_MMA = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc';
const TTL = 4 * 60 * 60 * 1000; // 4h — MMA fights are infrequent

const cache = new Map<string, { data: MMAFighterSignals; at: number }>();
const matchupCache = new Map<string, { data: MMAMatchupSignals; at: number }>();

export interface MMAFighterSignals {
  fighterName: string;
  // Physical
  stance: 'orthodox' | 'southpaw' | 'switch' | 'unknown';
  reachInches: number | null;
  ageYears: number | null;
  // Record
  wins: number;
  losses: number;
  draws: number;
  ufcWins: number;      // wins inside UFC specifically (quality of competition)
  ufcLosses: number;
  // Finishing rate
  koWins: number;
  subWins: number;
  decisionWins: number;
  koLosses: number;     // got knocked out — chin concern
  subLosses: number;
  koFinishPct: number;  // KOs / total wins
  subFinishPct: number;
  decisionFinishPct: number;
  // Striking
  sigStrikesLandedPerMin: number;
  sigStrikesAbsorbedPerMin: number;
  sigStrikeAccuracy: number;   // %
  sigStrikeDefense: number;    // % dodged
  // Grappling
  takedownAvgPer15: number;
  takedownAccuracy: number;    // %
  takedownDefense: number;     // % sprawled
  submissionAvgPer15: number;
  // Ring rust
  daysSinceLastFight: number;
  isRusty: boolean;            // 180+ days
  // Recent form
  last5Form: string;           // "W W L W W"
  last5Wins: number;
  lastFightResult: 'W' | 'L' | 'D' | 'NC' | null;
  lastFightMethod: 'KO' | 'Sub' | 'Decision' | null;
  recentKoLoss: boolean;       // knocked out in last 2 fights
}

async function fetchFighterStats(athleteId: string): Promise<any> {
  try {
    const r = await fetchWithTimeout(`${ESPN_MMA}/athletes/${athleteId}/statistics`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function fetchFighterProfile(athleteId: string): Promise<any> {
  try {
    const r = await fetchWithTimeout(`${ESPN_MMA}/athletes/${athleteId}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function fetchFighterEventLog(athleteId: string): Promise<any[]> {
  try {
    const r = await fetchWithTimeout(`${ESPN_MMA}/athletes/${athleteId}/eventlog`, { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return j.events?.events || j.events || [];
  } catch { return []; }
}

function statNum(stats: any[], ...names: string[]): number {
  for (const name of names) {
    const s = (stats || []).find((x: any) =>
      String(x.name || x.displayName || '').toLowerCase().includes(name.toLowerCase())
    );
    if (s) return Number(s.value ?? 0) || 0;
  }
  return 0;
}

export async function getMMAFighterSignals(
  athleteId: string, fighterName: string,
): Promise<MMAFighterSignals | null> {
  const hit = cache.get(`mma:${athleteId}`);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  try {
    const [profile, statsData, eventLog] = await Promise.all([
      fetchFighterProfile(athleteId),
      fetchFighterStats(athleteId),
      fetchFighterEventLog(athleteId),
    ]);

    const fighter = profile?.athletes?.[0] || profile;
    const statsArr: any[] = statsData?.athletes?.[0]?.statistics?.[0]?.splits?.categories?.flatMap((c: any) => c.stats || []) || [];

    // Physical
    const stance = (String(fighter?.stance || fighter?.handedness || '').toLowerCase().includes('south')
      ? 'southpaw' : fighter?.stance?.toLowerCase().includes('switch')
      ? 'switch' : fighter?.stance ? 'orthodox' : 'unknown') as MMAFighterSignals['stance'];
    const reach = Number(fighter?.reach || fighter?.reachInches || NaN);
    const dob = fighter?.dateOfBirth || fighter?.dob;
    const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000)) : null;

    // Record parsing
    const record = String(fighter?.record || fighter?.displayRecord || '');
    const recMatch = record.match(/(\d+)-(\d+)-?(\d+)?/);
    const wins = recMatch ? Number(recMatch[1]) : 0;
    const losses = recMatch ? Number(recMatch[2]) : 0;
    const draws = recMatch ? Number(recMatch[3] ?? 0) : 0;

    // Striking stats
    const slpm = statNum(statsArr, 'slpm', 'sig strikes landed per min', 'strikesLanded');
    const sapm = statNum(statsArr, 'sapm', 'sig strikes absorbed', 'strikesAbsorbed');
    const strAcc = statNum(statsArr, 'strikingAccuracy', 'strike accuracy', 'sigStrikeAcc');
    const strDef = statNum(statsArr, 'strikingDefense', 'strike defense', 'sigStrikeDef');

    // Grappling stats
    const tdAvg = statNum(statsArr, 'takedownAverage', 'td avg', 'takedownsPer15');
    const tdAcc = statNum(statsArr, 'takedownAccuracy', 'td accuracy');
    const tdDef = statNum(statsArr, 'takedownDefense', 'td defense');
    const subAvg = statNum(statsArr, 'submissionAverage', 'sub avg', 'submissionsPer15');

    // Fight history from event log
    const events = (eventLog || []).sort((a: any, b: any) =>
      String(b.date || '').localeCompare(String(a.date || ''))
    );

    let koW = 0, subW = 0, decW = 0, koL = 0, subL = 0;
    let ufcW = 0, ufcL = 0;
    let daysSince = 0;
    const last5: string[] = [];
    let lastMethod: MMAFighterSignals['lastFightMethod'] = null;
    let lastResult: MMAFighterSignals['lastFightResult'] = null;
    let recentKoLoss = false;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const comp = ev.competitions?.[0];
      if (!comp?.status?.type?.completed) continue;
      const competitors: any[] = comp.competitors || [];
      const me = competitors.find((c: any) => String(c.athlete?.id || c.id || '') === String(athleteId));
      if (!me) continue;

      const won = me.winner === true;
      const method = String(comp.status?.type?.shortDetail || comp.method || '').toUpperCase();
      const isKO = method.includes('KO') || method.includes('TKO');
      const isSub = method.includes('SUB');
      const isDec = method.includes('DEC') || method.includes('DECISION');
      const isUFC = String(ev.name || ev.league?.name || '').toUpperCase().includes('UFC');

      if (i === 0) {
        const ms = Date.now() - new Date(String(ev.date || '').slice(0, 10)).getTime();
        daysSince = Math.floor(ms / 86400000);
        lastResult = won ? 'W' : 'L';
        lastMethod = isKO ? 'KO' : isSub ? 'Sub' : isDec ? 'Decision' : null;
      }

      if (won) {
        if (isKO) koW++;
        else if (isSub) subW++;
        else if (isDec) decW++;
        if (isUFC) ufcW++;
      } else {
        if (isKO) { koL++; if (i <= 1) recentKoLoss = true; }
        else if (isSub) subL++;
        if (isUFC) ufcL++;
      }

      if (last5.length < 5) last5.push(won ? 'W' : 'L');
    }

    const totalWins = koW + subW + decW;
    const koFinishPct = totalWins > 0 ? Math.round((koW / totalWins) * 100) : 0;
    const subFinishPct = totalWins > 0 ? Math.round((subW / totalWins) * 100) : 0;
    const decFinishPct = totalWins > 0 ? Math.round((decW / totalWins) * 100) : 0;

    const signals: MMAFighterSignals = {
      fighterName, stance,
      reachInches: isNaN(reach) ? null : reach,
      ageYears: age,
      wins, losses, draws,
      ufcWins: ufcW, ufcLosses: ufcL,
      koWins: koW, subWins: subW, decisionWins: decW,
      koLosses: koL, subLosses: subL,
      koFinishPct, subFinishPct, decisionFinishPct: decFinishPct,
      sigStrikesLandedPerMin: Math.round(slpm * 100) / 100,
      sigStrikesAbsorbedPerMin: Math.round(sapm * 100) / 100,
      sigStrikeAccuracy: Math.round(strAcc * 10) / 10,
      sigStrikeDefense: Math.round(strDef * 10) / 10,
      takedownAvgPer15: Math.round(tdAvg * 100) / 100,
      takedownAccuracy: Math.round(tdAcc * 10) / 10,
      takedownDefense: Math.round(tdDef * 10) / 10,
      submissionAvgPer15: Math.round(subAvg * 100) / 100,
      daysSinceLastFight: daysSince,
      isRusty: daysSince >= 180,
      last5Form: last5.join(' '),
      last5Wins: last5.filter((r) => r === 'W').length,
      lastFightResult: lastResult,
      lastFightMethod: lastMethod,
      recentKoLoss,
    };

    cache.set(`mma:${athleteId}`, { data: signals, at: Date.now() });
    return signals;
  } catch (err) {
    console.error('[mmaSignalsService] error', err);
    return null;
  }
}

export interface MMAMatchupSignals {
  fighterA: MMAFighterSignals;
  fighterB: MMAFighterSignals;
  stanceMismatch: boolean;  // southpaw vs orthodox
  grappleEdge: 'A' | 'B' | 'even';
  strikeEdge: 'A' | 'B' | 'even';
  bullets: string[];
}

export async function getMMAMatchupSignals(
  athleteAId: string, fighterAName: string,
  athleteBId: string, fighterBName: string,
): Promise<MMAMatchupSignals | null> {
  const cacheKey = `mma-matchup:${athleteAId}|${athleteBId}`;
  const hit = matchupCache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const [a, b] = await Promise.all([
    getMMAFighterSignals(athleteAId, fighterAName),
    getMMAFighterSignals(athleteBId, fighterBName),
  ]);
  if (!a || !b) return null;

  const bullets: string[] = [];

  // Stance matchup — southpaw vs orthodox is the most predictive MMA matchup factor
  const stanceMismatch = (a.stance === 'southpaw' && b.stance === 'orthodox') ||
    (a.stance === 'orthodox' && b.stance === 'southpaw');
  if (stanceMismatch) {
    const southpaw = a.stance === 'southpaw' ? fighterAName : fighterBName;
    bullets.push(`Southpaw vs orthodox matchup — ${southpaw} has a natural stance advantage; southpaw fighters historically win ~55% of style-vs-style matchups.`);
  }

  // Ring rust
  if (a.isRusty) bullets.push(`⚠️ ${fighterAName} has been out ${a.daysSinceLastFight} days — significant ring rust, timing and cardio unknowns.`);
  if (b.isRusty) bullets.push(`⚠️ ${fighterBName} has been out ${b.daysSinceLastFight} days — ring rust factor.`);

  // KO loss chin concern
  if (a.recentKoLoss) bullets.push(`${fighterAName} was knocked out in a recent fight — chin durability is a real question.`);
  if (b.recentKoLoss) bullets.push(`${fighterBName} was knocked out recently — will they get wobbled again?`);

  // Grapple vs striker matchup
  const aGrapple = a.takedownAvgPer15 * a.takedownAccuracy;
  const bGrapple = b.takedownAvgPer15 * b.takedownAccuracy;
  const grappleEdge: 'A' | 'B' | 'even' = aGrapple > bGrapple * 1.3 ? 'A' : bGrapple > aGrapple * 1.3 ? 'B' : 'even';
  if (grappleEdge !== 'even') {
    const better = grappleEdge === 'A' ? fighterAName : fighterBName;
    const worse = grappleEdge === 'A' ? fighterBName : fighterAName;
    const betterF = grappleEdge === 'A' ? a : b;
    const worseF = grappleEdge === 'A' ? b : a;
    bullets.push(`Grapple edge: ${better} (${betterF.takedownAccuracy.toFixed(0)}% TD acc, ${betterF.takedownDefense.toFixed(0)}% def) vs ${worse} (${worseF.takedownDefense.toFixed(0)}% TD def).`);
  }

  // Striking
  const aStrikeEdge = a.sigStrikesLandedPerMin - a.sigStrikesAbsorbedPerMin;
  const bStrikeEdge = b.sigStrikesLandedPerMin - b.sigStrikesAbsorbedPerMin;
  const strikeEdge: 'A' | 'B' | 'even' = aStrikeEdge > bStrikeEdge + 0.5 ? 'A' : bStrikeEdge > aStrikeEdge + 0.5 ? 'B' : 'even';
  if (strikeEdge !== 'even') {
    const better = strikeEdge === 'A' ? fighterAName : fighterBName;
    const betterF = strikeEdge === 'A' ? a : b;
    bullets.push(`Striking edge: ${better} (+${(aStrikeEdge).toFixed(2)} sig strike differential/min, ${betterF.sigStrikeAccuracy.toFixed(0)}% accuracy).`);
  }

  // Reach
  if (a.reachInches && b.reachInches && Math.abs(a.reachInches - b.reachInches) >= 3) {
    const longer = a.reachInches > b.reachInches ? fighterAName : fighterBName;
    const diff = Math.abs(a.reachInches - b.reachInches);
    bullets.push(`${longer} has a ${diff}" reach advantage — matters significantly in stand-up exchanges.`);
  }

  // Finishing tendency
  if (a.koFinishPct >= 60) bullets.push(`${fighterAName} finishes ${a.koFinishPct}% of wins by KO/TKO — this fight likely doesn't go to the judges.`);
  if (b.koFinishPct >= 60) bullets.push(`${fighterBName} ends ${b.koFinishPct}% of wins by KO/TKO.`);
  if (a.subFinishPct >= 50) bullets.push(`${fighterAName} submits opponents in ${a.subFinishPct}% of wins — ground control is a real threat.`);
  if (b.subFinishPct >= 50) bullets.push(`${fighterBName} submits opponents in ${b.subFinishPct}% of wins.`);

  // Age/experience
  if (a.ageYears && b.ageYears && Math.abs(a.ageYears - b.ageYears) >= 5) {
    const younger = a.ageYears < b.ageYears ? fighterAName : fighterBName;
    const older = a.ageYears < b.ageYears ? fighterBName : fighterAName;
    const ageDiff = Math.abs(a.ageYears - b.ageYears);
    bullets.push(`Age gap: ${younger} is ${ageDiff} years younger than ${older} — matters in late-round cardio.`);
  }

  const result: MMAMatchupSignals = { fighterA: a, fighterB: b, stanceMismatch, grappleEdge, strikeEdge, bullets };
  matchupCache.set(cacheKey, { data: result, at: Date.now() });
  return result;
}
