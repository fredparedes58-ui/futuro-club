/**
 * VITAS · usePHVProduct — el PHV como producto por jugador (Sprint 2)
 *
 * Compone (client-side, sin IA, sin Supabase) desde los datos antropométricos
 * que el jugador ya tiene:
 *   - Mirwald offset + edad biológica
 *   - Estado de maduración vs pares (madurador tardío/precoz/en fase)
 *   - VSI ajustado por maduración + proyección a madurez
 *   - Escudo de Estirón (riesgo PHV × lesión)
 *   - Bio-band vs chrono-band
 *
 * Devuelve null si el jugador no tiene datos antropométricos mínimos.
 */
import { useMemo } from "react";
import { useRawPlayerById } from "@/hooks/usePlayers";
import {
  computeMirwald,
  canComputeMirwald,
  assessMaturation,
  projectToMaturity,
  assessGrowthSpurtShield,
  type MirwaldResult,
  type MaturationAssessment,
  type MaturityProjection,
  type GrowthSpurtShield,
} from "@/lib/phv";
import { playerMaturity } from "@/lib/phv/playerMaturity";
import type { MaturityAssessment } from "@/lib/phv/maturity";

export interface PHVProduct {
  /** Evaluación canónica (fuente ÚNICA para la UI: estado/timing/%PAH/APHV). */
  assessment: MaturityAssessment;
  mirwald: MirwaldResult;
  /** @deprecated status-as-timing; solo para projection/shield legacy. */
  maturation: MaturationAssessment;
  projection: MaturityProjection;
  shield: GrowthSpurtShield;
  /** VSI crudo del jugador (si existe). */
  rawVSI: number | null;
  /** VSI ajustado por maduración (factor gateado: 1 si el timing no es firme). */
  adjustedVSI: number | null;
  playerName: string;
}

/** Convierte un VSI 0-100 a un percentil aproximado (proxy si no hay percentil real). */
function vsiToPercentile(vsi: number): number {
  return Math.max(1, Math.min(99, Math.round(vsi)));
}

export function usePHVProduct(playerId: string | undefined): PHVProduct | null {
  const { data: player } = useRawPlayerById(playerId);

  return useMemo(() => {
    if (!player) return null;
    const p = player as unknown as Record<string, unknown>;
    const age = typeof p.age === "number" ? p.age : undefined;
    const height = typeof p.height === "number" ? p.height : undefined;
    const weight = typeof p.weight === "number" ? p.weight : undefined;
    const sittingHeight = typeof p.sittingHeight === "number" ? p.sittingHeight : undefined;
    const legLength = typeof p.legLength === "number" ? p.legLength : undefined;
    const hasParents =
      typeof p.motherHeightCm === "number" && typeof p.fatherHeightCm === "number";

    // PHV solo con datos REALES completos — NO estimamos sitting/leg:
    //  · Mirwald: edad + altura + peso + altura sentado + longitud de pierna MEDIDOS, o
    //  · Khamis-Roche: edad + altura + peso + altura de AMBOS padres.
    // Un jugador con solo altura/peso del alta (sin medición antropométrica registrada)
    // NO obtiene PHV → evita mostrar una maduración fabricada.
    const baseOk = canComputeMirwald({ age, height, weight });
    const canMirwald =
      baseOk && typeof sittingHeight === "number" && typeof legLength === "number";
    const canKhamis = baseOk && hasParents;
    if (!canMirwald && !canKhamis) return null;

    const mirwald = computeMirwald({
      chronologicalAge: age!,
      height: height!,
      weight: weight!,
      gender: (p.gender as "M" | "F") ?? "M",
      sittingHeight: typeof p.sittingHeight === "number" ? p.sittingHeight : undefined,
    });

    const maturation = assessMaturation(mirwald);

    // Evaluación canónica (científica, con edad decimal + %PAH si hay padres +
    // gating anti-falso-positivo). Es la que consume la UI.
    const assessment = playerMaturity({
      age,
      birthDate: typeof p.birthDate === "string" ? p.birthDate : null,
      height,
      weight,
      sittingHeight: typeof p.sittingHeight === "number" ? p.sittingHeight : null,
      legLength: typeof p.legLength === "number" ? p.legLength : null,
      gender: (p.gender as "M" | "F") ?? null,
      motherHeightCm: typeof p.motherHeightCm === "number" ? p.motherHeightCm : null,
      fatherHeightCm: typeof p.fatherHeightCm === "number" ? p.fatherHeightCm : null,
    });

    const rawVSI = typeof p.vsi === "number" ? p.vsi : null;
    const currentPercentile = rawVSI != null ? vsiToPercentile(rawVSI) : 50;
    const projection = projectToMaturity(currentPercentile, assessment, age!);
    const shield = assessGrowthSpurtShield(mirwald.offset, String(p.name ?? "el jugador"));

    // VSI ajustado con el factor CANÓNICO (1 cuando el timing no es firme →
    // no infla/penaliza sin base; blindaje anti-falso-positivo).
    const adjustedVSI =
      rawVSI != null
        ? Math.max(0, Math.min(100, Number((rawVSI * assessment.adjustmentFactor).toFixed(1))))
        : null;

    return {
      assessment,
      mirwald,
      maturation,
      projection,
      shield,
      rawVSI,
      adjustedVSI,
      playerName: String(p.name ?? "Jugador"),
    };
  }, [player]);
}
