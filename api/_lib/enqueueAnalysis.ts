/**
 * VITAS · enqueueAnalysis — encola un análisis de vídeo (idempotente)
 *
 * Una sola implementación (invariante #7) compartida por:
 *   - api/webhooks/bunny-uploaded.ts  (webhook real de Bunny, encode-complete)
 *   - api/videos/finalize.ts          (finalize del Lab / flujo A, in-process)
 *
 * Crea la fila `analyses` con status='queued' si no existe ya una activa para ese
 * vídeo, y dispara el cron de procesamiento de forma inmediata (best-effort). El
 * cron diario queda de backstop.
 *
 * GUARDA CRÍTICA: `analyses.player_id` es NOT NULL + FK a players. Sin playerId NO se
 * encola (un vídeo sin jugador atado no produce análisis). Sin tenantId tampoco: se
 * rompería el aislamiento multi-tenant de datos de menores (analyses.tenant_id null).
 *
 * Referencia del jugador (mig 068): el dorsal + color de equipación que teclea el
 * usuario se guardan en la fila (`jersey_number`, `kit_color`) para que el paso
 * Gemini pueda identificar al jugador en un clip con varios jugadores
 * (.claude/rules/identidad.md: solo dorsal + color, nunca la cara).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerReference } from "../../src/lib/shared/playerReference";
import { readAnalysisPlayerReference } from "./analysisPlayerReference";

export interface EnqueueAnalysisInput {
  supabase: SupabaseClient;
  videoId: string;
  tenantId: string | null;
  playerId: string | null;
  playedPosition?: string | null;
  /**
   * Idioma pedido para los informes (código del LANGUAGE_REGISTRY, ya normalizado).
   * Se persiste en `analyses.locale` (mig 064) porque el orquestador, cuando lo
   * dispara el cron o modal-callback, solo recibe { analysisId } y no puede saber el
   * idioma de otra forma. Null → el orquestador degrada a "es".
   */
  locale?: string | null;
  /**
   * Referencia del jugador en ESTE vídeo (dorsal + color de equipación, mig 068),
   * YA validada (src/lib/shared/playerReference.ts). Se persiste en la fila para que
   * gemini-analyze / el cron la pasen a video-observation.
   *   · `undefined` ⇒ el caller no la conoce (webhook de Bunny): no se toca nada.
   *   · objeto (aunque sea {null, null}) ⇒ es el último dato del usuario: se guarda
   *     en la fila nueva o se actualiza en la fila aún en cola.
   */
  playerReference?: PlayerReference;
  /** Base URL para disparar el cron (VITAS_PUBLIC_URL / VERCEL_URL). */
  publicUrl: string;
  /** CRON_SECRET: si falta, no se dispara el cron (el cron diario recogerá la cola). */
  cronSecret: string;
}

/**
 * `referenceApplied` (solo si el caller envió `playerReference`): true si la
 * referencia quedó guardada en la fila que se va a procesar; false si no se pudo
 * (la fila ya estaba en proceso/completada, el cron la reclamó en la carrera, o la
 * mig 068 aún no está aplicada). Nunca se afirma que se usó una referencia que no.
 */
export type EnqueueAnalysisResult =
  | { status: "queued"; analysisId: string; triggered: boolean; referenceApplied?: boolean }
  | { status: "exists"; analysisId: string; referenceApplied?: boolean }
  | { status: "skipped"; reason: string }
  | { status: "error"; error: string };

/** Columnas de la mig 068 (referencia del jugador). */
const REFERENCE_COLUMNS = ["jersey_number", "kit_color"] as const;

/** PostgREST rechaza una columna desconocida (migración sin aplicar) con PGRST204 / «schema cache». */
const SCHEMA_CACHE_ERROR = /PGRST204|schema cache/i;

