// ============================================================
// HIMOTHY PICK REGISTRY — Single Source of Truth
// ============================================================

export type PickCategory = 
  | "GRAND_SLAM" 
  | "PRESSURE_PACK" 
  | "VIP_4_PACK" 
  | "PARLAY_PLAN" 
  | "OVERNIGHT" 
  | "PERSONAL_PLAY" 
  | "HAILMARY" 
  | "OVERSEAS";

export interface Pick {
  id: string;
  category: PickCategory;
  sport: string;
  game: string;
  gameDate?: string;
  gameTime?: string;
  market: string;
  selection: string;
  line: string;
  odds: string;
  confidence: number;
  edge: string;
  risk: string;
  reasoning: string;
  isPremium?: boolean;
  legs?: string[]; // For parlays
  bestUse?: string;
  status?: string;
  fadeReasoning?: string;
}

export const PICK_REGISTRY: Pick[] = [
  // GRAND SLAM
  {
    id: "gs-1",
    category: "GRAND_SLAM",
    sport: "NBA",
    game: "Houston Rockets vs. LA Lakers",
    gameTime: "8:30 PM",
    market: "1st Half Spread",
    selection: "Rockets -1.5 (1H)",
    line: "-1.5",
    odds: "-110",
    confidence: 10.0,
    edge: "Massive (+3.5%)",
    risk: "Low",
    reasoning: "Level 4 Deep Scan identifies a massive efficiency mismatch. While the Lakers struggle with a 28th-ranked 1st Half Net Rating on B2Bs, Houston enters this matchup with a clean injury report—all starters cleared and zero rotational minutes lost to the training room. Houston currently ranks #4 in the NBA in 1st Half Net Rating (+8.2) at home, utilizing their league-leading defensive intensity to blow games open early.",
    fadeReasoning: "We are fading a fatigued Lakers squad that has shown a consistent drop in defensive field goal percentage (EFG%) when playing their third game in four nights. Their bench rotation lacks the lateral speed to keep up with Houston's young core on cross-match transitions.",
    isPremium: true,
  },
  // PRESSURE PACK
  {
    id: "pp-1",
    category: "PRESSURE_PACK",
    sport: "NBA",
    game: "Atlanta Hawks vs. Orlando Magic",
    gameTime: "7:00 PM",
    market: "1st Quarter Spread",
    selection: "Hawks -0.5 (1Q)",
    line: "-0.5",
    odds: "-115",
    confidence: 9.3,
    edge: "High (+2.1%)",
    risk: "Medium",
    reasoning: "The Hawks enter on a massive 9-game winning streak and routinely blitz teams early. Advanced net-rating metrics at home isolate a significant edge in the first 12 minutes against the Magic's slow-starting road offense.",
    fadeReasoning: "The Magic are specifically being faded here due to their league-worst 1st Quarter defensive rating on the road. They often take 5-6 minutes to find their rhythm, which is a death sentence against Atlanta's high-tempo starters.",
    isPremium: true,
  },
  {
    id: "pp-2",
    category: "PRESSURE_PACK",
    sport: "NBA",
    game: "Boston Celtics vs. Phoenix Suns",
    gameTime: "9:00 PM",
    market: "Player Prop - Solo",
    selection: "Jayson Tatum OVER 6.5 1Q Points",
    line: "6.5",
    odds: "-120",
    confidence: 9.1,
    edge: "Strong (+1.8%)",
    risk: "Medium",
    reasoning: "Tatum's usage rate spikes in the first quarter, particularly against switch-heavy defenses like Phoenix. He's cleared this number in 7 of his last 8 starts. Pure solo isolation value.",
    fadeReasoning: "Phoenix's rim protection is non-existent when Nurkic is off the floor, which usually happens early in the 1Q due to foul trouble or rotational shifts. Tatum will feast on the baseline.",
    isPremium: true,
  },
  // VIP 4-PACK
  {
    id: "vip-1",
    category: "VIP_4_PACK",
    sport: "NBA",
    game: "LA Clippers vs. San Antonio Spurs",
    gameTime: "10:00 PM",
    market: "Team Total - 1st Half",
    selection: "Clippers OVER 58.5 (1H)",
    line: "58.5",
    odds: "-115",
    confidence: 8.9,
    edge: "High (+2.4%)",
    risk: "Low",
    reasoning: "Pace projections show the Spurs trying to run with a rested Clippers offense. Our offensive efficiency metrics point to LA clearing this number easily before halftime before rotations get weird.",
    fadeReasoning: "We are fading the Spurs' 1H transition defense, which ranks bottom-5 in the league. They allow too many uncontested corner threes when scrambling back from missed shots.",
    isPremium: false,
  },
  {
    id: "vip-2",
    category: "VIP_4_PACK",
    sport: "NHL",
    game: "Los Angeles Kings vs. New York Rangers",
    gameTime: "7:00 PM",
    market: "Moneyline - 1st Period",
    selection: "Rangers ML (1P)",
    line: "PK",
    odds: "-125",
    confidence: 8.7,
    edge: "Strong (+1.9%)",
    risk: "Medium",
    reasoning: "The Rangers lead the NHL in 1st period goal differential at home. LA has started slowly on the road recently. High probability of New York striking first.",
    fadeReasoning: "Fading the Kings' backup goalie who has a sub-.880 save percentage in the opening 20 minutes this season. New York's power play is too lethal for this mismatch.",
    isPremium: false,
  },
  {
    id: "vip-3",
    category: "VIP_4_PACK",
    sport: "NBA",
    game: "Dallas Mavericks vs. New Orleans Pelicans",
    gameTime: "8:00 PM",
    market: "Player Prop",
    selection: "Luka Doncic OVER 32.5 Points",
    line: "32.5",
    odds: "-110",
    confidence: 8.6,
    edge: "Moderate (+1.5%)",
    risk: "Medium",
    reasoning: "The Mavericks rely heavily on Luka's scoring against teams that struggle with perimeter defense. Expect high volume tonight against the Pelicans.",
    isPremium: false,
  },
  // PARLAY PLAN
  {
    id: "parlay-1",
    category: "PARLAY_PLAN",
    sport: "Multi-Sport",
    game: "$10 PARLAY PLAN",
    gameTime: "All Day",
    market: "4-Leg Mixed Parlay",
    selection: "The Daily Flip",
    line: "-",
    odds: "+850",
    confidence: 7.5,
    edge: "Parlay Value",
    risk: "High",
    reasoning: "Built specifically for flip chasers trying to turn a small stake into a move. Combines a safe NHL moneyline favorite, two NBA alt-props, and a College Hoops 1st Half spread.",
    legs: [
      "7:00 PM — NY Rangers ML (NHL)",
      "9:00 PM — Jayson Tatum OVER 6.5 1Q Pts (NBA)",
      "7:00 PM — Hawks -0.5 1Q Spread (NBA)",
      "8:30 PM — Houston Rockets -1.5 1H Spread (NBA)"
    ]
  },
  // OVERNIGHT
  {
    id: "ov-1",
    category: "OVERNIGHT",
    sport: "Soccer - EPL",
    game: "Brentford vs. Wolves",
    gameDate: "Tomorrow",
    gameTime: "10:00 AM",
    market: "Both Teams To Score",
    selection: "YES (BTTS)",
    line: "-",
    odds: "-130",
    confidence: 8.2,
    edge: "Strong (+2.1%)",
    risk: "Medium",
    reasoning: "Both squads rank in the top 8 for goals scored and conceded in EPL this season.",
  },
  {
    id: "ov-2",
    category: "OVERNIGHT",
    sport: "Tennis",
    game: "C. Langmo vs. O. Krutykh",
    gameDate: "Tomorrow",
    gameTime: "7:00 AM",
    market: "Moneyline",
    selection: "O. Krutykh ML",
    line: "-",
    odds: "-140",
    confidence: 7.7,
    edge: "Moderate (+1.2%)",
    risk: "High",
    reasoning: "Krutykh's first-serve return points won percentage is significantly higher than market pricing suggests.",
  },
  {
    id: "ov-3",
    category: "OVERNIGHT",
    sport: "Table Tennis",
    game: "P. Gireth vs. J. Kanera",
    gameDate: "Tomorrow",
    gameTime: "4:15 AM",
    market: "Moneyline",
    selection: "J. Kanera ML",
    line: "-",
    odds: "-145",
    confidence: 7.4,
    edge: "Volume Edge",
    risk: "Medium",
    reasoning: "Czech TT-Cup outlier. Kanera has won 80% of his matches when priced as a favorite in the early morning session. High liquidity market for overnight action.",
  },
  // PERSONAL PLAY - RECALCULATED for Roster Sync
  {
    id: "per-1",
    category: "PERSONAL_PLAY",
    sport: "NBA",
    game: "Dallas Mavericks vs. Oklahoma City Thunder",
    gameDate: "Today",
    gameTime: "8:00 PM",
    market: "Player Prop",
    selection: "Klay Thompson OVER 18.5 Pts",
    line: "18.5",
    odds: "+105",
    confidence: 9.2,
    edge: "Roster Verified",
    risk: "Low",
    reasoning: "First look at the Mavericks' new Big 3: Luka, Klay, and Kyrie. With Luka's gravity drawing double teams, Klay is projected to see 12+ catch-and-shoot opportunities tonight. Roster validated at 12:37 PM.",
    isPremium: true,
  },
  // HAILMARY (10, 15, 20)
  {
    id: "hm-1",
    category: "HAILMARY",
    sport: "Multi-Sport Mix",
    game: "10-Leg Cross-Sport Lotto",
    gameTime: "All Night",
    market: "Moneyline / Spreads",
    selection: "10-LEG PARLAY",
    line: "-",
    odds: "+4500",
    confidence: 6.0,
    edge: "High Variance",
    risk: "Extreme",
    reasoning: "10 legs crossing every sport on the board today. High risk, high reward.",
    legs: [
      "7:00 PM — Rangers ML", "7:00 PM — Hawks -0.5 1Q", "8:30 PM — Rockets -1.5 1H", "6:45 AM — Fiorentina ML", "9:00 PM — Tatum Over 6.5 1Q", 
      "8:00 PM — Luka Over 32.5 Pts", "10:00 PM — Clippers Over 58.5 1H", "4:30 AM — CFR Cluj ML", "6:45 AM — Under 2.5 Cremonese/Fiorentina", "2:00 PM — Vejle +0.25 AH"
    ]
  },
  {
    id: "hm-2",
    category: "HAILMARY",
    sport: "NBA & College Hoops",
    game: "15-Leg Court Sweeper",
    gameTime: "All Night",
    market: "Alt Props / Moneylines",
    selection: "15-LEG PARLAY",
    line: "-",
    odds: "+12500",
    confidence: 5.0,
    edge: "Lotto Edge",
    risk: "Extreme",
    reasoning: "15 legs strictly focused on basketball.",
    legs: [
      "7:00 PM — Hawks ML", "7:00 PM — Wizards +10.5", "7:30 PM — Knicks ML", "8:00 PM — Mavs/Pels Over 234", 
      "8:30 PM — Rockets +4.5", "9:00 PM — Celtics ML", "10:00 PM — Clippers ML", "7:00 PM — Magic +6.5",
      "7:30 PM — Cavs ML", "8:00 PM — Bucks ML", "8:30 PM — Spurs +12.5", "9:00 PM — Suns ML",
      "10:00 PM — Kings ML", "7:00 PM — Pacers ML", "7:30 PM — Heat ML"
    ]
  },
  {
    id: "hm-3",
    category: "HAILMARY",
    sport: "All-Sport Mega-Mix",
    game: "The 20-Leg Global Sweep",
    gameTime: "All Night",
    market: "Moneyline",
    selection: "20-LEG PARLAY",
    line: "-",
    odds: "+35000",
    confidence: 4.0,
    edge: "Moonshot",
    risk: "Absolute Max",
    reasoning: "The ultimate sweat. 20 legs.",
    legs: [
      "7:00 PM — Rangers ML", "9:00 PM — Tatum Over 6.5 1Q", "6:45 AM — Fiorentina ML", "7:00 AM — Krutykh ML",
      "10:00 AM — BTTS Brentford/Wolves", "2:00 PM — Vejle +0.25", "5:30 AM — BTTS Pogon/Korona", "4:30 AM — CFR Cluj ML",
      "7:00 PM — Hawks -0.5 1Q", "8:30 PM — Rockets -1.5 1H", "8:00 PM — Luka Over 32.5", "10:00 PM — Clippers ML",
      "7:30 PM — Heat ML", "3:00 PM — Dortmund ML", "2:45 PM — Inter Milan ML", "1:00 PM — Al Nassr ML",
      "9:30 AM — Jannik Sinner 2-0", "8:15 AM — Carlos Alcaraz ML", "11:00 PM — Dodgers ML", "11:30 PM — Mariners ML"
    ]
  },
  // OVERSEAS
  {
    id: "ovs-1",
    category: "OVERSEAS",
    sport: "Italy Serie A",
    game: "Cremonese vs. Fiorentina",
    gameTime: "6:45 AM",
    market: "Moneyline",
    selection: "Fiorentina ML",
    line: "-",
    odds: "-115",
    confidence: 9.0,
    edge: "Strong (+2.3%)",
    risk: "Low",
    reasoning: "Cremonese are winless in their last 14 Serie A matches.",
  },
  {
    id: "ovs-2",
    category: "OVERSEAS",
    sport: "Italy Serie A",
    game: "Cremonese vs. Fiorentina",
    gameTime: "6:45 AM",
    market: "Total Goals",
    selection: "UNDER 2.5 Goals",
    line: "2.5",
    odds: "-120",
    confidence: 8.6,
    edge: "Strong (+2.0%)",
    risk: "Low",
    reasoning: "Tactical, low-scoring football expected.",
  },
  {
    id: "ovs-3",
    category: "OVERSEAS",
    sport: "Denmark Superliga",
    game: "Silkeborg vs. Vejle",
    gameTime: "2:00 PM",
    market: "Asian Handicap",
    selection: "Vejle +0.25",
    line: "+0.25",
    odds: "-103",
    confidence: 7.8,
    edge: "Moderate (+1.4%)",
    risk: "Medium",
    reasoning: "Silkeborg are overpriced as home favorites.",
  },
  {
    id: "ovs-4",
    category: "OVERSEAS",
    sport: "Poland Ekstraklasa",
    game: "Pogon Szczecin vs. Korona Kielce",
    gameTime: "5:30 AM",
    market: "Both Teams To Score",
    selection: "YES (BTTS)",
    line: "-",
    odds: "-115",
    confidence: 7.5,
    edge: "Moderate (+1.3%)",
    risk: "Medium",
    reasoning: "Both sides have been involved in high-scoring games.",
  },
  {
    id: "ovs-5",
    category: "OVERSEAS",
    sport: "Romania Liga 1",
    game: "Universitatea Cluj vs. CFR Cluj",
    gameTime: "4:30 AM",
    market: "Moneyline",
    selection: "CFR Cluj ML",
    line: "-",
    odds: "-130",
    confidence: 7.6,
    edge: "Moderate (+1.5%)",
    risk: "Medium",
    reasoning: "CFR Cluj are the dominant club in Romanian football.",
  }
];

