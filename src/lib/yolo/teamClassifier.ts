/**
 * VITAS · Team Classifier (Sprint 4 — Player Re-ID)
 *
 * Classifies players into two teams using K-means (k=2) on their torso
 * kit-colour histograms (colorReId.ts). Kit colour only — never the face
 * (.claude/rules/identidad.md).
 *
 * Special handling:
 *   - Goalkeeper detected as outlier (very different color from both clusters)
 *   - Referee detected similarly (often black/yellow, distinct from teams)
 *   - Updates incrementally as more frames are processed
 *
 * Label stability: "home"/"away" are cluster NAMES, not a claim about which
 * side is the home team (colour cannot tell). The first classification names
 * the larger cluster "home"; every later re-clustering is matched to the
 * previous centroids, so a team keeps its label for the whole match even if
 * the other team becomes the larger visible group.
 *
 * Memory: tracks not fed for `maxStaleFrames` are pruned — ByteTrack issues a
 * fresh id after every occlusion, so the per-track maps otherwise grow for the
 * whole match.
 */

import {
  extractTorsoHistogram,
  compareHistograms,
  isEmptyHistogram,
  DEFAULT_REID_THRESHOLD,
} from "./colorReId";

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
  /**
   * Forget a track after this many frames without being fed (default: 300).
   * Memory bound only — it never changes a live track's assignment.
   */
  maxStaleFrames: number;
}

const DEFAULT_CONFIG: TeamClassifierConfig = {
  minSamples: 5,
  kmeansIterations: 10,
  outlierThreshold: 0.7,
  frameInterval: 5,
  emaAlpha: 0.15,
  maxStaleFrames: 300,
};

// ─── Team Classifier ───────────────────────────────────────────────────────

export class TeamClassifier {
  private config: TeamClassifierConfig;
  /** Track ID → accumulated histogram (EMA blended) */
  private histograms = new Map<number, Float32Array>();
  /** Track ID → frame count */
  private frameCounts = new Map<number, number>();
  /** Track ID → last frame index the track was fed (for pruning) */
  private lastSeenFrame = new Map<number, number>();
  /** Current team assignments */
  private assignments = new Map<number, TeamAssignment>();
  /** Cluster centroids, ordered [home, away] once classified */
  private centroids: [Float32Array, Float32Array] | null = null;
  /** Latest frame index fed (pruning clock) */
  private latestFrame = 0;
  /** Whether classification is ready */
  private classified = false;

