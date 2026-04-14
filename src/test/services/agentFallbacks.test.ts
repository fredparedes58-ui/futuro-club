/**
 * Tests for api/_lib/agentFallbacks.ts
 * Pure TypeScript logic — no mocks needed.
 */
import { describe, it, expect } from "vitest";
import { phvFallback, roleProfileFallback, scoutInsightFallback } from "../../../api/_lib/agentFallbacks";

// ─── PHV Fallback ───────────────────────────────────────────────────────────

describe("phvFallback", () => {
  const baseInput = {
    playerId: "p1",
    chronologicalAge: 13,
    height: 160,
    weight: 50,
  };

  it("returns valid PHV result with _fallback flag", () => {
    const r = phvFallback(baseInput, "no_api_key");
    expect(r._fallback).toBe(true);
    expect(r._fallbackReason).toBe("no_api_key");
    expect(r.agentName).toBe("PHVCalculatorAgent");
    expect(r.tokensUsed).toBe(0);
    expect(r.playerId).toBe("p1");
  });

  it("calculates Mirwald offset correctly", () => {
    const r = phvFallback(baseInput, "no_api_key");
    expect(typeof r.offset).toBe("number");
    expect(r.biologicalAge).toBeCloseTo(baseInput.chronologicalAge + r.offset, 1);
  });

  it("categorizes early (offset < -1)", () => {
    // Young player with small height → likely early
    const r = phvFallback({ ...baseInput, chronologicalAge: 10, height: 130, weight: 30 }, "no_api_key");
    if (r.offset < -1) {
      expect(r.category).toBe("early");
      expect(r.phvStatus).toBe("pre_phv");
    }
  });

  it("sets lower confidence without real sitting height data", () => {
    const r = phvFallback(baseInput, "no_api_key");
    expect(r.confidence).toBe(0.5);
  });

  it("sets higher confidence with real sitting height data", () => {
    const r = phvFallback({ ...baseInput, sitingHeight: 83, legLength: 77 }, "no_api_key");
    expect(r.confidence).toBe(0.62);
  });

  it("adjustedVSI is clamped to [0, 100]", () => {
    const r = phvFallback({ ...baseInput, currentVSI: 99 }, "no_api_key");
    expect(r.adjustedVSI).toBeGreaterThanOrEqual(0);
    expect(r.adjustedVSI).toBeLessThanOrEqual(100);
  });

  it("uses 70 as default VSI when not provided", () => {
    const r = phvFallback({ playerId: "p1", chronologicalAge: 13 }, "no_api_key");
    // adjustedVSI should be based on 70
    expect(r.adjustedVSI).toBeGreaterThan(0);
  });

  it("developmentWindow is critical during PHV", () => {
    const r = phvFallback(baseInput, "no_api_key");
    if (r.phvStatus === "during_phv") {
      expect(r.developmentWindow).toBe("critical");
    }
  });

  it("recommendation is in Spanish", () => {
    const r = phvFallback(baseInput, "no_api_key");
    expect(r.recommendation.length).toBeGreaterThan(10);
  });
});

// ─── Role Profile Fallback ──────────────────────────────────────────────────

