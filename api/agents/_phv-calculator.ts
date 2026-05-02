/**
 * VITAS · PHV Calculator (REFACTOR DETERMINISTA · v2)
 * POST /api/agents/phv-calculator
 *
 * IMPORTANTE: Esta versión REEMPLAZA la antigua basada en LLM.
 * Mirwald formula es pura aritmética → no necesita Claude.
 *
 * Beneficios:
 * - Coste: €0 por cálculo (antes ~€0,005)
 * - Latencia: <5ms (antes 2-3 seg)
 * - Determinista: misma entrada → misma salida exacta
 * - Sin riesgo de alucinación del LLM
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const phvSchema = z.object({
  playerId: z.string().min(1),
  chronologicalAge: z.number().min(5).max(25),
  height: z.number().positive().optional(),         // cm
  weight: z.number().positive().optional(),         // kg
  sittingHeight: z.number().positive().optional(),  // cm
  legLength: z.number().positive().optional(),      // cm
  currentVSI: z.number().min(0).max(100).optional(),
  gender: z.enum(["M", "F"]).default("M"),
});

type PhvInput = z.infer<typeof phvSchema>;

interface PhvResult {
  playerId: string;
  biologicalAge: number;
  chronologicalAge: number;
  offset: number;
  category: "early" | "ontime" | "late";
  phvStatus: "pre_phv" | "during_phv" | "post_phv";
  developmentWindow: "critical" | "active" | "stable";
  adjustedVSI: number;
  recommendation: string;
  confidence: number;
  formula: "mirwald_male" | "mirwald_female";
  inputsUsed: { sittingHeight: "real" | "estimated"; legLength: "real" | "estimated" };
}

/**
 * Mirwald formula (Mirwald et al. 2002).
 * Calcula el offset de maduración (años) respecto al PHV.
 *
 * Para varones:
 *   MO = -9.236
 *      + 0.0002708 × (legLength × sittingHeight)
 *      − 0.001663  × (age × legLength)
 *      + 0.007216  × (age × sittingHeight)
 *      + 0.02292   × (weight / height × 100)
 *
 * Para mujeres (Moore 2015 alternativa, simplificada):
 *   MO = -9.376 + 0.0001882 × (legLength × sittingHeight)
 *      + 0.0022 × (age × legLength) + 0.005841 × (age × sittingHeight)
 *      - 0.002658 × (age × weight) + 0.07693 × (weight / height × 100)
 *
 * Nota: si no se aportan sittingHeight/legLength, se estiman:
 *   sittingHeight ≈ height × 0.52
 *   legLength     ≈ height × 0.48
 */
function calculateMaturityOffset(input: PhvInput): {
  offset: number;
  formula: "mirwald_male" | "mirwald_female";
  inputsUsed: { sittingHeight: "real" | "estimated"; legLength: "real" | "estimated" };
  confidence: number;
} {
  const age = input.chronologicalAge;
  const height = input.height ?? 0;
  const weight = input.weight ?? 0;

  // Estimación si faltan datos antropométricos
  const sittingHeightUsed = input.sittingHeight ?? (height ? height * 0.52 : 0);
  const legLengthUsed = input.legLength ?? (height ? height * 0.48 : 0);

  const inputsUsed = {
    sittingHeight: input.sittingHeight ? "real" as const : "estimated" as const,
    legLength: input.legLength ? "real" as const : "estimated" as const,
  };

  // Confianza
  const confidence =
    inputsUsed.sittingHeight === "real" && inputsUsed.legLength === "real"
      ? 0.92
      : 0.74;

  let offset: number;
  let formula: "mirwald_male" | "mirwald_female";

  if (input.gender === "M") {
    formula = "mirwald_male";
    offset =
      -9.236 +
      0.0002708 * (legLengthUsed * sittingHeightUsed) -
      0.001663 * (age * legLengthUsed) +
      0.007216 * (age * sittingHeightUsed) +
      (height > 0 ? 0.02292 * ((weight / height) * 100) : 0);
  } else {
    formula = "mirwald_female";
    offset =
      -9.376 +
      0.0001882 * (legLengthUsed * sittingHeightUsed) +
      0.0022 * (age * legLengthUsed) +
      0.005841 * (age * sittingHeightUsed) -
      0.002658 * (age * weight) +
      (height > 0 ? 0.07693 * ((weight / height) * 100) : 0);
  }

  return { offset: Number(offset.toFixed(2)), formula, inputsUsed, confidence };
}

function categorize(offset: number): {
  category: PhvResult["category"];
  phvStatus: PhvResult["phvStatus"];
  developmentWindow: PhvResult["developmentWindow"];
} {
  let category: PhvResult["category"];
  let phvStatus: PhvResult["phvStatus"];
  let developmentWindow: PhvResult["developmentWindow"];

  if (offset < -1.0) {
    category = "early";
    phvStatus = "pre_phv";
  } else if (offset > 1.0) {
    category = "late";
    phvStatus = "post_phv";
  } else {
    category = "ontime";
    phvStatus = "during_phv";
  }

  if (phvStatus === "during_phv") developmentWindow = "critical";
  else if ((offset >= -2 && offset < -1) || (offset > 1 && offset <= 2))
    developmentWindow = "active";
  else developmentWindow = "stable";

  return { category, phvStatus, developmentWindow };
}

function adjustVSI(currentVSI: number | undefined, category: PhvResult["category"]): number {
  const base = currentVSI ?? 70;
  const factor = category === "early" ? 1.12 : category === "late" ? 0.92 : 1.0;
  return Math.max(0, Math.min(100, Number((base * factor).toFixed(1))));
}

function buildRecommendation(result: Omit<PhvResult, "recommendation">): string {
  const cat = result.category;
  const win = result.developmentWindow;

  if (cat === "early" && win === "critical") {
    return "Estirón en curso: priorizar técnica + coordinación. Reducir cargas pesadas.";
  }
  if (cat === "early" && win === "active") {
    return "Pre-estirón cercano: aprovechar ventana técnica antes del crecimiento rápido.";
  }
  if (cat === "ontime" && win === "critical") {
    return "Período crítico de maduración: trabajo técnico-coordinativo prioritario.";
  }
  if (cat === "late" && win === "stable") {
    return "Maduración tardía: foco en fuerza y resistencia. Paciencia con el desarrollo físico.";
  }
  if (cat === "late" && win === "active") {
    return "Post-estirón: consolidar adaptaciones, incrementar trabajo de fuerza progresivo.";
  }
  return "Desarrollo estable: mantener plan equilibrado de técnica, físico y táctica.";
}

export default withHandler(
  { schema: phvSchema, requireAuth: true, maxRequests: 100 },
  async ({ body }) => {
    try {
      const input = body as PhvInput;
      const { offset, formula, inputsUsed, confidence } = calculateMaturityOffset(input);
      const biologicalAge = Number((input.chronologicalAge + offset).toFixed(2));
      const { category, phvStatus, developmentWindow } = categorize(offset);
      const adjustedVSI = adjustVSI(input.currentVSI, category);

      const partialResult = {
        playerId: input.playerId,
        biologicalAge,
        chronologicalAge: input.chronologicalAge,
        offset,
        category,
        phvStatus,
        developmentWindow,
        adjustedVSI,
        confidence,
        formula,
        inputsUsed,
      };

      const recommendation = buildRecommendation(partialResult);
      const result: PhvResult = { ...partialResult, recommendation };

      return successResponse(result);
    } catch (err) {
      return errorResponse({
        code: "phv_calc_failed",
        message: err instanceof Error ? err.message : "Unknown error in PHV calculation",
        status: 500,
      });
    }
  }
);