  constructor(config?: Partial<TeamClassifierConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  reset(): void {
    this.histograms.clear();
    this.frameCounts.clear();
    this.lastSeenFrame.clear();
    this.assignments.clear();
    this.centroids = null;
    this.latestFrame = 0;
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
    this.lastSeenFrame.set(trackId, frameIndex);
    if (frameIndex > this.latestFrame) this.latestFrame = frameIndex;

    // Rate limit
    const count = this.frameCounts.get(trackId) ?? 0;
    if (count > 0 && frameIndex % this.config.frameInterval !== 0) return;

    const hist = extractTorsoHistogram(imageData, bbox);
    // Empty crop (off-frame bbox): no colour evidence — never counted as a sample.
    if (isEmptyHistogram(hist)) return;
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

  /** Forget everything about a track (histogram, samples, assignment). */
  forgetTrack(trackId: number): void {
    this.histograms.delete(trackId);
    this.frameCounts.delete(trackId);
    this.lastSeenFrame.delete(trackId);
    this.assignments.delete(trackId);
  }

  /**
   * Drop tracks that have not been fed for more than `maxStaleFrames`
   * frames, relative to `currentFrame` (default: latest frame fed).
   */
  pruneStale(currentFrame = this.latestFrame): void {
    for (const [trackId, seen] of this.lastSeenFrame) {
      if (currentFrame - seen > this.config.maxStaleFrames) this.forgetTrack(trackId);
    }
  }

  /** Number of tracks currently held in memory. */
  get trackedCount(): number {
    return this.lastSeenFrame.size;
  }

  /**
   * Run K-means classification on all accumulated histograms.
   * Call periodically (e.g., every 30 frames) after enough samples.
   *
   * @returns Map of trackId → TeamAssignment
   */
  classify(): Map<number, TeamAssignment> {
    this.pruneStale();

    const entries = [...this.histograms.entries()].filter(
      ([id]) => (this.frameCounts.get(id) ?? 0) >= this.config.minSamples,
    );

    if (entries.length < 4) {
      // Need at least 4 players (2 per team minimum)
      return this.assignments;
    }

    // Run K-means (k=2)
    const hists = entries.map(([, h]) => h);
    const [c0, c1] = this.kmeans2(hists, hists[0].length);

    // Orient the new clusters as [home, away] — stable across re-clustering.
    this.centroids = this.orientCentroids(c0, c1, hists);
    const [home, away] = this.centroids;

    for (const [trackId, hist] of entries) {
      const dHome = compareHistograms(hist, home);
      const dAway = compareHistograms(hist, away);
      const minDist = Math.min(dHome, dAway);

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

      this.assignments.set(trackId, {
        trackId,
        team: dHome <= dAway ? "home" : "away",
        confidence: Math.min(1.0, 1.0 - minDist),
        distanceToCentroid: minDist,
      });
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

  /* ── Label orientation ─────────────────────────────────────────── */

  /**
   * Return the two new centroids ordered [home, away].
   *
   * - With previous centroids: pick the permutation that best matches them
   *   (a team keeps its label; ties keep the current order).
   * - First classification: the larger non-outlier cluster is named "home"
   *   (naming convention only).
   */
  private orientCentroids(
    c0: Float32Array,
    c1: Float32Array,
    hists: Float32Array[],
  ): [Float32Array, Float32Array] {
    if (this.centroids) {
      const [prevHome, prevAway] = this.centroids;
      const keepCost = compareHistograms(c0, prevHome) + compareHistograms(c1, prevAway);
      const swapCost = compareHistograms(c0, prevAway) + compareHistograms(c1, prevHome);
      return swapCost < keepCost ? [c1, c0] : [c0, c1];
    }

    let n0 = 0;
    let n1 = 0;
    for (const h of hists) {
      const d0 = compareHistograms(h, c0);
      const d1 = compareHistograms(h, c1);
      if (Math.min(d0, d1) > this.config.outlierThreshold) continue;
      if (d0 <= d1) n0++;
      else n1++;
    }
    return n1 > n0 ? [c1, c0] : [c0, c1];
  }

  /* ── K-means (k=2) ─────────────────────────────────────────────── */

  /**
   * Seeds = the two DENSEST kit groups, not the two most different histograms:
   * the most different pair is usually a goalkeeper or referee (a singleton),
   * which captured a centroid and merged both teams into the other one.
   */
  private seedIndices(histograms: Float32Array[]): [number, number] {
    const n = histograms.length;
    const d: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        d[i][j] = d[j][i] = compareHistograms(histograms[i], histograms[j]);
      }
    }

    // Density = how many other tracks wear a colour-compatible (same) kit.
    const density = d.map((row, i) =>
      row.reduce((acc, dij, j) => acc + (j !== i && dij < DEFAULT_REID_THRESHOLD ? 1 : 0), 0),
    );

    let s0 = 0;
    for (let i = 1; i < n; i++) if (density[i] > density[s0]) s0 = i;

    // Second seed: densest track wearing a DIFFERENT kit from the first seed;
    // if every track looks alike, fall back to the farthest one.
    let s1 = -1;
    for (let i = 0; i < n; i++) {
      if (i === s0 || d[s0][i] < DEFAULT_REID_THRESHOLD) continue;
      if (s1 === -1 || density[i] > density[s1] || (density[i] === density[s1] && d[s0][i] > d[s0][s1])) {
        s1 = i;
      }
    }
    if (s1 === -1) {
      s1 = s0 === 0 ? 1 : 0;
      for (let i = 0; i < n; i++) if (i !== s0 && d[s0][i] > d[s0][s1]) s1 = i;
    }
    return [s0, s1];
  }

  private kmeans2(
    histograms: Float32Array[],
    histLength: number,
  ): [Float32Array, Float32Array] {
    const [s0, s1] = this.seedIndices(histograms);
    const c0 = new Float32Array(histograms[s0]);
    const c1 = new Float32Array(histograms[s1]);

    // Iterate
    for (let iter = 0; iter < this.config.kmeansIterations; iter++) {
      const sum0 = new Float32Array(histLength);
      const sum1 = new Float32Array(histLength);
      let count0 = 0;
      let count1 = 0;

      for (const h of histograms) {
        const d0 = compareHistograms(h, c0);
        const d1 = compareHistograms(h, c1);

        // Outliers (GK / referee) do not drag the team centroids.
        if (Math.min(d0, d1) > this.config.outlierThreshold) continue;

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
