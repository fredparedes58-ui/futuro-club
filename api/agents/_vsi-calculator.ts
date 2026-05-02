/**
 * VITAS · VSI Calculator (NUEVO · determinista)
 * POST /api/agents/vsi-calculator
 *
 * Calcula el VITAS Score Index (VSI) 0-100 a partir de los sub-scores.
 *
 * FÓRMULA OFICIAL VITAS v1:
 *   VSI = 0.30·Técnica + 0.25·Físico + 0.20·Mental + 0.15·Táctica + 0.10·Proyección
 *
 * Tiers:
 *   ≥85  → "elite"
 *   70-84 → "pro"
 *   50-69 → "talent"
 *   <50  → "develop"
 *
 * Cada sub-score se mide en escala 0-100. Los inputs vienen de:
 *   - Técnica: biomecánica MMPose + acciones detectadas (regate, control, golpeo)
 *   - Físico: sprint speed, frecuencia zancada, asimetría, salto vertical (estimado)
 *   - Mental: latencia decisión, persistencia bajo presión (proxy de pose patterns)
 *   - Táctica: posicionamiento, movimientos sin balón, awareness espacial
 *   - Proyección: PHV adjusted + edad biológica + tendencia histórica
 *
 * NO usa LLM — pura aritmética. Latencia <2ms.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const vsiSchema = z.object({
  playerId: z.string().min(1),
  subscores: z.object({
    technique: z.number().min(0).max(100),
    physical: z.number().min(0).max(100),
    mental: z.number().min(0).max(100),
    tactical: z.number().min(0).max(100),
    projection: z.number().min(0).max(100),
  }),
  // Optional metadata for traceability
  context: z
    .object({
      videoId: z.string().optional(),
      ageGroup: z.string().optional(), // "sub-10" | "sub-12" etc.
      position: z.string().optional(),
    })
    .optional(),
});

type VsiInput = z.infer<typeof vsiSchema>;

export const VSI_WEIGHTS = {
  technique: 0.30,
  physical: 0.25,
  mental: 0.20,
  tactical: 0.15,
  projection: 0.10,
} as const;

export const VSI_TIERS = {
  elite: { min: 85, max: 100, label: "Elite", color: "#22e88c" },
  pro: { min: 70, max: 84, label: "Pro", color: "#1A8FFF" },
  talent: { min: 50, max: 69, label: "Talent", color: "#DC8B0A" },
  develop: { min: 0, max: 49, label: "Develop", color: "#EB1D1D" },
} as const;

export type VsiTier = keyof typeof VSI_TIERS;

export interface VsiResult {
  playerId: string;
  vsi: number;                   // 0-100
  tier: VsiTier;
  tierLabel: string;
  subscores: {
    technique: { value: number; weight: number; contribution: number };
    physical: { value: number; weight: number; contribution: number };
    mental: { value: number; weight: number; contribution: number };
    tactical: { value: number; weight: number; contribution: number };
    projection: { value: number; weight: number; contribution: number };
  };
  formula: string;
  version: "v1.0";
  context?: VsiInput["context"];
}

function determineTier(vsi: number): VsiTier {
  if (vsi >= 85) return "elite";
  if (vsi >= 70) return "pro";
  if (vsi >= 50) return "talent";
  return "develop";
}

export function computeVsi(subs: VsiInput["subscores"]): number {
  const v =
    VSI_WEIGHTS.technique * subs.technique +
    VSI_WEIGHTS.physical * subs.physical +
    VSI_WEIGHTS.mental * subs.mental +
    VSI_WEIGHTS.tactical * subs.tactical +
    VSI_WEIGHTS.projection * subs.projection;
  return Math.max(0, Math.min(100, Number(v.toFixed(1))));
}

export default withHandler(
  { schema: vsiSchema, requireAuth: true, maxRequests: 200 },
  async ({ body }) => {
    try {
      const input = body as VsiInput;
      const vsi = computeVsi(input.subscores);
      const tier = determineTier(vsi);

      const buildSub = (key: keyof typeof VSI_WEIGHTS) => {
        const value = input.subscores[key];
        const weight = VSI_WEIGHTS[key];
        return {
          value,
          weight,
          contribution: Number((value * weight).toFixed(2)),
        };
      };

      const result: VsiResult = {
        playerId: input.playerId,
        vsi,
        tier,
        tierLabel: VSI_TIERS[tier].label,
        subscores: {
          technique: buildSub("technique"),
          physical: buildSub("physical"),
          mental: buildSub("mental"),
          tactical: buildSub("tactical"),
          projection: buildSub("projection"),
        },
        formula:
          "VSI = 0.30·Técnica + 0.25·Físico + 0.20·Mental + 0.15·Táctica + 0.10·Proyección",
        version: "v1.0",
        context: input.context,
      };

      return successResponse(result);
    } catch (err) {
      return errorResponse({
        code: "vsi_calc_failed",
        message: err instanceof Error ? err.message : "VSI calculation error",
        status: 500,
      });
    }
  }
);
