/**
 * VITAS · Centroid / IoU Tracker + Kalman Prediction
 *
 * Rastrea jugadores entre frames consecutivos usando IoU matching.
 * Asigna un ID estable a cada jugador durante toda la sesión.
 *
 * When IoU matching fails (occlusion, players crossing), the tracker
 * falls back to Kalman-predicted position matching within a distance
 * threshold. This dramatically reduces ID switches.
 */

import type { Detection, Track, FieldPosition } from "./types";
import { pixelToField, fieldDistance } from "./homography";
import { KalmanLite2D } from "./kalmanLite";
import type { PlayerIdentity } from "./playerIdentityManager";

const EMA_ALPHA    = 0.35;   // suavizado de velocidad (exponential moving average)
const MAX_AGE      = 8;       // frames sin match antes de eliminar track
const IOU_THRESH   = 0.25;    // umbral mínimo IoU para match
const SPRINT_MS    = 5.83;    // m/s ≈ 21 km/h

// ── Kalman fallback constants ────────────────────────────────────────────────
/** Max distance (meters) for Kalman-predicted position matching */
const KALMAN_DIST_THRESH = 4.0;
/** Default dt for Kalman prediction when timestamp gap is unknown */
const DEFAULT_DT_S = 0.125; // 8 FPS

// ── Sanity checks para evitar métricas absurdas ──────────────────────────────
const MAX_SPEED_MS      = 12.5;  // 45 km/h — imposible en fútbol
const MAX_DIST_PER_FRAME = 5.0;  // metros — un jugador NO se mueve 5m entre frames a 8fps
const MIN_DT_S           = 0.05; // 50ms mínimo entre frames
const MAX_DT_S           = 2.0;  // 2s máximo (si más, el track probablemente cambió)
const FIELD_MAX_X        = 115;  // metros (campo + margen)
const FIELD_MAX_Y        = 78;   // metros (campo + margen)

// ── Punto de contacto con el SUELO (pies) ────────────────────────────────────
// La homografía px→m asume que el punto proyectado está EN EL SUELO. El centro del
// bbox está a la altura del TORSO → al proyectarlo mete un error sistemático que
// CRECE con el acercamiento a cámara (perspectiva) → contamina distancia/velocidad.
// Usamos el borde INFERIOR-centro del bbox (x+w/2, y+h) = la suela, punto de suelo.
//
// Descartado usar los tobillos (COCO 15/16) pese a ser marginalmente más precisos:
// alternar tobillo↔bbox según la confianza del keypoint (que oscila alrededor de un
// umbral) inyectaría desplazamiento fantasma entre frames → distancia/sprints
// espurios en un jugador quieto. El borde inferior es una referencia ÚNICA y estable
// → sin ese falso movimiento (coherente con el principio anti-fallo-silencioso).
/** Punto (px) donde el jugador toca el suelo, para proyectar a metros. */
export function groundContactPx(det: Detection): { x: number; y: number } {
  return { x: det.bbox[0] + det.bbox[2] / 2, y: det.bbox[1] + det.bbox[3] };
}

export class CentroidTracker {
  private tracks  = new Map<number, Track>();
  private nextId  = 1;
  private maxAge  = MAX_AGE;

