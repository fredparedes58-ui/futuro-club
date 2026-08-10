/**
 * Regresión de F3 (fallo silencioso): teamAnalysisEngine leía `ballTrack.fieldPosition`
 * pero la interfaz BallTrack expone `fieldPos` → ballPos era SIEMPRE null → la posesión
 * en último tercio salía 0% pasara lo que pasara. Este test fija que, con el balón en
 * el último tercio, homeFinalThirdPct refleja la realidad.
 */

import { describe, it, expect } from "vitest";
import { TeamAnalysisEngine } from "@/lib/tracking/teamAnalysisEngine";
import type { BallTrack } from "@/lib/yolo/ballTracker";
import type { PlayerIdentity } from "@/lib/yolo/playerIdentityManager";
import type { Track } from "@/lib/yolo/types";

function ballAt(fx: number): BallTrack {
  return {
    center: { x: 0, y: 0 },
    fieldPos: { fx, fy: 34 },
    speedMs: 0,
    visible: true,
    age: 0,
    totalFrames: 1,
    confidence: 0.9,
    trajectory: [],
    active: true,
  };
}

describe("TeamAnalysisEngine — posesión en último tercio (regresión F3)", () => {
  it("con el balón del equipo local en el último tercio → homeFinalThirdPct > 0", () => {
    const engine = new TeamAnalysisEngine();
    const noTracks: Track[] = [];
    const noIds = new Map<number, PlayerIdentity>();
    // fx=90 > 70 → último tercio del local, posesión "home".
    for (const ts of [0, 500, 1000]) {
      engine.processFrame(noTracks, noIds, ballAt(90), "home", ts);
    }
    const rep = engine.generateReport();
    expect(rep.cumulative.possession.homePct).toBeGreaterThan(0);
    expect(rep.cumulative.possession.homeFinalThirdPct).toBe(100);
  });

  it("con el balón local fuera del último tercio → homeFinalThirdPct 0", () => {
    const engine = new TeamAnalysisEngine();
    for (const ts of [0, 500, 1000]) {
      engine.processFrame([], new Map(), ballAt(30), "home", ts); // fx=30, no es último tercio
    }
    const rep = engine.generateReport();
    expect(rep.cumulative.possession.homeFinalThirdPct).toBe(0);
  });
});
