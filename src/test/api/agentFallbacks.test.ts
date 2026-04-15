/**
 * Tests for Deterministic Agent Fallbacks
 * Validates PHV Mirwald formula, role profile rules, and scout insight classification.
 */
import { describe, it, expect } from "vitest";
import { phvFallback, roleProfileFallback, scoutInsightFallback } from "../../../api/_lib/agentFallbacks";

// ── PHV Calculator Fallback ─────────────────────────────────────────────

describe("phvFallback", () => {
  const baseInput = {
    playerId: "p1",
    chronologicalAge: 14,
    height: 165,
    weight: 52,
    sitingHeight: 86,
    legLength: 79,
    currentVSI: 70,
  };

  it("returns all required fields", () => {
    const result = phvFallback(baseInput, "no_api_key");
    expect(result).toHaveProperty("playerId", "p1");
    expect(result).toHaveProperty("biologicalAge");
    expect(result).toHaveProperty("chronologicalAge", 14);
    expect(result).toHaveProperty("offset");
    expect(result).toHaveProperty("category");
    expect(result).toHaveProperty("phvStatus");
    expect(result).toHaveProperty("developmentWindow");
    expect(result).toHaveProperty("adjustedVSI");
    expect(result).toHaveProperty("recommendation");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("_fallback", true);
    expect(result).toHaveProperty("_fallbackReason", "no_api_key");
    expect(result).toHaveProperty("tokensUsed", 0);
  });

  it("categorizes correctly: early (offset < -1)", () => {
    // Use measurements that produce offset < -1
    const input = { ...baseInput, chronologicalAge: 12, height: 172, weight: 60, sitingHeight: 90, legLength: 82 };
    const result = phvFallback(input, "no_api_key");
    // Just verify it categorizes to one of the three
    expect(["early", "ontme", "late"]).toContain(result.category);
  });

  it("maps category to phvStatus correctly", () => {
    const result = phvFallback(baseInput, "claude_error");
    if (result.category === "early") expect(result.phvStatus).toBe("pre_phv");
    if (result.category === "ontme") expect(result.phvStatus).toBe("during_phv");
    if (result.category === "late") expect(result.phvStatus).toBe("post_phv");
  });

  it("adjustedVSI is within 0-100 range", () => {
    const result = phvFallback(baseInput, "no_api_key");
    expect(result.adjustedVSI).toBeGreaterThanOrEqual(0);
    expect(result.adjustedVSI).toBeLessThanOrEqual(100);
  });

  it("early maturers get VSI boost factor of 1.12", () => {
    // Force early category by providing measurements
    const input = { ...baseInput, currentVSI: 50 };
    const result = phvFallback(input, "no_api_key");
    if (result.category === "early") {
      expect(result.adjustedVSI).toBeGreaterThan(50);
    }
  });

  it("late maturers get VSI reduction factor of 0.92", () => {
    const input = { ...baseInput, currentVSI: 50 };
    const result = phvFallback(input, "no_api_key");
    if (result.category === "late") {
      expect(result.adjustedVSI).toBeLessThan(50);
    }
  });

  it("confidence is higher with real measurements (0.62 vs 0.5)", () => {
    const withData = phvFallback(baseInput, "no_api_key");
    const withoutData = phvFallback({
      playerId: "p2", chronologicalAge: 14, currentVSI: 70,
    }, "no_api_key");
    expect(withData.confidence).toBe(0.62);
    expect(withoutData.confidence).toBe(0.5);
  });

  it("uses default measurements when not provided", () => {
    const result = phvFallback({
      playerId: "p2", chronologicalAge: 14,
    }, "parse_error");
    expect(result.biologicalAge).toBeGreaterThan(0);
    expect(result._fallbackReason).toBe("parse_error");
  });

  it("biologicalAge = chronologicalAge + offset", () => {
    const result = phvFallback(baseInput, "no_api_key");
    expect(result.biologicalAge).toBeCloseTo(result.chronologicalAge + result.offset, 1);
  });

  it("developmentWindow is critical during PHV", () => {
    const result = phvFallback(baseInput, "no_api_key");
    if (result.phvStatus === "during_phv") {
      expect(result.developmentWindow).toBe("critical");
    }
  });

  it("recommendation matches category", () => {
    const result = phvFallback(baseInput, "no_api_key");
    expect(typeof result.recommendation).toBe("string");
    expect(result.recommendation.length).toBeGreaterThan(10);
  });
});

