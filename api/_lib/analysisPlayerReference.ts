/**
 * VITAS · Lectura de la referencia del jugador guardada (mig 068)
 *
 * ÚNICA implementación (invariante #7) de la lectura de `jersey_number` + `kit_color`:
 *   - fila `analyses` → los DOS caminos que llaman a video-observation por jugador:
 *       api/pipeline/_gemini-analyze.ts (principal) y
 *       api/crons/process-analyses-queue.ts (fallback inline);
 *   - fila `videos`   → api/webhooks/bunny-uploaded.ts, cuando es el webhook quien
 *       encola (finalize la escribió antes de que Bunny terminase de codificar).
 *
 * Devuelve la forma que espera `buildGeminiPlayerContext(player, anthro, identification)`
 * ({ jerseyNumber, teamColor }). Solo cuando existen AMBOS, `referenceProvided` es true
 * y Gemini puede dar al jugador por "identificado" (reglas en geminiBiomechanics.ts /
 * video-observation.ts, que este módulo NO cambia).
 *
 * Honestidad: dato ausente ⇒ null (nunca «el dorsal más probable»). Best-effort frente
 * al orden de despliegue: si la mig 068 aún no está aplicada, PostgREST devuelve error
 * (no lanza) y se degrada a sin referencia — la abstención de siempre. Los valores se
 * RE-VALIDAN con el schema compartido: un valor escrito por otra vía (p. ej. a mano en
 * la BD) que no lo cumpla no llega al prompt.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePlayerReference, type PlayerReference } from "../../src/lib/shared/playerReference";

export interface GeminiIdentificationInput {
  jerseyNumber: string | null;
  teamColor: string | null;
}

/** Lee y RE-VALIDA (schema compartido) `jersey_number` + `kit_color` de una fila. Error ⇒ null. */
async function readReferenceColumns(
  supabase: SupabaseClient,
  table: "analyses" | "videos",
  id: string,
): Promise<PlayerReference | null> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("jersey_number, kit_color")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.warn(`[playerReference] ${table}: sin referencia (¿mig 068 pendiente?):`, error.message);
      return null;
    }
    const row = (data ?? null) as { jersey_number?: unknown; kit_color?: unknown } | null;
    return normalizePlayerReference({ jerseyNumber: row?.jersey_number, kitColor: row?.kit_color });
  } catch (err) {
    console.warn(`[playerReference] ${table}: lectura fallida:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Referencia guardada en el análisis, en la forma de `buildGeminiPlayerContext`. */
export async function readAnalysisPlayerReference(
  supabase: SupabaseClient,
  analysisId: string,
): Promise<GeminiIdentificationInput> {
  const ref = await readReferenceColumns(supabase, "analyses", analysisId);
  return { jerseyNumber: ref?.jerseyNumber ?? null, teamColor: ref?.kitColor ?? null };
}

/**
 * Referencia que finalize dejó en la fila `videos` (para el jugador ligado al vídeo) y
 * que lee el webhook de Bunny al encolar. `undefined` si no hay ningún dato: el webhook
 * no la conoce y enqueueAnalysis no toca nada (nunca se «borra» con un vacío inventado).
 */
export async function readVideoPlayerReference(
  supabase: SupabaseClient,
  videoId: string,
): Promise<PlayerReference | undefined> {
  const ref = await readReferenceColumns(supabase, "videos", videoId);
  if (!ref || (ref.jerseyNumber === null && ref.kitColor === null)) return undefined;
  return ref;
}
