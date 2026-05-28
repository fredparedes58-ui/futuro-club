/**
 * VITAS · Formation Detector (Sprint 8)
 *
 * Detects team formation from player positions using K-means clustering
 * on Y-positions to identify defensive, midfield, and attacking lines.
 *
 * Uses rolling 5-minute windows to detect formation changes over time.
 *
 * Common formations: 4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 5-3-2, 4-1-4-1, 3-4-3
 */

import type { FieldPoint } from "@/lib/yolo/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FormationLine {
  /** Average X position of this line */
  avgX: number;
  /** Number of players in this line */
  playerCount: number;
  /** Player track IDs in this line */
  trackIds: number[];
  /** Average Y position (lateral spread) */
  avgY: number;
  /** Width of the line (max Y - min Y) */
  widthM: number;
}

export interface DetectedFormation {
  /** Formation label e.g. "4-3-3", "4-4-2" */
  label: string;
  /** Confidence 0-1 */
  confidence: number;
  /** Lines from defense to attack (ordered by X) */
  lines: FormationLine[];
  /** Whether a goalkeeper was detected (excluded from formation) */
  gkDetected: boolean;
  /** Timestamp of the window */
  timestampMs: number;
}

export interface FormationTimeline {
  /** Formation at each window */
  formations: DetectedFormation[];
  /** Most frequent formation */
  dominant: string;
  /** Formation changes detected */
  changes: Array<{ fromMs: number; toMs: number; from: string; to: string }>;
}

// ─── Known formation templates ───────────────────────────────────────────────

const FORMATION_TEMPLATES: Record<string, number[]> = {
  "4-4-2": [4, 4, 2],
  "4-3-3": [4, 3, 3],
  "4-2-3-1": [4, 2, 3, 1],
  "3-5-2": [3, 5, 2],
  "5-3-2": [5, 3, 2],
  "4-1-4-1": [4, 1, 4, 1],
  "3-4-3": [3, 4, 3],
  "5-4-1": [5, 4, 1],
  "4-5-1": [4, 5, 1],
  "3-4-1-2": [3, 4, 1, 2],
};

// ─── K-means clustering ──────────────────────────────────────────────────────

function kMeans1D(values: number[], k: number, maxIter = 20): number[][] {
  if (values.length <= k) {
    return values.map((v) => [v]);
  }

  // Initialize centroids evenly spaced
  const sorted = [...values].sort((a, b) => a - b);
  const step = sorted.length / k;
  let centroids = Array.from({ length: k }, (_, i) => sorted[Math.min(Math.floor(i * step), sorted.length - 1)]);

  let clusters: number[][] = [];

  for (let iter = 0; iter < maxIter; iter++) {
    // Assign points to nearest centroid
    clusters = Array.from({ length: k }, () => []);
    for (const v of values) {
      let minDist = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < centroids.length; c++) {
        const d = Math.abs(v - centroids[c]);
        if (d < minDist) {
          minDist = d;
          bestCluster = c;
        }
      }
      clusters[bestCluster].push(v);
    }

    // Update centroids
    const newCentroids = clusters.map((cl) =>
      cl.length > 0 ? cl.reduce((s, v) => s + v, 0) / cl.length : 0,
    );

    // Check convergence
    const converged = centroids.every((c, i) => Math.abs(c - newCentroids[i]) < 0.5);
    centroids = newCentroids;
    if (converged) break;
  }

  // Remove empty clusters and sort by centroid
  return clusters
    .filter((cl) => cl.length > 0)
    .sort((a, b) => {
      const avgA = a.reduce((s, v) => s + v, 0) / a.length;
      const avgB = b.reduce((s, v) => s + v, 0) / b.length;
      return avgA - avgB;
    });
}

// ─── Formation matching ──────────────────────────────────────────────────────

function matchFormation(lineCounts: number[]): { label: string; confidence: number } {
  let bestLabel = lineCounts.join("-");
  let bestScore = 0;

  for (const [label, template] of Object.entries(FORMATION_TEMPLATES)) {
    if (template.length !== lineCounts.length) continue;

    // Score: how well the line counts match (allow ±1 tolerance)
    let matchScore = 0;
    let totalPlayers = 0;
    for (let i = 0; i < template.length; i++) {
      const diff = Math.abs(template[i] - lineCounts[i]);
      if (diff === 0) matchScore += 2;
      else if (diff === 1) matchScore += 1;
      totalPlayers += template[i];
    }

    const normalized = matchScore / (template.length * 2);
    if (normalized > bestScore) {
      bestScore = normalized;
      bestLabel = label;
    }
  }

  return { label: bestLabel, confidence: Math.min(1, bestScore) };
}

