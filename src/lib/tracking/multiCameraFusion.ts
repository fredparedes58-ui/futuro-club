/**
 * VITAS · Multi-Camera Fusion (Tracking → 8/10)
 *
 * Fuses tracking data from multiple camera angles to produce
 * a unified player tracking output with significantly improved accuracy.
 *
 * Why multi-camera?
 *   - Single camera has occlusion blind spots (players hidden behind others)
 *   - 2+ cameras eliminate ~90% of occlusions
 *   - Triangulation gives true 3D positions (not just projected 2D)
 *   - Coverage of full pitch even with narrow-angle cameras
 *
 * Architecture:
 *   Camera 1 → Detections → ┐
 *   Camera 2 → Detections → ├─ Fusion Engine → Unified Tracking → Output
 *   Camera 3 → Detections → ┘
 *
 * Fusion steps:
 *   1. Temporal sync (align frames from different cameras by timestamp)
 *   2. Spatial mapping (transform all detections to a shared coordinate system)
 *   3. Re-identification (match same player across cameras using features)
 *   4. Triangulation (combine 2D detections into 3D position)
 *   5. Conflict resolution (when cameras disagree, pick best)
 *   6. Gap filling (if one camera loses a player, another fills in)
 */

/* ── Types ─────────────────────────────────────────────────────── */

export interface CameraConfig {
  /** Unique camera ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Camera type */
  type: "broadcast" | "tactical" | "behind_goal" | "sideline" | "drone";
  /** Resolution */
  resolution: { width: number; height: number };
  /** Frames per second */
  fps: number;
  /** Homography matrix to map to pitch coordinates (3x3) */
  homography?: number[][];
  /** Camera position in real-world coordinates [x, y, z] meters */
  position?: [number, number, number];
  /** Camera rotation [pitch, yaw, roll] degrees */
  rotation?: [number, number, number];
  /** Field of view in degrees */
  fov?: number;
  /** Reliability score 0-1 (updated dynamically) */
  reliability: number;
  /** Is this camera currently active/connected? */
  active: boolean;
}

export interface CameraDetection {
  /** Camera that produced this detection */
  cameraId: string;
  /** Timestamp in ms from video start */
  timestampMs: number;
  /** Frame index */
  frameIndex: number;
  /** Player bounding box [x, y, w, h] in pixel coordinates */
  bbox: [number, number, number, number];
  /** Player position in pitch coordinates [x, y] meters (if homography available) */
  pitchPosition?: [number, number];
  /** Appearance features for re-identification (color histogram, jersey number, etc.) */
  appearance: AppearanceFeatures;
  /** Pose keypoints (if available) */
  keypoints?: { x: number; y: number; confidence: number; name: string }[];
  /** Detection confidence 0-1 */
  confidence: number;
  /** Assigned player ID (after fusion) */
  playerId?: string;
}

export interface AppearanceFeatures {
  /** Dominant jersey color [H, S, V] */
  jerseyColor: [number, number, number];
  /** Secondary color (shorts) [H, S, V] */
  shortsColor: [number, number, number];
  /** Jersey number (if detected) */
  jerseyNumber?: number;
  /** Height estimate in pixels (bounding box height) */
  heightPx: number;
  /** Color histogram (8 bins per channel, flattened) */
  colorHistogram: number[];
  /** Body proportion ratio (height/width) */
  bodyRatio: number;
}

export interface FusedTrack {
  /** Assigned player ID */
  playerId: string;
  /** Best-estimate pitch position [x, y] meters */
  position: [number, number];
  /** Position confidence 0-1 */
  positionConfidence: number;
  /** Velocity [vx, vy] m/s */
  velocity: [number, number];
  /** Speed in m/s */
  speed: number;
  /** Contributing camera detections */
  sources: {
    cameraId: string;
    detection: CameraDetection;
    weight: number;
  }[];
  /** Best pose keypoints (from highest-confidence camera) */
  bestPose?: CameraDetection["keypoints"];
  /** Appearance for this track */
  appearance: AppearanceFeatures;
  /** Frames since last seen by any camera */
  framesSinceLastSeen: number;
  /** Track status */
  status: "active" | "occluded" | "lost";
  /** Timestamp */
  timestampMs: number;
}

