/**
 * VITAS · Participation Tracker
 *
 * Calculates per-player metrics for each drill segment.
 * Output: PlayerDrillMetrics[] — the contract consumed by:
 *   - Coaching Assistant (Sprint 15: engagement calculator)
 *   - Burnout & Dropout Detection (Sprint 21: engagement tracker)
 *
 * CRITICAL: distanceToCentroidM is the proxy for social engagement
 * used by the Burnout module. Do not remove or rename.
 *
 * Sprint 14: Coaching Assistant — Segmentation & Metrics
 */

import type { Track, BallTrack, FieldPoint } from "@/lib/yolo/types";
import type {
  TrainingSegment,
  ClassifiedDrill,
  PlayerDrillMetrics,
  PlayerSessionParticipation,
  ParticipationAlert,
} from "@/lib/shared/sessionTypes";

// ─── Configuration ────────────────────────────────────────────────────────

export interface ParticipationConfig {
  /** Speed threshold for idle detection (m/s) (default: 0.5) */
  idleSpeedThreshold: number;
  /** Speed threshold for active movement (m/s) (default: 2.0) */
  activeSpeedThreshold: number;
  /** Proximity to ball for touch detection (meters) (default: 2.0) */
  ballTouchProximityM: number;
  /** Low participation threshold (0-100) (default: 30) */
  lowParticipationThreshold: number;
  /** High idle threshold (%) (default: 50) */
  highIdleThreshold: number;
  /** Intensity drop threshold vs group mean (%) (default: 30) */
  intensityDropThreshold: number;
}

const DEFAULT_CONFIG: ParticipationConfig = {
  idleSpeedThreshold: 0.5,
  activeSpeedThreshold: 2.0,
  ballTouchProximityM: 2.0,
  lowParticipationThreshold: 30,
  highIdleThreshold: 50,
  intensityDropThreshold: 30,
};

// ─── Ball Touch Estimation ────────────────────────────────────────────────

/**
 * Estimate ball touches per player by proximity to ball position.
 * A "touch" is counted when a player is within proximity threshold
 * of the ball AND the ball changes direction (proxy for interaction).
 */
function estimatePlayerTouches(
  track: Track,
  ballTrack: BallTrack | null,
  durationMin: number,
): number {
  if (!ballTrack || !ballTrack.trajectory || ballTrack.trajectory.length < 3) {
    // Fallback: estimate from track activity
    return Math.round(track.smoothSpeedMs * durationMin * 2);
  }

  let touches = 0;
  const trajectory = ballTrack.trajectory;

  for (let i = 1; i < trajectory.length - 1; i++) {
    const ballPos = trajectory[i];
    const playerPos = track.lastFieldPos;

    if (!playerPos || !ballPos.fx || !ballPos.fy) continue;

    // Check proximity
    const dx = playerPos.fx - ballPos.fx;
    const dy = playerPos.fy - ballPos.fy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > DEFAULT_CONFIG.ballTouchProximityM) continue;

    // Check ball direction change (proxy for touch)
    const prev = trajectory[i - 1];
    const next = trajectory[i + 1];

    const dx1 = ballPos.fx - prev.fx;
    const dy1 = ballPos.fy - prev.fy;
    const dx2 = next.fx - ballPos.fx;
    const dy2 = next.fy - ballPos.fy;

    const dot = dx1 * dx2 + dy1 * dy2;
    const mag1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const mag2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    // Direction change near player = touch
    if (mag1 > 0.3 && mag2 > 0.3 && dot < 0) {
      touches++;
    }
  }

  return touches;
}

// ─── Group Centroid ───────────────────────────────────────────────────────

/**
 * Calculate centroid of a group of field positions.
 */
function calculateCentroid(positions: FieldPoint[]): FieldPoint {
  if (positions.length === 0) return { fx: 0, fy: 0 };

  const cx = positions.reduce((s, p) => s + p.fx, 0) / positions.length;
  const cy = positions.reduce((s, p) => s + p.fy, 0) / positions.length;

  return { fx: cx, fy: cy };
}

