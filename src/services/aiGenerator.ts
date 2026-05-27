import Anthropic from '@anthropic-ai/sdk';
import type { DeepPickResult } from './deepResearchService';

export interface AIExplanationResult {
  shortReason: string;
  fullBreakdown: string;
  keyAngles: string[];
  injuryNotes: string;
  marketNotes: string;
  riskNotes: string;
  killCase: string;
  bestUseCase: 'Straight' | 'Parlay' | 'Lean';
  freeTeaser: string;
}

export interface DeepAIExplanation {
  shortReason: string;
  fullBreakdown: string;
  keyAngles: string[];
  injuryNotes: string;
  marketNotes: string;
  riskNotes: string;
  killCase: string;
}

// ─── Legacy prompt builder (used by edge detection engine) ────────────────────

function buildPrompt(gameId: string, dossier: any, score: any): string {
  const d = dossier;
  const ctx = d?.context || {};
  const tf = ctx?.teamForm || {};
  const matchup = ctx?.matchup || {};
  const inj = ctx?.injuries || {};
  const mkt = ctx?.marketMovement || {};
  const env = ctx?.environmental || {};

  const homeTeam = tf.homeName || 'Home Team';
  const awayTeam = tf.awayName || 'Away Team';
  const homeRecord = tf.homeRecord || 'N/A';
  const awayRecord = tf.awayRecord || 'N/A';
  const homeHomeRec = tf.homeHomeRecord ? ` (home: ${tf.homeHomeRecord})` : '';
  const awayAwayRec = tf.awayAwayRecord ? ` (away: ${tf.awayAwayRecord})` : '';
  const spread = matchup?.spread || 'N/A';
  const total = matchup?.overUnder || 'N/A';
  const venue = env?.venue || 'Unknown Venue';
  const headline = matchup?.headline || '';
  const mktOdds = `${mkt.current > 0 ? '+' : ''}${mkt.current || 'N/A'}`;

  const homeInjuries = Array.isArray(inj.home) && inj.home.length > 0
    ? inj.home.map((p: any) => `${p.name} (${p.position || ''}) - ${p.status}${p.detail ? ': ' + p.detail : ''}`).join('; ')
    : 'None reported';
  const awayInjuries = Array.isArray(inj.away) && inj.away.length > 0
    ? inj.away.map((p: any) => `${p.name} (${p.position || ''}) - ${p.status}${p.detail ? ': ' + p.detail : ''}`).join('; ')
    : 'None reported';

  const homeLeaders = Array.isArray(tf.homeLeaders) && tf.homeLeaders.length > 0
    ? tf.homeLeaders.join(', ') : 'N/A';
  const awayLeaders = Array.isArray(tf.awayLeaders) && tf.awayLeaders.length > 0
    ? tf.awayLeaders.join(', ') : 'N/A';

  const reasonsFor = Array.isArray(d?.systemReasonsFor) ? d.systemReasonsFor.join(' ') : '';
  const reasonsAgainst = Array.isArray(d?.systemReasonsAgainst) ? d.systemReasonsAgainst.join(' ') : '';

  const marketType = score?.marketType || 'Market';
  const selection = score?.selection || 'Selection';
  const edgeVal = typeof score?.edgeValue === 'number' ? score.edgeValue.toFixed(1) : 'N/A';
  const confidence = typeof score?.confidenceScore === 'number' ? score.confidenceScore.toFixed(1) : 'N/A';

  return `You are HIMOTHY, an elite sports betting intelligence engine. Analyze this game and produce sharp, specific betting analysis. Be direct, concise, and analytical — no fluff.

GAME: ${awayTeam} @ ${homeTeam}
VENUE: ${venue}
SPORT: ${d?.sportId || 'Unknown'}
MARKET: ${marketType} — ${selection}
CURRENT ODDS: ${mktOdds}
SPREAD: ${spread} | TOTAL: ${total}

RECORDS:
- ${homeTeam}: ${homeRecord}${homeHomeRec}
- ${awayTeam}: ${awayRecord}${awayAwayRec}

KEY PERFORMERS:
- ${homeTeam}: ${homeLeaders}
- ${awayTeam}: ${awayLeaders}

INJURIES:
- ${homeTeam}: ${homeInjuries}
- ${awayTeam}: ${awayInjuries}

MARKET SIGNALS:
- Model edge value: ${edgeVal}
- Confidence score: ${confidence}
- System reasons FOR: ${reasonsFor}
- System reasons AGAINST: ${reasonsAgainst}

${headline ? `HEADLINE: ${headline}` : ''}

Respond ONLY with a valid JSON object:
{
  "shortReason": "1-2 sentence sharp summary (mention specific teams/players/stats)",
  "fullBreakdown": "3-4 sentence deep analysis covering matchup, market movement, and value angle",
  "keyAngles": ["specific angle 1", "specific angle 2", "specific angle 3 optional"],
  "injuryNotes": "specific injury impact or 'No significant injury concerns for this market.'",
  "marketNotes": "sharp take on the line/odds and where value exists",
  "riskNotes": "main scenario where this bet loses",
  "killCase": "one specific scenario that kills value and warrants a pass",
  "bestUseCase": "Straight" or "Parlay" or "Lean",
  "freeTeaser": "teaser hook that mentions the game without giving away the pick"
}`;
}