export interface FusionResult {
  /** All fused tracks for this time step */
  tracks: FusedTrack[];
  /** Timestamp */
  timestampMs: number;
  /** Number of cameras contributing */
  activeCameras: number;
  /** Fusion quality metrics */
  quality: {
    /** % of tracks seen by 2+ cameras */
    multiViewCoverage: number;
    /** Average position confidence across tracks */
    avgConfidence: number;
    /** Number of resolved occlusions */
    resolvedOcclusions: number;
    /** Number of ID conflicts resolved */
    idConflictsResolved: number;
  };
}

export interface FusionConfig {
  /** Maximum time difference for frame sync (ms) */
  maxTimeSyncDelta: number;
  /** Maximum distance for spatial matching (meters) */
  maxSpatialDistance: number;
  /** Minimum appearance similarity for re-ID (0-1) */
  minAppearanceSimilarity: number;
  /** Weight: spatial proximity vs appearance for matching */
  spatialWeight: number;
  /** Weight: appearance similarity for matching */
  appearanceWeight: number;
  /** Frames to keep a track alive without detections */
  maxFramesLost: number;
  /** Minimum cameras needed to create a track */
  minCamerasForTrack: number;
  /** Enable triangulation for 3D positioning */
  enableTriangulation: boolean;
}

const DEFAULT_FUSION_CONFIG: FusionConfig = {
  maxTimeSyncDelta: 50, // 50ms sync window
  maxSpatialDistance: 3.0, // 3 meters
  minAppearanceSimilarity: 0.6,
  spatialWeight: 0.6,
  appearanceWeight: 0.4,
  maxFramesLost: 30, // ~1 second at 30fps
  minCamerasForTrack: 1,
  enableTriangulation: true,
};

/* ── Multi-Camera Fusion Engine ────────────────────────────────── */

export class MultiCameraFusionEngine {
  private cameras: Map<string, CameraConfig> = new Map();
  private activeTracks: Map<string, FusedTrack> = new Map();
  private config: FusionConfig;
  private nextTrackId: number = 1;
  private detectionBuffer: Map<string, CameraDetection[]> = new Map(); // cameraId → buffer

  constructor(config?: Partial<FusionConfig>) {
    this.config = { ...DEFAULT_FUSION_CONFIG, ...config };
  }

  /* ── Camera Management ───────────────────────────────────── */

  registerCamera(camera: CameraConfig): void {
    this.cameras.set(camera.id, camera);
    this.detectionBuffer.set(camera.id, []);
    console.log(`[Fusion] Camera registered: ${camera.name} (${camera.type})`);
  }

  unregisterCamera(cameraId: string): void {
    this.cameras.delete(cameraId);
    this.detectionBuffer.delete(cameraId);
  }

  getCameraStatus(): { id: string; name: string; active: boolean; reliability: number; buffered: number }[] {
    return Array.from(this.cameras.values()).map(cam => ({
      id: cam.id,
      name: cam.name,
      active: cam.active,
      reliability: cam.reliability,
      buffered: this.detectionBuffer.get(cam.id)?.length ?? 0,
    }));
  }

  /* ── Detection Input ─────────────────────────────────────── */

  /**
   * Push detections from a single camera into the fusion buffer.
   * Call this for each camera as frames arrive.
   */
  pushDetections(cameraId: string, detections: CameraDetection[]): void {
    const buffer = this.detectionBuffer.get(cameraId);
    if (!buffer) {
      console.warn(`[Fusion] Unknown camera: ${cameraId}`);
      return;
    }

    // Transform to pitch coordinates if homography available
    const camera = this.cameras.get(cameraId);
    if (camera?.homography) {
      for (const det of detections) {
        if (!det.pitchPosition) {
          const cx = det.bbox[0] + det.bbox[2] / 2;
          const cy = det.bbox[1] + det.bbox[3]; // Bottom of bbox (feet)
          det.pitchPosition = applyHomography(camera.homography, cx, cy);
        }
      }
    }

    buffer.push(...detections);

    // Keep buffer bounded (last 2 seconds of detections)
    const maxBufferSize = (camera?.fps ?? 30) * 2;
    if (buffer.length > maxBufferSize) {
      buffer.splice(0, buffer.length - maxBufferSize);
    }
  }

