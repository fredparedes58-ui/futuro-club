/**
 * VITAS · Team Classifier (Sprint 4 — Player Re-ID)
 *
 * Classifies players into two teams using K-means (k=2) on the
 * hue channel of their torso color histograms.
 *
 * Special handling:
 *   - Goalkeeper detected as outlier (very different color from both clusters)
 *   - Referee detected similarly (often black/yellow, distinct from teams)
 *   - Updates incrementally as more frames are processed
 */

import { extractTorsoHistogram, compareHistograms } from "./colorReId";

// ─── Types ─────────────────────────────────────────────────────────────────

export type TeamLabel = "home" | "away" | "goalkeeper" | "referee" | "unknown";

export interface TeamAssignment {
  trackId: number;
  team: TeamLabel;
  confidence: number;
  /** Distance to assigned cluster centroid */
  distanceToCentroid: number;
}

export interface TeamClassifierConfig {
  /** Minimum samples before classifying (default: 5) */
  minSamples: number;
  /** K-means iterations (default: 10) */
  kmeansIterations: number;
  /** Distance threshold for outlier detection (GK/ref) (default: 0.7) */
  outlierThreshold: number;
  /** Every Nth frame to process histograms (default: 5) */
  frameInterval: number;
  /** EMA alpha for temporal histogram blending (default: 0.15) */
  emaAlpha: number;
}

const DEFAULT_CONFIG: TeamClassifierConfig = {
  minSamples: 5,
  kmeansIterations: 10,
  outlierThreshold: 0.7,
  frameInterval: 5,
  emaAlpha: 0.15,
};

// ─── Team Classifier ───────────────────────────────────────────────────────

export class TeamClassifier {
  private config: TeamClassifierConfig;
  /** Track ID → accumulated histogram (EMA blended) */
  private histograms = new Map<number, Float32Array>();
  /** Track ID → frame count */
  private frameCounts = new Map<number, number>();
  /** Current team assignments */
  private assignments = new Map<number, TeamAssignment>();
  /** Cluster centroids (2 teams) */
  private centroids: [Float32Array, Float32Array] | null = null;
  /** Whether classification is ready */
  private classified = false;

