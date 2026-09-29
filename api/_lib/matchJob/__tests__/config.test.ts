import { describe, it, expect } from "vitest";
import { MATCH_VIDEO_CONFIG, AI_PRICING, PRICING_REF, matchVideoConfigSource } from "../config";

describe("match job config", () => {
  it("loads config/matchVideo.json with a _source per value", () => {
    expect(MATCH_VIDEO_CONFIG.segmentSec).toBe(900);
    expect(MATCH_VIDEO_CONFIG.mediaResolution).toBe("MEDIA_RESOLUTION_LOW");
    for (const k of Object.keys(MATCH_VIDEO_CONFIG) as (keyof typeof MATCH_VIDEO_CONFIG)[]) {
      expect(matchVideoConfigSource(k).length).toBeGreaterThan(0);
    }
  });
  it("confidences without a source say 'pendiente de validar'", () => {
    for (const k of ["llmConfidence", "llmConfidencePartialFactor", "possessionConfidence", "staleHeartbeatSec", "kitDeltaEWarn"] as const) {
      expect(matchVideoConfigSource(k)).toMatch(/pendiente de validar/);
    }
  });
  it("loads config/aiPricing.json with fetch date", () => {
    expect(AI_PRICING.gemini["gemini-2.5-flash"].output_usd_per_mtok).toBe(2.5);
    expect(AI_PRICING.anthropic["claude-opus-5-5"].input_usd_per_mtok).toBe(4);
    expect(PRICING_REF).toBe("config/aiPricing.json@2026-09-28");
  });
});