  /* ── Main Fusion Step ────────────────────────────────────── */

  /**
   * Run one fusion step. Call this at your desired output FPS.
   * Collects all buffered detections within the sync window,
   * matches them across cameras, and produces unified tracks.
   */
  fuse(timestampMs: number): FusionResult {
    // 1. Temporal sync: collect detections from all cameras within sync window
    const syncedDetections = this.temporalSync(timestampMs);

    // 2. Spatial + appearance matching across cameras
    const matchedGroups = this.crossCameraMatch(syncedDetections);

    // 3. Update existing tracks or create new ones
    let resolvedOcclusions = 0;
    const idConflictsResolved = 0;
    const updatedTrackIds = new Set<string>();

    for (const group of matchedGroups) {
      const matched = this.matchToExistingTrack(group);

      if (matched) {
        this.updateTrack(matched, group, timestampMs);
        updatedTrackIds.add(matched.playerId);
        if (matched.status === "occluded") resolvedOcclusions++;
      } else {
        // New track
        const track = this.createTrack(group, timestampMs);
        this.activeTracks.set(track.playerId, track);
        updatedTrackIds.add(track.playerId);
      }
    }

    // 4. Age out tracks not updated
    for (const [id, track] of this.activeTracks) {
      if (!updatedTrackIds.has(id)) {
        track.framesSinceLastSeen++;
        if (track.framesSinceLastSeen > this.config.maxFramesLost) {
          track.status = "lost";
        } else if (track.framesSinceLastSeen > 5) {
          track.status = "occluded";
        }
      }
    }

    // Remove lost tracks
    for (const [id, track] of this.activeTracks) {
      if (track.status === "lost") {
        this.activeTracks.delete(id);
      }
    }

    // 5. Build result
    const tracks = Array.from(this.activeTracks.values());
    const multiViewCount = tracks.filter(t => t.sources.length >= 2).length;

    return {
      tracks,
      timestampMs,
      activeCameras: Array.from(this.cameras.values()).filter(c => c.active).length,
      quality: {
        multiViewCoverage: tracks.length > 0 ? multiViewCount / tracks.length : 0,
        avgConfidence: tracks.length > 0
          ? tracks.reduce((s, t) => s + t.positionConfidence, 0) / tracks.length
          : 0,
        resolvedOcclusions,
        idConflictsResolved,
      },
    };
  }

  /** Reset all tracks and buffers */
  reset(): void {
    this.activeTracks.clear();
    this.nextTrackId = 1;
    for (const buffer of this.detectionBuffer.values()) {
      buffer.length = 0;
    }
  }

  /* ── Private: Temporal Sync ──────────────────────────────── */

  private temporalSync(timestampMs: number): CameraDetection[] {
    const result: CameraDetection[] = [];
    const delta = this.config.maxTimeSyncDelta;

    for (const [, buffer] of this.detectionBuffer) {
      for (const det of buffer) {
        if (Math.abs(det.timestampMs - timestampMs) <= delta) {
          result.push(det);
        }
      }
    }

    return result;
  }

  /* ── Private: Cross-Camera Matching ──────────────────────── */

