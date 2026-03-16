export interface SeasonContext {
  game_id: string;
  sport: string;
  league: string;
  season_year: string;
  season_phase: "preseason" | "regular_season" | "conference_tournament" | "postseason" | "play_in" | "playoffs" | "championship" | "offseason" | "unknown";
  round_name: string;
  week_or_stage: string;
  calendar_fit: boolean;
  season_confidence: number;
  reason_if_flagged: string;
}

export interface PreGameValidation {
  game_valid: boolean;
  sport: string;
  league: string;
  home_team: string;
  away_team: string;
  event_date_utc: string;
  display_time_local: string;
  status: "scheduled" | "live" | "final" | "postponed" | "canceled" | "invalid";
  season_context: SeasonContext | null;
  sources_checked: Array<{
    source: string;
    team_match: boolean;
    time_match: boolean;
    status_match: boolean;
    last_updated: string;
  }>;
  validation_score: number;
  reason_if_invalid: string;
  safe_to_publish: boolean;
  availability_check?: {
    player_name?: string;
    team?: string;
    status: "active" | "out" | "doubtful" | "uncertain" | "scratched";
    injury_report?: string;
    confirmed: boolean;
    last_updated: string;
  };
  lifecycle_state: "watching" | "validated" | "published" | "changed" | "removed" | "live" | "final" | "archived";
  freshness_audit: {
    last_checked_utc: string;
    data_status: "live" | "fresh" | "delayed" | "stale";
    monitoring_interval_mins: number;
    source_count: number;
  };
  change_log?: {
    original_selection?: string;
    reason_for_change: string;
    timestamp_utc: string;
  };
  verification_log: {
    timestamp_utc: string;
    status: "rechecked" | "validated" | "published" | "changed" | "removed";
    source: string;
    note: string;
  }[];
  engine_meta?: {
    heartbeat_utc: string;
    queue_position: number;
    active_monitors: string[];
  };
  edge_analysis?: {
    edge_value: number; // Percentage over market odds
    model_confidence: number; // 0-100 score
    threshold_met: boolean;
    price_efficiency: "efficient" | "undervalued" | "overvalued";
    risk_factors: string[];
    signals: {
      line_movement: "stable" | "favorable" | "reverse";
      roster_status: "verified" | "unconfirmed" | "critical_out";
      rest_advantage: "neutral" | "home_rested" | "away_fatigued";
    };
  };
  sanity_audit: {
    event_reality: boolean;
    time_sanity: boolean;
    roster_integrity: boolean;
    player_availability: boolean;
    market_validity: boolean;
    count_sync: boolean;
    honesty_check: boolean;
  };
}

export interface LiveGameTracking {
  game_id: string;
  status: "scheduled" | "live" | "halftime" | "final" | "postponed" | "canceled";
  league: string;
  sport: string;
  season_context: SeasonContext | null;
  start_time_utc: string;
  display_time_local: string;
  home_team: {
    name: string;
    score: number;
    is_winning: boolean;
    has_possession: boolean;
  };
  away_team: {
    name: string;
    score: number;
    is_winning: boolean;
    has_possession: boolean;
  };
  period: string; // e.g., "Q3", "H2", "Final"
  clock: string; // e.g., "12:00", "0:00"
  live_badge: boolean;
  last_play: string;
  play_by_play: Array<{
    timestamp: string;
    team: string;
    description: string;
    score_after_play: string;
  }>;
  team_stats: any;
  player_stats: any;
  last_updated: string;
  feed_health: "ok" | "delayed" | "down";
}
