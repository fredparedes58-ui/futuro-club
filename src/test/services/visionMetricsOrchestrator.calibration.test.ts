/**
 * Gate honesto en el informe: las métricas físicas solo son fiables con calibración
 * válida. Sin ella, physicalReliable=false y el tracking NO infla la confianza.
 */
import { describe, it, expect } from "vitest";
import { orchestrateVisionMetrics, type VisionInputs } from "@/services/real/visionMetricsOrchestrator";

const base: VisionInputs = {
  playerId: "p1",
  videoId: "v1",
  durationSec: 600,
  distanceCoveredM: 4200,
  maxSpeedMs: 8.1,
  avgSpeedMs: 2.3,
  sprintCount: 12,
  trackCount: 900,
  speedSamples: Array.from({ length: 900 }, () => 3),
};

describe("visionMetricsOrchestrator · gate de calibración", () => {
  it("SIN calibración (default none): physicalReliable=false y 'yolo' NO cuenta como fuente", () => {
    const m = orchestrateVisionMetrics(base);
    expect(m.physicalReliable).toBe(false);
    expect(m.calibrationConfidence).toBe("none");
    expect(m.confidence.sources).not.toContain("yolo");
  });

  it("calibración 'low' tampoco desbloquea métricas físicas", () => {
    const m = orchestrateVisionMetrics({ ...base, calibrationConfidence: "low" });
    expect(m.physicalReliable).toBe(false);
    expect(m.confidence.sources).not.toContain("yolo");
  });

  it("calibración 'high'/'medium': physicalReliable=true y 'yolo' cuenta", () => {
    const hi = orchestrateVisionMetrics({ ...base, calibrationConfidence: "high" });
    expect(hi.physicalReliable).toBe(true);
    expect(hi.confidence.sources).toContain("yolo");

    const med = orchestrateVisionMetrics({ ...base, calibrationConfidence: "medium" });
    expect(med.physicalReliable).toBe(true);
    expect(med.confidence.sources).toContain("yolo");
  });

  it("el tracking sin calibrar NO infla la confianza (menos que calibrado)", () => {
    const uncal = orchestrateVisionMetrics(base);
    const cal = orchestrateVisionMetrics({ ...base, calibrationConfidence: "high" });
    expect(cal.confidence.score).toBeGreaterThan(uncal.confidence.score);
  });
});
