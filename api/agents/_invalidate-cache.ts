/**
 * VITAS Agent API — Cache Invalidation
 * POST /api/agents/invalidate-cache
 *
 * Invalidates cached agent responses when player data or video changes.
 */
import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { invalidateByPlayer, invalidateByVideo } from "../_lib/agentCache";

export const config = { runtime: "edge" };

const invalidateSchema = z.object({
  playerId: z.string().optional(),
  videoId: z.string().optional(),
});

export default withHandler(
  { schema: invalidateSchema, requireAuth: true, maxRequests: 60 },
  async ({ body }) => {
    const sbUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!sbUrl || !sbKey) {
      return errorResponse("Supabase not configured", 503);
    }

    let invalidated = 0;

    if (body.playerId) {
      invalidated += await invalidateByPlayer(body.playerId, sbUrl, sbKey);
    }
    if (body.videoId) {
      invalidated += await invalidateByVideo(body.videoId, sbUrl, sbKey);
    }

    return successResponse({ invalidated });
  },
);
