/**
 * VITAS · Centroid / IoU Tracker
 *
 * Rastrea jugadores entre frames consecutivos usando IoU matching.
 * Asigna un ID estable a cada jugador durante toda la sesión.
 * Sin Kalman — suficiente para 5-10 FPS con fútbol amateur.
 */

import type { Detection, Track, FieldPosition } from "./types";
import { pixelToField, fieldDistance } from "./homography";

const EMA_ALPHA    = 0.35;   // suavizado de velocidad (exponential moving average)
const MAX_AGE      = 8;       // frames sin match antes de eliminar track
const IOU_THRESH   = 0.25;    // umbral mínimo IoU para match
const SPRINT_MS    = 5.83;    // m/s ≈ 21 km/h

// ── Sanity checks para evitar métricas absurdas ──────────────────────────────
const MAX_SPEED_MS      = 12.5;  // 45 km/h — imposible en fútbol
const MAX_DIST_PER_FRAME = 5.0;  // metros — un jugador NO se mueve 5m entre frames a 8fps
const MIN_DT_S           = 0.05; // 50ms mínimo entre frames
const MAX_DT_S           = 2.0;  // 2s máximo (si más, el track probablemente cambió)
const FIELD_MAX_X        = 115;  // metros (campo + margen)
const FIELD_MAX_Y        = 78;   // metros (campo + margen)

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
        const det   = detections[di];

        // Calcular posición en campo
        const cx = det.bbox[0] + det.bbox[2] / 2;
        const cy = det.bbox[1] + det.bbox[3] / 2;
        const fieldPos = pixelToField(H, cx, cy);

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

        // Almacenar posición si es válida
        if (fieldValid) {
          const pos: FieldPosition = { fx: fieldPos.fx, fy: fieldPos.fy, timestampMs };
          track.positions.push(pos);
          track.lastFieldPos    = fieldPos;
          track.lastTimestampMs = timestampMs;
        }

        // Actualizar track
        track.bbox      = det.bbox;
        track.keypoints = det.keypoints;
        track.age       = 0;
      }
    }

    // ── 2. Detecciones sin match → nuevos tracks ──────────────────────────────
    detections.forEach((det, di) => {
      if (matched.has(di)) return;
      const cx = det.bbox[0] + det.bbox[2] / 2;
      const cy = det.bbox[1] + det.bbox[3] / 2;
      const fieldPos = pixelToField(H, cx, cy);

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
      };
      this.tracks.set(newTrack.id, newTrack);
    });

    // ── 3. Incrementar edad de tracks sin match y eliminar los viejos ─────────
    for (const [id, track] of this.tracks) {
      if (track.age > 0 || !detections.length) {
        track.age++;
        if (track.age > this.maxAge) this.tracks.delete(id);
      }
    }

    return [...this.tracks.values()];
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