  /**
   * Actualiza los tracks con las nuevas detecciones del frame actual.
   * @param detections  Detecciones YOLO del frame actual
   * @param H           Matriz de homografía (píxeles → metros)
   * @param timestampMs Timestamp del frame en ms
   */
  update(
    detections: Detection[],
    H: Float64Array,
    timestampMs: number,
  ): Track[] {

    // ── 1. Calcular matriz IoU entre tracks existentes y detecciones ──────────
    const trackList = [...this.tracks.values()];
    const matched   = new Set<number>(); // índices de detecciones ya asignadas
    const matchedTrackIds = new Set<number>(); // IDs de tracks ya asignados

    if (trackList.length > 0 && detections.length > 0) {
      // Construir matriz de similitud
      const iouMatrix: number[][] = trackList.map(t =>
        detections.map(d => computeIoU(t.bbox, d.bbox))
      );

      // Greedy matching: asignar pares ordenados por IoU descendente
      const pairs: Array<[number, number, number]> = []; // [trackIdx, detIdx, iou]
      iouMatrix.forEach((row, ti) => {
        row.forEach((iou, di) => { if (iou > IOU_THRESH) pairs.push([ti, di, iou]); });
      });
      pairs.sort((a, b) => b[2] - a[2]);

      const usedTracks = new Set<number>();
      for (const [ti, di] of pairs) {
        if (usedTracks.has(ti) || matched.has(di)) continue;
        usedTracks.add(ti);
        matched.add(di);

        const track = trackList[ti];
        matchedTrackIds.add(track.id);
        this.updateTrackWithDetection(track, detections[di], H, timestampMs);
      }

      // ── 1b. Kalman fallback for unmatched tracks ──────────────────────────
      // For tracks that failed IoU matching, use Kalman predicted position
      // to find the nearest unmatched detection within distance threshold.
      for (let ti = 0; ti < trackList.length; ti++) {
        const track = trackList[ti];
        if (matchedTrackIds.has(track.id)) continue;
        if (!track.kalman || !track.lastFieldPos) continue;

        // Predict where this track should be now
        const dt = track.lastTimestampMs > 0
          ? (timestampMs - track.lastTimestampMs) / 1000
          : DEFAULT_DT_S;
        if (dt < MIN_DT_S || dt > MAX_DT_S) continue;

        const predicted = track.kalman.predict(dt);

        // Find nearest unmatched detection within threshold
        let bestDi = -1;
        let bestDist = KALMAN_DIST_THRESH;

        for (let di = 0; di < detections.length; di++) {
          if (matched.has(di)) continue;
          const det = detections[di];
          const g = groundContactPx(det);
          const fp = pixelToField(H, g.x, g.y);

          const dist = Math.sqrt(
            (fp.fx - predicted.fx) ** 2 + (fp.fy - predicted.fy) ** 2,
          );

          if (dist < bestDist) {
            bestDist = dist;
            bestDi = di;
          }
        }

        if (bestDi >= 0) {
          matched.add(bestDi);
          matchedTrackIds.add(track.id);
          this.updateTrackWithDetection(track, detections[bestDi], H, timestampMs);
        }
      }
    }

    // ── 2. Detecciones sin match → nuevos tracks ──────────────────────────────
    detections.forEach((det, di) => {
      if (matched.has(di)) return;
      const g = groundContactPx(det);
      const fieldPos = pixelToField(H, g.x, g.y);

      const newTrack: Track = {
        id:              this.nextId++,
        bbox:            det.bbox,
        keypoints:       det.keypoints,
        age:             0,
        positions:       [{ fx: fieldPos.fx, fy: fieldPos.fy, timestampMs }],
        lastFieldPos:    fieldPos,
        lastTimestampMs: timestampMs,
        speedMs:         0,
        smoothSpeedMs:   0,
        accelMs2:        0,
        distanceM:       0,
        sprintCount:     0,
        kalman:          new KalmanLite2D(fieldPos.fx, fieldPos.fy),
      };
      this.tracks.set(newTrack.id, newTrack);
    });

    // ── 3. Incrementar edad de tracks sin match y eliminar los viejos ─────────
    for (const [id, track] of this.tracks) {
      if (!matchedTrackIds.has(id)) {
        track.age++;
        if (track.age > this.maxAge) this.tracks.delete(id);
      }
    }

    return [...this.tracks.values()];
  }

