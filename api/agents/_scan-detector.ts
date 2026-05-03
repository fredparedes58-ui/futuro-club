/**
 * VITAS · Scan Rate Detector (NUEVO · determinista · Sprint 4)
 * POST /api/agents/scan-detector
 *
 * Detecta cuántas veces el jugador "escanea" el campo (gira la cabeza)
 * usando los keypoints de MediaPipe.
 *
 * Métrica científica validada (Geir Jordet · Universidad Noruega):
 *   - Pedri sub-12: 0.51 scans/seg
 *   - Pro promedio: 0.4-0.8 scans/seg
 *   - Sub-12 promedio: 0.15 scans/seg
 *
 * Algoritmo:
 *   1. Por cada frame, calcular yaw (orientación cabeza horizontal)
 *      usando vector entre leftEye y rightEye + nose
 *   2. Detectar SCAN si:
 *      - cambio_yaw > 20° en menos de 0.4 segundos
 *      - velocidad_angular > 50°/seg
 *   3. Calcular:
 *      - scan_rate global (scans/segundo)
 *      - amplitud media (grados)
 *      - bilateralidad (% miradas a ambos lados)
 *
 * Indices MediaPipe Pose Landmarker:
 *   0  = nose
 *   2  = leftEye
 *   5  = rightEye
 *
 * NO requiere LLM. Pura geometría sobre keypoints.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const keypointSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().optional(),
  visibility: z.number().min(0).max(1),
});

const frameSchema = z.object({
  timestamp: z.number(),
  frame_idx: z.number().int(),
  keypoints: z.array(keypointSchema).min(33),
});

const scanSchema = z.object({
  playerId: z.string().min(1),
  frames: z.array(frameSchema).min(10),
  ageGroup: z.string().optional(), // "sub-10" | "sub-12" | etc.
});

// Umbrales de detección
const YAW_CHANGE_THRESHOLD_DEG = 20;
const TIME_WINDOW_SEC = 0.4;
const ANGULAR_VELOCITY_THRESHOLD = 50; // °/seg

// Percentiles por edad (papers Jordet + estimación)
const SCAN_RATE_BENCHMARKS: Record<string, { p25: number; p50: number; p75: number; pro: number }> = {
  "sub-10": { p25: 0.08, p50: 0.12, p75: 0.18, pro: 0.45 },
  "sub-12": { p25: 0.12, p50: 0.15, p75: 0.22, pro: 0.51 },
  "sub-14": { p25: 0.15, p50: 0.20, p75: 0.30, pro: 0.55 },
  "sub-16": { p25: 0.18, p50: 0.25, p75: 0.35, pro: 0.65 },
  "sub-19": { p25: 0.20, p50: 0.28, p75: 0.40, pro: 0.75 },
  default: { p25: 0.12, p50: 0.18, p75: 0.30, pro: 0.55 },
};

interface ScanEvent {
  startTime: number;
  endTime: number;
  yawDelta: number;        // cambio total en grados
  direction: "left" | "right";
  amplitude: number;       // valor absoluto del giro
}

export interface ScanDetectionResult {
  playerId: string;
  scansDetected: number;
  durationSec: number;
  scanRate: number;              // scans por segundo
  scanRateClassification: string; // "elite" | "above_avg" | "avg" | "below_avg"
  averageAmplitude: number;       // grados
  bilateralityPct: number | null; // % izq vs dcha
  comparison: {
    ageGroup: string;
    p25: number;
    p50: number;
    p75: number;
    pro: number;
    yourPercentile: number;
  } | null;
  events: ScanEvent[];
  frameCount: number;
}

/**
 * Calcula el yaw aproximado de la cabeza usando los puntos cara.
 * Returns: ángulo en grados, donde 0 = mirando recto a cámara,
 * positivo = mirando a su derecha, negativo = mirando a su izquierda.
 *
 * Métodos posibles (con MediaPipe Pose):
 *   - Distance ratio entre nose y eyes
 *   - z-coordinates si están disponibles (MediaPipe da z relativo)
 *
 * Aquí usamos una aproximación 2D razonable:
 *   yaw_degrees ≈ atan2(nose.x - midpoint_eyes.x, |leftEye.x - rightEye.x|/2)
 */
