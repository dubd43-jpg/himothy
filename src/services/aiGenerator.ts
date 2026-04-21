import Anthropic from '@anthropic-ai/sdk';

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
    ? tf.homeLeaders.join(', ')
    : 'N/A';
  const awayLeaders = Array.isArray(tf.awayLeaders) && tf.awayLeaders.length > 0
    ? tf.awayLeaders.join(', ')
    : 'N/A';

  const reasonsFor = Array.isArray(d?.systemReasonsFor) ? d.systemReasonsFor.join(' ') : '';
  const reasonsAgainst = Array.isArray(d?.systemReasonsAgainst) ? d.systemReasonsAgainst.join(' ') : '';

  const marketType = score?.marketType || 'Market';
  const selection = score?.selection || 'Selection';
  const edgeVal = typeof score?.edgeValue === 'number' ? score.edgeValue.toFixed(1) : 'N/A';
  const confidence = typeof score?.confidenceScore === 'number' ? score.confidenceScore.toFixed(1) : 'N/A';

  return `You are HIMOTHY, an elite sports betting intelligence engine. Analyze this game and produce sharp, specific betting analysis. Be direct, concise, and analytical — no fluff, no generic statements.

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

Respond ONLY with a valid JSON object in this exact format:
{
  "shortReason": "1-2 sentence sharp summary of the edge (mention specific teams/players/stats)",
  "fullBreakdown": "3-4 sentence deep analysis covering matchup, market movement, and value angle",
  "keyAngles": ["angle 1 specific to this game", "angle 2 specific to this game", "angle 3 optional"],
  "injuryNotes": "specific injury impact on the market, or 'No significant injury concerns for this market.'",
  "marketNotes": "sharp take on the line/odds and where value exists",
  "riskNotes": "main scenario where this bet loses",
  "killCase": "one specific scenario that kills the value and warrants a pass",
  "bestUseCase": "Straight" or "Parlay" or "Lean",
  "freeTeaser": "teaser hook that mentions the game without giving away the pick"
}`;
}

const FALLBACK: AIExplanationResult = {
  shortReason: 'Model identified a price inefficiency on this market based on edge signals.',
  fullBreakdown: 'Research scan flagged this market as a qualified edge candidate based on line value and movement signals. Full AI analysis temporarily unavailable.',
  keyAngles: ['Market price inefficiency detected', 'Edge signals confirmed via model'],
  injuryNotes: 'Injury data not available for this analysis pass.',
  marketNotes: 'Line movement and value signals present. Verify odds at your sportsbook before placing.',
  riskNotes: 'Standard market variance applies.',
  killCase: 'Edge degrades if line moves significantly against the model projection.',
  bestUseCase: 'Lean',
  freeTeaser: 'Research engine flagged a qualified edge on tonight\'s slate. Check the board.',
};

export async function generateExplanation(
  gameId: string,
  dossier: any,
  score: any
): Promise<AIExplanationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return FALLBACK;
  }

  try {
    const client = new Anthropic({ apiKey });
    const prompt = buildPrompt(gameId, dossier, score);

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return FALLBACK;

    const parsed = JSON.parse(jsonMatch[0]) as AIExplanationResult;

    // Validate required fields
    if (!parsed.shortReason || !parsed.fullBreakdown) return FALLBACK;

    // Ensure bestUseCase is valid
    if (!['Straight', 'Parlay', 'Lean'].includes(parsed.bestUseCase)) {
      parsed.bestUseCase = 'Lean';
    }

    return parsed;
  } catch {
    return FALLBACK;
  }
}