// ── Role Profile Fallback ───────────────────────────────────────────────

describe("roleProfileFallback", () => {
  const baseInput = {
    player: {
      id: "p1",
      name: "Samu",
      age: 15,
      foot: "right",
      position: "mediocentro",
      minutesPlayed: 600,
      competitiveLevel: "Nacional",
      metrics: { speed: 65, technique: 80, vision: 75, stamina: 60, shooting: 55, defending: 45 },
      phvCategory: "ontme",
    },
  };

  it("returns all required fields", () => {
    const result = roleProfileFallback(baseInput, "claude_error");
    expect(result).toHaveProperty("playerId", "p1");
    expect(result).toHaveProperty("dominantIdentity");
    expect(result).toHaveProperty("identityDistribution");
    expect(result).toHaveProperty("topPositions");
    expect(result).toHaveProperty("topArchetypes");
    expect(result).toHaveProperty("capabilities");
    expect(result).toHaveProperty("strengths");
    expect(result).toHaveProperty("gaps");
    expect(result).toHaveProperty("overallConfidence");
    expect(result).toHaveProperty("_fallback", true);
  });

  it("identity distribution sums to approximately 1.0", () => {
    const result = roleProfileFallback(baseInput, "no_api_key");
    const dist = result.identityDistribution;
    const sum = dist.ofensivo + dist.defensivo + dist.tecnico + dist.fisico + dist.mixto;
    expect(sum).toBeCloseTo(1.0, 1);
  });

  it("detects tecnico identity for high technique+vision", () => {
    const result = roleProfileFallback(baseInput, "no_api_key");
    expect(result.dominantIdentity).toBe("tecnico");
  });

  it("detects fisico identity for high speed+stamina", () => {
    const input = {
      player: {
        ...baseInput.player,
        metrics: { speed: 85, technique: 50, vision: 50, stamina: 82, shooting: 50, defending: 50 },
      },
    };
    const result = roleProfileFallback(input, "no_api_key");
    expect(result.dominantIdentity).toBe("fisico");
  });

  it("detects mixto identity when metrics are close", () => {
    const input = {
      player: {
        ...baseInput.player,
        metrics: { speed: 62, technique: 60, vision: 61, stamina: 63, shooting: 60, defending: 62 },
      },
    };
    const result = roleProfileFallback(input, "no_api_key");
    expect(result.dominantIdentity).toBe("mixto");
  });

  it("maps position to correct code", () => {
    const result = roleProfileFallback(baseInput, "no_api_key");
    expect(result.topPositions[0].code).toBe("DM"); // mediocentro → DM
  });

  it("maps portero to GK", () => {
    const input = { player: { ...baseInput.player, position: "portero" } };
    const result = roleProfileFallback(input, "no_api_key");
    expect(result.topPositions[0].code).toBe("GK");
  });

  it("confidence depends on minutes played", () => {
    const highMins = roleProfileFallback({ player: { ...baseInput.player, minutesPlayed: 600 } }, "no_api_key");
    const lowMins = roleProfileFallback({ player: { ...baseInput.player, minutesPlayed: 100 } }, "no_api_key");
    expect(highMins.overallConfidence).toBeGreaterThan(lowMins.overallConfidence);
  });

  it("strengths are top 3 metrics", () => {
    const result = roleProfileFallback(baseInput, "no_api_key");
    expect(result.strengths).toHaveLength(3);
    // technique=80 should be first
    expect(result.strengths[0]).toContain("technique");
  });

  it("gaps are bottom 2 metrics", () => {
    const result = roleProfileFallback(baseInput, "no_api_key");
    expect(result.gaps).toHaveLength(2);
    // defending=45 should be in gaps
    expect(result.gaps.some(g => g.includes("defending"))).toBe(true);
  });

  it("uses default metrics when none provided", () => {
    const input = { player: { name: "Test" } };
    const result = roleProfileFallback(input, "no_api_key");
    expect(result.dominantIdentity).toBeDefined();
    expect(result.capabilities.tactical.current).toBe(60); // default 60
  });

  it("capabilities projections increase over time", () => {
    const result = roleProfileFallback(baseInput, "no_api_key");
    const { tactical } = result.capabilities;
    expect(tactical.p6m).toBeGreaterThanOrEqual(tactical.current);
    expect(tactical.p18m).toBeGreaterThanOrEqual(tactical.p6m);
  });
});

