/**
 * matchStatsService — Tests
 *
 * Cubre:
 *  - Input null/undefined → null
 *  - Solo eventos (gemini_only) → pases/duelos/recuperaciones/disparos + rating
 *  - Solo físicas (yolo_only) → fisicas + rating parcial
 *  - Ambos (yolo+gemini) → rating compuesto completo
 *  - Edge cases: zero totals, 100% precision, ratings cualitativos
 *  - Nunca NaN/Infinity
 */
import { describe, it, expect } from "vitest";
import { computeMatchStats } from "@/services/real/matchStatsService";
import type { VideoIntelligenceOutput } from "@/agents/contracts";

type MC = NonNullable<VideoIntelligenceOutput["metricasCuantitativas"]>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function mkEventosOnly(overrides: Partial<MC["eventos"]> = {}): MC {
  return {
    eventos: {
      pasesCompletados: 40,
      pasesFallados: 10,
      precisionPases: 80,
      recuperaciones: 5,
      duelosGanados: 6,
      duelosPerdidos: 4,
      disparosAlArco: 3,
      disparosFuera: 2,
      ...overrides,
    },
    fuente: "gemini_only",
    confianza: 0.7,
  };
}

function mkFisicasOnly(): MC {
  return {
    fisicas: {
      velocidadMaxKmh: 28.5,
      velocidadPromKmh: 9.2,
      distanciaM: 4250,
      sprints: 12,
      zonasIntensidad: { caminar: 1800, trotar: 1200, correr: 950, sprint: 300 },
    },
    fuente: "yolo_only",
    confianza: 0.6,
  };
}

