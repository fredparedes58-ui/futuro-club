/**
 * VITAS · Video Status Handler
 * GET /api/videos/{id}/status → get encoding/processing status from Bunny
 */
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

const BUNNY_BASE = "https://video.bunnycdn.com/library";

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
    const videoId = url.searchParams.get("videoId");

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

export default videoStatus;
