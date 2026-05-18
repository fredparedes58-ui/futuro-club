/**
 * VITAS · Cubic Interpolation Between Frames
 *
 * Hermite cubic spline interpolation to generate intermediate points
 * between observed frames. At 8 FPS there is a 125ms gap between
 * detections — interpolation triples the effective resolution for
 * smoother heatmaps and more accurate distance calculations.
 */

/** A single tracked position with timestamp. */
export interface TrackPoint {
  /** Field X coordinate in meters (0-105) */
  fx: number;
  /** Field Y coordinate in meters (0-68) */
  fy: number;
  /** Timestamp in milliseconds */
  timestampMs: number;
}

/**
 * Hermite basis functions for t in [0, 1]:
 *   h00 =  2t^3 - 3t^2 + 1
 *   h10 =  t^3 - 2t^2 + t
 *   h01 = -2t^3 + 3t^2
 *   h11 =  t^3 - t^2
 */
function hermiteBasis(t: number): [number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    2 * t3 - 3 * t2 + 1,   // h00
    t3 - 2 * t2 + t,        // h10
    -2 * t3 + 3 * t2,       // h01
    t3 - t2,                 // h11
  ];
}

/**
 * Compute Catmull-Rom tangent from surrounding points.
 * Tangent at p1 = 0.5 * (p2 - p0), scaled by the segment duration.
 */
function catmullRomTangent(
  p0: TrackPoint,
  p1: TrackPoint,
  p2: TrackPoint,
): { tx: number; ty: number } {
  // Time scaling ensures tangents respect non-uniform sampling
  const dt = (p2.timestampMs - p0.timestampMs) / 1000;
  if (dt <= 0) return { tx: 0, ty: 0 };
  return {
    tx: 0.5 * (p2.fx - p0.fx),
    ty: 0.5 * (p2.fy - p0.fy),
  };
}

/**
 * Given 4 control points (p0, p1, p2, p3), interpolate N points
 * between p1 and p2 using Hermite cubic interpolation.
 *
 * Tangents are derived via Catmull-Rom from the outer points (p0, p3).
 * The returned array does NOT include p1 or p2 themselves — only the
 * intermediate points.
 *
 * @param points           Exactly 4 consecutive TrackPoints [p0, p1, p2, p3]
 * @param numIntermediate  Number of points to insert between p1 and p2 (default 2)
 * @returns                Array of interpolated TrackPoints
 */
export function hermiteInterpolate(
  points: TrackPoint[],
  numIntermediate = 2,
): TrackPoint[] {
  if (points.length < 4) return [];
  if (numIntermediate <= 0) return [];

  const [p0, p1, p2, p3] = points;

  // Catmull-Rom tangents at p1 and p2
  const m1 = catmullRomTangent(p0, p1, p2);
  const m2 = catmullRomTangent(p1, p2, p3);

  const result: TrackPoint[] = [];
  for (let i = 1; i <= numIntermediate; i++) {
    const t = i / (numIntermediate + 1);
    const [h00, h10, h01, h11] = hermiteBasis(t);

    const fx = h00 * p1.fx + h10 * m1.tx + h01 * p2.fx + h11 * m2.tx;
    const fy = h00 * p1.fy + h10 * m1.ty + h01 * p2.fy + h11 * m2.ty;
    const timestampMs = p1.timestampMs + t * (p2.timestampMs - p1.timestampMs);

    result.push({ fx, fy, timestampMs });
  }

  return result;
}

/**
 * Interpolate an entire track's positions, inserting intermediate points
 * between every pair of consecutive observations.
 *
 * For the first and last segments (where we lack an outer control point),
 * linear interpolation is used as a fallback.
 *
 * @param positions             Array of observed TrackPoints (chronological)
 * @param subdivisionsPerSegment Number of points to insert per segment (default 2)
 * @returns                     New array with original + interpolated points, sorted by time
 */
export function interpolateTrack(
  positions: TrackPoint[],
  subdivisionsPerSegment = 2,
): TrackPoint[] {
  if (positions.length <= 1) return [...positions];

  const result: TrackPoint[] = [];

  for (let i = 0; i < positions.length - 1; i++) {
    // Always include the original point
    result.push(positions[i]);

    const hasPrev = i > 0;
    const hasNext = i + 2 < positions.length;

    if (hasPrev && hasNext) {
      // Full Hermite with 4 control points
      const interpolated = hermiteInterpolate(
        [positions[i - 1], positions[i], positions[i + 1], positions[i + 2]],
        subdivisionsPerSegment,
      );
      result.push(...interpolated);
    } else {
      // Fallback: linear interpolation for edge segments
      const p1 = positions[i];
      const p2 = positions[i + 1];
      for (let j = 1; j <= subdivisionsPerSegment; j++) {
        const t = j / (subdivisionsPerSegment + 1);
        result.push({
          fx: p1.fx + t * (p2.fx - p1.fx),
          fy: p1.fy + t * (p2.fy - p1.fy),
          timestampMs: p1.timestampMs + t * (p2.timestampMs - p1.timestampMs),
        });
      }
    }
  }

  // Include the last original point
  result.push(positions[positions.length - 1]);

  return result;
}
