/**
 * VITAS · Hybrid Analysis Pipeline
 *
 * Combines YOLO (multi-player detection) + MediaPipe (per-player pose analysis)
 * into a single unified pipeline that feeds all downstream systems.
 *
 * Architecture:
 *   Video Frame
 *     ├── YOLO (existing tracker.ts)
 *     │    └── Detects ALL players → bounding boxes + basic COCO-17 keypoints
 *     │
 *     └── MediaPipe Pose Landmarker
 *          └── Analyzes FOCUS player → 33 keypoints + 3D world landmarks
 *               ├── keypointMapper → COCO-17 (high quality, replaces YOLO kps)
 *               ├── keypointMapper → Joint angles (3D)
 *               ├── biomechanicsEngine → DrillScore
 *               └── feetPosition → homography → field coverage
 *
 * Why hybrid?
 *   - YOLO alone: detects everyone but poor pose quality (17 kps, 2D only)
 *   - MediaPipe alone: excellent pose but processes 1-4 persons
 *   - Hybrid: YOLO for "where is everyone" + MediaPipe for "what is focus player doing"
 *
 * This pipeline produces a TrackingSnapshot compatible with the existing
 * AdvancedMetricsPanel, eliminating the STUBs for Cobertura and DrillScore.
 */

import type { Track, PhysicalMetrics, ScanEvent, DuelEvent, IntensityZones } from "@/lib/yolo/types";
import type { MappedPoseFrame } from "./keypointMapper";
import type { BiomechanicsScore } from "./biomechanicsEngine";
import type { TrackingSnapshot } from "@/services/real/playerTrackingService";
import { mapPoseFrame } from "./keypointMapper";
import { BiomechanicsAnalyzer } from "./biomechanicsEngine";
import { PoseAnalyzer } from "@/lib/yolo/poseAnalyzer";
import { pixelToField } from "@/lib/yolo/homography";
import type { MultiPoseResult } from "./mediaPipeService";

/* ── Types ─────────────────────────────────────────────────────── */

export interface HybridFrameResult {
  /** Frame index */
  frameIndex: number;
  /** Timestamp in ms */
  timestampMs: number;
  /** All YOLO tracks (multi-player) */
  tracks: Track[];
  /** MediaPipe pose for focus player (high quality) */
  focusPose: MappedPoseFrame | null;
  /** Focus player field position (from homography) */
  focusFieldPosition: { fx: number; fy: number } | null;
  /** Scan events detected this frame */
  scanEvents: ScanEvent[];
  /** Duel events detected this frame */
  duelEvents: DuelEvent[];
}

export interface HybridSessionResult {
  /** Duration in seconds */
  durationSec: number;
  /** Total frames processed */
  totalFrames: number;
  /** Physical metrics for focus player */
  physicalMetrics: PhysicalMetrics;
  /** Biomechanics score from MediaPipe */
  biomechanics: BiomechanicsScore;
  /** All scan events */
  scanEvents: ScanEvent[];
  /** All duel events */
  duelEvents: DuelEvent[];
  /** Focus player positions (for heatmap) */
  focusPositions: Array<{ fx: number; fy: number; tMs: number }>;
  /** Track count */
  tracksCount: number;
  /** Focus track ID */
  focusTrackId: number;
  /** Processing FPS achieved */
  processingFps: number;
}

/* ── Hybrid Pipeline ───────────────────────────────────────────── */

export class HybridPipeline {
  private poseAnalyzer = new PoseAnalyzer();
  private biomechanicsAnalyzer = new BiomechanicsAnalyzer();

  // Accumulated data
  private scanEvents: ScanEvent[] = [];
  private duelEvents: DuelEvent[] = [];
  private focusPositions: Array<{ fx: number; fy: number; tMs: number }> = [];
  private speeds: number[] = [];
  private distances: number[] = [];
  private sprintCount = 0;
  private maxSpeed = 0;
  private intensityZones: IntensityZones = { walk: 0, jog: 0, run: 0, sprint: 0 };
  private tracksSeenCount = 0;
  private focusTrackId = 0;
  private startTimeMs = 0;
  private lastTimeMs = 0;
  private lastFieldPos: { fx: number; fy: number } | null = null;
  private frameCount = 0;
  private voronoiAreas: number[] = [];

  /** Homography matrix for pixel → field coordinate transform */
  private homography: Float64Array | null = null;

  /** Set homography matrix (from calibration) */
  setHomography(H: Float64Array): void {
    this.homography = H;
  }

  /** Set focus track ID */
  setFocusTrack(trackId: number): void {
    this.focusTrackId = trackId;
  }

