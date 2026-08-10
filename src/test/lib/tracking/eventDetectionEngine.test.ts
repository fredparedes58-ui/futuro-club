/**
 * Gate de calibración de eventDetectionEngine (#21). Todos los eventos tácticos se
 * deciden por posición/velocidad en METROS → sin calibración fiable no deben
 * emitirse (serían píxeles disfrazados). Este test fija que con calibrationReliable
 * en false no se emite ningún evento (avanzando el estado).
 */

import { describe, it, expect } from "vitest";
import { EventDetectionEngine } from "@/lib/tracking/eventDetectionEngine";
import type { Track } from "@/lib/yolo/types";

function mkTrack(id: number, fx: number, fy: number, timestampMs: number): Track {
  return {
    id,
    bbox: [0, 0, 10, 20],
    keypoints: [],
    age: 0,
    positions: [{ fx, fy, timestampMs }],
    lastFieldPos: { fx, fy },
    lastTimestampMs: timestampMs,
    speedMs: 3,
    smoothSpeedMs: 3,
    accelMs2: 0,
    distanceM: 0,
    sprintCount: 0,
  };
}

describe("EventDetectionEngine — gate de calibración (#21)", () => {
  it("con calibración NO fiable no emite eventos", () => {
    const engine = new EventDetectionEngine({ trackingFps: 8 });
    // Frame 1 (fiable) establece el estado previo.
    engine.processFrame([mkTrack(1, 80, 34, 0)], 0, 0, null, null, true);
    // Frame 2 con calibrationReliable=false → sin eventos, pase lo que pase.
    const events = engine.processFrame([mkTrack(1, 85, 34, 125)], 125, 1, null, null, false);
    expect(events).toEqual([]);
  });

  it("el default (sin flag) sigue procesando (backward-compat)", () => {
    const engine = new EventDetectionEngine({ trackingFps: 8 });
    // No aseveramos eventos concretos (depende de la heurística), solo que no lanza
    // y devuelve un array — el comportamiento previo se mantiene sin pasar el flag.
    engine.processFrame([mkTrack(1, 80, 34, 0)], 0, 0);
    const events = engine.processFrame([mkTrack(1, 82, 34, 125)], 125, 1);
    expect(Array.isArray(events)).toBe(true);
  });
});
