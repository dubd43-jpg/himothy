# HIMOTHY Execution Roadmap

Date: 2026-04-20

Goal: move from a trustworthy tracking system to a professional, sustainable edge engine.

## Success Definition

A month is considered operationally successful when all are true:

1. Data integrity
- 0 fake events, 0 unverified markets published.
- 100% published picks have deterministic grading path.

2. Process discipline
- 100% publish/lock/grade actions pass coordination guard.
- 100% lifecycle transitions are change-logged with reason and actor.

3. Edge quality
- CLV beat rate >= 52% on tracked markets (rolling 30 days).
- Model calibration error below threshold (defined in Phase 3).

4. Risk control
- Auto-defensive mode triggers on losing stretches with no manual override required.
- Market/sport pauses execute automatically when trigger conditions are met.

## Priority Queue (by EV impact)

P0 (Do first)
1. Direct multi-book odds adapters (DK/FD/BMGM/Caesars/Hard Rock).
2. Deterministic grading expansion for all publishable market families.
3. Always-on scheduler for refresh/research/grading (not traffic-dependent).

P1 (Do next)
1. Player injury/availability feed with freshness and confidence thresholds.
2. Market-specific modeling (spreads, totals, moneyline, props separated).
3. True CLV pipeline: open-mid-close snapshots per book.

P2 (Scale + sharpen)
1. Calibration and drift monitors.
2. Portfolio-level risk and sizing engine.
3. Adversarial adaptation and release randomization.

## Phase 1: Data and Execution Foundations (Week 1-2)

### Deliverables

1. Odds Integration Layer
- Build provider adapters for each sportsbook feed.
- Normalize market schema: eventId, marketType, selection, line, price, timestamp, book.
- Add cross-book reconciliation and stale-source suppression.

2. Freshness and Source Trust
- Hard freshness gate by source type.
- Per-book health score and auto-failover.
- Publish blocked if no trusted source quorum.

3. Scheduler
- Add periodic jobs for:
  - odds refresh (60-120s)
  - injury refresh (2-5m)
  - research refresh (2-5m)
  - grading sweep (2-5m)
- Jobs must run even with zero user traffic.

4. Deterministic Grading Scope
- Expand grading logic beyond moneyline/spread/total to each publishable market.
- Add explicit "publishable market registry" so unsupported markets are blocked pre-publish.

### Acceptance Criteria

1. At least 3 books active for primary sports before first publish window.
2. 0 published picks with unknown grading logic.
3. Scheduler heartbeat visible in monitoring every 5 minutes max gap.
4. If 2+ books stale or missing, publish is blocked with explicit reason.

## Phase 2: Modeling and Signal Quality (Week 3-4)

### Deliverables

1. Market-Specific Models
- Separate model pipelines for:
  - spread
  - total
  - moneyline
  - player props
- Distinct feature sets and thresholds per pipeline.

2. Signal Weighting 2.0
- Replace static heuristics with learned, regularized weights.
- Add recency decay and sample-size confidence penalties.
- Remove synthetic split assumptions unless backed by real feed.

3. CLV and Microstructure
- Store open, mid, close for each market/book.
- Add movement velocity and acceleration features.
- Add hold/no-vig conversion and fair-price baseline.

4. Feature Expansion
- Player-level availability confidence.
- Team-level travel/rest compression.
- Liquidity proxy and line stability score.

### Acceptance Criteria

1. Confidence bins calibrated (expected vs actual) with max absolute error <= 5 points in top bins.
2. CLV beat rate >= 50% for each enabled primary market family over 200+ bets.
3. Model outputs include explainable feature contribution snapshots.
4. Any feature feed outage degrades gracefully and tightens thresholds automatically.

## Phase 3: Adaptive Risk Governance (Week 5)

### Deliverables

1. Losing-Stretch Governance
- Tightened mode trigger:
  - rolling 7d units <= -3 OR win rate <= 47% OR CLV beat < 50% with 30+ tracked.
- Defensive mode trigger:
  - rolling 14d units <= -7 OR win rate <= 44% OR CLV beat < 47% with 50+ tracked.
- Hard pause trigger:
  - rolling 21d negative units + CLV beat < 45%.

2. Auto Actions per Mode
- Tightened:
  - edge threshold +5
  - volume -35%
  - disable weakest market family
- Defensive:
  - edge threshold +10
  - disable props/alt-lines
  - only top-tier sports enabled
- Hard pause:
  - pause affected sport-market 24-72h
  - mandatory postmortem record

3. Portfolio Controls
- Correlation limiter across same-game/same-signal picks.
- Position sizing caps by market volatility class.

### Acceptance Criteria

1. Mode transitions happen automatically and are logged.
2. No publishes violate active mode constraints.
3. Correlated exposure cap breaches are prevented before publish.

## Phase 4: Professionalization and Anti-Adaptation (Week 6)

### Deliverables

1. Shadow Models and A/B Validation
- Run challenger models in parallel.
- Promote changes only after out-of-sample lift and CLV improvement.

2. Release Strategy Hardening
- Randomized release windows in safe bounds.
- Book-routing strategy to reduce predictability.

3. Ops Playbooks
- Incident playbook for feed outages.
- Daily pregame readiness checklist auto-generated.
- Weekly model governance report with rollback status.

### Acceptance Criteria

1. Every model update has before/after performance report.
2. Rollback to previous stable model in < 15 minutes.
3. No single feed outage causes silent bad publish.

## Automation Matrix (Must be automatic)

Always automatic
1. Feed refresh, health checks, retries, failover.
2. Publish gating, lock checks, grading idempotency.
3. Daily finalization and lifetime aggregation.
4. Drift detection, mode changes, market pauses.
5. Change logging with actor/reason/timestamp.

Never manual
1. Result grading edits for locked picks (except audited correction flow).
2. Threshold overrides during defensive/hard-pause mode.
3. History deletion or hidden loss handling.

Human-required
1. Enabling new market families.
2. Model promotion decisions after report review.
3. Correction approvals for rare settlement disputes.

## Technical Worklist (Concrete)

1. Add odds provider interfaces and adapters in services layer.
2. Add canonical market registry table with publishability + grading strategy.
3. Add scheduled jobs endpoint or worker process.
4. Add CLV snapshots table by book and timestamp.
5. Add calibration metrics table and drift monitor.
6. Add mode-state persistence and enforcement middleware.
7. Add incident and correction workflows with audit trails.

## KPI Dashboard (Daily)

1. Published picks, settled picks, pending picks.
2. Win rate, units, ROI by market and sport.
3. CLV beat rate by market and sport.
4. Feed health by source and stale count.
5. Defensive/tightened mode status and trigger reason.
6. Publish rejections by cause (stale odds, unsupported market, lock violation).

## Immediate Next 72 Hours

Day 1
1. Implement multi-book adapter interfaces and one live provider end-to-end.
2. Build publishable-market registry and block unsupported markets.

Day 2
1. Add scheduler heartbeat and guaranteed refresh jobs.
2. Add CLV open-mid-close storage for primary markets.

Day 3
1. Ship tightened/defensive/hard-pause auto-governance.
2. Add dashboard panels for mode state and feed health.

## Final Note

Current system is strong on trust ledger and coordination. This roadmap is focused on converting that trust foundation into repeatable market edge and risk-managed profitability.