/**
 * Calculate distance from a player to the group centroid.
 * Used as a proxy for social engagement — players who stay closer
 * to the group during pauses are considered more socially engaged.
 *
 * CRITICAL: This metric feeds directly into Burnout module (Sprint 21)
 */
function distanceToCentroid(
  playerPos: FieldPoint,
  centroid: FieldPoint,
): number {
  const dx = playerPos.fx - centroid.fx;
  const dy = playerPos.fy - centroid.fy;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── Intensity Calculation ────────────────────────────────────────────────

/**
 * Calculate intensity score (0-100) from speed and activity patterns.
 * Combines: speed relative to max, acceleration events, distance covered.
 */
function calculateIntensity(
  track: Track,
  groupAvgSpeed: number,
  durationMin: number,
): number {
  // Speed component (40% weight)
  const speedRatio = groupAvgSpeed > 0
    ? (track.smoothSpeedMs / groupAvgSpeed)
    : 0;
  const speedScore = Math.min(100, speedRatio * 50);

  // Distance component (30% weight)
  const expectedDistancePerMin = groupAvgSpeed * 60; // meters per minute
  const actualDistPerMin = durationMin > 0
    ? track.distanceM / durationMin
    : 0;
  const distanceRatio = expectedDistancePerMin > 0
    ? actualDistPerMin / expectedDistancePerMin
    : 0;
  const distanceScore = Math.min(100, distanceRatio * 50);

  // Sprint component (30% weight)
  const sprintScore = Math.min(100, track.sprintCount * 15);

  return Math.round(speedScore * 0.4 + distanceScore * 0.3 + sprintScore * 0.3);
}

// ─── Participation Score ──────────────────────────────────────────────────

/**
 * Calculate participation score (0-100) relative to group median.
 * Combines touches, distance, intensity, and idle time.
 */
function calculateParticipationScore(
  touches: number,
  distanceM: number,
  intensity: number,
  idlePct: number,
  medianTouches: number,
  medianDistance: number,
  medianIntensity: number,
): number {
  // Relative metrics vs median
  const touchRatio = medianTouches > 0 ? touches / medianTouches : 1;
  const distRatio = medianDistance > 0 ? distanceM / medianDistance : 1;
  const intensityRatio = medianIntensity > 0 ? intensity / medianIntensity : 1;
  const idlePenalty = Math.max(0, 1 - idlePct / 100);

  // Weighted combination
  const raw =
    touchRatio * 0.30 +
    distRatio * 0.25 +
    intensityRatio * 0.25 +
    idlePenalty * 0.20;

  // Normalize to 0-100 (raw ~1.0 = median → ~60 score)
  return Math.round(Math.min(100, Math.max(0, raw * 60)));
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ─── Main Tracker ─────────────────────────────────────────────────────────

export interface ParticipationInput {
  /** Classified drills from DrillClassifier */
  drills: ClassifiedDrill[];
  /** Training segments from SessionSegmenter */
  segments: TrainingSegment[];
  /** Track snapshots per segment (index-aligned with segments) */
  segmentTracks: Track[][];
  /** Ball tracker data */
  ballTrack: BallTrack | null;
  /** Scan counts per track ID (from PoseAnalyzer.getTrackScanCount) */
  scanCountsByTrackId?: Map<number, number>;
}

/**
 * Calculate per-player metrics for each drill in the session.
 *
 * For each segment:
 * 1. Identify active players from tracks
 * 2. Estimate touches, distance, speed, intensity per player
 * 3. Calculate idle% and participation score vs group median
 * 4. Measure distance to group centroid (social engagement proxy)
 * 5. Generate alerts for concerning patterns
 */
export function trackParticipation(
  input: ParticipationInput,
  configOverrides?: Partial<ParticipationConfig>,
): PlayerDrillMetrics[] {
  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const { drills, segments, segmentTracks, ballTrack, scanCountsByTrackId } = input;

  const allMetrics: PlayerDrillMetrics[] = [];

  for (let drillIdx = 0; drillIdx < drills.length; drillIdx++) {
    const drill = drills[drillIdx];
    const segment = segments[drill.segmentIndex];
    const tracks = segmentTracks[drill.segmentIndex] ?? [];

    if (!segment || tracks.length === 0) continue;

    const durationMin = segment.durationMin;

    // Filter active tracks (visible, with field position)
    const activeTracks = tracks.filter(
      (t) => t.lastFieldPos !== null && t.age === 0,
    );

    if (activeTracks.length === 0) continue;

    // ── Step 1: Calculate raw metrics per player ──

    const rawMetrics = activeTracks.map((track) => {
      const touches = estimatePlayerTouches(track, ballTrack, durationMin);

      const idlePct =
        track.smoothSpeedMs < config.idleSpeedThreshold ? 100 : 0;

      const groupAvgSpeed =
        activeTracks.reduce((s, t) => s + t.smoothSpeedMs, 0) /
        activeTracks.length;

      const intensity = calculateIntensity(track, groupAvgSpeed, durationMin);

      return {
        track,
        touches,
        distanceM: track.distanceM,
        avgSpeedMs: track.smoothSpeedMs,
        intensity,
        idlePct,
      };
    });

    // ── Step 2: Calculate medians for participation scoring ──

    const medianTouches = median(rawMetrics.map((m) => m.touches));
    const medianDistance = median(rawMetrics.map((m) => m.distanceM));
    const medianIntensity = median(rawMetrics.map((m) => m.intensity));

    // ── Step 3: Calculate group centroid for social engagement ──

    const fieldPositions = activeTracks
      .filter((t) => t.lastFieldPos)
      .map((t) => t.lastFieldPos as FieldPoint);
    const centroid = calculateCentroid(fieldPositions);

    // ── Step 4: Build PlayerDrillMetrics ──

    for (const raw of rawMetrics) {
      const participationScore = calculateParticipationScore(
        raw.touches,
        raw.distanceM,
        raw.intensity,
        raw.idlePct,
        medianTouches,
        medianDistance,
        medianIntensity,
      );

      const playerPos = raw.track.lastFieldPos as FieldPoint;
      const distToCentroid = playerPos
        ? distanceToCentroid(playerPos, centroid)
        : 0;

      // Use stableId if available, fallback to track id
      const playerId = raw.track.stableId ?? `track_${raw.track.id}`;

      // Get scan count from PoseAnalyzer if available
      const scanCount = scanCountsByTrackId?.get(raw.track.id) ?? 0;

      allMetrics.push({
        playerId,
        drillIndex: drillIdx,
        drillType: drill.category,
        touches: raw.touches,
        distanceM: Math.round(raw.distanceM * 10) / 10,
        avgSpeedMs: Math.round(raw.avgSpeedMs * 100) / 100,
        avgIntensity: raw.intensity,
        idlePct: Math.round(raw.idlePct * 10) / 10,
        participationScore,
        distanceToCentroidM: Math.round(distToCentroid * 10) / 10,
        scanCount,
      });
    }
  }

  return allMetrics;
}

// ─── Session-Level Aggregation ────────────────────────────────────────────

/**
 * Aggregate per-drill metrics into session-level participation.
 * Groups by playerId, calculates session totals and trends.
 */
export function aggregateSessionParticipation(
  drillMetrics: PlayerDrillMetrics[],
  sessionId: string,
  sessionDurationMin: number,
  previousSession?: PlayerSessionParticipation | null,
): PlayerSessionParticipation[] {
  // Group metrics by player
  const byPlayer = new Map<string, PlayerDrillMetrics[]>();

  for (const m of drillMetrics) {
    const existing = byPlayer.get(m.playerId) ?? [];
    existing.push(m);
    byPlayer.set(m.playerId, existing);
  }

  const results: PlayerSessionParticipation[] = [];

  for (const [playerId, metrics] of byPlayer) {
    const totalTouches = metrics.reduce((s, m) => s + m.touches, 0);
    const touchesPerMinute =
      sessionDurationMin > 0 ? totalTouches / sessionDurationMin : 0;

    // Activity percentages across all drills
    const totalDrills = metrics.length;
    const activeCount = metrics.filter(
      (m) => m.avgSpeedMs >= DEFAULT_CONFIG.activeSpeedThreshold,
    ).length;
    const idleCount = metrics.filter(
      (m) => m.idlePct > DEFAULT_CONFIG.highIdleThreshold,
    ).length;

    const activePct = totalDrills > 0 ? (activeCount / totalDrills) * 100 : 0;
    const idlePct = totalDrills > 0 ? (idleCount / totalDrills) * 100 : 0;

    // Generate alerts
    const alerts = generateAlerts(metrics, DEFAULT_CONFIG);

    // Trend vs previous session
    let trendVsPrevious: PlayerSessionParticipation["trendVsPrevious"] = null;
    if (previousSession) {
      trendVsPrevious = {
        touchesDelta: totalTouches - previousSession.totalTouches,
        intensityDelta:
          (metrics.reduce((s, m) => s + m.avgIntensity, 0) / totalDrills || 0) -
          (previousSession.perDrill.reduce((s, m) => s + m.avgIntensity, 0) /
            (previousSession.perDrill.length || 1)),
        participationDelta:
          (metrics.reduce((s, m) => s + m.participationScore, 0) /
            totalDrills || 0) -
          (previousSession.perDrill.reduce(
            (s, m) => s + m.participationScore,
            0,
          ) / (previousSession.perDrill.length || 1)),
      };
    }

    results.push({
      playerId,
      sessionId,
      totalTouches,
      touchesPerMinute: Math.round(touchesPerMinute * 10) / 10,
      activePct: Math.round(activePct),
      idlePct: Math.round(idlePct),
      perDrill: metrics,
      alerts,
      trendVsPrevious,
    });
  }

  return results;
}

// ─── Alert Generation ─────────────────────────────────────────────────────

function generateAlerts(
  metrics: PlayerDrillMetrics[],
  config: ParticipationConfig,
): ParticipationAlert[] {
  const alerts: ParticipationAlert[] = [];

  for (const m of metrics) {
    // Low participation
    if (m.participationScore < config.lowParticipationThreshold) {
      alerts.push({
        type: "low_participation",
        drillIndex: m.drillIndex,
        description: `Participación baja en ejercicio ${m.drillIndex + 1}: score ${m.participationScore}/100`,
        severity: m.participationScore < 15 ? "warning" : "info",
      });
    }

    // High idle time
    if (m.idlePct > config.highIdleThreshold) {
      alerts.push({
        type: "high_idle",
        drillIndex: m.drillIndex,
        description: `Tiempo inactivo alto en ejercicio ${m.drillIndex + 1}: ${Math.round(m.idlePct)}%`,
        severity: "warning",
      });
    }

    // Intensity drop (vs group — estimated by comparing to avg)
    const groupAvgIntensity =
      metrics.reduce((s, x) => s + x.avgIntensity, 0) / metrics.length;
    if (
      groupAvgIntensity > 0 &&
      m.avgIntensity < groupAvgIntensity * (1 - config.intensityDropThreshold / 100)
    ) {
      alerts.push({
        type: "intensity_drop",
        drillIndex: m.drillIndex,
        description: `Intensidad por debajo del grupo en ejercicio ${m.drillIndex + 1}: ${m.avgIntensity} vs media ${Math.round(groupAvgIntensity)}`,
        severity: "info",
      });
    }

    // Excluded from drill (very low touches + high distance to centroid)
    if (m.touches < 2 && m.distanceToCentroidM > 15) {
      alerts.push({
        type: "excluded_from_drill",
        drillIndex: m.drillIndex,
        description: `Posible exclusión del ejercicio ${m.drillIndex + 1}: sin toques y alejado del grupo`,
        severity: "warning",
      });
    }
  }

  return alerts;
}
