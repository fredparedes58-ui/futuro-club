/**
 * VITAS Phase 2 — Video Processing Status
 * GET /api/videos/[id]/status
 *
 * Polls Bunny Stream for encode progress and final status.
 * Used by useVideoUpload hook during the upload+processing flow.
 *
 * Env vars: BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY, BUNNY_CDN_HOSTNAME
 */

const BUNNY_BASE = "https://video.bunnycdn.com/library";

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  const cdnHostname = process.env.BUNNY_CDN_HOSTNAME;

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

  // Extract video ID from URL path
  // Vercel passes it as part of the URL: /api/videos/{id}/status
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const videoId = segments[segments.length - 2]; // ../{id}/status

  if (!videoId || videoId === "undefined") {
    return json({ success: false, error: "Missing video ID" }, 400);
  }

  try {
    const res = await fetch(`${BUNNY_BASE}/${libraryId}/videos/${videoId}`, {
      headers: { AccessKey: apiKey },
    });

    if (res.status === 404) {
      return json({ success: false, error: "Video not found" }, 404);
    }
    if (!res.ok) {
      throw new Error(`Bunny status failed (${res.status})`);
    }

    const v = (await res.json()) as {
      guid: string;
      title: string;
      status: number;
      encodeProgress: number;
      length: number;
      width: number;
      height: number;
      framesPerSecond: number;
      storageSize: number;
      thumbnailFileName: string;
      dateUploaded: string;
    };

    const cdn = cdnHostname ?? "";
    const isReady = v.status === 4;

    return json({
      success: true,
      data: {
        id: v.guid,
        title: v.title,
        status: mapBunnyStatus(v.status),
        statusCode: v.status,
        encodeProgress: v.encodeProgress,
        isReady,
        duration: v.length,
        width: v.width,
        height: v.height,
        fps: v.framesPerSecond,
        storageSize: v.storageSize,
        dateUploaded: v.dateUploaded,
        thumbnailUrl: cdn && v.thumbnailFileName
          ? `https://${cdn}/${v.guid}/${v.thumbnailFileName}`
          : null,
        embedUrl: `https://iframe.mediadelivery.net/embed/${libraryId}/${v.guid}`,
        streamUrl: cdn ? `https://${cdn}/${v.guid}/playlist.m3u8` : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ success: false, error: message }, 500);
  }
}

function mapBunnyStatus(code: number): string {
  switch (code) {
    case 0: return "created";
    case 1: return "uploaded";
    case 2: return "processing";
    case 3: return "transcoding";
    case 4: return "finished";
    case 5: return "error";
    case 6: return "upload-failed";
    default: return "unknown";
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = { runtime: "edge" };
