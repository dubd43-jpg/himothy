# AGENT_HANDOFF

Running log of significant changes. Newest at the top. Format per entry:

```
## YYYY-MM-DD — short title
What changed (concrete file paths or feature names).
Why (one sentence).
Pending / blocked (if anything).
```

Conventions: dates are absolute (not "yesterday"). Update this file at the end of any session that touched real code. See [Site Standards/SITE_STANDARDS_FOR_AGENTS.csv](../Site Standards/SITE_STANDARDS_FOR_AGENTS.csv) for the rules this handoff supports.

---

## 2026-05-27 — Site standards integration, voice + SEO scrub, AGENT_HANDOFF.md created
- Saved [reference-site-standards](../../.claude/projects/-Users-dubd-Library-CloudStorage-GoogleDrive-rentalsgradea-gmail-com-My-Drive-Himothy/memory/reference-site-standards.md) + [feedback-site-standards-do-and-dont](../../.claude/projects/-Users-dubd-Library-CloudStorage-GoogleDrive-rentalsgradea-gmail-com-My-Drive-Himothy/memory/feedback-site-standards-do-and-dont.md) memories so every future session enforces the rules from `Site Standards/SITE_STANDARDS_FOR_AGENTS.csv`.
- Voice scrub: removed "unlock" (twice) on [src/app/pricing/page.tsx](../src/app/pricing/page.tsx).
- Title trim: [src/app/missouri-sports-picks/page.tsx](../src/app/missouri-sports-picks/page.tsx) 61c → 51c.
- Meta description trims to 155-160 hard cap on 15 pages (picks, nba, wnba-props, kbo, value, mlb, ncaab, trends, sports-picks-today, asleep, missouri, edges, mlb-f5, stats, best-parlay).
- Fixed inaccurate trends meta: was "65%+ over last 10–20" → now "70%+ over last 10" (matches the trends-page UI which only renders L10 because closing-line data only spans 10 games).
- Created this handoff doc.
- Why: user asked all standards from CSV applied to HIMOTHY.

## 2026-05-27 — Confidence engine overhaul
- [src/services/deepResearchService.ts](../src/services/deepResearchService.ts): refactored Grand Slam to "top pick of day, score ≥88, no conflict, no key injury." Pure confidence ranking; no extra hoops on top of the score.
- Recency-weighted ATS: replaced single-season ATS with 40% L5 + 40% L10 + 20% season blend (sample-gated). New `weightedAtsCoverPct()` helper.
- Tennis frozen-slate fix: removed `state === 'post'` filter from both inline tennis flattener and shared `flattenTournamentEvents()`. Tennis matches play overnight EU time so by US evening every match is `post`; previous filter emptied the tennis board every day.
- DQ cap re-applied after asleep-league multiplier so low-DQ picks (tennis, KBO) can't sneak past tiers they didn't earn.
- Live on [himothypicks.com](https://himothypicks.com); GitHub at commit `70b5cd5` on `main`.

## 2026-05-27 — Cross-sport parlay + thin-slate backfill
- "Power 20" renamed to "Power of Parlays" (11-20 legs required). Power 10 requires 7-10 legs.
- Parlay excludes any game already on the exclusive cards (gameId-level exclusion). Currently TOO strict on thin slates — flagged as known issue, not yet fixed.
- Backfill cascade ensures Pressure Pack always = 2, VIP 4-Pack always = 4, Parlay Plan up to 6.
- Tennis/MMA tournament-shape flattening now applies inside `runPower20Research` via shared `flattenTournamentEvents()`.

## 2026-05-27 — Hard Rock pick-card button (search-URL, swap for affiliate later)
- New [src/lib/hardRock.ts](../src/lib/hardRock.ts) — `buildHardRockUrl()` helper. Currently builds a search URL with team names + sport hint.
- Wired into [PickCard.tsx](../src/components/PickCard.tsx), [SmartPickCard.tsx](../src/components/SmartPickCard.tsx), and the [pick detail page](../src/app/pick/[gameId]/page.tsx) as "Bet on Hard Rock" CTA.
- Pending: user is signing up for the Hard Rock affiliate program. When their tracking code is in, swap `HARD_ROCK_BASE` and add the affiliate param. See [project-hardrock-affiliate](../../.claude/projects/-Users-dubd-Library-CloudStorage-GoogleDrive-rentalsgradea-gmail-com-My-Drive-Himothy/memory/project-hardrock-affiliate.md).

## 2026-05-27 — Audit log + admin endpoint
- [src/services/pickAuditLog.ts](../src/services/pickAuditLog.ts) — append-only `PickAuditLog` table tracking every state change (GENERATED, RECORDED, GRADED, SKIPPED, ERROR).
- Admin query endpoint at [/api/admin/audit-log/route.ts](../src/app/api/admin/audit-log/route.ts).
- `recordBoardService.ts` now logs every skipped pick with reason (fixes "Cleveland win disappeared" gap).
- `pickRegistryService.gradeRegistryBoard` writes GRADED audit events with cover margin + CLV delta.

## 2026-05-27 — Stripe + entitlements
- 6-product catalog ([src/lib/products.ts](../src/lib/products.ts)) with day/week/month/year intervals.
- Stripe service ([src/services/stripeService.ts](../src/services/stripeService.ts)) — checkout, customer portal, webhook handler, 3-layer trial abuse prevention.
- 14-day card-required trial; day-restricted sampler (Pressure Pack days 1-2, then VIP/Power 20/10 days 3-14).
- HIMOTHY Personal Pick excluded from trials.
- Yearly perks gate ([src/components/YearlyMemberGate.tsx](../src/components/YearlyMemberGate.tsx)) — wraps Trends / Edges / Asleep for non-subscribers.

## Pending / queued
- HIMOTHY Personal Pick cross-sport best-prop scanner (product exists in catalog, engine not built).
- Add O/U signal weight for totals picks (currently zero credit for `ou10` on Over/Under selections).
- Reward ATS divergence vs. market (not confirmation) so chalk-with-hot-ATS doesn't double-count edge that's already priced in.
- Wire devigged fair probabilities from [oddsApiService](../src/services/oddsApiService.ts) into win-prob signals instead of ESPN's juiced ML.
- CLV feedback loop — `pickRegistryService` captures CLV but engine doesn't learn from it. Calibrate tier thresholds against actual hit rates monthly.
- Hard Rock affiliate URL swap (waiting on user signup at hardrockaffiliates.com).