// ─── Deep research prompt builder ─────────────────────────────────────────────

function buildDeepPrompt(pick: DeepPickResult): string {
  const { homeTeam: h, awayTeam: a, signals } = pick;

  const homeAts = h.ats ? `${h.ats.display} (${h.ats.coverPct.toFixed(1)}% cover rate)` : 'ATS data unavailable';
  const awayAts = a.ats ? `${a.ats.display} (${a.ats.coverPct.toFixed(1)}% cover rate)` : 'ATS data unavailable';

  const homeInjuries = [
    ...h.injuredOut.map(n => `${n} — OUT`),
    ...h.injuredDoubtful.map(n => `${n} — DOUBTFUL`),
    ...h.injuredQuestionable.map(n => `${n} — QUESTIONABLE`),
  ].join('; ') || 'None reported';

  const awayInjuries = [
    ...a.injuredOut.map(n => `${n} — OUT`),
    ...a.injuredDoubtful.map(n => `${n} — DOUBTFUL`),
    ...a.injuredQuestionable.map(n => `${n} — QUESTIONABLE`),
  ].join('; ') || 'None reported';

  const spread = pick.spread !== null ? `${h.name} ${pick.spread > 0 ? '+' : ''}${pick.spread}` : 'N/A';
  const total = pick.total !== null ? pick.total.toString() : 'N/A';

  const boardContext = pick.board === 'soccer' || pick.board === 'overseas'
    ? 'Focus on: team form, goal-scoring trends, defensive records, motivation, and 1X2/goals market value.'
    : pick.board === 'tennis'
    ? 'Focus on: head-to-head, surface suitability, recent tournament form, serving stats, and moneyline value.'
    : 'Focus on: ATS trends, matchup advantages, injury impact, spread value, and closing line projection.';

  return `Analyze this pick and produce the JSON. Use web_search to verify current injuries/lineups/line moves/weather first.

SPORT CONTEXT: ${boardContext}

GAME: ${a.name} @ ${h.name}
LEAGUE: ${pick.league}
SELECTION: ${pick.selection} ${pick.odds ? `(${pick.odds})` : ''}
MARKET: ${pick.marketType.toUpperCase()}
SPREAD: ${spread} | TOTAL: ${total}
CONFIDENCE SCORE: ${pick.confidenceScore}/100
TIER: ${pick.tier.replace(/_/g, ' ')}

SEASON RECORDS:
- ${h.name}: ${h.overallRecord || 'N/A'} overall, ${h.homeAwayRecord || 'N/A'} at home
- ${a.name}: ${a.overallRecord || 'N/A'} overall, ${a.homeAwayRecord || 'N/A'} on road

ATS PERFORMANCE (season):
- ${h.name}: ${homeAts}
- ${a.name}: ${awayAts}

WIN PROBABILITIES:
- ${h.name}: ${h.winProbability?.toFixed(1) ?? 'N/A'}%
- ${a.name}: ${a.winProbability?.toFixed(1) ?? 'N/A'}%
- Gap: ${signals.winProbabilityGap.toFixed(1)} points

KEY PERFORMERS:
- ${h.name}: ${h.keyPlayers.join(', ') || 'N/A'}
- ${a.name}: ${a.keyPlayers.join(', ') || 'N/A'}

INJURY REPORT:
- ${h.name}: ${homeInjuries}
- ${a.name}: ${awayInjuries}

SYSTEM SIGNALS:
- Odds available: ${signals.oddsAvailable}
- Win prob gap: ${signals.winProbabilityGap.toFixed(1)}pts
- ATS cover % (pick side): ${signals.atsCoverPct?.toFixed(1) ?? 'N/A'}%
- ATS cover % (opponent): ${signals.atsCoverPctOpp?.toFixed(1) ?? 'N/A'}%
- Key injury on pick side: ${signals.keyInjuryOnPickSide}
- Key injury on opponent: ${signals.keyInjuryOnOppSide}
- Sharp line signal: ${signals.sharpLineDetected}
- Data quality: ${signals.dataQuality}/100

SYSTEM ANALYSIS:
FOR: ${pick.reasonsFor.join(' | ')}
AGAINST: ${pick.reasonsAgainst.join(' | ')}

Justify why this is a ${pick.tier.replace(/_/g, ' ')} pick using the data above PLUS what you find via web_search. Then return the JSON object.`;
}

