/**
 * Tests · idpProgressTracker.computeSummary — gate inv#2.
 *
 * Antes: una meta SIN medición contaba como 0% en el promedio ponderado del plan,
 * arrastrando el "progreso global" que ve el padre hacia abajo con un 0 inventado.
 * Ahora: las metas sin medir se EXCLUYEN del promedio; si ninguna está medida,
 * overallProgress = null (no un 0% falso). Los conteos de estado siguen contando todas.
 */
import { describe, it, expect } from "vitest";
import { computeSummary } from "../idpProgressTracker";
import type { DevelopmentPlan, IDPGoal } from "../idpTypes";

const goal = (over: Partial<IDPGoal> & { id: string }): IDPGoal => ({
  id: over.id,
  planId: "plan1",
  dimension: "technical",
  title: "Goal",
  baselineMetric: { metric: `${over.id}_m`, value: 0 },
  targetMetric: { metric: `${over.id}_m`, value: 100 },
  drillsAssigned: [],
  weight: 1,
  status: "in_progress",
  aiProposed: false,
  coachEdited: false,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...over,
});

const plan = (goals: IDPGoal[]): DevelopmentPlan => ({
  id: "plan1",
  playerId: "p1",
  monthStart: "2026-01-01",
  monthEnd: "2026-01-31",
  status: "completed",
  generatedBy: "coach",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  goals,
});

const NOW = new Date("2026-01-15T00:00:00Z");

describe("idpProgressTracker · computeSummary gate inv#2", () => {
  it("ninguna meta con medición → overallProgress null (no un 0%)", () => {
    const s = computeSummary(plan([goal({ id: "g1" }), goal({ id: "g2" })]), {}, NOW);
    expect(s.overallProgress).toBeNull();
    expect(s.goalsTotal).toBe(2); // el conteo de metas NO cambia
  });

  it("meta sin medir se EXCLUYE del promedio (no arrastra un 0%)", () => {
    // g1 medida al 100% vía métrica fresca; g2 sin medición → excluida
    const s = computeSummary(
      plan([goal({ id: "g1" }), goal({ id: "g2" })]),
      { g1_m: 100 },
      NOW,
    );
    expect(s.overallProgress).toBe(100); // no (100+0)/2 = 50
  });

  it("meta con currentValue almacenado sí cuenta", () => {
    const s = computeSummary(plan([goal({ id: "g1", currentValue: 50 })]), {}, NOW);
    expect(s.overallProgress).toBe(50);
  });
});
