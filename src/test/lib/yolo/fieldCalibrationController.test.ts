import { describe, it, expect } from "vitest";
import {
  createCalibrationController,
  updateCalibration,
} from "@/lib/yolo/fieldCalibrationController";
import type { FieldRegistration, CalibrationConfidence } from "@/lib/yolo/fieldRegistration";

/** FieldRegistration sintético: solo importan confidence + Hpix2field. */
function reg(confidence: CalibrationConfidence): FieldRegistration {
  const usable = confidence === "high" || confidence === "medium";
  const H = usable ? new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) : null;
  return {
    Hpix2field: H,
    Hfield2pix: H,
    confidence,
    meanReprojErrorPx: usable ? 2 : Infinity,
    inlierCount: usable ? 10 : 0,
    usedLandmarks: usable ? 12 : 0,
    source: usable ? "model" : "none",
  };
}

describe("fieldCalibrationController", () => {
  it("no adopta antes de `adoptAfter` frames buenos seguidos", () => {
    const s = createCalibrationController();
    expect(updateCalibration(s, reg("medium"), { adoptAfter: 3 }).source).toBe("none");
    expect(updateCalibration(s, reg("high"), { adoptAfter: 3 }).source).toBe("none");
    const d3 = updateCalibration(s, reg("high"), { adoptAfter: 3 });
    expect(d3.source).toBe("auto");
    expect(d3.Hpix2field).not.toBeNull();
  });

  it("un frame malo reinicia la racha de calentamiento", () => {
    const s = createCalibrationController();
    updateCalibration(s, reg("high"), { adoptAfter: 3 });
    updateCalibration(s, reg("high"), { adoptAfter: 3 });
    updateCalibration(s, reg("none"), { adoptAfter: 3 }); // reset
    expect(updateCalibration(s, reg("high"), { adoptAfter: 3 }).source).toBe("none");
    expect(updateCalibration(s, reg("high"), { adoptAfter: 3 }).source).toBe("none");
    expect(updateCalibration(s, reg("high"), { adoptAfter: 3 }).source).toBe("auto");
  });

  it("mantiene la última buena durante frames malos transitorios (holding)", () => {
    const s = createCalibrationController();
    // adopta
    updateCalibration(s, reg("high"), { adoptAfter: 1 });
    const h1 = updateCalibration(s, reg("none"), { adoptAfter: 1, maxStaleFrames: 5 });
    expect(h1.source).toBe("holding");
    expect(h1.Hpix2field).not.toBeNull(); // sigue dando la última buena
    expect(h1.staleFrames).toBe(1);
    const h2 = updateCalibration(s, reg("low"), { adoptAfter: 1, maxStaleFrames: 5 });
    expect(h2.source).toBe("holding");
    expect(h2.staleFrames).toBe(2);
  });

  it("caduca la última buena tras maxStaleFrames", () => {
    const s = createCalibrationController();
    updateCalibration(s, reg("high"), { adoptAfter: 1 });
    for (let i = 0; i < 3; i++) updateCalibration(s, reg("none"), { adoptAfter: 1, maxStaleFrames: 3 });
    // 4º frame malo supera el umbral → caduca
    const d = updateCalibration(s, reg("none"), { adoptAfter: 1, maxStaleFrames: 3 });
    expect(d.source).toBe("none");
    expect(d.Hpix2field).toBeNull();
  });

  it("recupera 'auto' cuando vuelve un frame bueno tras holding", () => {
    const s = createCalibrationController();
    updateCalibration(s, reg("high"), { adoptAfter: 1 });
    updateCalibration(s, reg("none"), { adoptAfter: 1 });
    const back = updateCalibration(s, reg("medium"), { adoptAfter: 1 });
    expect(back.source).toBe("auto");
    expect(back.staleFrames).toBe(0);
  });

  it("nunca adopta si nunca hay calibración fiable", () => {
    const s = createCalibrationController();
    for (let i = 0; i < 10; i++) {
      expect(updateCalibration(s, reg(i % 2 ? "low" : "none")).source).toBe("none");
    }
    expect(s.active).toBeNull();
  });
});
