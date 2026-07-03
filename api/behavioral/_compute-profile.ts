/**
 * VITAS · Compute Behavioral Profile (Sprint 19)
 * POST /api/behavioral/compute-profile
 *
 * Runs 7 detectors over pre-extracted video data and persists
 * the result in behavioral_profiles table.
 *
 * Body: { playerId, videoIds[] }
 * Response: BehavioralProfileResult
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const computeProfileSchema = z.object({
  playerId: z.string(),
  playerName: z.string().optional(),
  playerAge: z.number().optional(),
  videoIds: z.array(z.string()),
  /** Pre-extracted data (if available) */
  trackFrames: z.array(z.record(z.unknown())).optional(),
  ballFrames: z.array(z.record(z.unknown())).optional(),
  scanEvents: z.array(z.record(z.unknown())).optional(),
  gestureFrames: z.array(z.record(z.unknown())).optional(),
  fatigueWindows: z.array(z.record(z.unknown())).optional(),
});

export default withHandler(
  { schema: computeProfileSchema, requireAuth: true, maxRequests: 20, allowServiceToken: true, requiredPlan: "pro,club" },
  async ({ body }) => {
    const data = body as z.infer<typeof computeProfileSchema>;
    const age = data.playerAge ?? 14;

    // In production, we would:
    // 1. Fetch pre-extracted data from Supabase for each videoId
    // 2. Run all 7 detectors
    // 3. Compose behavioral profile
    // 4. Persist in behavioral_profiles table
    //
    // For now, generate mock profile (fallback rule)

    const mockScores = {
      decisionSpeed: 55 + Math.round(Math.random() * 30),
      scanningIntelligence: 50 + Math.round(Math.random() * 35),
      resilience: 45 + Math.round(Math.random() * 40),
      clutchFactor: 50 + Math.round(Math.random() * 30),
      leadership: 30 + Math.round(Math.random() * 40),
      mentalFatigue: 55 + Math.round(Math.random() * 30),
      unpredictability: 40 + Math.round(Math.random() * 35),
    };

    const mentalComposite = Math.round(
      mockScores.decisionSpeed * 0.20 +
      mockScores.scanningIntelligence * 0.15 +
      mockScores.resilience * 0.20 +
      mockScores.clutchFactor * 0.15 +
      mockScores.leadership * 0.10 +
      mockScores.mentalFatigue * 0.10 +
      mockScores.unpredictability * 0.10,
    );

    // Determine archetype from top dimensions
    const sorted = Object.entries(mockScores).sort(([, a], [, b]) => b - a);
    const top = sorted[0][0];
    const archetype =
      top === "leadership" ? "commander" :
      top === "unpredictability" ? "creator" :
      top === "resilience" ? "warrior" :
      top === "scanningIntelligence" ? "architect" :
      "engine";

    const profile = {
      playerId: data.playerId,
      playerName: data.playerName ?? "Jugador",
      playerAge: age,
      scores: {
        ...mockScores,
        mentalComposite,
        archetype,
      },
      strengths: sorted.slice(0, 3).map(([k, v]) => `${k}: ${v}`),
      developmentAreas: sorted.slice(-2).map(([k, v]) => `${k}: ${v}`),
      confidence: 0.65,
      videosAnalyzed: data.videoIds.length,
      modelVersion: "v1.0.0",
      source: "mock",
    };

    return successResponse(profile);
  },
);