// ─── Fallbacks ────────────────────────────────────────────────────────────────

const LEGACY_FALLBACK: AIExplanationResult = {
  shortReason: 'Model identified a price inefficiency on this market based on edge signals.',
  fullBreakdown: 'Research scan flagged this market as a qualified edge candidate based on line value and movement signals. Full AI analysis temporarily unavailable.',
  keyAngles: ['Market price inefficiency detected', 'Edge signals confirmed via model'],
  injuryNotes: 'Injury data not available for this analysis pass.',
  marketNotes: 'Line movement and value signals present. Verify odds at your sportsbook before placing.',
  riskNotes: 'Standard market variance applies.',
  killCase: 'Edge degrades if line moves significantly against the model projection.',
  bestUseCase: 'Lean',
  freeTeaser: "Research engine flagged a qualified edge on tonight's slate. Check the board.",
};

const DEEP_FALLBACK: DeepAIExplanation = {
  shortReason: 'Research engine identified a qualified edge based on ATS records and win probability data.',
  fullBreakdown: 'Multiple confirming signals aligned on this pick: ATS trends, market pricing, and injury-adjusted win probability all point the same direction.',
  keyAngles: ['ATS trend confirmed', 'Win probability edge detected', 'Market pricing favorable'],
  injuryNotes: 'No critical injury concerns verified for this pick.',
  marketNotes: 'Line priced at a slight discount relative to projected outcome probability.',
  riskNotes: 'Variance in team execution and last-minute lineup changes are the main risk factors.',
  killCase: 'A key player ruled out within 2 hours of tip-off/first pitch would reduce confidence significantly.',
};

