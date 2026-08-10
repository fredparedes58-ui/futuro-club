/**
 * VITAS · POST /api/tactical/compute-from-video
 *
 * Cableado completo del flujo "tengo un video, quiero el heatmap táctico":
 *
 *   1. Recibe videoUrl + matchId + (opcional) frameSize del video
 *   2. Llama a Modal `track` endpoint → devuelve players[] + ball[]
 *   3. Reorganiza los frames en `samples[]` (1 entry por timestamp con todos
 *      los jugadores y la pelota)
 *   4. Asigna team (ours/theirs) a cada track — heurística inicial: los
 *      primeros 11 IDs únicos son "ours", los siguientes "theirs"
 *   5. Llama internamente a /api/tactical/compute-heatmap
 *
 * Endpoint diseñado para ser disparado:
 *   - Manualmente por el coach desde la UI ("Recomputar heatmap")
 *   - Automáticamente desde modal-callback cuando se completa un análisis
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { isOverBudget, recordSpendUsd, budgetExceededResponse } from "../_lib/budgetGuard";

export const config = { runtime: "edge" };

const MODAL_TRACK_URL = process.env.MODAL_TRACK_URL ?? "";
const MODAL_API_KEY = process.env.MODAL_API_KEY ?? "";
const PUBLIC_URL =
  process.env.VITAS_PUBLIC_URL ??
  `https://${process.env.VERCEL_URL ?? "futuro-club.vercel.app"}`;

const ComputeFromVideoSchema = z.object({
  matchId: z.string(),
  videoUrl: z.string().url(),
  videoId: z.string().optional(),
  /** Original frame dimensions for pixel→pitch normalization. */
  frameWidth: z.number().optional(),
  frameHeight: z.number().optional(),
  /** FPS at which Modal will sample the video (default 5). */
  sampleFps: z.number().int().min(1).max(15).optional(),
});

interface ModalPlayer {
  track_id: number;
  timestamp_ms: number;
  bbox: [number, number, number, number]; // x1, y1, x2, y2
  confidence: number;
}

interface ModalBall {
  timestamp_ms: number;
  x: number;
  y: number;
  confidence: number;
}

interface ModalResponse {
  status: string;
  duration_sec: number;
  fps_source: number;
  sample_fps: number;
  players: ModalPlayer[];
  ball: ModalBall[];
}

interface TacticalSample {
  timestampMs: number;
  ball: { x: number; y: number };
  players: Array<{ id: string; x: number; y: number; team: "ours" | "theirs" }>;
}

/**
 * Convierte el output de Modal en el formato que espera compute-heatmap.
 *
 * Modal devuelve players plano (un array de PlayerAppearance, cada uno una
 * detección en un frame concreto). Necesitamos agruparlos por timestamp.
 *
 * Coords del bbox son en pixeles del video original — los normalizamos a
 * 0-100 dividiendo por frameWidth/frameHeight.
 */
function modalToSamples(
  modal: ModalResponse,
  frameWidth: number,
  frameHeight: number,
): TacticalSample[] {
  // 1. Group players by timestamp
  const byTimestamp = new Map<number, ModalPlayer[]>();
  for (const p of modal.players) {
    const list = byTimestamp.get(p.timestamp_ms) ?? [];
    list.push(p);
    byTimestamp.set(p.timestamp_ms, list);
  }

  // 2. Identify "ours" vs "theirs": first 11 unique track_ids = ours, rest = theirs
  //    (Eventually we'll use color re-ID; for now this is a usable heuristic.)
  const trackOrder = new Map<number, number>();
  for (const p of modal.players) {
    if (!trackOrder.has(p.track_id)) trackOrder.set(p.track_id, trackOrder.size);
  }
  const teamOf = (trackId: number): "ours" | "theirs" =>
    (trackOrder.get(trackId) ?? 0) < 11 ? "ours" : "theirs";

  // 3. Index ball positions by timestamp (closest)
  const ballByMs = new Map<number, { x: number; y: number }>();
  for (const b of modal.ball) {
    ballByMs.set(b.timestamp_ms, { x: b.x, y: b.y });
  }

  // 4. Build samples
  const samples: TacticalSample[] = [];
  for (const [timestampMs, players] of byTimestamp.entries()) {
    // Find closest ball position (within 200 ms)
    let ball = { x: 50, y: 50 };
    let closestBallDiff = Number.POSITIVE_INFINITY;
    for (const [t, pos] of ballByMs.entries()) {
      const diff = Math.abs(t - timestampMs);
      if (diff < 200 && diff < closestBallDiff) {
        ball = { x: (pos.x / frameWidth) * 100, y: (pos.y / frameHeight) * 100 };
        closestBallDiff = diff;
      }
    }

    samples.push({
      timestampMs,
      ball,
      players: players.map((p) => {
        const cx = (p.bbox[0] + p.bbox[2]) / 2;
        const cy = (p.bbox[1] + p.bbox[3]) / 2;
        return {
          id: `track-${p.track_id}`,
          x: (cx / frameWidth) * 100,
          y: (cy / frameHeight) * 100,
          team: teamOf(p.track_id),
        };
      }),
    });
  }

  return samples.sort((a, b) => a.timestampMs - b.timestampMs);
}

