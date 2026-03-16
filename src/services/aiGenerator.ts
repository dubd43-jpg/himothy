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

export async function generateExplanation(
  gameId: string, 
  dossier: any, 
  score: any
): Promise<AIExplanationResult> {
  // If OpenAI API was installed we would construct a prompt:
  // const prompt = `You are the HIMOTHY Sports Intelligence engine...`
  // const completion = await openai.chat.completions.create({...})

  // Returning stub response fitting the requested format
  return {
    shortReason: "Opponent missing key defenders with home team showing strong possession edge.",
    fullBreakdown: "We are backing the home team here due to significant mismatch in transition defense. " +
                   "The away team is playing their 3rd game in 4 nights, which structurally impacts their rotations. " +
                   "Line moved down from -6 to -4.5 offering value against our projected -7 line.",
    keyAngles: [
      "Home Transition Offense vs Away Fatigue",
      "Point Guard Matchup Edge"
    ],
    injuryNotes: "Away team backup center is doubtful, exacerbating depth issues.",
    marketNotes: "Line movement favored the away team early due to volume, but sharp money pushed back late.",
    riskNotes: "If the home team shoots poorly from 3pt, the game may stagnate. Volatility exists in second-half pace.",
    killCase: "Away team gets hot from outside and overcomes the fatigue barrier.",
    bestUseCase: "Straight",
    freeTeaser: "We found a strong edge in tonight's matchup based on a fatigue spot and missing defenders. Unlock to see the play."
  };
}
