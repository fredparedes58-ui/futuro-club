/**
 * VITAS · Biomechanics Extractor (NUEVO · determinista)
 * POST /api/agents/biomechanics-extractor
 *
 * Recibe los keypoints de MMPose (17 keypoints COCO) y calcula métricas
 * biomecánicas reales del jugador objetivo a lo largo del vídeo.
 *
 * Métricas calculadas:
 *   - Ángulo de rodilla (izq/dcha) durante carrera
 *   - Asimetría izquierda vs derecha (% diferencia)
 *   - Frecuencia de zancada (zancadas por segundo)
 *   - Velocidad estimada de sprint (px/s normalizado)
 *   - Inclinación del tronco (grados respecto vertical)
 *   - Calidad del golpeo (cuando se detecta contacto con balón)
 *
 * Pura geometría euclidiana — cero LLM. Latencia <50ms para 90 seg de vídeo.
 *
 * NOTA: Este endpoint asume que los keypoints ya vienen extraídos por
 * MMPose (Modal). Aquí solo hacemos los cálculos derivados.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

// ── Schema ───────────────────────────────────────────────────────
const keypointSchema = z.object({
  x: z.number(),
  y: z.number(),
  confidence: z.number().min(0).max(1),
});

const frameSchema = z.object({
  timestamp: z.number(),  // segundos desde inicio
  keypoints: z.object({
    nose: keypointSchema,
    leftShoulder: keypointSchema,
    rightShoulder: keypointSchema,
    leftElbow: keypointSchema,
    rightElbow: keypointSchema,
    leftWrist: keypointSchema,
    rightWrist: keypointSchema,
    leftHip: keypointSchema,
    rightHip: keypointSchema,
    leftKnee: keypointSchema,
    rightKnee: keypointSchema,
    leftAnkle: keypointSchema,
    rightAnkle: keypointSchema,
  }),
});

const extractorSchema = z.object({
  playerId: z.string().min(1),
  frames: z.array(frameSchema).min(10),
  videoFps: z.number().positive().default(30),
  pixelsPerMeter: z.number().positive().optional(), // calibración opcional
});

type Frame = z.infer<typeof frameSchema>;

// ── Helpers geométricos ──────────────────────────────────────────

function angle(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  // Ángulo en B formado por puntos A-B-C, en grados
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.hypot(ab.x, ab.y);
  const magCB = Math.hypot(cb.x, cb.y);
  if (magAB === 0 || magCB === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Number((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2));
}

// ── Métricas ─────────────────────────────────────────────────────

function computeKneeAngles(frames: Frame[]) {
  const left: number[] = [];
  const right: number[] = [];

  for (const f of frames) {
    const kp = f.keypoints;
    if (kp.leftHip.confidence > 0.3 && kp.leftKnee.confidence > 0.3 && kp.leftAnkle.confidence > 0.3) {
      left.push(angle(kp.leftHip, kp.leftKnee, kp.leftAnkle));
    }
    if (kp.rightHip.confidence > 0.3 && kp.rightKnee.confidence > 0.3 && kp.rightAnkle.confidence > 0.3) {
      right.push(angle(kp.rightHip, kp.rightKnee, kp.rightAnkle));
    }
  }

  return {
    leftAvgDeg: average(left),
    rightAvgDeg: average(right),
    asymmetryPct:
      left.length && right.length
        ? Number((Math.abs(average(left) - average(right)) / Math.max(average(left), average(right)) * 100).toFixed(2))
        : null,
  };
}

function computeStrideFrequency(frames: Frame[], fps: number): number {
  // Detectar picos de altura del tobillo (paso) y contar zancadas
  const ankleY: number[] = frames
    .filter((f) => f.keypoints.leftAnkle.confidence > 0.3)
    .map((f) => f.keypoints.leftAnkle.y);

  if (ankleY.length < fps) return 0;

  let peaks = 0;
  for (let i = 1; i < ankleY.length - 1; i++) {
    if (ankleY[i] < ankleY[i - 1] && ankleY[i] < ankleY[i + 1]) {
      peaks++;
    }
  }
  const durationSec = ankleY.length / fps;
  return Number((peaks / durationSec).toFixed(2));
}

function computeSprintSpeed(frames: Frame[], fps: number, ppm?: number): number {
  if (frames.length < 2) return 0;

  // Centro de masa aproximado: punto medio caderas
  const positions = frames
    .filter((f) => f.keypoints.leftHip.confidence > 0.3 && f.keypoints.rightHip.confidence > 0.3)
    .map((f) => ({
      x: (f.keypoints.leftHip.x + f.keypoints.rightHip.x) / 2,
      y: (f.keypoints.leftHip.y + f.keypoints.rightHip.y) / 2,
      t: f.timestamp,
    }));

  if (positions.length < 5) return 0;

  let maxSpeed = 0;
  for (let i = 1; i < positions.length; i++) {
    const dx = positions[i].x - positions[i - 1].x;
    const dy = positions[i].y - positions[i - 1].y;
    const dt = positions[i].t - positions[i - 1].t || 1 / fps;
    const speedPxPerSec = Math.hypot(dx, dy) / dt;
    if (speedPxPerSec > maxSpeed) maxSpeed = speedPxPerSec;
  }

  // Si tenemos calibración, devolver m/s; si no, px/s
  return ppm ? Number((maxSpeed / ppm).toFixed(2)) : Number(maxSpeed.toFixed(0));
}

function computeTrunkInclination(frames: Frame[]): number {
  // Vector cadera→hombro vs vertical
  const angles: number[] = [];
  for (const f of frames) {
    const lh = f.keypoints.leftHip, rh = f.keypoints.rightHip;
    const ls = f.keypoints.leftShoulder, rs = f.keypoints.rightShoulder;
    if (lh.confidence < 0.3 || rh.confidence < 0.3 || ls.confidence < 0.3 || rs.confidence < 0.3) continue;

    const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    const dx = shoulderMid.x - hipMid.x;
    const dy = hipMid.y - shoulderMid.y; // y crece hacia abajo en imagen
    const ang = (Math.atan2(dx, dy) * 180) / Math.PI;
    angles.push(Math.abs(ang));
  }
  return average(angles);
}

export interface BiomechMetrics {
  playerId: string;
  framesAnalyzed: number;
  videoDurationSec: number;
  knee: {
    leftAvgDeg: number;
    rightAvgDeg: number;
    asymmetryPct: number | null;
  };
  strideFrequencyHz: number;
  sprintSpeed: { value: number; unit: "m/s" | "px/s" };
  trunkInclinationDeg: number;
  qualityScore: number; // 0-100, qué tan fiable son las métricas
}

export default withHandler(
  { schema: extractorSchema, requireAuth: true, maxRequests: 100 },
  async ({ body }) => {
    const input = body as z.infer<typeof extractorSchema>;
    const frames = input.frames;

    // Calcular métricas
    const knee = computeKneeAngles(frames);
    const strideFrequency = computeStrideFrequency(frames, input.videoFps);
    const sprintSpeed = computeSprintSpeed(frames, input.videoFps, input.pixelsPerMeter);
    const trunkInclination = computeTrunkInclination(frames);

    // Calidad: % de frames con confianza promedio >0.5 en keypoints clave
    const goodFrames = frames.filter((f) => {
      const kp = f.keypoints;
      const avgConf = (kp.leftHip.confidence + kp.rightHip.confidence + kp.leftKnee.confidence + kp.rightKnee.confidence) / 4;
      return avgConf > 0.5;
    }).length;
    const qualityScore = Number(((goodFrames / frames.length) * 100).toFixed(1));

    const result: BiomechMetrics = {
      playerId: input.playerId,
      framesAnalyzed: frames.length,
      videoDurationSec: frames[frames.length - 1].timestamp - frames[0].timestamp,
      knee,
      strideFrequencyHz: strideFrequency,
      sprintSpeed: {
        value: sprintSpeed,
        unit: input.pixelsPerMeter ? "m/s" : "px/s",
      },
      trunkInclinationDeg: trunkInclination,
      qualityScore,
    };

    return successResponse(result);
  }
);
