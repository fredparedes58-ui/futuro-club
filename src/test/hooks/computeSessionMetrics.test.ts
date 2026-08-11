/**
 * Cableado del gate fail-closed de atribución (#24) en computeSessionMetrics.
 * Verifica que el flag identityReliable de las métricas de sesión refleja la
 * fiabilidad de la identidad de los track(s) enfocados: sin identidad fiable, las
 * métricas por-jugador NO deben presentarse como medidas (VitasLab las omite del LLM).
 */

import { describe, it, expect } from "vitest";
import { computeSessionMetrics } from "@/hooks/useTracking";
import type { Track, FieldPosition } from "@/lib/yolo/types";

function mkTrack(id: number, iou: number, weak: number): Track {
  return {
    id,
    bbox: [0, 0, 20, 40],
    keypoints: [],
    age: 0,
    positions: [],
    lastFieldPos: null,
    lastTimestampMs: 0,
    speedMs: 3,
    smoothSpeedMs: 3,
    accelMs2: 0,
    distanceM: 10,
    sprintCount: 1,
    iouMatchCount: iou,
    weakMatchCount: weak,
  };
}

describe("computeSessionMetrics — gate identityReliable (#24)", () => {
  it("identityReliable=true cuando el track enfocado tiene identidad fiable (IoU fuerte)", () => {
    const m = computeSessionMetrics([mkTrack(1, 8, 1)], 1, [], []);
    expect(m.identityReliable).toBe(true);
  });

  it("identityReliable=false cuando el track enfocado es sostenido por asociación débil", () => {
    const m = computeSessionMetrics([mkTrack(1, 3, 5)], 1, [], []);
    expect(m.identityReliable).toBe(false);
  });

  it("identityReliable=false si el track no tiene suficientes matches (aún sin probar)", () => {
    const m = computeSessionMetrics([mkTrack(1, 2, 0)], 1, [], []);
    expect(m.identityReliable).toBe(false);
  });

  it("sin track enfocado (agregado): fiable solo si TODOS los tracks lo son (fail-closed)", () => {
    const allReliable = computeSessionMetrics([mkTrack(1, 8, 1), mkTrack(2, 6, 2)], null, [], []);
    expect(allReliable.identityReliable).toBe(true);
    const oneWeak = computeSessionMetrics([mkTrack(1, 8, 1), mkTrack(2, 3, 5)], null, [], []);
    expect(oneWeak.identityReliable).toBe(false);
  });

  it("sin tracks → EMPTY_METRICS con identityReliable=false (nunca fail-open)", () => {
    const m = computeSessionMetrics([], 1, [], []);
    expect(m.identityReliable).toBe(false);
  });
});

/** Track con un perfil de velocidad dado (m/s por paso a 8 fps): construye las
 *  posiciones de campo cuya distancia por paso produce esas velocidades. */
function trackWithSpeedProfile(id: number, speedsMs: number[]): Track {
  const dt = 0.125; // 8 fps
  let fx = 0;
  const positions: FieldPosition[] = [{ fx: 0, fy: 0, timestampMs: 0 }];
  speedsMs.forEach((v, i) => {
    fx += v * dt;
    positions.push({ fx, fy: 0, timestampMs: (i + 1) * 125 });
  });
  return { ...mkTrack(id, 8, 1), positions };
}

describe("computeSessionMetrics — velocidad máx = pico de sesión, no último frame (G2)", () => {
  it("captura la ráfaga del medio aunque el clip acabe lento (bug de agregación G1)", () => {
    // Lento, RÁFAGA a 8 m/s en el medio, lento al final.
    const speeds = [...Array(30).fill(0.5), ...Array(10).fill(8), ...Array(30).fill(0.5)];
    const m = computeSessionMetrics([trackWithSpeedProfile(1, speeds)], 1, [], []);
    expect(m.maxSpeedMs).toBeGreaterThan(5);   // captura el pico (~8), no el final (~0.5)
    expect(m.maxSpeedMs).toBeLessThanOrEqual(8.1);
  });

  it("p95 rechaza un único spike de jitter (no domina el máximo)", () => {
    const speeds = [...Array(50).fill(3), 40]; // 50 muestras a 3 + 1 spike irreal
    const m = computeSessionMetrics([trackWithSpeedProfile(1, speeds)], 1, [], []);
    expect(m.maxSpeedMs).toBeLessThan(5);      // ~3, el spike (clampeado + outlier) no manda
  });

  it("sin posiciones (posible en tests) → velocidad 0, no lanza", () => {
    const m = computeSessionMetrics([mkTrack(1, 8, 1)], 1, [], []);
    expect(m.maxSpeedMs).toBe(0);
  });
});