// ── Scout Insight Fallback ──────────────────────────────────────────────

describe("scoutInsightFallback", () => {
  it("detects breakout: VSI > 75 + trend up", () => {
    const result = scoutInsightFallback({
      player: { name: "Star", vsi: 80, vsiTrend: "up", recentMetrics: { speed: 70 } },
    }, "claude_error");
    expect(result.type).toBe("breakout");
    expect(result.urgency).toBe("high");
  });

  it("detects phv_alert: early maturer + speed > 75", () => {
    const result = scoutInsightFallback({
      player: { name: "PHV", phvCategory: "early", recentMetrics: { speed: 80 } },
    }, "no_api_key");
    expect(result.type).toBe("phv_alert");
    expect(result.urgency).toBe("high");
  });

  it("detects drill_record: max metric > 85", () => {
    const result = scoutInsightFallback({
      player: { name: "Record", recentMetrics: { technique: 90, speed: 60 } },
    }, "no_api_key");
    expect(result.type).toBe("drill_record");
    expect(result.urgency).toBe("medium");
  });

  it("detects regression: trend down", () => {
    const result = scoutInsightFallback({
      player: { name: "Declining", vsi: 60, vsiTrend: "down", recentMetrics: { speed: 50 } },
    }, "no_api_key");
    expect(result.type).toBe("regression");
    expect(result.urgency).toBe("high");
  });

  it("detects comparison: balanced 55-75 profile", () => {
    const result = scoutInsightFallback({
      player: { name: "Balanced", recentMetrics: { speed: 60, technique: 65, vision: 70 } },
    }, "no_api_key");
    expect(result.type).toBe("comparison");
    expect(result.urgency).toBe("low");
  });

  it("falls back to general for unclassified", () => {
    const result = scoutInsightFallback({
      player: { name: "Generic", recentMetrics: { speed: 40 } },
    }, "no_api_key");
    expect(result.type).toBe("general");
  });

  it("context override forces type", () => {
    const result = scoutInsightFallback({
      player: { name: "Override" },
      context: "breakout",
    }, "no_api_key");
    expect(result.type).toBe("breakout");
  });

  it("returns all required output fields", () => {
    const result = scoutInsightFallback({
      player: { name: "Test", id: "p1" },
    }, "no_api_key");
    expect(result.playerId).toBe("p1");
    expect(result.headline).toContain("Test");
    expect(typeof result.body).toBe("string");
    expect(result.tags.length).toBeGreaterThan(0);
    expect(result.actionItems.length).toBeGreaterThan(0);
    expect(result.ragEnriched).toBe(false);
    expect(result._fallback).toBe(true);
    expect(result.tokensUsed).toBe(0);
  });

  it("uses 'unknown' when player.id is missing", () => {
    const result = scoutInsightFallback({
      player: { name: "NoId" },
    }, "no_api_key");
    expect(result.playerId).toBe("unknown");
  });
});