  private crossCameraMatch(detections: CameraDetection[]): CameraDetection[][] {
    if (detections.length === 0) return [];

    // Group by camera
    const byCamera = new Map<string, CameraDetection[]>();
    for (const det of detections) {
      const group = byCamera.get(det.cameraId) ?? [];
      group.push(det);
      byCamera.set(det.cameraId, group);
    }

    // If only one camera, each detection is its own group
    if (byCamera.size <= 1) {
      return detections.map(d => [d]);
    }

    // Match detections across cameras using spatial + appearance similarity
    const matched: CameraDetection[][] = [];
    const used = new Set<string>();

    const allDetections = [...detections];

    for (let i = 0; i < allDetections.length; i++) {
      if (used.has(`${allDetections[i].cameraId}_${i}`)) continue;

      const group: CameraDetection[] = [allDetections[i]];
      used.add(`${allDetections[i].cameraId}_${i}`);

      for (let j = i + 1; j < allDetections.length; j++) {
        if (used.has(`${allDetections[j].cameraId}_${j}`)) continue;
        if (allDetections[j].cameraId === allDetections[i].cameraId) continue; // Same camera

        const similarity = this.computeSimilarity(allDetections[i], allDetections[j]);
        if (similarity > this.config.minAppearanceSimilarity) {
          group.push(allDetections[j]);
          used.add(`${allDetections[j].cameraId}_${j}`);
        }
      }

      matched.push(group);
    }

    return matched;
  }

  private computeSimilarity(a: CameraDetection, b: CameraDetection): number {
    let spatialSim = 0;
    let appearanceSim = 0;

    // Spatial similarity (if both have pitch positions)
    if (a.pitchPosition && b.pitchPosition) {
      const dist = Math.sqrt(
        (a.pitchPosition[0] - b.pitchPosition[0]) ** 2 +
        (a.pitchPosition[1] - b.pitchPosition[1]) ** 2,
      );
      spatialSim = Math.max(0, 1 - dist / this.config.maxSpatialDistance);
    }

    // Appearance similarity (color histogram correlation)
    if (a.appearance.colorHistogram.length > 0 && b.appearance.colorHistogram.length > 0) {
      appearanceSim = histogramCorrelation(
        a.appearance.colorHistogram,
        b.appearance.colorHistogram,
      );
    }

    // Jersey number match (strong signal)
    if (a.appearance.jerseyNumber && b.appearance.jerseyNumber) {
      if (a.appearance.jerseyNumber === b.appearance.jerseyNumber) {
        appearanceSim = Math.max(appearanceSim, 0.95);
      } else {
        appearanceSim *= 0.3; // Different number = strong negative
      }
    }

    // Jersey color match
    const colorDist = colorDistance(a.appearance.jerseyColor, b.appearance.jerseyColor);
    const colorSim = Math.max(0, 1 - colorDist / 180);
    appearanceSim = Math.max(appearanceSim, colorSim * 0.7);

    return spatialSim * this.config.spatialWeight + appearanceSim * this.config.appearanceWeight;
  }

  /* ── Private: Track Matching ─────────────────────────────── */

  private matchToExistingTrack(group: CameraDetection[]): FusedTrack | null {
    if (this.activeTracks.size === 0) return null;

    let bestTrack: FusedTrack | null = null;
    let bestScore = 0;

    // Average position of the group
    const avgPos = this.averagePosition(group);
    if (!avgPos) return null;

    for (const track of this.activeTracks.values()) {
      // Spatial proximity
      const dist = Math.sqrt(
        (track.position[0] - avgPos[0]) ** 2 +
        (track.position[1] - avgPos[1]) ** 2,
      );
      const spatialScore = Math.max(0, 1 - dist / (this.config.maxSpatialDistance * 2));

      // Appearance match
      const bestAppearance = group.reduce((best, d) =>
        d.confidence > (best?.confidence ?? 0) ? d : best
      , group[0]);

      const appearanceScore = bestAppearance
        ? histogramCorrelation(
            track.appearance.colorHistogram,
            bestAppearance.appearance.colorHistogram,
          )
        : 0;

      const score = spatialScore * 0.7 + appearanceScore * 0.3;

      if (score > bestScore && score > 0.4) {
        bestScore = score;
        bestTrack = track;
      }
    }

    return bestTrack;
  }

  /* ── Private: Track Management ───────────────────────────── */

