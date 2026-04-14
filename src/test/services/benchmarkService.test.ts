/**
 * Tests for benchmarkService.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateReportBenchmark, DIMENSION_TO_METRIC } from "@/services/real/benchmarkService";

// Mock PlayerService
vi.mock("@/services/real/playerService", () => ({
  PlayerService: {
    getAll: vi.fn(() => []),
  },
}));

import { PlayerService } from "@/services/real/playerService";

const mockPlayers = (players: Array<{ age: number; position: string; stats: Record<string, number> }>) => {
  vi.mocked(PlayerService.getAll).mockReturnValue(
    players.map((p, i) => ({
      id: `p${i}`,
      name: `Player ${i}`,
      age: p.age,
      position: p.position,
      stats: p.stats,
    })) as ReturnType<typeof PlayerService.getAll>,
  );
};

const sampleDimensions = {
  velocidadDecision: { score: 7.5 },
  tecnicaConBalon: { score: 8.0 },
  inteligenciaTactica: { score: 6.5 },
  capacidadFisica: { score: 7.0 },
  liderazgoPresencia: { score: 5.5 },
  eficaciaCompetitiva: { score: 8.5 },
};

describe("benchmarkService", () => {
  beforeEach(() => {
    vi.mocked(PlayerService.getAll).mockReturnValue([]);
  });

  it("DIMENSION_TO_METRIC has all 6 dimensions", () => {
    expect(Object.keys(DIMENSION_TO_METRIC)).toHaveLength(6);
    expect(DIMENSION_TO_METRIC.velocidadDecision).toBe("speed");
    expect(DIMENSION_TO_METRIC.tecnicaConBalon).toBe("technique");
  });

  it("returns empty benchmark when no players exist", () => {
    const r = calculateReportBenchmark(13, "delantero", sampleDimensions);
    expect(r.sampleSize).toBe(0);
    expect(r.groupDescription).toBe("Sin datos de comparación");
  });

  it("calculates percentiles with enough players", () => {
    mockPlayers([
      { age: 12, position: "delantero", stats: { speed: 50, technique: 60, vision: 55, stamina: 50, shooting: 70 } },
      { age: 13, position: "delantero", stats: { speed: 60, technique: 70, vision: 60, stamina: 55, shooting: 75 } },
      { age: 13, position: "delantero", stats: { speed: 70, technique: 75, vision: 65, stamina: 65, shooting: 80 } },
      { age: 14, position: "delantero", stats: { speed: 80, technique: 80, vision: 70, stamina: 70, shooting: 85 } },
      { age: 13, position: "delantero", stats: { speed: 55, technique: 65, vision: 50, stamina: 60, shooting: 65 } },
      { age: 13, position: "delantero", stats: { speed: 65, technique: 72, vision: 62, stamina: 58, shooting: 78 } },
    ]);

    const r = calculateReportBenchmark(13, "delantero", sampleDimensions);
    expect(r.sampleSize).toBeGreaterThanOrEqual(5);
    expect(r.dimensions.length).toBe(6);

    for (const d of r.dimensions) {
      expect(d.percentile).toBeGreaterThanOrEqual(0);
      expect(d.percentile).toBeLessThanOrEqual(100);
      expect(d.isSmallSample).toBe(false);
    }

    expect(r.groupDescription).toContain("delantero");
  });

  it("falls back to age-only filter when position group too small", () => {
    mockPlayers([
      { age: 13, position: "portero", stats: { speed: 50, technique: 50, vision: 50, stamina: 50, shooting: 50 } },
      { age: 13, position: "portero", stats: { speed: 60, technique: 60, vision: 60, stamina: 60, shooting: 60 } },
      { age: 12, position: "defensa", stats: { speed: 70, technique: 60, vision: 55, stamina: 65, shooting: 40 } },
      { age: 14, position: "mediocampo", stats: { speed: 65, technique: 75, vision: 70, stamina: 60, shooting: 55 } },
      { age: 13, position: "extremo", stats: { speed: 80, technique: 70, vision: 60, stamina: 70, shooting: 65 } },
    ]);

    const r = calculateReportBenchmark(13, "delantero", sampleDimensions);
    // Should use age-only group since no "delantero" exists with 5+ players
    expect(r.sampleSize).toBeGreaterThan(0);
  });

  it("marks small sample when < 5 players", () => {
    mockPlayers([
      { age: 13, position: "delantero", stats: { speed: 60, technique: 70, vision: 60, stamina: 55, shooting: 75 } },
      { age: 13, position: "delantero", stats: { speed: 70, technique: 75, vision: 65, stamina: 65, shooting: 80 } },
    ]);

    const r = calculateReportBenchmark(13, "delantero", sampleDimensions);
    // Less than 5 in any filter → isSmallSample
    for (const d of r.dimensions) {
      if (d.sampleSize < 5) {
        expect(d.isSmallSample).toBe(true);
      }
    }
  });

  it("has valid calculatedAt timestamp", () => {
    const r = calculateReportBenchmark(13, "delantero", sampleDimensions);
    expect(new Date(r.calculatedAt).toISOString()).toBe(r.calculatedAt);
  });
});