  /**
   * Process one frame with hybrid analysis.
   *
   * @param tracks - YOLO tracks for all players (from existing tracker)
   * @param mediaPipeResult - MediaPipe result for focus player crop
   * @param videoWidth - Video width in pixels
   * @param videoHeight - Video height in pixels
   * @param timestampMs - Frame timestamp
   * @param fps - Video FPS (for timing calculations)
   */
  processFrame(
    tracks: Track[],
    mediaPipeResult: MultiPoseResult | null,
    videoWidth: number,
    videoHeight: number,
    timestampMs: number,
    fps: number,
  ): HybridFrameResult {
    if (this.frameCount === 0) {
      this.startTimeMs = timestampMs;
    }
    this.lastTimeMs = timestampMs;
    this.frameCount++;
    this.tracksSeenCount = Math.max(this.tracksSeenCount, tracks.length);

    // 1. Process MediaPipe pose for focus player
    let focusPose: MappedPoseFrame | null = null;
    let focusFieldPosition: { fx: number; fy: number } | null = null;

    if (mediaPipeResult && mediaPipeResult.persons.length > 0) {
      const primaryPerson = mediaPipeResult.persons[0];

      focusPose = mapPoseFrame(
        primaryPerson.landmarks,
        primaryPerson.worldLandmarks,
        videoWidth,
        videoHeight,
      );

      // Feed joint angles to biomechanics analyzer
      this.biomechanicsAnalyzer.addFrame(focusPose.jointAngles);

      // Calculate field position from foot keypoint + homography
      if (this.homography) {
        const foot = focusPose.feetPosition.best;
        const fieldPos = pixelToField(this.homography, foot.x, foot.y);
        focusFieldPosition = { fx: fieldPos.fx, fy: fieldPos.fy };

        // Track position history
        this.focusPositions.push({
          fx: fieldPos.fx,
          fy: fieldPos.fy,
          tMs: timestampMs,
        });

        // Calculate speed from position change
        if (this.lastFieldPos) {
          const dt = (timestampMs - (this.focusPositions.length > 1
            ? this.focusPositions[this.focusPositions.length - 2].tMs
            : timestampMs)) / 1000;

          if (dt > 0) {
            const dx = fieldPos.fx - this.lastFieldPos.fx;
            const dy = fieldPos.fy - this.lastFieldPos.fy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const speed = dist / dt;

            this.speeds.push(speed);
            this.distances.push(dist);
            this.maxSpeed = Math.max(this.maxSpeed, speed);

            // Intensity zones
            if (speed < 2) this.intensityZones.walk += dist;
            else if (speed < 4) this.intensityZones.jog += dist;
            else if (speed < 5.83) this.intensityZones.run += dist;
            else {
              this.intensityZones.sprint += dist;
              // Sprint detection (>5.83 m/s = 21 km/h)
              if (this.speeds.length >= 2 && this.speeds[this.speeds.length - 2] < 5.83) {
                this.sprintCount++;
              }
            }
          }
        }

        this.lastFieldPos = { fx: fieldPos.fx, fy: fieldPos.fy };
      }
    }

    // 2. Run pose analyzer on YOLO tracks (scans + duels from ALL players)
    // Use MediaPipe COCO keypoints for focus player (better quality)
    const enrichedTracks = [...tracks];
    if (focusPose && this.focusTrackId > 0) {
      const focusTrack = enrichedTracks.find(t => t.id === this.focusTrackId);
      if (focusTrack) {
        // Replace YOLO keypoints with higher-quality MediaPipe keypoints
        focusTrack.keypoints = focusPose.cocoKeypoints;
      }
    }

    const { scans, duels } = this.poseAnalyzer.analyzeTracks(
      enrichedTracks,
      timestampMs,
      fps,
    );

    this.scanEvents.push(...scans);
    this.duelEvents.push(...duels);

    return {
      frameIndex: this.frameCount - 1,
      timestampMs,
      tracks: enrichedTracks,
      focusPose,
      focusFieldPosition,
      scanEvents: scans,
      duelEvents: duels,
    };
  }