export default withHandler(
  {
    method: "POST",
    schema: ComputeFromVideoSchema,
    requireAuth: false,
    maxRequests: 10,
  },
  async ({ body }) => {
    const input = body as z.infer<typeof ComputeFromVideoSchema>;

    if (!MODAL_TRACK_URL || !MODAL_API_KEY) {
      return errorResponse(
        "Modal no configurado (MODAL_TRACK_URL / MODAL_API_KEY missing)",
        503,
      );
    }

    // Tripwire de presupuesto (054): este endpoint es requireAuth:false → gatearlo
    // es clave. Corta si el mes superó el tope; fail-open si el ledger no responde.
    if (await isOverBudget()) return budgetExceededResponse();
    await recordSpendUsd("modal-compute");

    // 1. Call Modal track
    console.log(`[compute-from-video] Calling Modal for match ${input.matchId}`);
    const modalRes = await fetch(MODAL_TRACK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MODAL_API_KEY}`,
      },
      body: JSON.stringify({
        video_url: input.videoUrl,
        sample_fps: input.sampleFps ?? 5,
        classes: [0, 32], // person + sports ball
      }),
    });

    if (!modalRes.ok) {
      const text = await modalRes.text().catch(() => "");
      return errorResponse(
        `Modal tracking failed: ${modalRes.status} ${text.slice(0, 200)}`,
        502,
      );
    }

    const modalData = (await modalRes.json()) as { data?: ModalResponse } | ModalResponse;
    // Modal wraps response in `data` when going through our proxy; tolerate both
    const modal = (
      "data" in modalData && modalData.data ? modalData.data : modalData
    ) as ModalResponse;

    if (modal.status !== "ok" || modal.players.length === 0) {
      return errorResponse(
        `Modal returned no tracking data (status: ${modal.status}, players: ${modal.players.length})`,
        422,
      );
    }

    // 2. Convert to samples (assume 1920×1080 if frame size not provided)
    const frameWidth = input.frameWidth ?? 1920;
    const frameHeight = input.frameHeight ?? 1080;
    const samples = modalToSamples(modal, frameWidth, frameHeight);

    console.log(
      `[compute-from-video] ${samples.length} samples from ${modal.players.length} player detections`,
    );

    // 3. Call compute-heatmap internally
    const computeRes = await fetch(`${PUBLIC_URL}/api/tactical/compute-heatmap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId: input.matchId,
        videoId: input.videoId,
        samples,
        algoVersion: "modal-v1.0.0",
      }),
    });

    if (!computeRes.ok) {
      const text = await computeRes.text().catch(() => "");
      return errorResponse(
        `compute-heatmap failed: ${computeRes.status} ${text.slice(0, 200)}`,
        502,
      );
    }

    const computeResult = (await computeRes.json()) as {
      data: { phasesDetected: number; heatmapsComputed: number; playerCount: number };
    };

    return successResponse({
      matchId: input.matchId,
      videoDurationSec: modal.duration_sec,
      modalPlayerDetections: modal.players.length,
      samplesGenerated: samples.length,
      ...computeResult.data,
    });
  },
);
