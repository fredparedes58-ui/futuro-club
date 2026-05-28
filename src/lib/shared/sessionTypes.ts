/**
 * VITAS · Shared Session Types
 *
 * Types shared across Coaching Assistant, Behavioral Profiling,
 * and Burnout & Dropout Detection modules.
 *
 * Sprint 14: Initial creation (Coaching Assistant)
 * Sprint 15: Add SessionAnalysis, SessionRecommendation, ParentReport
 * Sprint 19: Add BehavioralScores
 * Sprint 21: Add Attendance, Overtraining, Wellbeing types
 */

// ─── Drill Category ────────────────────────────────────────────────────────

export type DrillCategory =
  | "rondo"
  | "possession"
  | "positional_play"
  | "small_sided_game"
  | "full_game"
  | "shooting_drill"
  | "pressing_drill"
  | "transition_drill"
  | "individual_technique"
  | "set_piece_practice"
  | "physical_conditioning"
  | "warmup"
  | "cooldown";

/** High-level segment type used by SessionSegmenter */
export type SegmentType =
  | "warmup"
  | "technical"
  | "tactical"
  | "physical"
  | "game_small_sided"
  | "game_full"
  | "cooldown"
  | "transition_break";

// ─── Training Segment (output of SessionSegmenter) ─────────────────────────

export interface TrainingSegment {
  segmentIndex: number;
  startMs: number;
  endMs: number;
  durationMin: number;
  type: SegmentType;

  /** Signals used to classify this segment */
  signals: {
    /** Average player spread in meters (compact = rondo, dispersed = game) */
    playerSpread: number;
    /** Average speed across all players (m/s) */
    avgSpeed: number;
    /** Ball touch frequency per minute */
    ballTouchFrequency: number;
    /** Number of players detected in segment */
    playerCount: number;
    /** Dominant movement pattern */
    movementPattern: "circular" | "linear" | "grid" | "free" | "static";
    /** Average intensity level */
    intensityLevel: "low" | "medium" | "high";
  };

  confidence: number;
}

// ─── Classified Drill (output of DrillClassifier) ──────────────────────────

export interface ClassifiedDrill {
  segmentIndex: number;
  category: DrillCategory;
  /** Sub-category like "rondo_4v2", "possession_6v6_3_zones" */
  subcategory: string;
  playerCount: number;
  /** Estimated playing format */
  estimatedFormat: string;
  /** Field area used in m² */
  spaceUsedM2: number;
  /** Percentage of time ball is in active play */
  ballInPlayPct: number;
  /** Matched drill from DRILLS_LIBRARY (null if no match) */
  matchedDrillId: string | null;

  /** Drill-specific metrics */
  metrics: {
    avgTouchesPerPlayer: number;
    avgPassesPerMinute: number;
    /** 0-100 pressing intensity */
    pressureIntensity: number;
    /** Attack↔defense transitions */
    transitionCount: number;
    goalAttempts: number;
  };

  confidence: number;
}

// ─── Player Drill Metrics (output of ParticipationTracker) ─────────────────

/** Metrics per player per drill — CRITICAL: feeds Burnout module in Sprint 21 */
export interface PlayerDrillMetrics {
  playerId: string;
  drillIndex: number;
  drillType: DrillCategory;
  /** Total ball touches in this drill */
  touches: number;
  /** Distance covered in meters */
  distanceM: number;
  /** Average speed in m/s */
  avgSpeedMs: number;
  /** Average intensity 0-100 */
  avgIntensity: number;
  /** Percentage of time idle (<0.5 m/s) */
  idlePct: number;
  /** Participation score 0-100 vs group median */
  participationScore: number;
  /** Distance to group centroid during pauses (meters) — proxy for social engagement */
  distanceToCentroidM: number;
  /** Scan count during this drill (from PoseAnalyzer) */
  scanCount: number;
}

/** Complete participation metrics for a player in a session */
export interface PlayerSessionParticipation {
  playerId: string;
  sessionId: string;
  /** Total touches across all drills */
  totalTouches: number;
  /** Touches per minute */
  touchesPerMinute: number;
  /** Percentage of time in active movement (>2 m/s) */
  activePct: number;
  /** Percentage of time idle (<0.5 m/s) */
  idlePct: number;
  /** Per-drill breakdown */
  perDrill: PlayerDrillMetrics[];
  /** Alerts generated for this player */
  alerts: ParticipationAlert[];
  /** Trend vs previous sessions (null if first session) */
  trendVsPrevious: {
    touchesDelta: number;
    intensityDelta: number;
    participationDelta: number;
  } | null;
}