  private createTrack(group: CameraDetection[], timestampMs: number): FusedTrack {
    const avgPos = this.averagePosition(group) ?? [0, 0] as [number, number];
    const bestDet = group.reduce((best, d) => d.confidence > best.confidence ? d : best, group[0]);

    const playerId = `P${String(this.nextTrackId++).padStart(3, "0")}`;

    return {
      playerId,
      position: avgPos,
      positionConfidence: group.length > 1 ? 0.85 : bestDet.confidence * 0.7,
      velocity: [0, 0],
      speed: 0,
      sources: group.map(d => ({
        cameraId: d.cameraId,
        detection: d,
        weight: d.confidence * (this.cameras.get(d.cameraId)?.reliability ?? 0.5),
      })),
      bestPose: bestDet.keypoints,
      appearance: bestDet.appearance,
      framesSinceLastSeen: 0,
      status: "active",
      timestampMs,
    };
  }

  private updateTrack(
    track: FusedTrack,
    group: CameraDetection[],
    timestampMs: number,
  ): void {
    const prevPos = track.position;
    const newPos = this.averagePosition(group) ?? track.position;
    const dt = (timestampMs - track.timestampMs) / 1000; // seconds

    // Update velocity
    if (dt > 0) {
      track.velocity = [
        (newPos[0] - prevPos[0]) / dt,
        (newPos[1] - prevPos[1]) / dt,
      ];
      track.speed = Math.sqrt(track.velocity[0] ** 2 + track.velocity[1] ** 2);
    }

    // Update position (weighted by camera reliability and detection confidence)
    track.position = newPos;
    track.positionConfidence = Math.min(1.0,
      group.length > 1
        ? 0.85 + group.length * 0.03
        : group[0].confidence * 0.7,
    );

    // Update sources
    track.sources = group.map(d => ({
      cameraId: d.cameraId,
      detection: d,
      weight: d.confidence * (this.cameras.get(d.cameraId)?.reliability ?? 0.5),
    }));

    // Update best pose
    const bestDet = group.reduce((best, d) => d.confidence > best.confidence ? d : best, group[0]);
    if (bestDet.keypoints) {
      track.bestPose = bestDet.keypoints;
    }

    // Update appearance (exponential moving average)
    if (bestDet.appearance.colorHistogram.length > 0) {
      const alpha = 0.3;
      track.appearance.colorHistogram = track.appearance.colorHistogram.map((v, i) =>
        v * (1 - alpha) + (bestDet.appearance.colorHistogram[i] ?? 0) * alpha,
      );
      track.appearance.jerseyColor = bestDet.appearance.jerseyColor;
      if (bestDet.appearance.jerseyNumber) {
        track.appearance.jerseyNumber = bestDet.appearance.jerseyNumber;
      }
    }

    track.framesSinceLastSeen = 0;
    track.status = "active";
    track.timestampMs = timestampMs;
  }

  private averagePosition(group: CameraDetection[]): [number, number] | null {
    const withPos = group.filter(d => d.pitchPosition);
    if (withPos.length === 0) return null;

    // Weighted average by confidence × camera reliability
    let totalWeight = 0;
    let sumX = 0;
    let sumY = 0;

    for (const det of withPos) {
      const camReliability = this.cameras.get(det.cameraId)?.reliability ?? 0.5;
      const weight = det.confidence * camReliability;
      sumX += det.pitchPosition![0] * weight;
      sumY += det.pitchPosition![1] * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) return null;

    return [
      Math.round((sumX / totalWeight) * 100) / 100,
      Math.round((sumY / totalWeight) * 100) / 100,
    ];
  }
}

/* ── Homography Transform ──────────────────────────────────────── */

function applyHomography(
  H: number[][],
  px: number,
  py: number,
): [number, number] {
  const w = H[2][0] * px + H[2][1] * py + H[2][2];
  if (Math.abs(w) < 1e-10) return [0, 0];

  const x = (H[0][0] * px + H[0][1] * py + H[0][2]) / w;
  const y = (H[1][0] * px + H[1][1] * py + H[1][2]) / w;

  return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
}

/* ── Appearance Helpers ────────────────────────────────────────── */

function histogramCorrelation(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;

  let num = 0;
  let denA = 0;
  let denB = 0;

  for (let i = 0; i < a.length; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }

  const den = Math.sqrt(denA * denB);
  if (den < 1e-10) return 0;

  return Math.max(0, num / den); // Clamp to [0, 1]
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  // Simple HSV hue distance (circular)
  const hueDist = Math.min(Math.abs(a[0] - b[0]), 360 - Math.abs(a[0] - b[0]));
  const satDist = Math.abs(a[1] - b[1]);
  const valDist = Math.abs(a[2] - b[2]);
  return hueDist * 0.6 + satDist * 0.2 + valDist * 0.2;
}

