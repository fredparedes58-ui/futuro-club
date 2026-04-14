/**
 * Tests for KPI Projections & Monthly Challenges
 * Validates VSI projections, peak percentages, maturation advantage, and challenge generation.
 */
import { describe, it, expect, vi } from "vitest";

// Mock development curves
vi.mock("@/data/developmentCurves", () => ({
  developmentFactor: vi.fn((_age: number, _pos: string, _metric: string) => 0.65),
  developmentFactorAvg: vi.fn((age: number) => age <= 14 ? 0.60 : age <= 18 ? 0.85 : 0.95),
  estimateAtAge: vi.fn(() => 75),
  inverseAge: vi.fn((_val: number) => 15.3),
  ageConfidence: vi.fn((age: number) => ({
    confidence: age >= 16 ? 0.8 : age >= 13 ? 0.6 : 0.4,
    disclaimer: age < 13 ? "Datos limitados para esta edad" : undefined,
  })),
  phvAdjustment: vi.fn((_age: number, phvOffset: number) =>
    phvOffset > 0.5 ? 1.08 : phvOffset < -0.5 ? 0.93 : 1.0
  ),
  getHorizonMonths: vi.fn((age: number) => age <= 13 ? 6 : age <= 16 ? 9 : 12),
  getDevelopmentWindow: vi.fn(() => ["pace", "physic"]),
}));

vi.mock("@/data/proPlayers", () => ({
  getPositionGroup: vi.fn(() => "midfielder"),
}));

import { computeKPIs, generateMonthlyChallenges } from "@/lib/kpiProjections";

const baseMetrics = {
  speed: 65,
  shooting: 55,
  vision: 70,
  technique: 72,
  defending: 45,
  stamina: 60,
};

describe("computeKPIs", () => {
  it("returns all required fields", () => {
    const result = computeKPIs(baseMetrics, 14, "Mediocentro");
    expect(result).toHaveProperty("pctOfPeak");
    expect(result).toHaveProperty("avgPctOfPeak");
    expect(result).toHaveProperty("projectedVSI");
    expect(result).toHaveProperty("maturationAdvantage");
    expect(result).toHaveProperty("ageEquivalentPro");
    expect(result).toHaveProperty("confidence");
  });

  it("pctOfPeak entries are numeric and reasonable (0-120)", () => {
    const result = computeKPIs(baseMetrics, 14, "Mediocentro");
    for (const pct of Object.values(result.pctOfPeak)) {
      expect(typeof pct).toBe("number");
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(120);
    }
  });

  it("avgPctOfPeak is between 0 and 120", () => {
    const result = computeKPIs(baseMetrics, 14, "Mediocentro");
    expect(result.avgPctOfPeak).toBeGreaterThanOrEqual(0);
    expect(result.avgPctOfPeak).toBeLessThanOrEqual(120);
  });

  it("projectedVSI at18 and at21 have estimate, low, high", () => {
    const result = computeKPIs(baseMetrics, 14, "Mediocentro");
    for (const horizon of [result.projectedVSI.at18, result.projectedVSI.at21]) {
      expect(horizon.low).toBeLessThanOrEqual(horizon.estimate);
      expect(horizon.high).toBeGreaterThanOrEqual(horizon.estimate);
      expect(horizon.low).toBeGreaterThanOrEqual(1);
      expect(horizon.high).toBeLessThanOrEqual(99);
    }
  });

  it("VSI projections grow from 18 to 21", () => {
    const result = computeKPIs(baseMetrics, 14, "Mediocentro");
    expect(result.projectedVSI.at21.estimate).toBeGreaterThanOrEqual(result.projectedVSI.at18.estimate);
  });

  it("confidence margin is wider for younger players", () => {
    const young = computeKPIs(baseMetrics, 12, "Mediocentro");
    const older = computeKPIs(baseMetrics, 17, "Mediocentro");
    const youngRange = young.projectedVSI.at18.high - young.projectedVSI.at18.low;
    const olderRange = older.projectedVSI.at18.high - older.projectedVSI.at18.low;
    expect(youngRange).toBeGreaterThan(olderRange);
  });

  it("maturation advantage is non-zero for early maturers", () => {
    const result = computeKPIs(baseMetrics, 14, "Mediocentro", 1.5);
    // phvAdjustment returns 1.08 for offset > 0.5
    expect(result.maturationAdvantage).not.toBe(0);
  });

  it("maturation advantage is 0 for on-time maturers", () => {
    const result = computeKPIs(baseMetrics, 14, "Mediocentro", 0);
    // phvAdjustment returns 1.0 for offset near 0
    expect(result.maturationAdvantage).toBe(0);
  });

  it("ageEquivalentPro is a reasonable number", () => {
    const result = computeKPIs(baseMetrics, 14, "Mediocentro");
    expect(result.ageEquivalentPro).toBeGreaterThan(10);
    expect(result.ageEquivalentPro).toBeLessThan(30);
  });

  it("disclaimer present for young players (< 13)", () => {
    const result = computeKPIs(baseMetrics, 11, "Mediocentro");
    expect(result.disclaimer).toBeDefined();
  });

  it("no disclaimer for older players", () => {
    const result = computeKPIs(baseMetrics, 16, "Mediocentro");
    expect(result.disclaimer).toBeUndefined();
  });

  it("handles zero metrics gracefully", () => {
    const zeroMetrics = { speed: 0, shooting: 0, vision: 0, technique: 0, defending: 0, stamina: 0 };
    const result = computeKPIs(zeroMetrics, 14, "Mediocentro");
    expect(result.avgPctOfPeak).toBeGreaterThanOrEqual(0);
    expect(result.projectedVSI.at18.estimate).toBeGreaterThanOrEqual(0);
  });
});

