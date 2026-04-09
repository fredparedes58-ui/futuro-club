/**
 * VITAS Phase 2 — Delete Video from Bunny Stream
 * DELETE /api/videos/[id]/delete
 *
 * Env vars: BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY
 */

import { withHandler } from "../../_lib/withHandler";
import { successResponse, errorResponse } from "../../_lib/apiResponse";

const BUNNY_BASE = "https://video.bunnycdn.com/library";

export default withHandler(
  { method: "DELETE", requireAuth: true, maxRequests: 30 },
  async ({ req }) => {
    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
    const apiKey = process.env.BUNNY_STREAM_API_KEY;

    if (!libraryId || !apiKey) {
      return errorResponse(
        "BUNNY_STREAM_LIBRARY_ID / BUNNY_STREAM_API_KEY no configuradas",
        503,
        "CONFIG_MISSING",
      );
    }

    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    // Path: /api/videos/{id}/delete  →  segments[-2] = id
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
      throw new Error(`Bunny delete failed (${res.status})`);
    }

    return successResponse({ deletedId: videoId });
  },
);

export const config = { runtime: "edge" };
