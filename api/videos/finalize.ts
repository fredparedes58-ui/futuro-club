/**
 * VITAS · Finalize Video Upload
 * POST /api/videos/finalize
 *
 * Llamado por el frontend tras completar el upload TUS a Bunny.
 *
 * Comportamiento:
 *   1. Verifica que el vídeo existe en Bunny (consulta status)
 *   2. Si Bunny lo está procesando, espera o reintenta
 *   3. Cuando Status=4 (encoded), DISPARA EL WEBHOOK manualmente
 *      (porque no tenemos webhook Bunny configurado todavía)
 *
 * Esto permite que el flujo funcione sin webhook Bunny configurado.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUNNY_LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID ?? "";
const BUNNY_API_KEY = process.env.BUNNY_STREAM_API_KEY ?? "";
const PUBLIC_URL =
  process.env.VITAS_PUBLIC_URL ??
  `https://${process.env.VERCEL_URL ?? "futuro-club.vercel.app"}`;

const finalizeSchema = z.object({
  videoId: z.string().min(1),
  bunnyVideoId: z.string().min(1),
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

async function triggerBunnyWebhook(bunnyVideoId: string): Promise<boolean> {
  // Disparar manualmente el webhook bunny-uploaded (mismo formato que Bunny enviaría)
  try {
    const res = await fetch(`${PUBLIC_URL}/api/webhooks/bunny-uploaded`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        VideoLibraryId: parseInt(BUNNY_LIBRARY_ID),
        VideoGuid: bunnyVideoId,
        Status: 4, // simulamos "encoded ready"
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default withHandler(
  { schema: finalizeSchema, requireAuth: true, maxRequests: 30 },
  async ({ body }) => {
    const input = body as z.infer<typeof finalizeSchema>;

    if (!BUNNY_LIBRARY_ID || !BUNNY_API_KEY) {
      return errorResponse({
        code: "bunny_not_configured",
        message: "Bunny no configurado",
        status: 503,
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Verificar que el video existe
    const { data: video } = await supabase
      .from("videos")
      .select("id, bunny_video_id")
      .eq("id", input.videoId)
      .single();

    if (!video) {
      return errorResponse({ code: "video_not_found", message: "Video no existe", status: 404 });
    }

    // Consultar Bunny por el status del vídeo
    const bunnyStatus = await getBunnyVideoStatus(input.bunnyVideoId);
    if (!bunnyStatus) {
      return errorResponse({
        code: "bunny_query_failed",
        message: "No se pudo consultar Bunny",
        status: 502,
      });
    }

    // Status: 0=Created, 1=Uploaded, 2=Processing, 3=Transcoding, 4=Finished, 5=Error
    const STATUS_FINISHED = 4;
    const STATUS_ERROR = 5;

    // Actualizar duration en BBDD
    if (bunnyStatus.length > 0) {
      await supabase
        .from("videos")
        .update({ duration_sec: bunnyStatus.length })
        .eq("id", video.id);
    }

    if (bunnyStatus.status === STATUS_ERROR) {
      return errorResponse({
        code: "bunny_encoding_failed",
        message: "Bunny falló encoding",
        status: 422,
      });
    }

    if (bunnyStatus.status !== STATUS_FINISHED) {
      // Aún no listo · cliente debe reintentar
      return successResponse({
        ready: false,
        status: bunnyStatus.status,
        message: "Vídeo aún en procesamiento, reintentar en 5-10 segundos",
        retryAfterSec: 5,
      });
    }

    // Listo · disparar webhook (encolará el análisis)
    const webhookFired = await triggerBunnyWebhook(input.bunnyVideoId);

    return successResponse({
      ready: true,
      videoId: video.id,
      bunnyStatus: bunnyStatus.status,
      webhookFired,
      message: webhookFired
        ? "Vídeo listo · análisis encolado · ETA ~2 minutos"
        : "Vídeo listo pero no se pudo disparar webhook",
    });
  }
);