  /**
   * Update a track with a matched detection: compute metrics, update Kalman.
   */
  private updateTrackWithDetection(
    track: Track,
    det: Detection,
    H: Float64Array,
    timestampMs: number,
  ): void {
    // Calcular posición en campo (punto de contacto con el suelo = pies)
    const g = groundContactPx(det);
    const fieldPos = pixelToField(H, g.x, g.y);

    // Sanity check: si las coordenadas de campo están fuera de rango,
    // la homografía es inválida → no acumular métricas
    const fieldValid = Math.abs(fieldPos.fx) < FIELD_MAX_X
                    && Math.abs(fieldPos.fy) < FIELD_MAX_Y
                    && isFinite(fieldPos.fx) && isFinite(fieldPos.fy);

    // Calcular velocidad y aceleración usando timestamps REALES
    let speedMs = 0;
    let accelMs2 = 0;
    if (track.lastFieldPos && track.lastTimestampMs > 0 && fieldValid) {
      // dt REAL desde el último frame de ESTE track (no hardcoded)
      const dt = (timestampMs - track.lastTimestampMs) / 1000;

      // Solo calcular si dt está en rango razonable
      if (dt >= MIN_DT_S && dt <= MAX_DT_S) {
        const dist = fieldDistance(track.lastFieldPos, fieldPos);

        // Sanity: si un jugador "salta" >5m en un frame, es un glitch de tracking
        if (dist < MAX_DIST_PER_FRAME) {
          speedMs = dist / dt;

          // Clamp a velocidad física máxima (45 km/h)
          speedMs = Math.min(speedMs, MAX_SPEED_MS);

          // EMA para suavizar
          const smooth = EMA_ALPHA * speedMs + (1 - EMA_ALPHA) * track.smoothSpeedMs;
          accelMs2 = (smooth - track.smoothSpeedMs) / dt;

          // Acumular distancia e intensidad
          track.distanceM += dist;
          if (speedMs > SPRINT_MS) track.sprintCount++;

          track.speedMs       = speedMs;
          track.smoothSpeedMs = smooth;
          track.accelMs2      = Math.min(Math.abs(accelMs2), 8.0) * Math.sign(accelMs2); // clamp accel
        }
        // else: salto grande → mantener métricas anteriores, no acumular
      }
    }

    // Almacenar posición y update Kalman si es válida
    if (fieldValid) {
      const pos: FieldPosition = { fx: fieldPos.fx, fy: fieldPos.fy, timestampMs };
      track.positions.push(pos);
      track.lastFieldPos    = fieldPos;
      track.lastTimestampMs = timestampMs;

      // Update Kalman filter with observed position
      if (track.kalman) {
        track.kalman.update(fieldPos.fx, fieldPos.fy);
      }
    }

    // Actualizar track
    track.bbox      = det.bbox;
    track.keypoints = det.keypoints;
    track.age       = 0;
  }

  /**
   * Apply identity data from PlayerIdentityManager to current tracks.
   * Called after processFrame() in the main thread with identity results.
   *
   * @param identities Map of trackId → PlayerIdentity
   */
  applyIdentities(identities: Map<number, PlayerIdentity>): void {
    for (const [trackId, identity] of identities) {
      const track = this.tracks.get(trackId);
      if (!track) continue;

      track.stableId = identity.stableId;
      track.dorsalNumber = identity.dorsalNumber ?? undefined;
      track.team = identity.team === "home" || identity.team === "away"
        ? identity.team
        : "unknown";
      track.identityConfidence = identity.confidence;
    }
  }

  reset(): void {
    this.tracks.clear();
    this.nextId = 1;
  }

  getTrack(id: number): Track | undefined {
    return this.tracks.get(id);
  }
}

// ─── IoU entre dos bounding boxes [x,y,w,h] ──────────────────────────────────

function computeIoU(
  a: [number, number, number, number],
  b: [number, number, number, number]
): number {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;

  const ax2 = ax + aw, ay2 = ay + ah;
  const bx2 = bx + bw, by2 = by + bh;

  const ix1 = Math.max(ax, bx), iy1 = Math.max(ay, by);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);

  const interW = Math.max(0, ix2 - ix1);
  const interH = Math.max(0, iy2 - iy1);
  const interA = interW * interH;

  if (interA === 0) return 0;

  const unionA = aw * ah + bw * bh - interA;
  return interA / unionA;
}
