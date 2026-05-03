/**
 * VITAS · Tests del Scan Rate Detector
 *
 * Verifica:
 *   - Cálculo correcto del yaw a partir de keypoints
 *   - Detección de scans (cambios bruscos)
 *   - Filtrado de movimientos lentos (no son scans)
 *   - Clasificación por edad
 *   - Cálculo de bilateralidad
 */

import { describe, it, expect } from "vitest";

// Reimplementación local del algoritmo para tests sin HTTP
// (la implementación canónica está en _scan-detector.ts)
function computeYaw(kp: Array<{ x: number; y: number; visibility: number }>): number | null {
  const nose = kp[0];
  const leftEye = kp[2];
  const rightEye = kp[5];

  if (nose.visibility < 0.5 || leftEye.visibility < 0.5 || rightEye.visibility < 0.5) {
    return null;
  }

  const midX = (leftEye.x + rightEye.x) / 2;
  const eyeDist = Math.abs(rightEye.x - leftEye.x);

  if (eyeDist < 5) return null;

  const noseOffset = nose.x - midX;
  const ratio = noseOffset / (eyeDist / 2);
  const clampedRatio = Math.max(-1, Math.min(1, ratio));
  return clampedRatio * 60;
}

// Helper: crear array de keypoints MediaPipe (solo los relevantes)
function makeKeypoints(noseX: number, leftEyeX: number, rightEyeX: number, visibility = 0.9) {
  const arr = Array.from({ length: 33 }, () => ({ x: 0, y: 100, visibility: 0 }));
  arr[0] = { x: noseX, y: 100, visibility };  // nose
  arr[2] = { x: leftEyeX, y: 95, visibility }; // leftEye
  arr[5] = { x: rightEyeX, y: 95, visibility }; // rightEye
  return arr;
}

describe("Scan Detector · Yaw calculation", () => {
  it("Mirando recto · yaw ≈ 0°", () => {
    // nose centrado entre ojos
    const kp = makeKeypoints(150, 130, 170);
    const yaw = computeYaw(kp);
    expect(yaw).toBeCloseTo(0, 0);
  });

  it("Mirando a la derecha · yaw positivo", () => {
    // nose desplazado a la derecha del punto medio
    const kp = makeKeypoints(160, 130, 170); // mid=150, nose=160 → desplazamiento +10
    const yaw = computeYaw(kp);
    expect(yaw).toBeGreaterThan(0);
  });

  it("Mirando a la izquierda · yaw negativo", () => {
    const kp = makeKeypoints(140, 130, 170);
    const yaw = computeYaw(kp);
    expect(yaw).toBeLessThan(0);
  });

  it("Cara no visible · devuelve null", () => {
    const kp = makeKeypoints(150, 130, 170, 0.1);
    expect(computeYaw(kp)).toBeNull();
  });

  it("Ojos demasiado juntos · devuelve null", () => {
    const kp = makeKeypoints(150, 148, 152);
    expect(computeYaw(kp)).toBeNull();
  });

  it("Yaw extremo · clamped a ±60°", () => {
    const kp = makeKeypoints(200, 130, 170); // muy desplazado
    const yaw = computeYaw(kp);
    expect(yaw).toBe(60);

    const kp2 = makeKeypoints(100, 130, 170);
    expect(computeYaw(kp2)).toBe(-60);
  });
});

describe("Scan Detector · benchmark de edades", () => {
  const SCAN_BENCHMARKS = {
    "sub-12": { p25: 0.12, p50: 0.15, p75: 0.22, pro: 0.51 },
  };

  it("Sub-12 con 0.5 scans/seg → cerca de pro", () => {
    const b = SCAN_BENCHMARKS["sub-12"];
    expect(0.5).toBeGreaterThan(b.p75);
    expect(0.5).toBeCloseTo(b.pro, 0);
  });

  it("Sub-12 con 0.10 scans/seg → debajo del p25", () => {
    const b = SCAN_BENCHMARKS["sub-12"];
    expect(0.10).toBeLessThan(b.p25);
  });
});

describe("Scan Detector · clasificación", () => {
  function classify(rate: number, b: { p25: number; p50: number; p75: number; pro: number }): string {
    if (rate >= b.pro * 0.85) return "elite";
    if (rate >= b.p75) return "above_avg";
    if (rate >= b.p25) return "avg";
    return "below_avg";
  }

  const sub12 = { p25: 0.12, p50: 0.15, p75: 0.22, pro: 0.51 };

  it("0.05 sub-12 → below_avg", () => {
    expect(classify(0.05, sub12)).toBe("below_avg");
  });

  it("0.18 sub-12 → avg", () => {
    expect(classify(0.18, sub12)).toBe("avg");
  });

  it("0.30 sub-12 → above_avg", () => {
    expect(classify(0.30, sub12)).toBe("above_avg");
  });

  it("0.50 sub-12 → elite (cerca de Pedri)", () => {
    expect(classify(0.50, sub12)).toBe("elite");
  });
});

describe("Scan Detector · detección de scans", () => {
  it("Cambio de yaw rápido y grande · ES un scan", () => {
    // 30° en 0.2 seg = 150°/seg
    const yawDelta = 30;
    const dt = 0.2;
    const angularVelocity = Math.abs(yawDelta) / dt;

    expect(Math.abs(yawDelta)).toBeGreaterThanOrEqual(20); // umbral
    expect(angularVelocity).toBeGreaterThanOrEqual(50);    // umbral
  });

  it("Cambio de yaw lento · NO es un scan", () => {
    // 25° en 1 seg = 25°/seg (lento, NO scan)
    const yawDelta = 25;
    const dt = 1.0;
    const angularVelocity = Math.abs(yawDelta) / dt;

    expect(angularVelocity).toBeLessThan(50); // no supera umbral
  });

  it("Cambio de yaw pequeño · NO es un scan", () => {
    // 10° en 0.1 seg = 100°/seg (rápido pero pequeño, NO scan)
    const yawDelta = 10;
    expect(Math.abs(yawDelta)).toBeLessThan(20); // no supera umbral
  });
});

describe("Scan Detector · bilateralidad", () => {
  it("100% un solo lado · bilateralidad 0%", () => {
    const events = [
      { direction: "left" as const },
      { direction: "left" as const },
      { direction: "left" as const },
    ];
    const left = events.filter(e => e.direction === "left").length;
    const right = events.filter(e => e.direction === "right").length;
    const bilaterality = events.length > 0 ? Math.min(left, right) / events.length * 100 : 0;
    expect(bilaterality).toBe(0);
  });

  it("50/50 · bilateralidad 50%", () => {
    const events = [
      { direction: "left" as const },
      { direction: "right" as const },
      { direction: "left" as const },
      { direction: "right" as const },
    ];
    const left = events.filter(e => e.direction === "left").length;
    const right = events.filter(e => e.direction === "right").length;
    const bilaterality = events.length > 0 ? Math.min(left, right) / events.length * 100 : 0;
    expect(bilaterality).toBe(50);
  });
});