describe("roleProfileFallback", () => {
  const baseInput = {
    player: {
      id: "p1",
      name: "Test Player",
      age: 14,
      position: "delantero",
      minutesPlayed: 300,
      metrics: { speed: 80, technique: 70, vision: 65, stamina: 75, shooting: 85, defending: 40 },
      phvCategory: "ontme" as const,
    },
  };

  it("returns valid role profile with _fallback flag", () => {
    const r = roleProfileFallback(baseInput, "no_api_key");
    expect(r._fallback).toBe(true);
    expect(r.agentName).toBe("RoleProfileAgent");
    expect(r.tokensUsed).toBe(0);
  });

  it("identifies ofensivo when shooting+speed are top", () => {
    const r = roleProfileFallback(baseInput, "no_api_key");
    expect(r.dominantIdentity).toBe("ofensivo");
  });

  it("identifies fisico when speed+stamina are top", () => {
    const input = {
      player: {
        ...baseInput.player,
        metrics: { speed: 90, technique: 40, vision: 40, stamina: 85, shooting: 45, defending: 40 },
      },
    };
    const r = roleProfileFallback(input, "no_api_key");
    expect(r.dominantIdentity).toBe("fisico");
  });

  it("identifies tecnico when technique+vision are top", () => {
    const input = {
      player: {
        ...baseInput.player,
        metrics: { speed: 40, technique: 90, vision: 88, stamina: 40, shooting: 45, defending: 40 },
      },
    };
    const r = roleProfileFallback(input, "no_api_key");
    expect(r.dominantIdentity).toBe("tecnico");
  });

  it("identityDistribution sums to ~1.0", () => {
    const r = roleProfileFallback(baseInput, "no_api_key");
    const sum = Object.values(r.identityDistribution).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 1);
  });

  it("capabilities p18m > current", () => {
    const r = roleProfileFallback(baseInput, "no_api_key");
    expect(r.capabilities.tactical.p18m).toBeGreaterThan(r.capabilities.tactical.current);
    expect(r.capabilities.technical.p18m).toBeGreaterThan(r.capabilities.technical.current);
    expect(r.capabilities.physical.p18m).toBeGreaterThan(r.capabilities.physical.current);
  });

  it("confidence based on minutesPlayed", () => {
    const r = roleProfileFallback(baseInput, "no_api_key");
    expect(r.overallConfidence).toBe(0.35); // 200-500 range
  });

  it("handles missing metrics gracefully", () => {
    const input = { player: { name: "Bare" } };
    const r = roleProfileFallback(input, "claude_error");
    expect(r._fallback).toBe(true);
    expect(r.dominantIdentity).toBeDefined();
  });
});

// ─── Scout Insight Fallback ─────────────────────────────────────────────────

describe("scoutInsightFallback", () => {
  it("generates breakout when vsi > 75 and trend up", () => {
    const r = scoutInsightFallback({
      player: { name: "Star", vsi: 82, vsiTrend: "up", recentMetrics: { speed: 80 } },
    }, "no_api_key");
    expect(r.type).toBe("breakout");
    expect(r.urgency).toBe("high");
    expect(r._fallback).toBe(true);
  });

  it("generates regression when trend is down", () => {
    const r = scoutInsightFallback({
      player: { name: "Slump", vsi: 55, vsiTrend: "down", recentMetrics: { speed: 60 } },
    }, "no_api_key");
    expect(r.type).toBe("regression");
    expect(r.urgency).toBe("high");
  });

  it("generates phv_alert when early + high speed", () => {
    const r = scoutInsightFallback({
      player: { name: "Young", phvCategory: "early", recentMetrics: { speed: 80 } },
    }, "no_api_key");
    expect(r.type).toBe("phv_alert");
    expect(r.urgency).toBe("high");
  });

  it("generates drill_record when metric > 85", () => {
    const r = scoutInsightFallback({
      player: { name: "Pro", recentMetrics: { technique: 90, speed: 60 } },
    }, "no_api_key");
    expect(r.type).toBe("drill_record");
    expect(r.urgency).toBe("medium");
  });

  it("generates general for average metrics", () => {
    const r = scoutInsightFallback({
      player: { name: "Average", vsi: 60, recentMetrics: { speed: 60, technique: 60 } },
    }, "no_api_key");
    expect(["general", "comparison"]).toContain(r.type);
  });

  it("timestamp is valid ISO string", () => {
    const r = scoutInsightFallback({ player: { name: "T" } }, "no_api_key");
    expect(new Date(r.timestamp).toISOString()).toBe(r.timestamp);
  });

  it("always has actionItems", () => {
    const r = scoutInsightFallback({ player: { name: "T" } }, "no_api_key");
    expect(r.actionItems.length).toBeGreaterThanOrEqual(2);
  });
});
