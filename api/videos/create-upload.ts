/**
 * VITAS · Create Bunny Upload
 * POST /api/videos/create-upload
 *
 * Crea un vídeo "vacío" en Bunny Stream y devuelve credenciales
 * firmadas para que el cliente pueda subir directamente con TUS protocol.
 *
 * Flujo:
 *   1. Cliente llama a este endpoint con metadata del vídeo
 *   2. Servidor crea video en Bunny (POST a Bunny API)
 *   3. Servidor crea row en `videos` table (status='uploading')
 *   4. Servidor devuelve { videoId, bunnyVideoId, uploadUrl, signature }
 *   5. Cliente sube directo a Bunny via TUS (no pasa por nuestro server)
 *   6. Tras subir, cliente llama /api/videos/finalize con el bunnyVideoId
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUNNY_LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID ?? "";
const BUNNY_API_KEY = process.env.BUNNY_STREAM_API_KEY ?? "";

const createUploadSchema = z.object({
  playerId: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  durationSec: z.number().positive().optional(),
});

async function createBunnyVideo(title: string): Promise<{ guid: string; libraryId: number } | null> {
  if (!BUNNY_LIBRARY_ID || !BUNNY_API_KEY) {
    console.error("[VITAS] BUNNY credentials not configured");
    return null;
  }

  try {
    const res = await fetch(
      `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos`,
      {
        method: "POST",
        headers: {
          AccessKey: BUNNY_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ title }),
      }
    );

    if (!res.ok) {
      console.error(`[VITAS] Bunny createVideo failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return {
      guid: data.guid,
      libraryId: parseInt(BUNNY_LIBRARY_ID),
    };
  } catch (err) {
    console.error("[VITAS] Bunny API error:", err);
    return null;
  }
}

/**
 * Genera la signature TUS que Bunny espera.
 * Formato: SHA256(library_id + api_key + expiration_timestamp + video_id)
 * Expiración: 24h en el futuro.
 */
function generateTusSignature(videoId: string, expirationSec: number): string {
  const payload = BUNNY_LIBRARY_ID + BUNNY_API_KEY + expirationSec + videoId;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export default withHandler(
  { schema: createUploadSchema, requireAuth: true, maxRequests: 30 },
  async ({ body, userId }) => {
    const input = body as z.infer<typeof createUploadSchema>;

    if (!BUNNY_LIBRARY_ID || !BUNNY_API_KEY) {
      return errorResponse({
        code: "bunny_not_configured",
        message: "Bunny Stream no está configurado en el servidor",
        status: 503,
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Verificar player y obtener tenant_id
    const { data: player } = await supabase
      .from("players")
      .select("id, tenant_id, name")
      .eq("id", input.playerId)
      .single();

    if (!player) {
      return errorResponse({ code: "player_not_found", message: "Jugador no existe", status: 404 });
    }

    // Crear vídeo en Bunny
    const bunnyVideo = await createBunnyVideo(`${input.title} · ${player.name}`);
    if (!bunnyVideo) {
      return errorResponse({
        code: "bunny_create_failed",
        message: "No se pudo crear el vídeo en Bunny",
        status: 502,
      });
    }

    // Crear row en `videos` table
    const videoId = `vid-${crypto.randomBytes(8).toString("hex")}`;
    const { data: video, error } = await supabase
      .from("videos")
      .insert({
        id: videoId,
        tenant_id: player.tenant_id,
        player_id: input.playerId,
        bunny_video_id: bunnyVideo.guid,
        duration_sec: input.durationSec ?? null,
      })
      .select()
      .single();

    if (error) {
      return errorResponse({ code: "video_create_failed", message: error.message, status: 500 });
    }

    // Generar signature TUS válida 24h
    const expirationSec = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const signature = generateTusSignature(bunnyVideo.guid, expirationSec);

    return successResponse({
      videoId: video.id,
      bunnyVideoId: bunnyVideo.guid,
      libraryId: bunnyVideo.libraryId,
      tusUploadUrl: "https://video.bunnycdn.com/tusupload",
      authorizationSignature: signature,
      authorizationExpire: expirationSec,
    });
  }
);