  constructor(config?: Partial<TeamClassifierConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  reset(): void {
    this.histograms.clear();
    this.frameCounts.clear();
    this.assignments.clear();
    this.centroids = null;
    this.classified = false;
  }

  /**
   * Feed a frame's histogram for a track. Call for each visible player.
   *
   * @param trackId - Player track ID
   * @param imageData - Full frame pixel data
   * @param bbox - Player bounding box [x, y, w, h]
   * @param frameIndex - Current frame index
   */
  feedFrame(
    trackId: number,
    imageData: ImageData,
    bbox: [number, number, number, number],
    frameIndex: number,
  ): void {
    // Rate limit
    const count = this.frameCounts.get(trackId) ?? 0;
    if (count > 0 && frameIndex % this.config.frameInterval !== 0) return;

    const hist = extractTorsoHistogram(imageData, bbox);
    const existing = this.histograms.get(trackId);

    if (existing) {
      // EMA blend
      const alpha = this.config.emaAlpha;
      for (let i = 0; i < hist.length; i++) {
        existing[i] = alpha * hist[i] + (1 - alpha) * existing[i];
      }
    } else {
      this.histograms.set(trackId, new Float32Array(hist));
    }

    this.frameCounts.set(trackId, count + 1);
  }

  /**
   * Run K-means classification on all accumulated histograms.
   * Call periodically (e.g., every 30 frames) after enough samples.
   *
   * @returns Map of trackId → TeamAssignment
   */
  classify(): Map<number, TeamAssignment> {
    const entries = [...this.histograms.entries()].filter(
      ([id]) => (this.frameCounts.get(id) ?? 0) >= this.config.minSamples,
    );

    if (entries.length < 4) {
      // Need at least 4 players (2 per team minimum)
      return this.assignments;
    }

    // Run K-means (k=2)
    const histLength = entries[0][1].length;
    this.centroids = this.kmeans2(
      entries.map(([, h]) => h),
      histLength,
    );

    // Assign each track to nearest centroid
    const cluster0: number[] = [];
    const cluster1: number[] = [];

    for (const [trackId, hist] of entries) {
      const d0 = compareHistograms(hist, this.centroids[0]);
      const d1 = compareHistograms(hist, this.centroids[1]);
      const minDist = Math.min(d0, d1);

      // Check if outlier (GK/referee)
      if (minDist > this.config.outlierThreshold) {
        this.assignments.set(trackId, {
          trackId,
          team: "goalkeeper", // Could be GK or ref — detect later
          confidence: 0.5,
          distanceToCentroid: minDist,
        });
        continue;
      }

      const cluster = d0 <= d1 ? 0 : 1;
      const confidence = 1.0 - minDist;

      if (cluster === 0) cluster0.push(trackId);
      else cluster1.push(trackId);

      this.assignments.set(trackId, {
        trackId,
        team: cluster === 0 ? "home" : "away",
        confidence: Math.min(1.0, confidence),
        distanceToCentroid: minDist,
      });
    }

    // Larger cluster = "home" (convention: home team typically has more players visible)
    if (cluster1.length > cluster0.length) {
      // Swap labels
      for (const id of cluster0) {
        const a = this.assignments.get(id);
        if (a) a.team = "away";
      }
      for (const id of cluster1) {
        const a = this.assignments.get(id);
        if (a) a.team = "home";
      }
    }

    this.classified = true;
    return this.assignments;
  }

  /** Get current assignments */
  getAssignments(): Map<number, TeamAssignment> {
    return this.assignments;
  }

  /** Get team for a specific track */
  getTeam(trackId: number): TeamLabel {
    return this.assignments.get(trackId)?.team ?? "unknown";
  }

  /** Get a simple Map<trackId, "home"|"away"> for possession engine */
  getTeamMap(): Map<number, "home" | "away"> {
    const map = new Map<number, "home" | "away">();
    for (const [id, assignment] of this.assignments) {
      if (assignment.team === "home" || assignment.team === "away") {
        map.set(id, assignment.team);
      }
    }
    return map;
  }

  /** Whether classification has been run with enough data */
  get isClassified(): boolean {
    return this.classified;
  }

  /* ── K-means (k=2) ─────────────────────────────────────────────── */

  private kmeans2(
    histograms: Float32Array[],
    histLength: number,
  ): [Float32Array, Float32Array] {
    const n = histograms.length;

    // Initialize centroids: pick two most different histograms
    let maxDist = 0;
    let c0Idx = 0;
    let c1Idx = 1;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = compareHistograms(histograms[i], histograms[j]);
        if (d > maxDist) {
          maxDist = d;
          c0Idx = i;
          c1Idx = j;
        }
      }
    }

    const c0 = new Float32Array(histograms[c0Idx]);
    const c1 = new Float32Array(histograms[c1Idx]);

    // Iterate
    for (let iter = 0; iter < this.config.kmeansIterations; iter++) {
      const sum0 = new Float32Array(histLength);
      const sum1 = new Float32Array(histLength);
      let count0 = 0;
      let count1 = 0;

      for (const h of histograms) {
        const d0 = compareHistograms(h, c0);
        const d1 = compareHistograms(h, c1);

        if (d0 <= d1) {
          for (let i = 0; i < histLength; i++) sum0[i] += h[i];
          count0++;
        } else {
          for (let i = 0; i < histLength; i++) sum1[i] += h[i];
          count1++;
        }
      }

      // Update centroids
      if (count0 > 0) for (let i = 0; i < histLength; i++) c0[i] = sum0[i] / count0;
      if (count1 > 0) for (let i = 0; i < histLength; i++) c1[i] = sum1[i] / count1;
    }

    return [c0, c1];
  }
}
