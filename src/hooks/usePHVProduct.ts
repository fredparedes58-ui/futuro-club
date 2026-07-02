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
import { usePlayerById } from "@/hooks/usePlayers";
import {
  computeMirwald,
  canComputeMirwald,
  assessMaturation,
  projectToMaturity,
  assessGrowthSpurtShield,
  bioBandFor,
  chronoBandLabel,
  type MirwaldResult,
  type MaturationAssessment,
  type MaturityProjection,
  type GrowthSpurtShield,
} from "@/lib/phv";

export interface PHVProduct {
  mirwald: MirwaldResult;
  maturation: MaturationAssessment;
  projection: MaturityProjection;
  shield: GrowthSpurtShield;
  bioBandLabel: string;
  chronoBandLabel: string;
  rebands: boolean;
  /** VSI crudo del jugador (si existe). */
  rawVSI: number | null;
  /** VSI ajustado por maduración. */
  adjustedVSI: number | null;
  playerName: string;
}

/** Convierte un VSI 0-100 a un percentil aproximado (proxy si no hay percentil real). */
function vsiToPercentile(vsi: number): number {
  return Math.max(1, Math.min(99, Math.round(vsi)));
}

export function usePHVProduct(playerId: string | undefined): PHVProduct | null {
  const { data: player } = usePlayerById(playerId);

  return useMemo(() => {
    if (!player) return null;
    const p = player as unknown as Record<string, unknown>;
    const age = typeof p.age === "number" ? p.age : undefined;
    const height = typeof p.height === "number" ? p.height : undefined;
    const weight = typeof p.weight === "number" ? p.weight : undefined;

    if (!canComputeMirwald({ age, height, weight })) return null;

    const mirwald = computeMirwald({
      chronologicalAge: age!,
      height: height!,
      weight: weight!,
      gender: (p.gender as "M" | "F") ?? "M",
      sittingHeight: typeof p.sittingHeight === "number" ? p.sittingHeight : undefined,
    });

    const maturation = assessMaturation(mirwald);
    const rawVSI = typeof p.vsi === "number" ? p.vsi : null;
    const currentPercentile = rawVSI != null ? vsiToPercentile(rawVSI) : 50;
    const projection = projectToMaturity(currentPercentile, maturation, age!);
    const shield = assessGrowthSpurtShield(mirwald.offset, String(p.name ?? "el jugador"));

    const bioBand = bioBandFor(mirwald.biologicalAge);
    const chrono = chronoBandLabel(age!);
    const rebands = bioBand.label.replace("Bio ", "") !== chrono;

    const adjustedVSI =
      rawVSI != null
        ? Math.max(0, Math.min(100, Number((rawVSI * maturation.adjustmentFactor).toFixed(1))))
        : null;

    return {
      mirwald,
      maturation,
      projection,
      shield,
      bioBandLabel: bioBand.label,
      chronoBandLabel: chrono,
      rebands,
      rawVSI,
      adjustedVSI,
      playerName: String(p.name ?? "Jugador"),
    };
  }, [player]);
}