describe("generateMonthlyChallenges", () => {
  it("returns challenges with correct horizon for age 14", () => {
    const result = generateMonthlyChallenges(baseMetrics, 14, "Mediocentro");
    expect(result.horizonMonths).toBe(9); // 14-16 = 9 months
    expect(result.challenges).toHaveLength(9);
  });

  it("returns shorter horizon for young players", () => {
    const result = generateMonthlyChallenges(baseMetrics, 12, "Mediocentro");
    expect(result.horizonMonths).toBe(6);
    expect(result.challenges).toHaveLength(6);
  });

  it("challenges have all required fields", () => {
    const result = generateMonthlyChallenges(baseMetrics, 14, "Mediocentro");
    for (const ch of result.challenges) {
      expect(ch).toHaveProperty("month");
      expect(ch).toHaveProperty("title");
      expect(ch).toHaveProperty("metric");
      expect(ch).toHaveProperty("description");
      expect(ch).toHaveProperty("kpiTarget");
      expect(ch).toHaveProperty("drillSuggestion");
      expect(ch.month).toBeGreaterThan(0);
    }
  });

  it("challenges are numbered sequentially", () => {
    const result = generateMonthlyChallenges(baseMetrics, 14, "Mediocentro");
    result.challenges.forEach((ch, i) => {
      expect(ch.month).toBe(i + 1);
    });
  });

  it("focusAreas has exactly 3 items", () => {
    const result = generateMonthlyChallenges(baseMetrics, 14, "Mediocentro");
    expect(result.focusAreas).toHaveLength(3);
  });

  it("weakest metrics appear in focusAreas", () => {
    // defending=45 is the weakest metric → "Defensa" should be in focusAreas
    const result = generateMonthlyChallenges(baseMetrics, 14, "Mediocentro");
    expect(result.focusAreas).toContain("Defensa");
  });

  it("ageGroup matches player age", () => {
    expect(generateMonthlyChallenges(baseMetrics, 9, "Delantero").ageGroup).toContain("8-10");
    expect(generateMonthlyChallenges(baseMetrics, 12, "Delantero").ageGroup).toContain("11-13");
    expect(generateMonthlyChallenges(baseMetrics, 15, "Delantero").ageGroup).toContain("14-16");
    expect(generateMonthlyChallenges(baseMetrics, 18, "Delantero").ageGroup).toContain("17+");
  });

  it("challenges rotate among 3 focus metrics", () => {
    const result = generateMonthlyChallenges(baseMetrics, 14, "Mediocentro");
    // Months 1,4,7 should use same metric; 2,5,8 same; 3,6,9 same
    if (result.challenges.length >= 6) {
      expect(result.challenges[0].metric).toBe(result.challenges[3].metric);
      expect(result.challenges[1].metric).toBe(result.challenges[4].metric);
    }
  });
});
