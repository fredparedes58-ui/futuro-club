/**
 * VITAS · Behavioral Profiling Engine — Types (Sprint 17)
 *
 * All types for the BPE module: events, profiles, detector outputs.
 * Consumed by Sprints 17-20 and optionally by Burnout (Sprint 21-23).
 */

// ─── Gesture Types ───────────────────────────────────────────────────────

export type GestureType =
  | "pointing"       // 1 arm extended >150°, >0.5s
  | "organizing"     // 2 arms >120°, dead ball
  | "clapping"       // wrists <15cm + rapid cycle
  | "frustration"    // both hands to head
  | "celebration"    // arms raised above shoulders
  | "calling_ball"   // 1 arm raised, palm open
  | "unknown";

export interface GestureEvent {
  trackId: number;
  gestureType: GestureType;
  startMs: number;
  endMs: number;
  durationMs: number;
  confidence: number;
  /** COCO-17 keypoint indices involved */
  keypointsUsed: number[];
}

// ─── Linked Event (output of TemporalEventLinker) ────────────────────────

export type ActionType =
  | "pass_short"
  | "pass_long"
  | "dribble"
  | "shot"
  | "cross"
  | "clearance"
  | "interception"
  | "reception"
  | "turn"
  | "unknown";

export type ActionOutcome =
  | "successful"
  | "failed"
  | "neutral";

export interface LinkedEvent {
  /** Player track ID */
  trackId: number;
  /** Frame ms when player receives/gains possession */
  receptionMs: number;
  /** Frame ms when player's posture/movement indicates decision made */
  decisionMs: number;
  /** Frame ms when action is executed (ball leaves foot) */
  executionMs: number;
  /** Type of action performed */
  actionType: ActionType;
  /** Outcome of the action */
  outcome: ActionOutcome;
  /** Pressure level at decision moment 0-100 */
  pressureLevel: number;
  /** Field position at reception (meters) */
  fieldPosition: { fx: number; fy: number } | null;
  /** Decision time in ms (decisionMs - receptionMs) */
  decisionTimeMs: number;
  /** Execution time in ms (executionMs - decisionMs) */
  executionTimeMs: number;
  /** Confidence of the linking (0-1) */
  confidence: number;
}

// ─── Pressure Context ────────────────────────────────────────────────────

export interface PressureContext {
  timestampMs: number;
  trackId: number;
  /** Number of opponents within 3 meters */
  rivalsWithin3m: number;
  /** Number of viable passing options */
  availableOptions: number;
  /** Time since gaining possession (ms) */
  possessionDurationMs: number;
  /** Combined pressure level 0-100 */
  combinedPressureLevel: number;
  /** Field zone (defensive/middle/attacking third) */
  fieldZone: "defensive" | "middle" | "attacking";
}

// ─── Decision Speed Profile ──────────────────────────────────────────────

export interface DecisionSpeedProfile {
  trackId: number;
  /** Average decision time in ms */
  avgMs: number;
  /** Median decision time in ms */
  medianMs: number;
  /** Average decision time under high pressure (>60) */
  avgMsUnderPressure: number;
  /** Average decision time under low pressure (<30) */
  avgMsLowPressure: number;
  /** Percentile for age group (0-100) */
  percentileForAge: number;
  /** Number of decisions analyzed */
  sampleCount: number;
  /** All individual decision times */
  decisions: Array<{
    decisionTimeMs: number;
    pressureLevel: number;
    outcome: ActionOutcome;
    actionType: ActionType;
  }>;
  /** Consistency (lower std deviation = more consistent) */
  consistencyScore: number;
}

// ─── Scan Correlation ────────────────────────────────────────────────────

export interface ScanCorrelation {
  /** LinkedEvent this correlation belongs to */
  eventReceptionMs: number;
  trackId: number;
  /** Number of scans in 10s window before reception */
  scansPreReception: number;
  /** Quality of decision following the scans */
  decisionQuality: ActionOutcome;
  /** Decision speed for this event */
  decisionTimeMs: number;
  /** Whether more scans correlated with better outcome */
  scanEffective: boolean;
}

// ─── Scanning Intelligence Profile ───────────────────────────────────────

export interface ScanningProfile {
  trackId: number;
  /** Average scans in 10s pre-reception window */
  avgScansPreReception: number;
  /** Ratio of effective scans (led to good decisions) */
  scanEffectiveness: number;
  /** Percentile for age group (0-100) */
  percentileForAge: number;
  /** Total scans analyzed */
  totalScans: number;
  /** Scan-decision correlations */
  correlations: ScanCorrelation[];
  /** Scan frequency per minute (overall) */
  scansPerMinute: number;
}

// ─── Composite types used across detectors ───────────────────────────────

export interface DetectorConfig {
  /** Tolerance for temporal alignment (±ms) — video from phone isn't frame-perfect */
  temporalToleranceMs: number;
  /** Minimum confidence threshold to include events */
  minConfidence: number;
  /** Player age for percentile lookups */
  playerAge: number;
}

export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  temporalToleranceMs: 200,
  minConfidence: 0.5,
  playerAge: 14,
};