function mkFullData(): MC {
  return {
    ...mkEventosOnly(),
    ...mkFisicasOnly(),
    fuente: "yolo+gemini",
    confianza: 0.85,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("matchStatsService", () => {
  describe("input inválido", () => {
    it("devuelve null si metricas es undefined", () => {
      expect(computeMatchStats(undefined)).toBeNull();
    });

    it("devuelve null si metricas es null", () => {
      expect(computeMatchStats(null)).toBeNull();
    });
  });

  describe("solo eventos (gemini_only)", () => {
    const res = computeMatchStats(mkEventosOnly())!;

    it("no devuelve null", () => {
      expect(res).not.toBeNull();
    });

    it("flags de disponibilidad correctos", () => {
      expect(res.tieneEventos).toBe(true);
      expect(res.tieneFisicas).toBe(false);
      expect(res.fisicas).toBeUndefined();
    });

    it("pases calculados correctamente", () => {
      expect(res.pases).toBeDefined();
      expect(res.pases!.completados).toBe(40);
      expect(res.pases!.fallados).toBe(10);
      expect(res.pases!.total).toBe(50);
      expect(res.pases!.precision).toBe(80);
      expect(res.pases!.rating).toBe("excelente"); // 80 >= 80
    });

    it("duelos calculados correctamente", () => {
      expect(res.duelos).toBeDefined();
      expect(res.duelos!.ganados).toBe(6);
      expect(res.duelos!.perdidos).toBe(4);
      expect(res.duelos!.total).toBe(10);
      expect(res.duelos!.efectividad).toBe(60);
      expect(res.duelos!.rating).toBe("competitivo"); // 60 >= 55
    });

    it("recuperaciones con rating correcto", () => {
      expect(res.recuperaciones).toBeDefined();
      expect(res.recuperaciones!.total).toBe(5);
      expect(res.recuperaciones!.rating).toBe("excelente"); // 5 >= 5
    });

    it("disparos con precision", () => {
      expect(res.disparos).toBeDefined();
      expect(res.disparos!.alArco).toBe(3);
      expect(res.disparos!.fuera).toBe(2);
      expect(res.disparos!.total).toBe(5);
      expect(res.disparos!.precision).toBe(60);
    });

    it("totales agregados correctos", () => {
      expect(res.totalOfensivas).toBe(40 + 3);       // pases completados + disparos al arco
      expect(res.totalDefensivas).toBe(6 + 5);       // duelos ganados + recuperaciones
      expect(res.totalAcciones).toBe(50 + 10 + 5 + 5); // pases + duelos + rec + disparos
    });

    it("rating compuesto entre 0 y 10", () => {
      expect(res.performanceRating).toBeGreaterThan(0);
      expect(res.performanceRating).toBeLessThanOrEqual(10);
      expect(Number.isFinite(res.performanceRating)).toBe(true);
    });

    it("no pierde metadatos", () => {
      expect(res.fuente).toBe("gemini_only");
      expect(res.confianza).toBe(0.7);
    });
  });

  describe("solo físicas (yolo_only)", () => {
    const res = computeMatchStats(mkFisicasOnly())!;

    it("flags correctos", () => {
      expect(res.tieneEventos).toBe(false);
      expect(res.tieneFisicas).toBe(true);
      expect(res.pases).toBeUndefined();
      expect(res.duelos).toBeUndefined();
    });

    it("físicas correctamente mapeadas", () => {
      expect(res.fisicas).toBeDefined();
      expect(res.fisicas!.velocidadMaxKmh).toBe(28.5);
      expect(res.fisicas!.distanciaM).toBe(4250);
      expect(res.fisicas!.sprints).toBe(12);
      expect(res.fisicas!.rating).toBe("alto"); // 28.5 >= 28
    });

    it("intensidadPct suma ~100", () => {
      const p = res.fisicas!.intensidadPct;
      const sum = p.caminar + p.trotar + p.correr + p.sprint;
      expect(sum).toBeGreaterThanOrEqual(99);
      expect(sum).toBeLessThanOrEqual(101);
    });

    it("rating compuesto usa solo físicas", () => {
      expect(res.performanceRating).toBeGreaterThan(0);
      expect(res.performanceRating).toBeLessThanOrEqual(10);
    });
  });

  describe("datos completos (yolo+gemini)", () => {
    const res = computeMatchStats(mkFullData())!;

    it("tiene ambas secciones", () => {
      expect(res.tieneEventos).toBe(true);
      expect(res.tieneFisicas).toBe(true);
    });

    it("rating compuesto considera todas las componentes", () => {
      expect(res.performanceRating).toBeGreaterThan(0);
      expect(res.performanceRating).toBeLessThanOrEqual(10);
    });

    it("fuente correcta", () => {
      expect(res.fuente).toBe("yolo+gemini");
    });
  });

  describe("edge cases", () => {
    it("pases con 0 totales no rompe", () => {
      const res = computeMatchStats(mkEventosOnly({
        pasesCompletados: 0,
        pasesFallados: 0,
        precisionPases: 0,
      }))!;
      expect(res.pases!.total).toBe(0);
      expect(res.pases!.precision).toBe(0);
      expect(res.pases!.rating).toBe("bajo");
      expect(Number.isFinite(res.performanceRating)).toBe(true);
    });

    it("duelos con 0 totales → igualado + efectividad 0", () => {
      const res = computeMatchStats(mkEventosOnly({
        duelosGanados: 0,
        duelosPerdidos: 0,
      }))!;
      expect(res.duelos!.total).toBe(0);
      expect(res.duelos!.efectividad).toBe(0);
      expect(res.duelos!.rating).toBe("igualado");
    });

    it("disparos con 0 totales → precision 0 (no NaN)", () => {
      const res = computeMatchStats(mkEventosOnly({
        disparosAlArco: 0,
        disparosFuera: 0,
      }))!;
      expect(res.disparos!.total).toBe(0);
      expect(res.disparos!.precision).toBe(0);
      expect(Number.isFinite(res.disparos!.precision)).toBe(true);
    });

    it("100% precision pases → rating elite", () => {
      const res = computeMatchStats(mkEventosOnly({
        pasesCompletados: 50,
        pasesFallados: 0,
        precisionPases: 100,
      }))!;
      expect(res.pases!.precision).toBe(100);
      expect(res.pases!.rating).toBe("elite");
    });

    it("duelos 90% → dominante", () => {
      const res = computeMatchStats(mkEventosOnly({
        duelosGanados: 9,
        duelosPerdidos: 1,
      }))!;
      expect(res.duelos!.efectividad).toBe(90);
      expect(res.duelos!.rating).toBe("dominante");
    });

    it("recuperaciones 0 → bajo", () => {
      const res = computeMatchStats(mkEventosOnly({ recuperaciones: 0 }))!;
      expect(res.recuperaciones!.total).toBe(0);
      expect(res.recuperaciones!.rating).toBe("bajo");
    });

    it("recuperaciones 10+ → elite", () => {
      const res = computeMatchStats(mkEventosOnly({ recuperaciones: 12 }))!;
      expect(res.recuperaciones!.rating).toBe("elite");
    });

    it("velocidad <24 km/h → rating bajo", () => {
      const m = mkFisicasOnly();
      m.fisicas!.velocidadMaxKmh = 18;
      const res = computeMatchStats(m)!;
      expect(res.fisicas!.rating).toBe("bajo");
    });

    it("velocidad 33 km/h → rating elite", () => {
      const m = mkFisicasOnly();
      m.fisicas!.velocidadMaxKmh = 33;
      const res = computeMatchStats(m)!;
      expect(res.fisicas!.rating).toBe("elite");
    });
  });

  describe("rating compuesto — labels", () => {
    it("performance excepcional → outstanding", () => {
      const res = computeMatchStats(mkEventosOnly({
        pasesCompletados: 100,
        pasesFallados: 0,
        precisionPases: 100,
        duelosGanados: 20,
        duelosPerdidos: 0,
        recuperaciones: 15,
        disparosAlArco: 10,
        disparosFuera: 0,
      }))!;
      expect(res.performanceRating).toBeGreaterThanOrEqual(8.5);
      expect(res.performanceLabel).toBe("outstanding");
    });

    it("performance pobre → below", () => {
      const res = computeMatchStats(mkEventosOnly({
        pasesCompletados: 5,
        pasesFallados: 20,
        precisionPases: 20,
        duelosGanados: 1,
        duelosPerdidos: 10,
        recuperaciones: 0,
        disparosAlArco: 0,
        disparosFuera: 3,
      }))!;
      expect(res.performanceRating).toBeLessThan(4);
      expect(res.performanceLabel).toBe("below");
    });

    it("performance intermedia → good o average", () => {
      const res = computeMatchStats(mkEventosOnly())!;
      expect(["average", "good", "excellent"]).toContain(res.performanceLabel);
    });
  });

  describe("invariantes", () => {
    it("nunca devuelve NaN en ningún campo numérico", () => {
      const samples: MC[] = [
        mkEventosOnly(),
        mkEventosOnly({ pasesCompletados: 0, pasesFallados: 0, precisionPases: 0 }),
        mkFisicasOnly(),
        mkFullData(),
      ];
      for (const m of samples) {
        const r = computeMatchStats(m)!;
        expect(Number.isFinite(r.performanceRating)).toBe(true);
        expect(Number.isFinite(r.totalAcciones)).toBe(true);
        if (r.pases) expect(Number.isFinite(r.pases.precision)).toBe(true);
        if (r.duelos) expect(Number.isFinite(r.duelos.efectividad)).toBe(true);
        if (r.disparos) expect(Number.isFinite(r.disparos.precision)).toBe(true);
        if (r.fisicas) {
          expect(Number.isFinite(r.fisicas.velocidadMaxKmh)).toBe(true);
          expect(Number.isFinite(r.fisicas.distanciaM)).toBe(true);
        }
      }
    });
  });
});
