/**
 * Arnés de validación (puntuación pura contra eventos anotados A MANO). Las fixtures de
 * aquí son sintéticas para el test; el ground truth real vive en fixtures/partido/.
 */
import { describe, expect, it } from "vitest";
import { annotatedEventsFileSchema, evaluateThresholds, regularStepShare, scoreObservation, type PredictedEvidence } from "../validation";
import { loadPartidoFixture } from "../validationHarness";
import { MATCH_VIDEO_CONFIG, matchVideoConfigSource } from "../config";

const ev = (t_start: number, t_end: number, team: PredictedEvidence["team"], category: PredictedEvidence["category"]): PredictedEvidence => ({
  t_start,
  t_end,
  team,
  category,
});

describe("scoreObservation", () => {
  const events = [
    { t: 100, team: "home" as const, category: "chance" as const },
    { t: 300, team: "away" as const, category: "pressing" as const },
    { t: 500, team: "home" as const, category: "chance" as const },
    { t: 2000, team: "home" as const, category: "chance" as const }, // fuera de la ventana
  ];
  const windows = [{ start_sec: 0, end_sec: 900 }];

  it("matches one-to-one by category + team inside [t_start − tol, t_end + tol]", () => {
    const r = scoreObservation({
      evidence: [ev(98, 99, "home", "chance"), ev(104, 106, "home", "chance"), ev(300, 310, "away", "pressing"), ev(700, 710, "home", "chance")],
      events,
      toleranceSec: 5,
      windows,
    });
    const chance = r.byCategory.find((c) => c.category === "chance");
    // 100 casa con una de las dos cercanas (uno a uno), 500 sin evidencia, 700 sin evento.
    expect(chance).toMatchObject({ annotated: 2, predicted: 3, matched: 1 });
    expect(chance?.precision).toBeCloseTo(1 / 3);
    expect(chance?.recall).toBeCloseTo(0.5);
    expect(r.byCategory.find((c) => c.category === "pressing")).toMatchObject({ matched: 1, precision: 1, recall: 1 });
    expect(r.overall).toMatchObject({ annotated: 3, predicted: 4, matched: 2 });
    expect(r.eventsOutsideWindows).toBe(1);
  });
  it("the spike pattern (0 of 5 cited shots existed) scores precision 0", () => {
    const fabricated = [10, 20, 30, 40, 50].map((t) => ev(t, t, "home", "chance"));
    const r = scoreObservation({ evidence: fabricated, events: [{ t: 400, team: "home", category: "chance" }], toleranceSec: 5, windows });
    expect(r.overall.precision).toBe(0);
    expect(evaluateThresholds(r, { minPrecision: 0.9, minRecall: 0.5 }).pass).toBe(false);
  });
  it("an 'ambiguous' evidence never matches a team event (strict mode decides; agnostic is diagnostic only)", () => {
    const r = scoreObservation({ evidence: [ev(100, 100, "ambiguous", "chance")], events: [events[0]], toleranceSec: 5, windows });
    expect(r.overall.matched).toBe(0);
    expect(r.overallTeamAgnostic.matched).toBe(1);
  });
  it("no predictions → precision null (neither 0 nor 1); recall 0", () => {
    const r = scoreObservation({ evidence: [], events: [events[0]], toleranceSec: 5, windows });
    expect(r.overall.precision).toBeNull();
    expect(r.overall.recall).toBe(0);
  });
});

describe("evaluateThresholds", () => {
  it("passes only when every category and the total reach the thresholds", () => {
    const good = scoreObservation({ evidence: [ev(100, 100, "home", "chance")], events: [{ t: 101, team: "home", category: "chance" }], toleranceSec: 5, windows: [{ start_sec: 0, end_sec: 900 }] });
    expect(evaluateThresholds(good, { minPrecision: 0.9, minRecall: 0.5 })).toEqual({ pass: true, failures: [], reason: null });
  });
  it("nothing annotated in the evaluated windows is NOT a pass", () => {
    const r = scoreObservation({ evidence: [ev(1, 2, "home", "chance")], events: [{ t: 5000, team: "home", category: "chance" }], toleranceSec: 5, windows: [{ start_sec: 0, end_sec: 900 }] });
    const v = evaluateThresholds(r, { minPrecision: 0, minRecall: 0 });
    expect(v.pass).toBe(false);
    expect(v.reason).toMatch(/ningún evento/);
  });
  it("thresholds come from config and are marked 'pendiente de validar'", () => {
    expect(MATCH_VIDEO_CONFIG.validationMinPrecision).toBeGreaterThan(0);
    expect(matchVideoConfigSource("validationMinRecall")).toMatch(/pendiente de validar/);
  });
});

describe("template diagnostic", () => {
  it("share of evidence starting on exact 10 s multiples (the spike signal)", () => {
    expect(regularStepShare([ev(10, 12, "home", "chance"), ev(20, 21, "home", "chance"), ev(33, 35, "home", "chance")], 10)).toBeCloseTo(2 / 3);
    expect(regularStepShare([], 10)).toBeNull();
  });
});

describe("fixtures", () => {
  it("eventos.json must be a non-empty array of {t, team: home|away, category}", () => {
    expect(annotatedEventsFileSchema.safeParse([]).success).toBe(false);
    expect(annotatedEventsFileSchema.safeParse([{ t: 1, team: "ambiguous", category: "chance" }]).success).toBe(false);
    expect(annotatedEventsFileSchema.safeParse([{ t: 1, team: "home", category: "chance" }]).success).toBe(true);
  });
  it("the harness refuses the _plantilla template", () => {
    expect(() => loadPartidoFixture("fixtures/partido/_plantilla")).toThrow(/_plantilla/);
  });
});
