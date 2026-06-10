// PRE-PUBLISH PICK VERIFICATION
//
// Every pick the engine produces gets run through these checks BEFORE it
// reaches the customer-facing slate. If a check fails, the pick is either
// downgraded (problematic reason stripped) or rejected entirely.
//
// This is the integrity layer that catches:
//   - Hallucinated reasoning text containing "undefined" / "null" / "NaN"
//   - Empty or junk selection strings
//   - Confidence out of valid range
//   - Market-type-specific confidence caps being violated
//   - Picks with no odds attached
//   - Lines with raw "TBD" markers
//   - Reasoning strings claiming line-movement / sharp-money when the signal
//     data is null (Tempo-style hallucination)
//
// Owner directives 2026-06-03/04 that this enforces:
//   - "no pick on my site will be more than -300"
//   - "no hallucinated reasoning"
//   - "MLB runlines cap at 92"
//
// Returns:
//   - ok: true if pick passes all checks
//   - reasons: list of issues found (empty if ok)
//   - cleanedReasonsFor: reasonsFor with hallucinated entries removed
//   - cleanedReasonsAgainst: same for risks
//   - downgradedConfidence: capped confidence if violations were minor

export interface VerificationResult {
  ok: boolean;
  reject: boolean;          // true = drop this pick from the slate entirely
  reasons: string[];        // human-readable issues
  cleanedReasonsFor: string[];
  cleanedReasonsAgainst: string[];
  downgradedConfidence: number | null;  // null = no cap applied
}

// String patterns that ALWAYS mean the reasoning is broken.
const HALLUCINATION_MARKERS = /\b(undefined|NaN|null)\b/i;

// Sharp-money / public-betting phrases that require sharpIntel.betting data.
const REQUIRES_SHARP_DATA = /textbook reverse line movement|sharps agree|public is on the other side|sharp\/public divergence|public is \d+%/i;

