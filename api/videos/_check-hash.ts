/**
 * VITAS · POST /api/videos/check-hash
 *
 * Deduplicación de videos: el cliente envía el SHA-256 del archivo antes
 * de subirlo. Si ya existe un video con ese hash para este usuario
 * (opcionalmente filtrado por playerId), devolvemos el videoId existente
 * para que el cliente pueda reusarlo y saltar re-upload a Bunny +
 * re-análisis de IA.
 *
 * Body: { hash: string (64 hex), playerId?: string }
 * Response:
 *   { success: true, data: { duplicate: false } }
 *   { success: true, data: { duplicate: true, videoId, title, dateUploaded, playerId, hasAnalysis } }
 *
 * SEGURO: Si el lookup falla (Supabase down, credenciales ausentes),
 * devolvemos { duplicate: false } para que el upload proceda normal.
 * NUNCA bloquea el flujo del usuario.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";

const BodySchema = z.object({
  hash: z.string().regex(/^[0-9a-f]{64}$/i, "hash debe ser SHA-256 hex (64 chars)"),
  playerId: z.string().optional(),
});

export default withHandler(
  { method: "POST", schema: BodySchema, requireAuth: true, maxRequests: 30 },
  async ({ body, userId }) => {
    const { hash, playerId } = body;

    const sbUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Sin Supabase configurado → no hay dedup posible → el cliente sube normal
    if (!sbUrl || !sbKey) {
      return successResponse({ duplicate: false, _reason: "supabase_not_configured" });
    }

    const headers = {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
    };

    try {
      // Filtro: mismo user_id + mismo hash. Opcionalmente mismo player_id.
      // Orden: más reciente primero. Limit 1 — solo necesitamos saber si existe.
      const qs = new URLSearchParams({
        user_id: `eq.${userId}`,
        file_hash: `eq.${hash.toLowerCase()}`,
        select: "id,title,date_uploaded,player_id,analysis_result,status",
        order: "date_uploaded.desc.nullslast",
        limit: "1",
      });
      if (playerId) qs.set("player_id", `eq.${playerId}`);

      const res = await fetch(`${sbUrl}/rest/v1/videos?${qs}`, { headers });

      if (!res.ok) {
        console.warn("[check-hash] Supabase error:", res.status);
        // No bloquear al usuario — permitir upload normal
        return successResponse({ duplicate: false, _reason: "lookup_failed" });
      }

      const rows = (await res.json()) as Array<{
        id: string;
        title: string | null;
        date_uploaded: string | null;
        player_id: string | null;
        analysis_result: unknown;
        status: string | null;
      }>;

      if (rows.length === 0) {
        return successResponse({ duplicate: false });
      }

      const existing = rows[0];
      return successResponse({
        duplicate: true,
        videoId: existing.id,
        title: existing.title,
        dateUploaded: existing.date_uploaded,
        playerId: existing.player_id,
        status: existing.status,
        hasAnalysis: existing.analysis_result !== null && existing.analysis_result !== undefined,
      });
    } catch (err) {
      console.error("[check-hash] Error:", err);
      // Graceful fallback: no bloquear — permitir upload normal
      return successResponse({ duplicate: false, _reason: "exception" });
    }
  },
);

export const config = { runtime: "edge" };