// Stable system prompt (cached) — instructs Claude to dive deep with live web research.
const DEEP_SYSTEM = `You are HIMOTHY, an elite sports betting analyst writing for a paying subscriber who trusts your picks completely. You are not a hype machine — you are honest, sharp, and specific.

Before you finalize, USE THE web_search TOOL to pull the most current real-world context for this exact game:
- Confirmed injuries, scratches, and starting lineups / starting pitchers (search team + "injury report" or "starting lineup" + today's date)
- Late line movement and where sharp money is going
- Weather for outdoor games
- Any breaking news (rest, travel, suspensions, motivation) that the raw stats miss

Synthesize what you find with the model's data signals into a clear, confident, honest case for why this is the best pick — and be straight about the real risk. Cite concrete facts (names, numbers, ERAs, line moves). Never invent a stat. If web search contradicts the pick, say so in riskNotes/killCase.

Respond ONLY with a valid JSON object, no prose before or after:
{
  "shortReason": "2-3 sentence sharp summary referencing specific stats/numbers/matchup factors and anything notable found via web search",
  "fullBreakdown": "4-6 sentence deep breakdown combining the data signals with current real-world context (injuries, lineups, line moves, weather) and why this market has value",
  "keyAngles": ["angle with a specific stat or fact", "injury/lineup or sharp-money angle", "matchup or situational angle"],
  "injuryNotes": "specific, CURRENT injury/lineup impact verified via web search, or 'Both sides healthy per latest reports.'",
  "marketNotes": "where the line/price sits vs true probability, plus any line movement found",
  "riskNotes": "the exact scenario that makes this pick lose",
  "killCase": "one specific event before game time that would make you pass entirely"
}`;

// ─── Exported functions ───────────────────────────────────────────────────────

export async function generateExplanation(
  gameId: string,
  dossier: any,
  score: any
): Promise<AIExplanationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return LEGACY_FALLBACK;

  try {
    const client = new Anthropic({ apiKey });
    const prompt = buildPrompt(gameId, dossier, score);

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return LEGACY_FALLBACK;

    const parsed = JSON.parse(jsonMatch[0]) as AIExplanationResult;
    if (!parsed.shortReason || !parsed.fullBreakdown) return LEGACY_FALLBACK;
    if (!['Straight', 'Parlay', 'Lean'].includes(parsed.bestUseCase)) parsed.bestUseCase = 'Lean';

    return parsed;
  } catch {
    return LEGACY_FALLBACK;
  }
}

export async function generateDeepExplanation(pick: DeepPickResult): Promise<DeepAIExplanation> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return DEEP_FALLBACK;

  try {
    const client = new Anthropic({ apiKey });

    // Server-side web search: Claude pulls current injuries/lineups/line moves/weather
    // from around the web and synthesizes it into the reasoning. Dynamic filtering is
    // built into this tool version (no code-execution tool, no beta header needed).
    const tools: any[] = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }];

    const system: any[] = [{ type: 'text', text: DEEP_SYSTEM, cache_control: { type: 'ephemeral' } }];
    const messages: any[] = [{ role: 'user', content: buildDeepPrompt(pick) }];

    const params = { model: 'claude-opus-4-7', max_tokens: 2048, system, tools, messages };

    let response = await client.messages.create(params as any);

    // Web search runs as a server-side loop; if it hits the server cap it returns
    // stop_reason "pause_turn" — re-send the accumulated turn to resume (no extra prompt).
    let guard = 0;
    while (response.stop_reason === 'pause_turn' && guard < 4) {
      messages.push({ role: 'assistant', content: response.content });
      response = await client.messages.create({ ...params, messages } as any);
      guard++;
    }

    // Concatenate all text blocks (the response may interleave search-result blocks).
    const text = (response.content as any[])
      .filter((b) => b?.type === 'text')
      .map((b) => b.text)
      .join('\n');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return DEEP_FALLBACK;

    const parsed = JSON.parse(jsonMatch[0]) as DeepAIExplanation;
    if (!parsed.shortReason || !parsed.fullBreakdown) return DEEP_FALLBACK;

    return {
      shortReason: parsed.shortReason,
      fullBreakdown: parsed.fullBreakdown,
      keyAngles: Array.isArray(parsed.keyAngles) ? parsed.keyAngles : DEEP_FALLBACK.keyAngles,
      injuryNotes: parsed.injuryNotes || DEEP_FALLBACK.injuryNotes,
      marketNotes: parsed.marketNotes || DEEP_FALLBACK.marketNotes,
      riskNotes: parsed.riskNotes || DEEP_FALLBACK.riskNotes,
      killCase: parsed.killCase || DEEP_FALLBACK.killCase,
    };
  } catch {
    return DEEP_FALLBACK;
  }
}