// 2026-06-04 reasoning-vs-bet coherence patterns. The HOU TT Over 4 loss
// tonight had reasoning explicitly saying "expect this game to play in the low
// scoring range" while the bet was an Over. The engine swapped markets but the
// reasoning stack was still arguing the opposite direction. These regexes
// detect the most common bet/direction conflicts.
const LOW_SCORING_PHRASES = /\b(low[\s-]scoring|low total|expect.*under|projecting.*under|pitcher's duel|dominant arm|holds.*hitless|stifles?)\b/i;
const HIGH_SCORING_PHRASES = /\b(high[\s-]scoring|high total|expect.*over|projecting.*over|bullpen meltdown|hittable arm|crooked numbers?)\b/i;

// Returns true if `reason` argues for OVER while bet is UNDER (or vice versa)
// on a totals-family market.
function reasoningContradictsBet(pick: any, reason: string): boolean {
  if (!reason || !pick) return false;
  const market = String(pick.marketType || '').toLowerCase();
  const sel = String(pick.selection || '').toLowerCase();
  const isTotalsFamily = market.includes('total') || market.includes('over') || market.includes('under') ||
    /\b(over|under)\b/.test(sel) || /\bteam_total\b/.test(market) || /\bf5\b/.test(market);
  if (!isTotalsFamily) return false;
  const betDirection: 'over' | 'under' | null =
    /\bover\b/i.test(sel) ? 'over' : /\bunder\b/i.test(sel) ? 'under' : null;
  if (!betDirection) return false;
  if (betDirection === 'over' && LOW_SCORING_PHRASES.test(reason)) return true;
  if (betDirection === 'under' && HIGH_SCORING_PHRASES.test(reason)) return true;
  return false;
}

export function verifyPick(pick: any): VerificationResult {
  const result: VerificationResult = {
    ok: true, reject: false, reasons: [],
    cleanedReasonsFor: [],
    cleanedReasonsAgainst: [],
    downgradedConfidence: null,
  };

  // 1. Selection must be a real, non-empty string
  if (!pick?.selection || typeof pick.selection !== 'string' || pick.selection === 'undefined' || pick.selection.trim() === '') {
    result.reasons.push('selection is empty or invalid');
    result.reject = true;
    result.ok = false;
  }
  if (HALLUCINATION_MARKERS.test(pick?.selection || '')) {
    result.reasons.push(`selection contains hallucinated marker: "${pick.selection}"`);
    result.reject = true;
    result.ok = false;
  }

  // 2. Selection can't reference "TBD" line — book line wasn't available
  if (/\bTBD\b/i.test(pick?.selection || '')) {
    result.reasons.push(`selection references TBD line — book had no real price`);
    result.reject = true;
    result.ok = false;
  }

  // 3. Confidence in valid 0-100 range
  const conf = Number(pick?.confidenceScore || 0);
  if (!Number.isFinite(conf) || conf < 0 || conf > 100) {
    result.reasons.push(`confidence ${pick?.confidenceScore} out of 0-100 range`);
    result.downgradedConfidence = Math.max(0, Math.min(100, conf || 0));
    result.ok = false;
  }

  // 4. Market-type-specific confidence caps
  const market = String(pick?.marketType || '').toLowerCase();
  const league = String(pick?.league || '').toUpperCase();
  if (league === 'MLB' && market === 'spread' && conf > 92) {
    result.reasons.push(`MLB runline conf ${conf} exceeds 92 cap`);
    result.downgradedConfidence = 92;
    result.ok = false;
  }
  if (market === 'player_prop' && conf > 90) {
    result.reasons.push(`player prop conf ${conf} exceeds 90 cap`);
    result.downgradedConfidence = 90;
    result.ok = false;
  }

  // 5. Odds present (except for spread/total which can be implicit -110)
  if (market !== 'spread' && market !== 'total' && !pick?.odds) {
    result.reasons.push('missing odds');
    result.reject = true;
    result.ok = false;
  }

  // 6. Odds within sanity range
  if (pick?.odds) {
    const m = String(pick.odds).match(/[+-]?\d{2,4}/);
    if (m) {
      const oddsNum = Number(m[0]);
      if (oddsNum < -300) {
        result.reasons.push(`odds ${oddsNum} steeper than -300 floor`);
        result.reject = true;
        result.ok = false;
      }
      if (oddsNum > 5000) {
        // Suspicious high plus-odds — probably a long-shot prop that shouldn't ship
        result.reasons.push(`odds ${oddsNum} above sanity ceiling +5000`);
        result.reject = true;
        result.ok = false;
      }
    }
  }

  // 7. reasonsFor — filter out any line containing hallucination markers OR
  //    making sharp-money claims when sharpIntel data is missing.
  const sharpDataPresent = !!(pick?.sharpIntel?.betting && (
    pick.sharpIntel.betting.homeMoneyPct != null ||
    pick.sharpIntel.betting.awayMoneyPct != null ||
    pick.sharpIntel.betting.homeBetPct != null ||
    pick.sharpIntel.betting.awayBetPct != null
  ));
  let contradictionCount = 0;
  for (const r of (pick?.reasonsFor || [])) {
    if (typeof r !== 'string') continue;
    if (HALLUCINATION_MARKERS.test(r)) {
      result.reasons.push(`hallucinated reasonsFor stripped: "${r.slice(0, 80)}"`);
      result.ok = false;
      continue;
    }
    if (REQUIRES_SHARP_DATA.test(r) && !sharpDataPresent) {
      result.reasons.push(`unbacked sharp-money claim stripped: "${r.slice(0, 80)}"`);
      result.ok = false;
      continue;
    }
    if (reasoningContradictsBet(pick, r)) {
      result.reasons.push(`contradictory reasoning stripped (bet direction conflict): "${r.slice(0, 80)}"`);
      result.ok = false;
      contradictionCount++;
      continue;
    }
    result.cleanedReasonsFor.push(r);
  }
  // 2026-06-04: if MORE THAN HALF the reasonsFor were stripped as contradictory,
  // the pick itself is incoherent — reject entirely. One stray bullet might be
  // a wording quirk; a majority arguing the wrong direction means the engine
  // genuinely picked the wrong side of a totals market.
  const totalReasons = (pick?.reasonsFor || []).filter((r: any) => typeof r === 'string').length;
  if (totalReasons >= 2 && contradictionCount > totalReasons / 2) {
    result.reasons.push(`reject: ${contradictionCount}/${totalReasons} reasons argue opposite of bet direction`);
    result.reject = true;
    result.ok = false;
  }

  // 8. reasonsAgainst — same hallucination check
  for (const r of (pick?.reasonsAgainst || [])) {
    if (typeof r !== 'string') continue;
    if (HALLUCINATION_MARKERS.test(r)) {
      result.reasons.push(`hallucinated reasonsAgainst stripped: "${r.slice(0, 80)}"`);
      result.ok = false;
      continue;
    }
    result.cleanedReasonsAgainst.push(r);
  }

  return result;
}

// Filter a list of picks, returning only those that pass verification.
// Applies the cleanedReasonsFor/Against + downgradedConfidence in-place on
// picks that pass but had minor issues. Logs every rejection so we can post-mortem.
export function verifyAndCleanPicks(picks: any[]): any[] {
  const out: any[] = [];
  for (const p of picks) {
    const v = verifyPick(p);
    if (v.reject) {
      console.warn('[pickVerification] REJECTED:', p?.selection, '—', v.reasons.join('; '));
      continue;
    }
    // Apply cleaned reasoning + capped confidence to the pick
    const cleaned = {
      ...p,
      reasonsFor: v.cleanedReasonsFor,
      reasonsAgainst: v.cleanedReasonsAgainst,
      ...(v.downgradedConfidence != null ? { confidenceScore: v.downgradedConfidence } : {}),
    };
    if (!v.ok) {
      console.warn('[pickVerification] cleaned:', p?.selection, '—', v.reasons.join('; '));
    }
    out.push(cleaned);
  }
  return out;
}