// ─── Main detection function ─────────────────────────────────────────────────

/**
 * Detect formation from a set of player positions.
 * Excludes the player closest to the goal (assumed GK).
 *
 * @param players Array of { trackId, position }
 * @param attackingDirection "right" means team attacks toward x=105
 */
export function detectFormation(
  players: Array<{ trackId: number; pos: FieldPoint }>,
  attackingDirection: "right" | "left" = "right",
  timestampMs = 0,
): DetectedFormation {
  if (players.length < 4) {
    return {
      label: "?",
      confidence: 0,
      lines: [],
      gkDetected: false,
      timestampMs,
    };
  }

  // Sort by X position (attacking direction)
  const sorted = [...players].sort((a, b) =>
    attackingDirection === "right" ? a.pos.fx - b.pos.fx : b.pos.fx - a.pos.fx,
  );

  // Remove GK: player closest to own goal
  const gk = sorted[0];
  const outfield = sorted.slice(1);
  const gkDetected = gk.pos.fx < 20 || gk.pos.fx > 85; // near goal line

  if (outfield.length < 3) {
    return { label: "?", confidence: 0, lines: [], gkDetected, timestampMs };
  }

  // Cluster outfield X positions into 2-4 lines
  const xValues = outfield.map((p) => p.pos.fx);

  // Try k=2,3,4 and pick the best clustering
  let bestK = 3;
  let bestClusters: number[][] = [];
  let bestInertia = Infinity;

  for (const k of [2, 3, 4]) {
    if (k > outfield.length) continue;
    const clusters = kMeans1D(xValues, k);
    // Compute inertia (sum of squared distances to centroid)
    let inertia = 0;
    for (const cl of clusters) {
      const mean = cl.reduce((s, v) => s + v, 0) / cl.length;
      for (const v of cl) inertia += (v - mean) ** 2;
    }
    // Penalize more clusters slightly to prefer simpler formations
    const adjustedInertia = inertia + k * 5;
    if (adjustedInertia < bestInertia) {
      bestInertia = adjustedInertia;
      bestK = k;
      bestClusters = clusters;
    }
  }

  // Build lines from clusters
  const lines: FormationLine[] = bestClusters.map((cluster) => {
    // Find which players belong to this cluster
    const lineTrackIds: number[] = [];
    const linePositions: FieldPoint[] = [];

    for (const p of outfield) {
      if (cluster.includes(p.pos.fx)) {
        lineTrackIds.push(p.trackId);
        linePositions.push(p.pos);
      }
    }

    // Deduplicate (if multiple players have same X)
    const uniqueIds = [...new Set(lineTrackIds)];
    const avgX =
      linePositions.length > 0
        ? linePositions.reduce((s, p) => s + p.fx, 0) / linePositions.length
        : 0;
    const avgY =
      linePositions.length > 0
        ? linePositions.reduce((s, p) => s + p.fy, 0) / linePositions.length
        : 34;
    const yValues = linePositions.map((p) => p.fy);
    const widthM = yValues.length > 1 ? Math.max(...yValues) - Math.min(...yValues) : 0;

    return {
      avgX: Math.round(avgX * 10) / 10,
      playerCount: uniqueIds.length,
      trackIds: uniqueIds,
      avgY: Math.round(avgY * 10) / 10,
      widthM: Math.round(widthM * 10) / 10,
    };
  });

  // Match to known formation
  const lineCounts = lines.map((l) => l.playerCount);
  const { label, confidence } = matchFormation(lineCounts);

  return {
    label,
    confidence,
    lines,
    gkDetected,
    timestampMs,
  };
}

// ─── Formation timeline builder ──────────────────────────────────────────────

/**
 * Build a timeline of formations from multiple detection windows.
 */
export function buildFormationTimeline(
  formations: DetectedFormation[],
): FormationTimeline {
  if (formations.length === 0) {
    return { formations: [], dominant: "?", changes: [] };
  }

  // Count occurrences
  const counts = new Map<string, number>();
  for (const f of formations) {
    counts.set(f.label, (counts.get(f.label) ?? 0) + 1);
  }

  // Dominant: most frequent
  let dominant = "?";
  let maxCount = 0;
  for (const [label, count] of counts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominant = label;
    }
  }

  // Detect changes
  const changes: Array<{ fromMs: number; toMs: number; from: string; to: string }> = [];
  for (let i = 1; i < formations.length; i++) {
    if (formations[i].label !== formations[i - 1].label) {
      changes.push({
        fromMs: formations[i - 1].timestampMs,
        toMs: formations[i].timestampMs,
        from: formations[i - 1].label,
        to: formations[i].label,
      });
    }
  }

  return { formations, dominant, changes };
}
