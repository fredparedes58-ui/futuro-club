/**
 * VITAS · Generate Reports from Client-Side Data
 * POST /api/analyses/generate-reports
 *
 * Called by usePlayerAnalysisV2.analyzeWithClientData() when MediaPipe + YOLO
 * data is available from browser-side processing (no Modal dependency).
 *
 * Flow:
 *   1. Receives analysisId + client biomechanics + physicalMetrics + eventSummary
 *   2. Delegates to pipeline-orchestrator to generate 6 Claude reports
 *   3. Returns immediately (orchestrator handles report generation)
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { checkUsageQuota, incrementUsage, usageExceededResponse } from "../_lib/usageGuard";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PUBLIC_URL =
  process.env.VITAS_PUBLIC_URL ??
  process.env.VITAS_API_BASE_URL ??
  `https://${process.env.VERCEL_URL ?? "futuro-club.vercel.app"}`;
const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN ?? process.env.CRON_SECRET ?? "";

const schema = z.object({
  analysisId: z.string().uuid().optional(),
  playerId: z.string(),
  videoId: z.string(),
  biomechanics: z.record(z.unknown()).nullable().optional(),
  physicalMetrics: z.record(z.unknown()).nullable().optional(),
  eventSummary: z.record(z.unknown()).nullable().optional(),
  playedPosition: z.string().nullable().optional(),
});

export default withHandler(
  { schema, requireAuth: true, maxRequests: 10 },
  async ({ body, userId }) => {
    // ── Quota check before expensive pipeline ─────────────────────
    if (userId) {
      const usage = await checkUsageQuota(userId);
      if (!usage.allowed) return usageExceededResponse(usage);
    }

    const {
      analysisId: providedId,
      playerId,
      videoId,
      biomechanics,
      physicalMetrics,
      eventSummary,
      playedPosition,
    } = body as z.infer<typeof schema>;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // ── 1. Upsert analysis with client data ──────────────────────────
    let analysisId = providedId;

    if (!analysisId) {
      // Find existing or create
      const { data: existing } = await supabase
        .from("analyses")
        .select("id")
        .eq("video_id", videoId)
        .eq("player_id", playerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      analysisId = existing?.id;
    }

    if (analysisId) {
      // Update existing analysis with client data
      await supabase
        .from("analyses")
        .update({
          status: "processing_reports",
          biomechanics: biomechanics ?? undefined,
          played_position: playedPosition ?? undefined,
          client_metrics: {
            physicalMetrics: physicalMetrics ?? null,
            eventSummary: eventSummary ?? null,
            source: "client_mediapipe_yolo",
            processedAt: new Date().toISOString(),
          },
        })
        .eq("id", analysisId);
    } else {
      // Create new analysis
      const { data: newAnalysis, error: insertError } = await supabase
        .from("analyses")
        .insert({
          player_id: playerId,
          video_id: videoId,
          user_id: userId,
          status: "processing_reports",
          biomechanics: biomechanics ?? null,
          played_position: playedPosition ?? null,
          client_metrics: {
            physicalMetrics: physicalMetrics ?? null,
            eventSummary: eventSummary ?? null,
            source: "client_mediapipe_yolo",
            processedAt: new Date().toISOString(),
          },
        })
        .select("id")
        .single();

      if (insertError || !newAnalysis) {
        return errorResponse({
          code: "insert_failed",
          message: insertError?.message ?? "Cannot create analysis",
          status: 500,
        });
      }
      analysisId = newAnalysis.id;
    }

    // ── 2. Dispatch to pipeline-orchestrator (fire-and-forget) ───────
    // The orchestrator generates 6 Claude reports and marks as completed
    try {
      const orchestratorRes = await fetch(
        `${PUBLIC_URL}/api/agents/pipeline-orchestrator`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${INTERNAL_TOKEN}`,
          },
          body: JSON.stringify({ analysisId }),
        }
      );

      if (!orchestratorRes.ok) {
        const errText = await orchestratorRes.text().catch(() => "unknown");
        console.error(`[generate-reports] Orchestrator failed: ${orchestratorRes.status} ${errText}`);
        // Don't fail — analysis is still saved with biomechanics
      }
    } catch (err) {
      console.error("[generate-reports] Orchestrator dispatch error:", err);
      // Don't fail — analysis is still saved with biomechanics
    }

    // Increment usage after successful dispatch
    if (userId) {
      incrementUsage(userId, "generate-reports").catch(() => {});
    }

    return successResponse({
      analysisId,
      status: "processing_reports",
      message: "Reports generation started",
    });
  }
);
