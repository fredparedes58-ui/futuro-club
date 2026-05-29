/**
 * VITAS · /api/videos/_bunny-create
 *
 * Lightweight version of create-upload that does NOT depend on Supabase.
 * Used by Phase 1 (localStorage only) features like Set Pieces video upload.
 *
 * Flow:
 *   1. Client POSTs { title, durationSec? }
 *   2. We create a video record in Bunny Stream
 *   3. We compute TUS credentials (signature, expire, library_id)
 *   4. We return everything the client needs to upload directly to Bunny
 *
 * Required env vars on Vercel:
 *   BUNNY_STREAM_LIBRARY_ID
 *   BUNNY_STREAM_API_KEY
 *   BUNNY_CDN_HOSTNAME  (e.g. "vz-abc123.b-cdn.net")
 *
 * Returns 503 if env vars not configured so the client can fall back
 * to blob: URLs (local-only, the existing behavior).
 */

export const config = {
  runtime: "edge",
};

interface CreateRequest {
  title: string;
  durationSec?: number;
}

interface CreateResponse {
  bunnyVideoId: string;
  libraryId: number;
  tusUploadUrl: string;
  authorizationSignature: string;
  authorizationExpire: number;
  // Public URLs to play back later
  streamUrl: string; // HLS playlist
  mp4Url: string;    // direct MP4 (720p) for Modal etc.
  embedUrl: string;  // Bunny iframe player
  thumbnailUrl: string;
}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const libraryIdStr = process.env.BUNNY_STREAM_LIBRARY_ID;
  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  const cdnHost = process.env.BUNNY_CDN_HOSTNAME;

  if (!libraryIdStr || !apiKey || !cdnHost) {
    return json(
      {
        error: "bunny_not_configured",
        reason:
          "BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY and BUNNY_CDN_HOSTNAME must be set in Vercel env. Client should use blob: fallback.",
      },
      503,
    );
  }

  const libraryId = parseInt(libraryIdStr, 10);
  if (isNaN(libraryId)) {
    return json({ error: "bunny_library_id_not_numeric" }, 500);
  }

  let body: CreateRequest;
  try {
    body = (await request.json()) as CreateRequest;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!body.title?.trim()) {
    return json({ error: "missing_title" }, 400);
  }

  // 1. Create the video record on Bunny
  let bunnyResp: Response;
  try {
    bunnyResp = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
      method: "POST",
      headers: {
        AccessKey: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ title: body.title.trim() }),
    });
  } catch (err) {
    return json({ error: "bunny_unreachable", detail: (err as Error).message }, 502);
  }

  if (!bunnyResp.ok) {
    const detail = await bunnyResp.text().catch(() => "");
    return json({ error: "bunny_create_failed", status: bunnyResp.status, detail }, 502);
  }

  const bunnyVideo = (await bunnyResp.json()) as { guid: string };
  const bunnyVideoId = bunnyVideo.guid;

  // 2. Compute TUS credentials
  // Bunny signature: SHA256(library_id + apiKey + expiration + video_id)
  // Expiration: timestamp in seconds, valid up to 24h
  const expireSec = Math.floor(Date.now() / 1000) + 12 * 3600; // 12h
  const signatureInput = `${libraryId}${apiKey}${expireSec}${bunnyVideoId}`;
  const signature = await sha256Hex(signatureInput);

  const tusUploadUrl = "https://video.bunnycdn.com/tusupload";

  // 3. Return everything the client needs
  const result: CreateResponse = {
    bunnyVideoId,
    libraryId,
    tusUploadUrl,
    authorizationSignature: signature,
    authorizationExpire: expireSec,
    streamUrl: `https://${cdnHost}/${bunnyVideoId}/playlist.m3u8`,
    mp4Url: `https://${cdnHost}/${bunnyVideoId}/play_720p.mp4`,
    embedUrl: `https://iframe.mediadelivery.net/embed/${libraryId}/${bunnyVideoId}`,
    thumbnailUrl: `https://${cdnHost}/${bunnyVideoId}/thumbnail.jpg`,
  };

  return json(result);
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