  /**
   * Get final session results.
   * Call this when video processing is complete.
   */
  getSessionResult(): HybridSessionResult {
    const durationSec = (this.lastTimeMs - this.startTimeMs) / 1000;
    const totalDistance = this.distances.reduce((s, d) => s + d, 0);
    const avgSpeed = this.speeds.length > 0
      ? this.speeds.reduce((s, v) => s + v, 0) / this.speeds.length
      : 0;

    // Focus player duels
    const focusDuels = this.duelEvents.filter(d =>
      d.trackIds.includes(this.focusTrackId),
    );
    const duelsWon = focusDuels.filter(d => d.winnerId === this.focusTrackId).length;
    const duelsLost = focusDuels.filter(d =>
      d.winnerId !== null && d.winnerId !== this.focusTrackId,
    ).length;

    // Focus player scans
    const focusScans = this.scanEvents.filter(s => s.trackId === this.focusTrackId);

    // Voronoi area (estimated from position spread)
    const avgVoronoiArea = this.estimateVoronoiArea();

    const physicalMetrics: PhysicalMetrics = {
      maxSpeedMs: Math.round(this.maxSpeed * 100) / 100,
      avgSpeedMs: Math.round(avgSpeed * 100) / 100,
      distanceCoveredM: Math.round(totalDistance),
      sprintCount: this.sprintCount,
      sprintDistanceM: Math.round(this.intensityZones.sprint),
      maxAccelMs2: 0, // TODO: calculate from speed deltas
      intensityZones: {
        walk: Math.round(this.intensityZones.walk),
        jog: Math.round(this.intensityZones.jog),
        run: Math.round(this.intensityZones.run),
        sprint: Math.round(this.intensityZones.sprint),
      },
      scanCount: focusScans.length,
      duelsWon,
      duelsLost,
      avgVoronoiAreaM2: avgVoronoiArea,
    };

    const biomechanics = this.biomechanicsAnalyzer.calculate();

    return {
      durationSec: Math.round(durationSec),
      totalFrames: this.frameCount,
      physicalMetrics,
      biomechanics,
      scanEvents: this.scanEvents.slice(-200),
      duelEvents: this.duelEvents.slice(-200),
      focusPositions: this.focusPositions.slice(-500),
      tracksCount: this.tracksSeenCount,
      focusTrackId: this.focusTrackId,
      processingFps: durationSec > 0 ? Math.round(this.frameCount / durationSec) : 0,
    };
  }

  /**
   * Convert session result to TrackingSnapshot (for AdvancedMetricsPanel).
   * This is the bridge that eliminates the STUBs.
   */
  toTrackingSnapshot(
    playerId: string,
    videoId: string | null,
  ): TrackingSnapshot {
    const result = this.getSessionResult();

    return {
      playerId,
      videoId,
      savedAt: new Date().toISOString(),
      durationSec: result.durationSec,
      sessionMetrics: result.physicalMetrics,
      scanCount: result.scanEvents.filter(s => s.trackId === this.focusTrackId).length,
      duelCount: result.duelEvents.filter(d => d.trackIds.includes(this.focusTrackId)).length,
      tracksCount: result.tracksCount,
      focusTrackId: this.focusTrackId,
      scanEvents: result.scanEvents,
      duelEvents: result.duelEvents,
      focusPositions: result.focusPositions,
    };
  }

  /** Reset for a new session */
  reset(): void {
    this.poseAnalyzer.reset();
    this.biomechanicsAnalyzer.reset();
    this.scanEvents = [];
    this.duelEvents = [];
    this.focusPositions = [];
    this.speeds = [];
    this.distances = [];
    this.sprintCount = 0;
    this.maxSpeed = 0;
    this.intensityZones = { walk: 0, jog: 0, run: 0, sprint: 0 };
    this.tracksSeenCount = 0;
    this.startTimeMs = 0;
    this.lastTimeMs = 0;
    this.lastFieldPos = null;
    this.frameCount = 0;
    this.voronoiAreas = [];
  }

  /* ── Private ─────────────────────────────────────────────── */

  private estimateVoronoiArea(): number {
    if (this.focusPositions.length < 10) return 0;

    // Estimate coverage area from position spread
    // Use convex hull area / number of unique zones as proxy
    const fxValues = this.focusPositions.map(p => p.fx);
    const fyValues = this.focusPositions.map(p => p.fy);

    const minFx = Math.min(...fxValues);
    const maxFx = Math.max(...fxValues);
    const minFy = Math.min(...fyValues);
    const maxFy = Math.max(...fyValues);

    // Bounding box area as rough estimate
    const boundingArea = (maxFx - minFx) * (maxFy - minFy);

    // Discount: actual Voronoi is ~60% of bounding box typically
    return Math.round(boundingArea * 0.6 * 10) / 10;
  }
}

/* ── Factory ───────────────────────────────────────────────────── */

let _pipeline: HybridPipeline | null = null;

export function getHybridPipeline(): HybridPipeline {
  if (!_pipeline) {
    _pipeline = new HybridPipeline();
  }
  return _pipeline;
}

export function resetHybridPipeline(): void {
  _pipeline?.reset();
  _pipeline = null;
}
