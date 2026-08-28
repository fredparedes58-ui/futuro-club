/**
 * VITAS Phase 2 — Bunny Stream Video Init
 * POST /api/upload/video-init
 *
 * Flow: Client calls this → we create a Bunny video entry → return upload URL
 * Client then uploads DIRECTLY to Bunny (bypasses Vercel 4.5MB body limit).
 *
 * Env vars needed (Vercel):
 *   BUNNY_STREAM_LIBRARY_ID  — numeric Library ID from Bunny dashboard
 *   BUNNY_STREAM_API_KEY     — library-level API key (AccessKey)
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse, degradedResponse } from "../_lib/apiResponse";

const BodySchema = z.object({
  title: z.string().min(1).max(200),
  playerId: z.string().optional(),
  collection: z.string().optional(), // Bunny collection GUID (optional)
});

const BUNNY_BASE = "https://video.bunnycdn.com/library";

export default withHandler(
  { method: "POST", schema: BodySchema, requireAuth: true, maxRequests: 10 },
  async ({ req, body }) => {
    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
    const apiKey = process.env.BUNNY_STREAM_API_KEY ?? process.env.BUNNY_API_KEY;

    // Degradación elegante: sin almacenamiento en la nube configurado, el cliente
    // procesa el vídeo LOCALMENTE (el análisis de visión corre en el navegador).
    // Devolvemos 200 + { success:false, phase2Pending:true } a nivel raíz — el contrato
    // que useVideoUpload ya consume — en vez de un 503 con jerga: NUNCA exponemos
    // nombres de variables de entorno al usuario final.
    if (!libraryId || !apiKey) {
      return degradedResponse({ phase2Pending: true });
    }

    const { title, playerId, collection } = body;

    // Step 1: Create video entry in Bunny Stream
    const createPayload: Record<string, string> = { title };
    if (collection) createPayload.collectionId = collection;

    const createRes = await fetch(`${BUNNY_BASE}/${libraryId}/videos`, {
      method: "POST",
      headers: {
        AccessKey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createPayload),
    });

    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => "");
      console.warn(`[video-init] Bunny Stream API ${createRes.status}: ${errText || "sin cuerpo"}`);
      return errorResponse(
        `Almacenamiento de vídeo no disponible temporalmente (${createRes.status}). Inténtalo de nuevo en unos minutos.`,
        502,
        "BUNNY_ERROR",
      );
    }

    const video = (await createRes.json()) as {
      videoLibraryId: number;
      guid: string;
      title: string;
      status: number;
      dateUploaded: string;
      views: number;
      isPublic: boolean;
      length: number;
      category: string;
      framesPerSecond: number;
      width: number;
      height: number;
      availableResolutions: string;
      thumbnailCount: number;
      encodeProgress: number;
      storageSize: number;
    };

    // Step 2: Generate a one-time upload signature (plain SHA256)
    // Bunny Stream: AuthorizationSignature = SHA256(libraryId + apiKey + expirationTime + videoId)
    const expirationTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    const signatureInput = `${libraryId}${apiKey}${expirationTime}${video.guid}`;
    const encoder = new TextEncoder();
    const msgData = encoder.encode(signatureInput);
    const sigBuffer = await crypto.subtle.digest("SHA-256", msgData);
    const signature = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

    // Return upload credentials — use signed auth, NEVER expose raw API key
    return successResponse({
      videoId:        video.guid,
      libraryId:      Number(libraryId),
      uploadUrl:      `${BUNNY_BASE}/${libraryId}/videos/${video.guid}`,
      authSignature:  signature,
      authExpire:     expirationTime,
      title:          video.title,
      playerId:       playerId ?? null,
      cdnHostname:    process.env.BUNNY_CDN_HOSTNAME ?? process.env.VITE_BUNNY_CDN_HOSTNAME ?? null,
    });
  },
);

export const config = { runtime: "edge" };
