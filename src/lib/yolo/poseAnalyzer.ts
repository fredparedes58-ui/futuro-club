/**
 * VITAS · Pose Analyzer
 *
 * Detecta eventos de escaneo (giro de cabeza) y duelos
 * a partir de los keypoints COCO-17 de YOLOv8n-pose.
 *
 * COCO keypoints:
 *   0=nariz  1=ojoIzq  2=ojoDer  3=orejaIzq  4=orejaDer
 *   5=hombroIzq  6=hombroDer  11=caderaIzq  12=caderaDer
 */

import type { Track, ScanEvent, DuelEvent, Keypoint } from "./types";
import { fieldDistance } from "./homography";

const SCAN_ANGLE_THRESH   = 28;   // grados — diferencia de ángulo para detectar escaneo
const SCAN_MIN_FRAMES     = 2;    // frames mínimos para confirmar escaneo
const DUEL_DISTANCE_M     = 1.8;  // metros — distancia máxima para considerar duelo
const DUEL_MIN_FRAMES     = 3;    // frames mínimos para confirmar duelo
const KP_CONF_THRESH      = 0.3;  // confianza mínima de keypoint

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface ScanState {
  direction: "left" | "right" | null;
  framesCount: number;
  startMs: number;
}

interface DuelState {
  trackIds: [number, number];
  framesCount: number;
  startMs: number;
  type: "aerial" | "ground";
}

// ─── Analyzer ─────────────────────────────────────────────────────────────────

export class PoseAnalyzer {
  private scanStates  = new Map<number, ScanState>();
  private duelStates  = new Map<string, DuelState>();

  analyzeTracks(
    tracks:      Track[],
    timestampMs: number,
    fps:         number
  ): { scans: ScanEvent[]; duels: DuelEvent[] } {
    const newScans: ScanEvent[] = [];
    const newDuels: DuelEvent[] = [];

    // ── Escaneo por jugador ───────────────────────────────────────────────────
    for (const track of tracks) {
      const scan = detectScanDirection(track.keypoints);

      let state = this.scanStates.get(track.id);
      if (!state) {
        state = { direction: null, framesCount: 0, startMs: timestampMs };
        this.scanStates.set(track.id, state);
      }

      if (scan && scan === state.direction) {
        state.framesCount++;
      } else if (scan && scan !== state.direction) {
        // Nueva dirección de escaneo
        if (state.framesCount >= SCAN_MIN_FRAMES && state.direction) {
          newScans.push({
            trackId:     track.id,
            timestampMs: state.startMs,
            direction:   state.direction,
            durationMs:  timestampMs - state.startMs,
          });
        }
        state.direction  = scan;
        state.framesCount = 1;
        state.startMs    = timestampMs;
      } else {
        // Sin escaneo — cerrar si había uno en curso
        if (state.framesCount >= SCAN_MIN_FRAMES && state.direction) {
          newScans.push({
            trackId:     track.id,
            timestampMs: state.startMs,
            direction:   state.direction,
            durationMs:  timestampMs - state.startMs,
          });
        }
        state.direction  = null;
        state.framesCount = 0;
      }
    }

    // ── Duelos entre pares de jugadores ───────────────────────────────────────
    for (let i = 0; i < tracks.length; i++) {
      for (let j = i + 1; j < tracks.length; j++) {
        const a = tracks[i];
        const b = tracks[j];
        if (!a.lastFieldPos || !b.lastFieldPos) continue;

        const dist = fieldDistance(a.lastFieldPos, b.lastFieldPos);
        const key  = [Math.min(a.id, b.id), Math.max(a.id, b.id)].join("-");

        if (dist <= DUEL_DISTANCE_M) {
          const duelType = detectDuelType(a.keypoints, b.keypoints);

          let state = this.duelStates.get(key);
          if (!state) {
            state = {
              trackIds:   [a.id, b.id],
              framesCount: 0,
              startMs:    timestampMs,
              type:       duelType,
            };
            this.duelStates.set(key, state);
          }
          state.framesCount++;

          if (state.framesCount === DUEL_MIN_FRAMES) {
            const midField = {
              fx: ((a.lastFieldPos.fx + b.lastFieldPos.fx) / 2),
              fy: ((a.lastFieldPos.fy + b.lastFieldPos.fy) / 2),
            };
            newDuels.push({
              trackIds:    [a.id, b.id],
              timestampMs: state.startMs,
              fieldPos:    midField,
              type:        state.type,
              winnerId:    null, // se determina en frame posterior
            });
          }
        } else {
          this.duelStates.delete(key);
        }
      }
    }

    // Limpiar tracks que ya no están activos
    const activeIds = new Set(tracks.map(t => t.id));
    for (const id of this.scanStates.keys()) {
      if (!activeIds.has(id)) this.scanStates.delete(id);
    }

    return { scans: newScans, duels: newDuels };
  }

  reset(): void {
    this.scanStates.clear();
    this.duelStates.clear();
  }
}

// ─── Detectar dirección de escaneo desde keypoints ───────────────────────────

function detectScanDirection(keypoints: Keypoint[]): "left" | "right" | null {
  if (keypoints.length < 17) return null;

  const nose      = keypoints[0];
  const earLeft   = keypoints[3];
  const earRight  = keypoints[4];
  const shoulderL = keypoints[5];
  const shoulderR = keypoints[6];

  // Verificar confianza mínima
  if (nose.confidence < KP_CONF_THRESH) return null;
  if (shoulderL.confidence < KP_CONF_THRESH || shoulderR.confidence < KP_CONF_THRESH) return null;

  // Vector eje del cuerpo (hombros)
  const bodyAngle = Math.atan2(
    shoulderR.y - shoulderL.y,
    shoulderR.x - shoulderL.x
  ) * (180 / Math.PI);

  // Asymmetría de orejas: si orejaIzq más visible → mirando a la derecha
  const leftEarVisible  = earLeft.confidence  > KP_CONF_THRESH;
  const rightEarVisible = earRight.confidence > KP_CONF_THRESH;

  if (leftEarVisible && !rightEarVisible) {
    // Solo se ve oreja izquierda → cara apuntando a la derecha
    return "right";
  }
  if (rightEarVisible && !leftEarVisible) {
    // Solo se ve oreja derecha → cara apuntando a la izquierda
    return "left";
  }

  // Ambas orejas visibles → calcular asimetría por posición de nariz
  if (leftEarVisible && rightEarVisible) {
    const earMidX = (earLeft.x + earRight.x) / 2;
    const noseOffset = nose.x - earMidX;
    if (Math.abs(noseOffset) > 8) { // píxeles
      return noseOffset > 0 ? "right" : "left";
    }
  }

  return null;
}

// ─── Detectar tipo de duelo (aéreo vs en suelo) ───────────────────────────────

function detectDuelType(kpA: Keypoint[], kpB: Keypoint[]): "aerial" | "ground" {
  if (kpA.length < 17 || kpB.length < 17) return "ground";

  // Si las caderas de ambos jugadores están por encima de sus rodillas → salto
  const hipAy   = (kpA[11].y + kpA[12].y) / 2;
  const kneeAy  = (kpA[13].y + kpA[14].y) / 2;
  const hipBy   = (kpB[11].y + kpB[12].y) / 2;
  const kneeby  = (kpB[13].y + kpB[14].y) / 2;

  // En imagen: Y menor = más arriba; si cadera está cerca de rodilla en Y → saltando
  const aJumping = Math.abs(hipAy - kneeAy) < 20;
  const bJumping = Math.abs(hipBy - kneeby) < 20;

  return (aJumping || bJumping) ? "aerial" : "ground";
}
