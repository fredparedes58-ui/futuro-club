/**
 * VITAS Phase 2 — Delete Video from Bunny Stream
 * DELETE /api/videos/[id]/delete
 *
 * Env vars: BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY
 */

const BUNNY_BASE = "https://video.bunnycdn.com/library";

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "DELETE") {
    return json({ error: "Method not allowed" }, 405);
  }

  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const apiKey = process.env.BUNNY_STREAM_API_KEY;

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

  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  // Path: /api/videos/{id}/delete  →  segments[-2] = id
  const videoId = segments[segments.length - 2];

  if (!videoId || videoId === "undefined") {
    return json({ success: false, error: "Missing video ID" }, 400);
  }

  try {
    const res = await fetch(`${BUNNY_BASE}/${libraryId}/videos/${videoId}`, {
      method: "DELETE",
      headers: { AccessKey: apiKey },
    });

    if (res.status === 404) {
      return json({ success: false, error: "Video not found" }, 404);
    }
    if (!res.ok) {
      throw new Error(`Bunny delete failed (${res.status})`);
    }

    return json({ success: true, deletedId: videoId });
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
