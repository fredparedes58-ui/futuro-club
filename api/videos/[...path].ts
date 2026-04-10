/**
 * VITAS · Videos Router
 * Routes:
 *   /api/videos/list          → list all videos
 *   /api/videos/{id}/status   → get video status
 *   /api/videos/{id}/delete   → delete video
 *
 * Status and delete handlers are inlined here because Vercel's file-based
 * routing conflicts when [id]/ subdirectory coexists with a catch-all.
 */
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

import list from "./_list";

export const config = { runtime: "edge" };

const BUNNY_BASE = "https://video.bunnycdn.com/library";

// ── Video Status Handler ──────────────────────────────────────────────
const videoStatus = withHandler(
  { method: "GET", requireAuth: true, maxRequests: 30 },
  async ({ req }) => {
    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
    const apiKey = process.env.BUNNY_STREAM_API_KEY ?? process.env.BUNNY_API_KEY;
    const cdnHostname = process.env.BUNNY_CDN_HOSTNAME ?? process.env.VITE_BUNNY_CDN_HOSTNAME;

    if (!libraryId || !apiKey) {
      return errorResponse(
        "BUNNY_STREAM_LIBRARY_ID / BUNNY_STREAM_API_KEY no configuradas",
        503,
        "CONFIG_MISSING",
      );
    }

    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    // /api/videos/{id}/status → segments = ["api","videos","{id}","status"]
    const videoId = segments[segments.length - 2];

    if (!videoId || videoId === "undefined") {
      return errorResponse("Missing video ID", 400);
    }

    const res = await fetch(`${BUNNY_BASE}/${libraryId}/videos/${videoId}`, {
      headers: { AccessKey: apiKey },
    });

    if (res.status === 404) {
      return errorResponse("Video not found", 404);
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return errorResponse(`Bunny status error (${res.status}): ${errText}`, 502, "BUNNY_ERROR");
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

    return successResponse({
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
    });
  },
);

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

// ── Video Delete Handler ──────────────────────────────────────────────
const videoDelete = withHandler(
  { method: "DELETE", requireAuth: true, maxRequests: 30 },
  async ({ req }) => {
    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
    const apiKey = process.env.BUNNY_STREAM_API_KEY ?? process.env.BUNNY_API_KEY;

    if (!libraryId || !apiKey) {
      return errorResponse(
        "BUNNY_STREAM_LIBRARY_ID / BUNNY_STREAM_API_KEY no configuradas",
        503,
        "CONFIG_MISSING",
      );
    }

    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const videoId = segments[segments.length - 2];

    if (!videoId || videoId === "undefined") {
      return errorResponse("Missing video ID", 400);
    }

    const res = await fetch(`${BUNNY_BASE}/${libraryId}/videos/${videoId}`, {
      method: "DELETE",
      headers: { AccessKey: apiKey },
    });

    if (res.status === 404) {
      return errorResponse("Video not found", 404);
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return errorResponse(`Bunny delete error (${res.status}): ${errText}`, 502, "BUNNY_ERROR");
    }

    return successResponse({ deletedId: videoId });
  },
);

// ── Main Router ───────────────────────────────────────────────────────
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const segments = url.pathname.replace(/^\/api\/videos\/?/, "").split("/").filter(Boolean);

  // /api/videos/list
  if (segments.length === 1 && segments[0] === "list") {
    return list(req);
  }

  // /api/videos/{id}/status or /api/videos/{id}/delete
  if (segments.length === 2) {
    if (segments[1] === "status") return videoStatus(req);
    if (segments[1] === "delete") return videoDelete(req);
  }

  return errorResponse(`Videos route "${segments.join("/")}" not found`, 404);
}