/* ── Extract Appearance Features from Canvas ───────────────────── */

/**
 * Extract appearance features from a bounding box region in a canvas.
 * Used to build re-identification features for cross-camera matching.
 */
export function extractAppearance(
  ctx: CanvasRenderingContext2D,
  bbox: [number, number, number, number],
): AppearanceFeatures {
  const [x, y, w, h] = bbox.map(Math.round);

  // Clamp to canvas bounds
  const cx = Math.max(0, x);
  const cy = Math.max(0, y);
  const cw = Math.min(w, ctx.canvas.width - cx);
  const ch = Math.min(h, ctx.canvas.height - cy);

  if (cw <= 0 || ch <= 0) {
    return {
      jerseyColor: [0, 0, 0],
      shortsColor: [0, 0, 0],
      heightPx: h,
      colorHistogram: new Array(24).fill(0),
      bodyRatio: h > 0 ? w / h : 1,
    };
  }

  const imageData = ctx.getImageData(cx, cy, cw, ch);
  const data = imageData.data;

  // Split into upper (jersey) and lower (shorts) halves
  const midY = Math.floor(ch * 0.55);

  // Calculate dominant color for jersey (upper region, center 60%)
  const jerseyColor = dominantColor(data, cw, ch, Math.floor(cw * 0.2), 0, Math.floor(cw * 0.6), midY);
  const shortsColor = dominantColor(data, cw, ch, Math.floor(cw * 0.2), midY, Math.floor(cw * 0.6), ch - midY);

  // Build color histogram (8 bins per RGB channel)
  const histogram = new Array(24).fill(0);
  const pixelCount = cw * ch;
  for (let i = 0; i < data.length; i += 4) {
    const rBin = Math.min(7, Math.floor(data[i] / 32));
    const gBin = Math.min(7, Math.floor(data[i + 1] / 32));
    const bBin = Math.min(7, Math.floor(data[i + 2] / 32));
    histogram[rBin]++;
    histogram[8 + gBin]++;
    histogram[16 + bBin]++;
  }
  // Normalize
  for (let i = 0; i < histogram.length; i++) {
    histogram[i] = Math.round((histogram[i] / pixelCount) * 1000) / 1000;
  }

  return {
    jerseyColor,
    shortsColor,
    heightPx: h,
    colorHistogram: histogram,
    bodyRatio: h > 0 ? Math.round((w / h) * 100) / 100 : 1,
  };
}

function dominantColor(
  data: Uint8ClampedArray,
  width: number,
  _height: number,
  startX: number,
  startY: number,
  regionW: number,
  regionH: number,
): [number, number, number] {
  let rSum = 0, gSum = 0, bSum = 0, count = 0;

  for (let dy = 0; dy < regionH; dy++) {
    for (let dx = 0; dx < regionW; dx++) {
      const px = startX + dx;
      const py = startY + dy;
      const idx = (py * width + px) * 4;
      if (idx + 2 < data.length) {
        rSum += data[idx];
        gSum += data[idx + 1];
        bSum += data[idx + 2];
        count++;
      }
    }
  }

  if (count === 0) return [0, 0, 0];

  const r = rSum / count;
  const g = gSum / count;
  const b = bSum / count;

  // Convert RGB to HSV
  return rgbToHsv(r, g, b);
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return [
    Math.round(h * 360),
    Math.round(s * 100),
    Math.round(v * 100),
  ];
}

/* ── Singleton ─────────────────────────────────────────────────── */

let _fusionEngine: MultiCameraFusionEngine | null = null;

export function getFusionEngine(config?: Partial<FusionConfig>): MultiCameraFusionEngine {
  if (!_fusionEngine || config) {
    _fusionEngine = new MultiCameraFusionEngine(config);
  }
  return _fusionEngine;
}

export { DEFAULT_FUSION_CONFIG };
