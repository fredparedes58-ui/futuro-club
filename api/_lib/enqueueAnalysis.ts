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
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface EnqueueAnalysisInput {
  supabase: SupabaseClient;
  videoId: string;
  tenantId: string | null;
  playerId: string | null;
  playedPosition?: string | null;
  /** Base URL para disparar el cron (VITAS_PUBLIC_URL / VERCEL_URL). */
  publicUrl: string;
  /** CRON_SECRET: si falta, no se dispara el cron (el cron diario recogerá la cola). */
  cronSecret: string;
}

export type EnqueueAnalysisResult =
  | { status: "queued"; analysisId: string; triggered: boolean }
  | { status: "exists"; analysisId: string }
  | { status: "skipped"; reason: string }
  | { status: "error"; error: string };

export async function enqueueAnalysis(input: EnqueueAnalysisInput): Promise<EnqueueAnalysisResult> {
  const { supabase, videoId, tenantId, playerId, playedPosition, publicUrl, cronSecret } = input;

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

  if (existing) return { status: "exists", analysisId: existing.id };

  const { data: analysis, error } = await supabase
    .from("analyses")
    .insert({
      tenant_id: tenantId,
      player_id: playerId,
      video_id: videoId,
      status: "queued",
      pipeline_version: "v1.0",
      played_position: playedPosition ?? null,
    })
    .select("id")
    .single();

  if (error || !analysis) {
    return { status: "error", error: error?.message ?? "insert_failed" };
  }

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

  return { status: "queued", analysisId: analysis.id, triggered };
}
