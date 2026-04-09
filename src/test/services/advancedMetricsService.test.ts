/**
 * VITAS · Tests — AdvancedMetricsService
 * Verifica: RAE, UBI, TruthFilter, VAEP (events), DominantFeatures, TrackingService
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  RAEService,
  UBIService,
  TruthFilterService,
  VAEPService,
  DominantFeaturesService,
  TrackingService,
} from "@/services/real/advancedMetricsService";
import type { RAEResult, SPADLAction } from "@/services/real/advancedMetricsService";
import type { MatchEvent } from "@/services/real/matchEventsService";

// ─── RAE ────────────────────────────────────────────────────────────────────

describe("RAEService", () => {
  describe("calculate", () => {
    it("enero (mes 1) con cutoff enero = Q1 (early_cohort)", () => {
      const result = RAEService.calculate({ birthMonth: 1, birthYear: 2010 });
      expect(result.birthQuartile).toBe(1);
      expect(result.label).toBe("early_cohort");
      expect(result.ageAdvantageMonths).toBe(0);
    });

    it("marzo (mes 3) con cutoff enero = Q1", () => {
      const result = RAEService.calculate({ birthMonth: 3, birthYear: 2010 });
      expect(result.birthQuartile).toBe(1);
      expect(result.ageAdvantageMonths).toBe(2);
    });

    it("abril (mes 4) con cutoff enero = Q2 (mid_cohort_early)", () => {
      const result = RAEService.calculate({ birthMonth: 4, birthYear: 2010 });
      expect(result.birthQuartile).toBe(2);
      expect(result.label).toBe("mid_cohort_early");
    });

    it("julio (mes 7) con cutoff enero = Q3 (mid_cohort_late)", () => {
      const result = RAEService.calculate({ birthMonth: 7, birthYear: 2010 });
      expect(result.birthQuartile).toBe(3);
      expect(result.label).toBe("mid_cohort_late");
    });

    it("diciembre (mes 12) con cutoff enero = Q4 (late_cohort)", () => {
      const result = RAEService.calculate({ birthMonth: 12, birthYear: 2010 });
      expect(result.birthQuartile).toBe(4);
      expect(result.label).toBe("late_cohort");
      expect(result.ageAdvantageMonths).toBe(11);
    });

    it("Q1 tiene raeBiasFactor mayor que Q4", () => {
      const q1 = RAEService.calculate({ birthMonth: 1, birthYear: 2010 });
      const q4 = RAEService.calculate({ birthMonth: 12, birthYear: 2010 });
      expect(q1.raeBiasFactor).toBeGreaterThan(q4.raeBiasFactor);
    });

    it("cutoff personalizado (agosto) cambia cuartiles", () => {
      // Agosto como cutoff: agosto=Q1, noviembre=Q2...
      const result = RAEService.calculate({ birthMonth: 8, birthYear: 2010, cutoffMonth: 8 });
      expect(result.birthQuartile).toBe(1);
      expect(result.ageAdvantageMonths).toBe(0);
    });
  });

  describe("correctVSI", () => {
    it("Q1 reduce VSI en -2", () => {
      const rae: RAEResult = { birthQuartile: 1, ageAdvantageMonths: 0, raeBiasFactor: 1.22, label: "early_cohort" };
      expect(RAEService.correctVSI(70, rae)).toBe(68);
    });

    it("Q4 aumenta VSI en +5", () => {
      const rae: RAEResult = { birthQuartile: 4, ageAdvantageMonths: 11, raeBiasFactor: 1.0, label: "late_cohort" };
      expect(RAEService.correctVSI(70, rae)).toBe(75);
    });

    it("VSI corregido no excede 100", () => {
      const rae: RAEResult = { birthQuartile: 4, ageAdvantageMonths: 11, raeBiasFactor: 1.0, label: "late_cohort" };
      expect(RAEService.correctVSI(98, rae)).toBe(100);
    });

    it("VSI corregido no baja de 0", () => {
      const rae: RAEResult = { birthQuartile: 1, ageAdvantageMonths: 0, raeBiasFactor: 1.22, label: "early_cohort" };
      expect(RAEService.correctVSI(1, rae)).toBe(0);
    });
  });
});

// ─── UBI ────────────────────────────────────────────────────────────────────

describe("UBIService", () => {
  describe("calculate", () => {
    it("Q1 + ontme = sesgo bajo (solo RAE component)", () => {
      const rae: RAEResult = { birthQuartile: 1, ageAdvantageMonths: 0, raeBiasFactor: 1.22, label: "early_cohort" };
      const result = UBIService.calculate(rae, 0, "ontme");
      expect(result.raeComponent).toBe(0); // (1-1)/3 = 0
      expect(result.ubi).toBeLessThanOrEqual(0.1);
    });

    it("Q4 + late maturer = sesgo alto (ambos componentes)", () => {
      const rae: RAEResult = { birthQuartile: 4, ageAdvantageMonths: 11, raeBiasFactor: 1.0, label: "late_cohort" };
      const result = UBIService.calculate(rae, -2, "late");
      expect(result.raeComponent).toBe(1); // (4-1)/3 = 1
      expect(result.phvComponent).toBe(1); // clamp(-(-2)/2, 0, 1) = 1
      expect(result.ubi).toBe(1); // 0.55*1 + 0.45*1 = 1
    });

    it("vsICorrectionFactor es 1 + UBI * 0.12", () => {
      const rae: RAEResult = { birthQuartile: 4, ageAdvantageMonths: 11, raeBiasFactor: 1.0, label: "late_cohort" };
      const result = UBIService.calculate(rae, -2, "late");
      expect(result.vsICorrectionFactor).toBe(1.12); // 1 + 1.0 * 0.12
    });

    it("null inputs = sin sesgo", () => {
      const result = UBIService.calculate(null, null, null);
      expect(result.ubi).toBe(0);
      expect(result.vsICorrectionFactor).toBe(1);
    });

    it("early maturer tiene phvComponent > 0 (sobreestimado)", () => {
      const rae: RAEResult = { birthQuartile: 2, ageAdvantageMonths: 3, raeBiasFactor: 1.16, label: "mid_cohort_early" };
      const result = UBIService.calculate(rae, 1.5, "early");
      expect(result.phvComponent).toBeGreaterThan(0);
      // early phvComp = min(0.5, max(0, 1.5/2)) = 0.75 → capped at 0.5
      expect(result.phvComponent).toBeLessThanOrEqual(0.5);
    });

    it("UBI siempre entre 0 y 1", () => {
      const rae: RAEResult = { birthQuartile: 4, ageAdvantageMonths: 11, raeBiasFactor: 1.0, label: "late_cohort" };
      const result = UBIService.calculate(rae, -5, "late");
      expect(result.ubi).toBeGreaterThanOrEqual(0);
      expect(result.ubi).toBeLessThanOrEqual(1);
    });

    it("split RAE/PHV es 0.55/0.45", () => {
      // Solo RAE (Q4, ontme)
      const raeOnly: RAEResult = { birthQuartile: 4, ageAdvantageMonths: 11, raeBiasFactor: 1.0, label: "late_cohort" };
      const r1 = UBIService.calculate(raeOnly, 0, "ontme");
      expect(r1.ubi).toBeCloseTo(0.55, 2); // 0.55 * 1 + 0.45 * 0

      // Solo PHV (Q1, late -2)
      const q1: RAEResult = { birthQuartile: 1, ageAdvantageMonths: 0, raeBiasFactor: 1.22, label: "early_cohort" };
      const r2 = UBIService.calculate(q1, -2, "late");
      expect(r2.ubi).toBeCloseTo(0.45, 2); // 0.55 * 0 + 0.45 * 1
    });
  });
});

// ─── TruthFilter ────────────────────────────────────────────────────────────

describe("TruthFilterService", () => {
  describe("detectCase", () => {
    it("early maturer → early_maturers", () => {
      expect(TruthFilterService.detectCase(1.5, "early", null)).toBe("early_maturers");
    });

    it("late maturer → late_maturers", () => {
      expect(TruthFilterService.detectCase(-1.5, "late", null)).toBe("late_maturers");
    });

    it("ontme + Q1 → ontme_high_rae", () => {
      const rae: RAEResult = { birthQuartile: 1, ageAdvantageMonths: 0, raeBiasFactor: 1.22, label: "early_cohort" };
      expect(TruthFilterService.detectCase(0, "ontme", rae)).toBe("ontme_high_rae");
    });

    it("ontme + Q4 → ontme_low_rae", () => {
      const rae: RAEResult = { birthQuartile: 4, ageAdvantageMonths: 11, raeBiasFactor: 1.0, label: "late_cohort" };
      expect(TruthFilterService.detectCase(0, "ontme", rae)).toBe("ontme_low_rae");
    });

    it("phvOffset > 0.5 sin category → early_maturers", () => {
      expect(TruthFilterService.detectCase(0.8, null, null)).toBe("early_maturers");
    });

    it("phvOffset < -0.5 sin category → late_maturers", () => {
      expect(TruthFilterService.detectCase(-0.8, null, null)).toBe("late_maturers");
    });
  });

  describe("apply", () => {
    it("early maturer reduce VSI (delta negativo)", () => {
      const result = TruthFilterService.apply(75, 1.5, "early", null);
      expect(result.filterCase).toBe("early_maturers");
      expect(result.delta).toBeLessThan(0);
      expect(result.adjustedVSI).toBeLessThan(75);
      // magnitude = min(8, round(1.5 * 4)) = min(8, 6) = 6
      expect(result.delta).toBe(-6);
      expect(result.confidence).toBe(0.85);
    });

    it("late maturer aumenta VSI (delta positivo)", () => {
      const result = TruthFilterService.apply(60, -2.0, "late", null);
      expect(result.filterCase).toBe("late_maturers");
      expect(result.delta).toBeGreaterThan(0);
      expect(result.adjustedVSI).toBeGreaterThan(60);
      // magnitude = min(10, round(2.0 * 4)) = min(10, 8) = 8
      expect(result.delta).toBe(8);
      expect(result.confidence).toBe(0.88);
    });

    it("early maturer delta max es -8", () => {
      const result = TruthFilterService.apply(80, 3.0, "early", null);
      // magnitude = min(8, round(3.0 * 4)) = min(8, 12) = 8
      expect(result.delta).toBe(-8);
    });

    it("late maturer delta max es +10", () => {
      const result = TruthFilterService.apply(50, -4.0, "late", null);
      // magnitude = min(10, round(4.0 * 4)) = min(10, 16) = 10
      expect(result.delta).toBe(10);
    });

    it("ontme Q1 reduce VSI en -3", () => {
      const rae: RAEResult = { birthQuartile: 1, ageAdvantageMonths: 0, raeBiasFactor: 1.22, label: "early_cohort" };
      const result = TruthFilterService.apply(70, 0, "ontme", rae);
      expect(result.filterCase).toBe("ontme_high_rae");
      expect(result.delta).toBe(-3);
    });

    it("ontme Q4 aumenta VSI en +4", () => {
      const rae: RAEResult = { birthQuartile: 4, ageAdvantageMonths: 11, raeBiasFactor: 1.0, label: "late_cohort" };
      const result = TruthFilterService.apply(70, 0, "ontme", rae);
      expect(result.filterCase).toBe("ontme_low_rae");
      expect(result.delta).toBe(4);
    });

    it("adjustedVSI nunca excede 100", () => {
      const result = TruthFilterService.apply(98, -3.0, "late", null);
      expect(result.adjustedVSI).toBeLessThanOrEqual(100);
    });

    it("adjustedVSI nunca baja de 0", () => {
      const result = TruthFilterService.apply(3, 2.5, "early", null);
      expect(result.adjustedVSI).toBeGreaterThanOrEqual(0);
    });

    it("sin datos PHV, confianza es menor", () => {
      const withPHV = TruthFilterService.apply(70, 1.5, "early", null);
      const withoutPHV = TruthFilterService.apply(70, null, "early", null);
      expect(withPHV.confidence).toBeGreaterThan(withoutPHV.confidence);
    });
  });
});

// ─── VAEP ───────────────────────────────────────────────────────────────────

describe("VAEPService", () => {
  describe("calculate (SPADL con probabilidades)", () => {
    it("retorna stub_no_data sin acciones", () => {
      const result = VAEPService.calculate({ actions: [], minutesPlayed: 90 });
      expect(result.status).toBe("stub_no_data");
      expect(result.vaepTotal).toBeNull();
    });

    it("retorna stub_no_data si faltan probabilidades", () => {
      const actions: SPADLAction[] = [{
        actionId: "a1", type: "pass", startX: 30, startY: 34, endX: 50, endY: 34, result: "success",
      }];
      const result = VAEPService.calculate({ actions, minutesPlayed: 90 });
      expect(result.status).toBe("stub_no_data");
    });

    it("calcula VAEP real con probabilidades completas", () => {
      const actions: SPADLAction[] = [{
        actionId: "a1", type: "pass", startX: 30, startY: 34, endX: 50, endY: 34, result: "success",
        scoreProbBefore: 0.01, scoreProbAfter: 0.05,
        concedeProbBefore: 0.02, concedeProbAfter: 0.01,
      }];
      const result = VAEPService.calculate({ actions, minutesPlayed: 90 });
      expect(result.status).toBe("calculated");
      // VAEP = (0.05 - 0.01) - (0.01 - 0.02) = 0.04 - (-0.01) = 0.05
      expect(result.vaepTotal).toBeCloseTo(0.05, 2);
      expect(result.vaep90).toBeCloseTo(0.05, 2); // 90 min jugados
    });

    it("vaep90 escala correctamente a 90 minutos", () => {
      const actions: SPADLAction[] = [{
        actionId: "a1", type: "shot", startX: 95, startY: 34, endX: 105, endY: 34, result: "success",
        scoreProbBefore: 0.1, scoreProbAfter: 0.9,
        concedeProbBefore: 0.0, concedeProbAfter: 0.0,
      }];
      const result = VAEPService.calculate({ actions, minutesPlayed: 45 });
      expect(result.status).toBe("calculated");
      // vaep90 = (total / 45) * 90 = total * 2
      expect(result.vaep90).toBeCloseTo(result.vaepTotal! * 2, 2);
    });
  });

  describe("calculateFromEvents (eventos manuales)", () => {
    it("retorna insufficient_data sin eventos", () => {
      const result = VAEPService.calculateFromEvents([], 90);
      expect(result.status).toBe("insufficient_data");
    });

    it("shot_success vale 0.15", () => {
      const events: MatchEvent[] = [{
        id: "e1", playerId: "p1", type: "shot", result: "success",
        minute: 25, matchDate: "2026-04-01", createdAt: new Date().toISOString(),
      }];
      const result = VAEPService.calculateFromEvents(events, 90);
      expect(result.status).toBe("calculated");
      expect(result.vaepTotal).toBe(0.15);
    });

    it("pass_success en zona ofensiva vale 0.03", () => {
      const events: MatchEvent[] = [{
        id: "e1", playerId: "p1", type: "pass", result: "success",
        minute: 30, matchDate: "2026-04-01", xZone: "offensive", createdAt: new Date().toISOString(),
      }];
      const result = VAEPService.calculateFromEvents(events, 90);
      expect(result.vaepTotal).toBe(0.03);
    });

    it("pass_success en zona defensiva vale 0.005", () => {
      const events: MatchEvent[] = [{
        id: "e1", playerId: "p1", type: "pass", result: "success",
        minute: 10, matchDate: "2026-04-01", xZone: "defensive", createdAt: new Date().toISOString(),
      }];
      const result = VAEPService.calculateFromEvents(events, 90);
      expect(result.vaepTotal).toBe(0.005);
    });

    it("dribble_fail penaliza -0.02", () => {
      const events: MatchEvent[] = [{
        id: "e1", playerId: "p1", type: "dribble", result: "fail",
        minute: 40, matchDate: "2026-04-01", createdAt: new Date().toISOString(),
      }];
      const result = VAEPService.calculateFromEvents(events, 90);
      expect(result.vaepTotal).toBe(-0.02);
    });

    it("topActions ordenadas por impacto descendente", () => {
      const events: MatchEvent[] = [
        { id: "e1", playerId: "p1", type: "pass", result: "fail", minute: 10, matchDate: "2026-04-01", createdAt: new Date().toISOString() },
        { id: "e2", playerId: "p1", type: "shot", result: "success", minute: 30, matchDate: "2026-04-01", createdAt: new Date().toISOString() },
        { id: "e3", playerId: "p1", type: "tackle", result: "success", minute: 50, matchDate: "2026-04-01", createdAt: new Date().toISOString() },
      ];
      const result = VAEPService.calculateFromEvents(events, 90);
      expect(result.topActions[0].actionId).toBe("e2"); // shot_success = 0.15
      expect(result.topActions[1].actionId).toBe("e3"); // tackle_success = 0.04
    });

    it("vaep90 escala correctamente", () => {
      const events: MatchEvent[] = [{
        id: "e1", playerId: "p1", type: "shot", result: "success",
        minute: 25, matchDate: "2026-04-01", createdAt: new Date().toISOString(),
      }];
      const result = VAEPService.calculateFromEvents(events, 45);
      // vaep90 = (0.15 / 45) * 90 = 0.3
      expect(result.vaep90).toBeCloseTo(0.3, 2);
    });
  });

  describe("getStub", () => {
    it("retorna status stub_no_data", () => {
      const result = VAEPService.getStub(540);
      expect(result.status).toBe("stub_no_data");
      expect(result.vaepTotal).toBeNull();
      expect(result.vaep90).toBeNull();
    });
  });
});

// ─── DominantFeatures ───────────────────────────────────────────────────────

describe("DominantFeaturesService", () => {
  describe("calculate", () => {
    it("identifica top 3 dominantes por z-score", () => {
      const metrics = { speed: 90, technique: 85, vision: 80, stamina: 50, shooting: 45, defending: 40 };
      const result = DominantFeaturesService.calculate(metrics);
      expect(result.dominant).toHaveLength(3);
      expect(result.dominant[0].key).toBe("speed"); // highest z-score
    });

    it("identifica 2 areas subdesarrolladas", () => {
      const metrics = { speed: 90, technique: 85, vision: 80, stamina: 50, shooting: 45, defending: 40 };
      const result = DominantFeaturesService.calculate(metrics);
      expect(result.underdeveloped).toHaveLength(2);
      // Las 2 areas con menor z-score (defending=40, shooting=45 o stamina=50)
      const underKeys = result.underdeveloped.map((u) => u.key);
      expect(underKeys).toContain("defending"); // lowest value (40)
    });

    it("jugador ofensivo clasificado como ofensivo", () => {
      const metrics = { speed: 70, technique: 85, vision: 80, stamina: 55, shooting: 78, defending: 40 };
      const result = DominantFeaturesService.calculate(metrics);
      expect(result.playStyle).toBe("ofensivo");
    });

    it("jugador defensivo clasificado como defensivo", () => {
      const metrics = { speed: 65, technique: 50, vision: 50, stamina: 85, shooting: 40, defending: 90 };
      const result = DominantFeaturesService.calculate(metrics);
      expect(result.playStyle).toBe("defensivo");
    });

    it("jugador equilibrado", () => {
      const metrics = { speed: 60, technique: 60, vision: 60, stamina: 60, shooting: 60, defending: 60 };
      const result = DominantFeaturesService.calculate(metrics);
      expect(result.playStyle).toBe("equilibrado");
    });

    it("specializationIndex entre 0 y 1", () => {
      const metrics = { speed: 95, technique: 20, vision: 90, stamina: 15, shooting: 85, defending: 10 };
      const result = DominantFeaturesService.calculate(metrics);
      expect(result.specializationIndex).toBeGreaterThanOrEqual(0);
      expect(result.specializationIndex).toBeLessThanOrEqual(1);
    });

    it("jugador uniforme tiene specializationIndex bajo", () => {
      const uniform = { speed: 60, technique: 60, vision: 60, stamina: 60, shooting: 60, defending: 60 };
      const specialized = { speed: 95, technique: 30, vision: 90, stamina: 25, shooting: 85, defending: 20 };
      const r1 = DominantFeaturesService.calculate(uniform);
      const r2 = DominantFeaturesService.calculate(specialized);
      expect(r1.specializationIndex).toBeLessThan(r2.specializationIndex);
    });
  });
});

// ─── TrackingService ────────────────────────────────────────────────────────

describe("TrackingService", () => {
  it("retorna stub sin datos", () => {
    const result = TrackingService.calculate(null);
    expect(result.status).toBe("stub_no_data");
    expect(result.maxSpeedMs).toBeNull();
  });

  it("retorna stub con array vacío", () => {
    const result = TrackingService.calculate({ positions: [], minutesPlayed: 90 });
    expect(result.status).toBe("stub_no_data");
  });

  it("calcula distancia y velocidad con datos GPS", () => {
    const positions = [
      { x: 0, y: 0, timestampMs: 0 },
      { x: 10, y: 0, timestampMs: 1000 },  // 10m in 1s = 10 m/s
      { x: 20, y: 0, timestampMs: 2000 },   // 10m in 1s = 10 m/s
      { x: 22, y: 0, timestampMs: 3000 },   // 2m in 1s = 2 m/s (no sprint)
    ];
    const result = TrackingService.calculate({ positions, minutesPlayed: 1 });
    expect(result.status).toBe("calculated");
    expect(result.totalDistanceM).toBeCloseTo(22, 0);
    expect(result.maxSpeedMs).toBeCloseTo(10, 0);
  });

  it("detecta sprints (>6.5 m/s por >1s)", () => {
    const positions = [
      { x: 0, y: 0, timestampMs: 0 },
      { x: 7, y: 0, timestampMs: 1000 },   // 7 m/s — sprint
      { x: 14, y: 0, timestampMs: 2000 },  // 7 m/s — sprint continues
      { x: 16, y: 0, timestampMs: 3000 },  // 2 m/s — sprint ends
    ];
    const result = TrackingService.calculate({ positions, minutesPlayed: 1 });
    expect(result.sprintCount).toBeGreaterThanOrEqual(1);
  });
});