export interface ParticipationAlert {
  type: "low_participation" | "high_idle" | "intensity_drop" | "excluded_from_drill";
  drillIndex: number;
  description: string;
  severity: "info" | "warning";
}

// ─── Engagement Snapshot (used by Coaching S15 and Burnout S21) ────────────

/** Engagement snapshot — calculated from PlayerDrillMetrics */
export interface EngagementSnapshot {
  playerId: string;
  sessionId: string;
  date: string;
  /** Physical engagement 0-100 (participation + intensity relative to own history) */
  physicalEngagement: number;
  /** Social engagement 0-100 (distance to centroid + interaction frequency) */
  socialEngagement: number;
  /** Emotional engagement 0-100 (posture energy + reaction to events) */
  emotionalEngagement: number;
  /** Composite engagement score 0-100 */
  engagementScore: number;
  /** Trend relative to last 4 sessions */
  engagementTrend: "rising" | "stable" | "declining";
  /** Rolling average of last 4 sessions */
  weeklyAvg: number;
}

// ─── Session Analysis (output of SessionAnalyzer, Sprint 15) ──────────────

export interface SessionBalance {
  actual: {
    technical: number;
    tactical: number;
    physical: number;
    game: number;
    warmupCooldown: number;
  };
  ideal: {
    technical: number;
    tactical: number;
    physical: number;
    game: number;
    warmupCooldown: number;
    label: string;
  };
  deviations: {
    technical: number;
    tactical: number;
    physical: number;
    game: number;
    warmupCooldown: number;
  };
  /** 0-100 how well the session matches LTAD ideal */
  overallScore: number;
}

export interface LoadAnalysis {
  sessionLoad: number;
  maxRecommendedLoad: number;
  loadPct: number;
  sessionDurationMin: number;
  maxRecommendedMinutes: number;
  durationPct: number;
  zone: "low" | "optimal" | "caution" | "overload";
  phvAdjusted: boolean;
  recommendation: string;
}

export interface PlayerHighlight {
  playerId: string;
  type: "top_performer" | "low_participation" | "high_touches" | "isolated";
  description: string;
  metric: number;
}

export interface SessionAnalysis {
  sessionDurationMin: number;
  segmentCount: number;
  drillCount: number;
  playerCount: number;
  balance: SessionBalance;
  loadAnalysis: LoadAnalysis;
  highlights: PlayerHighlight[];
  teamAvgAge: number;
  ltadPhase: string;
}

// ─── Session Recommendation (output of SessionRecommender, Sprint 15) ─────

export interface DrillSuggestion {
  drillId: string;
  drillName: string;
  reason: string;
  /** Which weakness or imbalance this addresses */
  addressesGap: string;
  durationMin: number;
  priority: "high" | "medium" | "low";
}

export interface WeeklySessionPlan {
  dayOfWeek: number; // 1=Monday ... 7=Sunday
  focus: string;
  suggestedDrills: DrillSuggestion[];
  totalMinutes: number;
  intensityLevel: "low" | "medium" | "high";
}

export interface SessionRecommendation {
  /** Key areas to improve based on session analysis */
  areasToImprove: string[];
  /** Drills suggested for next session */
  nextSessionDrills: DrillSuggestion[];
  /** Full weekly plan */
  weeklyPlan: WeeklySessionPlan[];
  /** Load adjustment recommendation */
  loadAdjustment: string;
  /** PHV-specific notes */
  phvNotes: string | null;
}

// ─── Parent Report (output of ParentReportGenerator, Sprint 15) ───────────

export interface ParentReport {
  playerId: string;
  playerName: string;
  reportMonth: string;
  /** Simple metrics parents can understand */
  summary: {
    sessionsAttended: number;
    totalTrainingMinutes: number;
    avgParticipationScore: number;
    avgEngagementScore: number;
  };
  /** Trend arrows for key areas */
  trends: {
    participation: "improving" | "stable" | "declining";
    technique: "improving" | "stable" | "declining";
    physical: "improving" | "stable" | "declining";
    social: "improving" | "stable" | "declining";
  };
  /** PHV context in plain language */
  growthContext: string | null;
  /** 3 positive things */
  positives: string[];
  /** 1-2 areas to develop (non-alarming language) */
  developmentAreas: string[];
  /** Coach's note */
  coachNote: string;
}

// ─── Behavioral Scores (output of BPE Sprint 19, input of Burnout Sprint 21)

/** Behavioral scores — output of Behavioral Profiling Engine */
export interface BehavioralScores {
  decisionSpeed: number;
  scanningIntelligence: number;
  resilience: number;
  clutchFactor: number;
  leadership: number;
  mentalFatigue: number;
  unpredictability: number;
  /** Weighted composite 0-100 */
  mentalComposite: number;
  archetype: string;
}
