/**
 * Cableado del gate fail-closed de atribución (#24) en computeSessionMetrics.
 * Verifica que el flag identityReliable de las métricas de sesión refleja la
 * fiabilidad de la identidad de los track(s) enfocados: sin identidad fiable, las
 * métricas por-jugador NO deben presentarse como medidas (VitasLab las omite del LLM).
 */

import { describe, it, expect } from "vitest";
import { computeSessionMetrics } from "@/hooks/useTracking";
import type { Track } from "@/lib/yolo/types";

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
