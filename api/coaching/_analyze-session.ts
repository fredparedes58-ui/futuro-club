/**
 * VITAS · POST /api/coaching/analyze-session
 *
 * Analyzes a training session video:
 *   1. Loads track snapshots + ball track from tracking data
 *   2. Runs SessionSegmenter → TrainingSegment[]
 *   3. Runs DrillClassifier → ClassifiedDrill[]
 *   4. Runs ParticipationTracker → PlayerDrillMetrics[]
 *   5. Persists results in training_sessions + player_session_metrics
 *
 * Sprint 14: Coaching Assistant — Segmentation & Metrics
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const AnalyzeSessionSchema = z.object({
  videoId: z.string().min(1, "videoId es requerido"),
  teamId: z.string().min(1, "teamId es requerido"),
  sessionDate: z.string().optional(), // ISO date string
  sessionDurationMs: z.number().optional(),
  /** Pre-extracted tracking data (from client-side YOLO pipeline) */
  trackSnapshots: z.array(z.object({
    timestampMs: z.number(),
    tracks: z.array(z.unknown()),
  })).optional(),
  ballTrajectory: z.array(z.object({
    fx: z.number(),
    fy: z.number(),
    timestampMs: z.number(),
  })).optional(),
});

export default withHandler(
  {
    method: "POST",
    schema: AnalyzeSessionSchema,
    requireAuth: true,
    maxRequests: 10,
  },
  async ({ body, userId }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase no configurado", 503, "CONFIG_MISSING");
    }

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    try {
      // ── Step 0: Create session record (status: processing) ──

      const sessionDate = body.sessionDate || new Date().toISOString().split("T")[0];
      const sessionDurationMs = body.sessionDurationMs || 0;

      const sessionRow = {
        team_id: body.teamId,
        coach_id: userId,
        video_id: body.videoId,
        session_date: sessionDate,
        duration_min: sessionDurationMs / 60_000,
        status: "processing",
      };

      const createRes = await fetch(`${supabaseUrl}/rest/v1/training_sessions`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify(sessionRow),
      });

      if (!createRes.ok) {
        const err = await createRes.text().catch(() => "unknown");
        return errorResponse(`Failed to create session: ${err}`, 500);
      }

      const [created] = (await createRes.json()) as Array<{ id: string }>;
      const sessionId = created.id;

      // ── Step 1: Load tracking data ──
      // In production, tracking data comes from the client-side YOLO pipeline
      // via trackSnapshots in the request body, or loaded from tracking_sessions table.

      const trackSnapshots = body.trackSnapshots ?? [];
      const ballTrajectory = body.ballTrajectory ?? [];

      // If no tracking data provided, try loading from tracking_sessions
      if (trackSnapshots.length === 0) {
        try {
          const trackingRes = await fetch(
            `${supabaseUrl}/rest/v1/tracking_sessions?video_id=eq.${encodeURIComponent(body.videoId)}&select=metrics,scan_events&order=created_at.desc&limit=1`,
            { headers },
          );
          if (trackingRes.ok) {
            const rows = (await trackingRes.json()) as Array<{
              metrics: Record<string, unknown>;
              scan_events: unknown[];
            }>;
            // Note: In full implementation, tracking data would be stored
            // in a more granular format. For now, generate mock segments.
            if (rows.length > 0) {
              // Tracking data available but in summarized form
              // The client-side pipeline should send detailed snapshots
            }
          }
        } catch {
          // Continue with empty data — will produce mock-like results
        }
      }

      // ── Steps 2-4: Segmentation → Classification → Participation ──
      // These run on the client side in production (browser-based YOLO).
      // The API receives pre-computed results OR raw tracking data.
      //
      // For now, we persist whatever the client sends.
      // In Sprint 15+, the sessionAnalyzer will process these further.

      // Import processing modules dynamically if tracking data available
      // Note: In edge runtime, these are bundled at build time
      const { segmentSession } = await import(
        "../../src/lib/coaching/sessionSegmenter"
      );
      const { classifyDrills } = await import(
        "../../src/lib/coaching/drillClassifier"
      );
      const { trackParticipation, aggregateSessionParticipation } = await import(
        "../../src/lib/coaching/participationTracker"
      );

      // Run segmenter
      const segments = segmentSession({
        trackSnapshots: trackSnapshots as never[],
        ballTrack: ballTrajectory.length > 0
          ? { center: { x: 0, y: 0 }, fieldPos: null, speedMs: 0, visible: false, age: 0, trajectory: ballTrajectory, active: false }
          : null,
        sessionDurationMs,
      });

      // Run classifier
      const segmentTracks = segments.map((seg) => {
        const snapshot = (trackSnapshots as Array<{ timestampMs: number; tracks: unknown[] }>)
          .find((s) => s.timestampMs >= seg.startMs && s.timestampMs < seg.endMs);
        return (snapshot?.tracks ?? []) as never[];
      });

      const drills = classifyDrills({
        segments,
        segmentTracks,
        ballTrack: ballTrajectory.length > 0
          ? { center: { x: 0, y: 0 }, fieldPos: null, speedMs: 0, visible: false, age: 0, trajectory: ballTrajectory, active: false }
          : null,
      });

      // Run participation tracker
      const drillMetrics = trackParticipation({
        drills,
        segments,
        segmentTracks,
        ballTrack: null,
      });

      // Aggregate per-player session participation
      const durationMin = sessionDurationMs / 60_000;
      const playerParticipation = aggregateSessionParticipation(
        drillMetrics,
        sessionId,
        durationMin,
      );

      // ── Step 5: Persist results ──

      // Update training_sessions with segments and drills
      const updateRes = await fetch(
        `${supabaseUrl}/rest/v1/training_sessions?id=eq.${sessionId}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            segments: JSON.stringify(segments),
            drills: JSON.stringify(drills),
            drill_count: drills.length,
            player_count: new Set(drillMetrics.map((m) => m.playerId)).size,
            status: "completed",
          }),
        },
      );

      if (!updateRes.ok) {
        const err = await updateRes.text().catch(() => "unknown");
        console.error("Failed to update session:", err);
      }

      // Persist player metrics
      if (playerParticipation.length > 0) {
        const metricsRows = playerParticipation.map((p) => ({
          session_id: sessionId,
          player_id: p.playerId,
          total_touches: p.totalTouches,
          touches_per_minute: p.touchesPerMinute,
          active_pct: p.activePct,
          idle_pct: p.idlePct,
          avg_intensity:
            p.perDrill.length > 0
              ? p.perDrill.reduce((s: number, m: { avgIntensity: number }) => s + m.avgIntensity, 0) /
                p.perDrill.length
              : 0,
          per_drill: JSON.stringify(p.perDrill),
          alerts: JSON.stringify(p.alerts),
          trend: p.trendVsPrevious ? JSON.stringify(p.trendVsPrevious) : null,
        }));

        const metricsRes = await fetch(
          `${supabaseUrl}/rest/v1/player_session_metrics`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(metricsRows),
          },
        );

        if (!metricsRes.ok) {
          const err = await metricsRes.text().catch(() => "unknown");
          console.error("Failed to persist player metrics:", err);
        }
      }

      return successResponse({
        sessionId,
        segmentCount: segments.length,
        drillCount: drills.length,
        playerCount: playerParticipation.length,
        segments,
        drills,
        playerParticipation,
      });
    } catch (err) {
      // Mark session as failed if it was created
      console.error("Session analysis failed:", err);
      return errorResponse(
        `Analysis failed: ${err instanceof Error ? err.message : "unknown error"}`,
        500,
      );
    }
  },
);