export async function enqueueAnalysis(input: EnqueueAnalysisInput): Promise<EnqueueAnalysisResult> {
  const { supabase, videoId, tenantId, playerId, playedPosition, locale, playerReference, publicUrl, cronSecret } = input;

  // Sin jugador o sin tenant → NO se encola (FK NOT NULL + RLS de menores).
  if (!playerId) return { status: "skipped", reason: "no_player" };
  if (!tenantId) return { status: "skipped", reason: "no_tenant" };

  // Idempotencia por (vídeo, JUGADOR): un mismo vídeo analizado para OTRO jugador es su
  // propio análisis. Sin el filtro player_id, el análisis del jugador A bloqueaba el
  // encolado del jugador B (mismo vídeo) — y con varios análisis del mismo vídeo,
  // `.maybeSingle()` recibía >1 fila y erroraba. Incluye 'processing_reports' (Gemini
  // hecho, informes en curso): también es activo → no re-encolar (evita el duplicado en
  // la carrera webhook-Bunny vs finalize durante la fase de informes).
  const { data: existing } = await supabase
    .from("analyses")
    .select("id, status")
    .eq("video_id", videoId)
    .eq("player_id", playerId)
    .in("status", ["queued", "processing", "processing_reports", "completed"])
    .maybeSingle();

  if (existing) {
    if (!playerReference) return { status: "exists", analysisId: existing.id };
    // Re-encolado con referencia (p. ej. el webhook de Bunny encoló primero SIN ella y
    // luego llega finalize con el dorsal/color del usuario): se actualiza la MISMA fila
    // (la idempotencia por (vídeo, jugador) se mantiene). SOLO mientras sigue en cola:
    // si el cron ya la reclamó, Gemini ya recibió la referencia anterior y reescribirla
    // haría que la fila afirmara una referencia que no se usó → referenceApplied false.
    if (existing.status !== "queued") {
      // ¿La fila ya lleva ESTA referencia? (p. ej. la encoló el webhook de Bunny con la
      // que finalize dejó en `videos`). Solo entonces se declara aplicada.
      const stored = await readAnalysisPlayerReference(supabase, existing.id);
      const same =
        stored.jerseyNumber === playerReference.jerseyNumber && stored.teamColor === playerReference.kitColor;
      return { status: "exists", analysisId: existing.id, referenceApplied: same };
    }
    const { data: updated, error: updError } = await supabase
      .from("analyses")
      .update({ jersey_number: playerReference.jerseyNumber, kit_color: playerReference.kitColor })
      .eq("id", existing.id)
      .eq("status", "queued") // carrera con el claim del cron: 0 filas ⇒ no aplicada
      .select("id");
    if (updError) console.warn("[enqueueAnalysis] referencia no guardada:", updError.message);
    const applied = !updError && Array.isArray(updated) && updated.length > 0;
    return { status: "exists", analysisId: existing.id, referenceApplied: applied };
  }

  const baseRow = {
    tenant_id: tenantId,
    player_id: playerId,
    video_id: videoId,
    status: "queued",
    pipeline_version: "v1.0",
    played_position: playedPosition ?? null,
  };

  // Referencia del jugador (mig 068): solo se escriben las columnas si hay algún dato
  // (sin dato = null por defecto de la columna, nunca un relleno).
  const referenceCols =
    playerReference && (playerReference.jerseyNumber !== null || playerReference.kitColor !== null)
      ? { jersey_number: playerReference.jerseyNumber, kit_color: playerReference.kitColor }
      : null;

  // Idioma (mig 064) y referencia (mig 068) en la fila. DEFENSIVO frente al orden de
  // despliegue: si una migración aún no está aplicada, PostgREST rechaza la columna
  // desconocida (PGRST204 / "schema cache") → reintentamos SIN esas columnas para no
  // romper el encolado. Se descarta primero la referencia (mig más reciente) para no
  // perder el idioma si solo falta la 068. Sin referencia guardada, Gemini se abstiene
  // en clips con varios jugadores (como antes de 068) y se declara referenceApplied false.
  let withLocale = !!locale;
  let withReference = referenceCols !== null;
  let analysis: { id: string } | null = null;
  let error: { message?: string } | null = null;
  for (;;) {
    const row = {
      ...baseRow,
      ...(withLocale ? { locale } : {}),
      ...(withReference ? referenceCols : {}),
    };
    ({ data: analysis, error } = await supabase.from("analyses").insert(row).select("id").single());
    if (!error) break;
    const msg = error.message ?? "";
    const namesReference = REFERENCE_COLUMNS.some((c) => msg.includes(c));
    if (withReference && (namesReference || (!msg.includes("locale") && SCHEMA_CACHE_ERROR.test(msg)))) {
      withReference = false;
      continue;
    }
    if (withLocale && (msg.includes("locale") || SCHEMA_CACHE_ERROR.test(msg))) {
      withLocale = false;
      continue;
    }
    break;
  }

  if (error || !analysis) {
    return { status: "error", error: error?.message ?? "insert_failed" };
  }
  const referenceApplied = playerReference ? referenceCols === null || withReference : undefined;

  // Dispara el procesamiento inmediato (fire-and-forget). Sin CRON_SECRET, el cron
  // diario (vercel.json) recoge la cola como backstop.
  let triggered = false;
  if (cronSecret) {
    triggered = true;
    void fetch(`${publicUrl}/api/crons/process-analyses-queue`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
    }).catch((err) => console.error("[enqueueAnalysis] trigger de cola falló:", err));
  }

  return {
    status: "queued",
    analysisId: analysis.id,
    triggered,
    ...(referenceApplied === undefined ? {} : { referenceApplied }),
  };
}
