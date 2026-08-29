/**
 * VITAS · Finalize Video Upload
 * POST /api/videos/finalize
 *
 * Llamado por el frontend tras completar el upload TUS a Bunny, en el momento en que
 * el jugador YA se conoce (en el Lab la subida no lleva jugador; se elige al analizar).
 *
 * Hace, server-side:
 *   1. Comprueba el status del vídeo en Bunny (encoded ready = 4).
 *   2. SIEMBRA en `videos` las columnas que el pipeline necesita —bunny_video_id,
 *      player_id, tenant_id (resuelto del jugador; el cliente solo tiene org_id),
 *      duration_sec, played_position— con check de OWNERSHIP (anti-IDOR de menor ajeno).
 *   3. Encola el análisis IN-PROCESS (impl compartida con el webhook, inv #7).
 *
 * Antes disparaba el webhook por HTTP SIN firma → el webhook fail-closed lo rechazaba
 * siempre (503/401) y el análisis nunca se encolaba, pero respondía ready:true → la UI
 * hacía polling 5 min y moría en timeout. Eso queda corregido.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";
import { ownsVideo, ownsPlayerOrTenant } from "../_lib/ownership";
import { enqueueAnalysis } from "../_lib/enqueueAnalysis";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUNNY_LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID ?? "";
const BUNNY_API_KEY = process.env.BUNNY_STREAM_API_KEY ?? "";
const PUBLIC_URL =
  process.env.VITAS_PUBLIC_URL ??
  `https://${process.env.VERCEL_URL ?? "futuro-club.vercel.app"}`;
const CRON_SECRET = process.env.CRON_SECRET ?? "";

const finalizeSchema = z.object({
  videoId: z.string().min(1),
  bunnyVideoId: z.string().min(1),
  playerId: z.string().min(1).optional(),      // jugador elegido al analizar (Lab)
  playedPosition: z.string().optional(),        // posición jugada en este video
});

interface BunnyVideoStatus {
  guid: string;
  status: number;
  length: number;
  width: number;
  height: number;
}

async function getBunnyVideoStatus(bunnyVideoId: string): Promise<BunnyVideoStatus | null> {
  try {
    const res = await fetch(
      `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${bunnyVideoId}`,
      { headers: { AccessKey: BUNNY_API_KEY, Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      guid: data.guid,
      status: data.status,
      length: data.length,
      width: data.width,
      height: data.height,
    };
  } catch {
    return null;
  }
}

export default withHandler(
  { schema: finalizeSchema, requireAuth: true, maxRequests: 30 },
  async ({ body, userId, tenantId, isServiceCall }) => {
    const input = body as z.infer<typeof finalizeSchema>;

    if (!BUNNY_LIBRARY_ID || !BUNNY_API_KEY) {
      return errorResponse({ code: "bunny_not_configured", message: "Bunny no configurado", status: 503 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Verificar que el video existe (+ leer dueño y lo que ya tenga)
    const { data: video } = await supabase
      .from("videos")
      .select("id, bunny_video_id, player_id, tenant_id, user_id")
      .eq("id", input.videoId)
      .single();

    if (!video) {
      return errorResponse({ code: "video_not_found", message: "Video no existe", status: 404 });
    }

    const vrow = video as { id: string; bunny_video_id?: string | null; player_id?: string | null; tenant_id?: string | null; user_id?: string | null };

    // ── AUTORIZACIÓN A NIVEL DE OBJETO (anti-IDOR de menores) ────────────────
    // finalize MUTA una fila `videos` EXISTENTE (siembra bunny_video_id/player_id/
    // tenant_id y encola un análisis). Sin esto, un autenticado A podía finalizar el
    // vídeo de otro tenant B (por id), atribuirlo a un jugador PROPIO y procesar el
    // contenido de Bunny de un menor ajeno. Fail-closed vía ownsVideo (inv #7: el mismo
    // helper que identify-player/candidates; autoriza por uploader/tenant/jugador del vídeo).
    if (!(await ownsVideo(vrow, userId, tenantId, isServiceCall))) {
      return errorResponse({ code: "forbidden", message: "No gestionas este vídeo", status: 403 });
    }

    // El bunnyVideoId del cliente NO es de fiar: si la fila ya tiene uno grabado, debe
    // coincidir — nunca se sobreescribe con lo que mande el cliente (evita apuntar la
    // fila a un GUID de Bunny ajeno).
    if (vrow.bunny_video_id && vrow.bunny_video_id !== input.bunnyVideoId) {
      return errorResponse({ code: "bunny_id_mismatch", message: "bunnyVideoId no coincide con el vídeo", status: 403 });
    }

    // Jugador: el que llega al analizar, o el que ya tuviera la fila.
    const playerId: string | null = input.playerId ?? vrow.player_id ?? null;

    // Ownership + tenant SIEMPRE server-side (el cliente no conoce el tenant_id del
    // jugador). Fail-closed: no gestionas al jugador → 403, sin sembrar ni encolar.
    let resolvedTenantId: string | null = vrow.tenant_id ?? tenantId ?? null;
    if (playerId) {
      if (!isServiceCall && !(await ownsPlayerOrTenant(playerId, userId, tenantId))) {
        return errorResponse({ code: "forbidden", message: "No gestionas este jugador", status: 403 });
      }
      const { data: player } = await supabase
        .from("players")
        .select("tenant_id")
        .eq("id", playerId)
        .single();
      if (player?.tenant_id) resolvedTenantId = player.tenant_id as string;
    }

    // Status del vídeo en Bunny
    const bunnyStatus = await getBunnyVideoStatus(input.bunnyVideoId);
    if (!bunnyStatus) {
      return errorResponse({ code: "bunny_query_failed", message: "No se pudo consultar Bunny", status: 502 });
    }

    const STATUS_FINISHED = 4;
    const STATUS_ERROR = 5;

    if (bunnyStatus.status === STATUS_ERROR) {
      return errorResponse({ code: "bunny_encoding_failed", message: "Bunny falló encoding", status: 422 });
    }

    if (bunnyStatus.status !== STATUS_FINISHED) {
      return successResponse({
        ready: false,
        status: bunnyStatus.status,
        message: "Vídeo aún en procesamiento, reintentar en 5-10 segundos",
        retryAfterSec: 5,
      });
    }

    // ── Sembrar en `videos` las columnas del pipeline (solo lo que aporte valor) ──
    const updateData: Record<string, unknown> = { bunny_video_id: input.bunnyVideoId };
    if (playerId) updateData.player_id = playerId;
    if (resolvedTenantId) updateData.tenant_id = resolvedTenantId;
    if (bunnyStatus.length > 0) updateData.duration_sec = bunnyStatus.length;
    if (input.playedPosition) updateData.played_position = input.playedPosition;
    await supabase.from("videos").update(updateData).eq("id", video.id);

    // ── Encolar el análisis (idempotente, impl compartida con el webhook) ──
    const result = await enqueueAnalysis({
      supabase,
      videoId: video.id,
      tenantId: resolvedTenantId,
      playerId,
      playedPosition: input.playedPosition ?? null,
      publicUrl: PUBLIC_URL,
      cronSecret: CRON_SECRET,
    });

    if (result.status === "error") {
      return errorResponse({ code: "enqueue_failed", message: result.error, status: 500 });
    }
    if (result.status === "skipped") {
      // Sin jugador atado: el vídeo queda almacenado, pero no hay análisis por jugador.
      return successResponse({
        ready: true,
        queued: false,
        videoId: video.id,
        reason: result.reason,
        message: "Vídeo listo. Elige un jugador para generar su informe.",
      });
    }

    const analysisId = result.analysisId;
    return successResponse({
      ready: true,
      queued: true,
      videoId: video.id,
      analysisId,
      alreadyQueued: result.status === "exists",
      message: "Vídeo listo · análisis encolado · ETA ~2 minutos",
    });
  }
);