function computeYaw(kp: Array<{ x: number; y: number; visibility: number }>): number | null {
  const nose = kp[0];
  const leftEye = kp[2];
  const rightEye = kp[5];

  if (nose.visibility < 0.5 || leftEye.visibility < 0.5 || rightEye.visibility < 0.5) {
    return null;
  }

  const midX = (leftEye.x + rightEye.x) / 2;
  const eyeDist = Math.abs(rightEye.x - leftEye.x);

  if (eyeDist < 5) return null; // ojos demasiado juntos · no fiable

  // Cuando la cabeza está girada lateralmente, la nariz se desplaza
  // del punto medio entre ojos en proporción al ángulo.
  const noseOffset = nose.x - midX;
  const ratio = noseOffset / (eyeDist / 2);

  // Aproximación: ratio de [-1, 1] mapea a [-60°, 60°]
  const clampedRatio = Math.max(-1, Math.min(1, ratio));
  return clampedRatio * 60;
}

function classifyScanRate(rate: number, benchmarks: typeof SCAN_RATE_BENCHMARKS["default"]): string {
  if (rate >= benchmarks.pro * 0.85) return "elite";
  if (rate >= benchmarks.p75) return "above_avg";
  if (rate >= benchmarks.p25) return "avg";
  return "below_avg";
}

function percentile(value: number, p25: number, p50: number, p75: number, pro: number): number {
  if (value < p25) return Math.round((value / p25) * 25);
  if (value < p50) return Math.round(25 + ((value - p25) / (p50 - p25)) * 25);
  if (value < p75) return Math.round(50 + ((value - p50) / (p75 - p50)) * 25);
  if (value < pro) return Math.round(75 + ((value - p75) / (pro - p75)) * 24);
  return 99;
}

export default withHandler(
  { schema: scanSchema, requireAuth: true, maxRequests: 100 },
  async ({ body }) => {
    const input = body as z.infer<typeof scanSchema>;

    // ── 1. Calcular yaw por frame ────────────────────────────
    const yawSeries: Array<{ t: number; yaw: number }> = [];
    for (const f of input.frames) {
      const yaw = computeYaw(f.keypoints);
      if (yaw !== null) {
        yawSeries.push({ t: f.timestamp, yaw });
      }
    }

    if (yawSeries.length < 5) {
      return errorResponse({
        code: "insufficient_face_data",
        message: "No hay suficientes frames con cara visible para detectar scans",
        status: 422,
      });
    }

    // ── 2. Detectar scans (cambios bruscos de yaw) ───────────
    const events: ScanEvent[] = [];
    for (let i = 1; i < yawSeries.length; i++) {
      const dt = yawSeries[i].t - yawSeries[i - 1].t;
      if (dt <= 0 || dt > TIME_WINDOW_SEC) continue;

      const yawDelta = yawSeries[i].yaw - yawSeries[i - 1].yaw;
      const angularVelocity = Math.abs(yawDelta) / dt;
      const amplitude = Math.abs(yawDelta);

      if (
        amplitude >= YAW_CHANGE_THRESHOLD_DEG &&
        angularVelocity >= ANGULAR_VELOCITY_THRESHOLD
      ) {
        events.push({
          startTime: yawSeries[i - 1].t,
          endTime: yawSeries[i].t,
          yawDelta,
          direction: yawDelta > 0 ? "right" : "left",
          amplitude: Number(amplitude.toFixed(2)),
        });
      }
    }

    // ── 3. Métricas agregadas ─────────────────────────────────
    const totalDuration = yawSeries[yawSeries.length - 1].t - yawSeries[0].t;
    const scanRate = totalDuration > 0 ? events.length / totalDuration : 0;
    const avgAmplitude = events.length > 0
      ? events.reduce((s, e) => s + e.amplitude, 0) / events.length
      : 0;

    const leftScans = events.filter(e => e.direction === "left").length;
    const rightScans = events.filter(e => e.direction === "right").length;
    const bilateralityPct = events.length > 0
      ? Math.round((Math.min(leftScans, rightScans) / events.length) * 100)
      : null;

    // ── 4. Comparación por edad ──────────────────────────────
    const ageGroup = input.ageGroup ?? "default";
    const benchmarks = SCAN_RATE_BENCHMARKS[ageGroup] ?? SCAN_RATE_BENCHMARKS.default;
    const classification = classifyScanRate(scanRate, benchmarks);
    const percentileRank = percentile(scanRate, benchmarks.p25, benchmarks.p50, benchmarks.p75, benchmarks.pro);

    const result: ScanDetectionResult = {
      playerId: input.playerId,
      scansDetected: events.length,
      durationSec: Number(totalDuration.toFixed(2)),
      scanRate: Number(scanRate.toFixed(3)),
      scanRateClassification: classification,
      averageAmplitude: Number(avgAmplitude.toFixed(2)),
      bilateralityPct,
      comparison: {
        ageGroup,
        ...benchmarks,
        yourPercentile: percentileRank,
      },
      events: events.slice(0, 20), // máximo 20 eventos para no inflar respuesta
      frameCount: yawSeries.length,
    };

    return successResponse(result);
  }
);
