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

const BodySchema = z.object({
  title: z.string().min(1).max(200),
  playerId: z.string().optional(),
  collection: z.string().optional(), // Bunny collection GUID (optional)
});

const BUNNY_BASE = "https://video.bunnycdn.com/library";

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const apiKey = process.env.BUNNY_STREAM_API_KEY;

  // Graceful degradation — env vars not configured yet
  if (!libraryId || !apiKey) {
    return json(
      {
        success: false,
        error: "BUNNY_STREAM_LIBRARY_ID / BUNNY_STREAM_API_KEY no configuradas",
        phase2Pending: true,
      },
      503
    );
  }

  try {
    const body = await req.json();
    const { title, playerId, collection } = BodySchema.parse(body);

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
      const errText = await createRes.text();
      throw new Error(`Bunny create failed (${createRes.status}): ${errText}`);
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

    // Step 2: Generate a one-time upload signature (SHA256 HMAC)
    // Bunny Stream supports: AuthorizationSignature = SHA256(libraryId + apiKey + expirationTime + videoId)
    const expirationTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    const signatureInput = `${libraryId}${apiKey}${expirationTime}${video.guid}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(apiKey);
    const msgData = encoder.encode(signatureInput);
    const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
    const signature = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

    // Return upload token — API key is NOT exposed to client
    return json({
      success: true,
      data: {
        videoId:        video.guid,
        libraryId:      Number(libraryId),
        uploadUrl:      `${BUNNY_BASE}/${libraryId}/videos/${video.guid}`,
        authSignature:  signature,
        authExpire:     expirationTime,
        title:          video.title,
        playerId:       playerId ?? null,
        cdnHostname:    process.env.BUNNY_CDN_HOSTNAME ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ success: false, error: message }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = { runtime: "edge" };