// Helper to filter by category
export const getPicksByCategory = (cat: PickCategory) => 
  PICK_REGISTRY.filter(p => p.category === cat);

// Derived exports for easier component consumption
export const hailmaryParlays = getPicksByCategory("HAILMARY");
export const tenDollarParlayPlan = getPicksByCategory("PARLAY_PLAN");
export const overseasPicks = getPicksByCategory("OVERSEAS");
export const overnightBets = getPicksByCategory("OVERNIGHT");

export interface AuditLogEntry {
  id: string;
  time: string;
  pick: string;
  action: "published" | "changed" | "removed";
  reason: string;
}

export const SIMULATED_AUDIT_LOG: AuditLogEntry[] = [
  {
    id: "log-4",
    time: "12:08 PM",
    pick: "Mavericks ML",
    action: "published",
    reason: "New market entry with +3.1% edge detected."
  },
  {
    id: "log-3",
    time: "11:41 AM",
    pick: "Warriors -4.5",
    action: "removed",
    reason: "Stephen Curry ruled OUT. Model confidence dropped to 42%."
  },
  {
    id: "log-2",
    time: "11:02 AM",
    pick: "Knicks vs. Celtics Over 221.5",
    action: "changed",
    reason: "Line moved to 219.5; re-validated for +1.8% edge."
  },
  {
    id: "log-1",
    time: "10:18 AM",
    pick: "Knicks vs. Celtics Over 221.5",
    action: "published",
    reason: "Initial board publication."
  }
];
