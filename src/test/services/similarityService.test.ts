/**
 * VITAS · Tests — SimilarityService
 * Verifica: findSimilarPlayers, scoreToBadge, de-aging, cosine similarity
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock supabase para forzar fallback a datos locales
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  },
  SUPABASE_CONFIGURED: false,
}));

import { findSimilarPlayers, scoreToBadge } from "@/services/real/similarityService";
import type { VSIMetrics } from "@/services/real/similarityService";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── findSimilarPlayers ─────────────────────────────────────────────────────

describe("findSimilarPlayers", () => {
  const metricsDelantero: VSIMetrics = {
    speed: 85, shooting: 82, vision: 70, technique: 78, defending: 35, stamina: 72,
  };

  const metricsDefensor: VSIMetrics = {
    speed: 68, shooting: 35, vision: 60, technique: 55, defending: 88, stamina: 80,
  };

  it("retorna top 5 por defecto", async () => {
    const result = await findSimilarPlayers(metricsDelantero, "ST");
    expect(result.top5).toHaveLength(5);
    expect(result.bestMatch).toBeDefined();
    expect(result.bestMatch.score).toBeGreaterThan(0);
  });

  it("scores están ordenados descendente", async () => {
    const result = await findSimilarPlayers(metricsDelantero, "ST");
    for (let i = 1; i < result.top5.length; i++) {
      expect(result.top5[i - 1].score).toBeGreaterThanOrEqual(result.top5[i].score);
    }
  });

  it("bestMatch es el primero de top5", async () => {
    const result = await findSimilarPlayers(metricsDelantero, "ST");
    expect(result.bestMatch.player.name).toBe(result.top5[0].player.name);
  });

  it("avgScore es promedio de top5", async () => {
    const result = await findSimilarPlayers(metricsDelantero, "ST");
    const expected = result.top5.reduce((s, m) => s + m.score, 0) / result.top5.length;
    expect(result.avgScore).toBeCloseTo(expected, 0);
  });

  it("topN configurable", async () => {
    const result = await findSimilarPlayers(metricsDelantero, "ST", { topN: 3 });
    expect(result.top5).toHaveLength(3);
  });

  it("positionFilter strict solo retorna posiciones compatibles", async () => {
    const result = await findSimilarPlayers(metricsDefensor, "CB", { positionFilter: "strict" });
    result.top5.forEach((m) => {
      expect(m.positionMatch).toBe(true);
    });
  });

  it("delantero vs defensor: resultados diferentes", async () => {
    const r1 = await findSimilarPlayers(metricsDelantero, "ST");
    const r2 = await findSimilarPlayers(metricsDefensor, "CB");
    expect(r1.bestMatch.player.name).not.toBe(r2.bestMatch.player.name);
  });

  it("source es local cuando no hay Supabase", async () => {
    const result = await findSimilarPlayers(metricsDelantero, "ST");
    expect(result.source).toBe("local");
  });

  it("computedAt tiene formato ISO", async () => {
    const result = await findSimilarPlayers(metricsDelantero, "ST");
    expect(new Date(result.computedAt).toISOString()).toBe(result.computedAt);
  });

  describe("con ajuste de edad (de-aging)", () => {
    it("activa de-aging cuando youthAge < 21", async () => {
      const result = await findSimilarPlayers(metricsDelantero, "ST", { youthAge: 14 });
      expect(result.ageAdjusted).toBe(true);
    });

    it("no activa de-aging sin youthAge", async () => {
      const result = await findSimilarPlayers(metricsDelantero, "ST");
      expect(result.ageAdjusted).toBe(false);
    });

    it("de-aging incluye proAtYouthAge en matches", async () => {
      const deAged = await findSimilarPlayers(metricsDelantero, "ST", { youthAge: 14 });
      // Todos los matches deben tener proAtYouthAge
      deAged.top5.forEach((m) => {
        expect(m.ageAdjusted).toBe(true);
        expect(m.proAtYouthAge).toBeDefined();
      });
    });

    it("confidence menor para juventud temprana", async () => {
      const young = await findSimilarPlayers(metricsDelantero, "ST", { youthAge: 12 });
      const older = await findSimilarPlayers(metricsDelantero, "ST", { youthAge: 18 });
      expect(young.confidence).toBeLessThanOrEqual(older.confidence);
    });

    it("proAtYouthAge disponible con de-aging", async () => {
      const result = await findSimilarPlayers(metricsDelantero, "ST", { youthAge: 14 });
      expect(result.top5[0].proAtYouthAge).toBeDefined();
      expect(result.top5[0].ageAdjusted).toBe(true);
    });
  });
});

// ─── scoreToBadge ───────────────────────────────────────────────────────────

describe("scoreToBadge", () => {
  it("score >= 92 es Clon", () => {
    expect(scoreToBadge(95).label).toBe("Clon");
  });

  it("score >= 85 es Muy similar", () => {
    expect(scoreToBadge(87).label).toBe("Muy similar");
  });

  it("score bajo tiene label apropiado", () => {
    const badge = scoreToBadge(50);
    expect(badge.label).toBeDefined();
    expect(badge.color).toBeDefined();
  });
});
