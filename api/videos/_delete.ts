/**
 * VITAS · Video Delete Handler
 * DELETE /api/videos/{id}/delete → delete video from Bunny
 */
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

const BUNNY_BASE = "https://video.bunnycdn.com/library";

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

export default videoDelete;
