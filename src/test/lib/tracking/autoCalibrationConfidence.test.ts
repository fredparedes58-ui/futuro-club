import { describe, it, expect } from "vitest";
import { autoCalibrationConfidence } from "@/lib/tracking/autoCalibrationConfidence";
import { metricsTrustworthy } from "@/lib/yolo/fieldRegistration";

describe("autoCalibrationConfidence (fail-closed)", () => {
  it("heurística pura / no detectado → 'none' (métricas bloqueadas)", () => {
    expect(autoCalibrationConfidence({ autoDetected: false, confidence: 0.9 })).toBe("none");
    expect(autoCalibrationConfidence(null)).toBe("none");
    expect(autoCalibrationConfidence({ autoDetected: true, confidence: 0.2 })).toBe("none");
  });

  it("detectado pero sin validar → 'low' (nunca high/medium sin validadores)", () => {
    expect(autoCalibrationConfidence({ autoDetected: true, confidence: 0.6 })).toBe("low");
    expect(autoCalibrationConfidence({ autoDetected: true, confidence: 0.99 })).toBe("low");
  });

  it("NUNCA desbloquea métricas: metricsTrustworthy es false en todos los casos actuales", () => {
    for (const c of [0.5, 0.7, 0.9, 1]) {
      expect(metricsTrustworthy(autoCalibrationConfidence({ autoDetected: true, confidence: c }))).toBe(false);
    }
  });
});
