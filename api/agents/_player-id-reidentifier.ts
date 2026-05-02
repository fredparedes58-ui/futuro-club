/**
 * VITAS · Player ID Re-identifier (NUEVO · determinista)
 * POST /api/agents/player-id-reidentifier
 *
 * Re-identifica al jugador objetivo entre los detectados en un nuevo vídeo,
 * usando el embedding de su anterior identificación como referencia.
 *
 * Algoritmo:
 *   1. Recibe N candidatos detectados en el nuevo vídeo (cada uno con su
 *      embedding parcial extraído de su crop)
 *   2. Compara con el embedding de referencia del jugador (guardado de la
 *      primera vez que se identificó)
 *   3. Devuelve el candidato con menor distancia coseno + score de confianza
 *
 * Si la distancia mínima es >0.45, devuelve `unidentified` y la app pide
 * al padre que vuelva a identificar manualmente.
 *
 * Sin LLM, pura álgebra vectorial. Latencia <10ms.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const reidSchema = z.object({
  playerId: z.string().min(1),
  referenceEmbedding: z.array(z.number()).min(64),
  candidates: z
    .array(
      z.object({
        candidateIdx: z.number().int().nonnegative(),
        embedding: z.array(z.number()).min(64),
        bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
      })
    )
    .min(1),
  threshold: z.number().min(0).max(1).default(0.45),
});

function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding dim mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

export interface ReIdResult {
  playerId: string;
  status: "identified" | "unidentified";
  bestMatch: {
    candidateIdx: number;
    distance: number;
    confidence: number;
    bbox?: { x: number; y: number; w: number; h: number };
  } | null;
  rankedCandidates: Array<{
    candidateIdx: number;
    distance: number;
    confidence: number;
  }>;
  thresholdUsed: number;
}

export default withHandler(
  { schema: reidSchema, requireAuth: true, maxRequests: 200 },
  async ({ body }) => {
    const input = body as z.infer<typeof reidSchema>;

    const ranked = input.candidates
      .map((c) => {
        const distance = cosineDistance(input.referenceEmbedding, c.embedding);
        return {
          candidateIdx: c.candidateIdx,
          distance: Number(distance.toFixed(4)),
          confidence: Number(Math.max(0, 1 - distance).toFixed(4)),
          bbox: c.bbox,
        };
      })
      .sort((a, b) => a.distance - b.distance);

    const top = ranked[0];
    const status = top.distance <= input.threshold ? "identified" : "unidentified";

    const result: ReIdResult = {
      playerId: input.playerId,
      status,
      bestMatch:
        status === "identified"
          ? {
              candidateIdx: top.candidateIdx,
              distance: top.distance,
              confidence: top.confidence,
              bbox: top.bbox,
            }
          : null,
      rankedCandidates: ranked.map(({ candidateIdx, distance, confidence }) => ({
        candidateIdx, distance, confidence,
      })),
      thresholdUsed: input.threshold,
    };

    return successResponse(result);
  }
);
