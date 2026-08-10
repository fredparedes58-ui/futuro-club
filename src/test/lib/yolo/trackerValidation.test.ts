// @ts-nocheck — harness de VALIDACIÓN (dev, no CI) del tracker ByteTrack (#14) sobre
// detecciones REALES de un clip (pose_detect.py → detections.json). Mide estabilidad
// de identidad SIN calibración (asociación en píxeles). Se salta si falta el JSON.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CentroidTracker } from "@/lib/yolo/tracker";

const DIR = process.env.TRACK_DIR || join(process.cwd(), "scratchpad", "ft", "track0031");
const DET = process.env.DET_FILE || join(DIR, "detections.json");
const ASG_OUT = process.env.ASG_OUT || "assignments.json";
const CONF_MIN = Number(process.env.CONF_MIN ?? 0.30); // igual que el worker de prod
const FPS = Number(process.env.TRACK_FPS ?? 6);

describe("Tracker validation on real clip (#14)", () => {
  it("corre CentroidTracker sobre detecciones reales y reporta estabilidad de id", () => {
    if (!existsSync(DET)) { console.log("(sin detections.json — skip)"); return; }
    const data = JSON.parse(readFileSync(DET, "utf-8"));
    const frames = Object.keys(data).sort();
    // Homografía de escala aproximada (px→m, ~1/22) — NO es calibración real; solo da
    // una escala métrica plausible para que la compuerta Kalman (4 m) funcione. La
    // asociación de identidad (IoU/ByteTrack) es en píxeles → independiente de esto.
    const H = new Float64Array([1 / 22, 0, 0, 0, 1 / 22, 0, 0, 0, 1]);
    const tracker = new CentroidTracker();
    const assignments: Record<string, unknown[]> = {};
    const allIds = new Set<number>();
    const activePerFrame: number[] = [];
    const kindCounts: Record<string, number> = {};

    frames.forEach((fn, fi) => {
      const raw = (data[fn] as any[]).filter((d) => d.confidence >= CONF_MIN);
      const dets = raw.map((d) => ({
        bbox: d.bbox,
        confidence: d.confidence,
        keypoints: (d.keypoints || []).map((k: number[]) => ({ x: k[0], y: k[1], confidence: k[2] })),
      }));
      const ts = Math.round((fi * 1000) / FPS);
      const tracks = tracker.update(dets, H, ts);
      const active = tracks.filter((t) => t.age === 0); // matcheados este frame
      active.forEach((t) => allIds.add(t.id));
      activePerFrame.push(active.length);
      assignments[fn] = active.map((t) => ({ id: t.id, bbox: t.bbox, kind: t.lastMatchKind }));
      for (const t of active) kindCounts[t.lastMatchKind] = (kindCounts[t.lastMatchKind] || 0) + 1;
    });

    writeFileSync(join(DIR, ASG_OUT), JSON.stringify(assignments));
    const meanActive = activePerFrame.reduce((a, b) => a + b, 0) / activePerFrame.length;
    const maxActive = Math.max(...activePerFrame);
    const churn = allIds.size / Math.max(1, maxActive);
    console.log(`\n╔═ TRACKER VALIDATION (${frames.length} frames @${FPS}fps · conf>=${CONF_MIN}) ═`);
    console.log(`║ jugadores activos/frame: media ${meanActive.toFixed(1)} · máx ${maxActive}`);
    console.log(`║ IDs distintos creados en todo el clip: ${allIds.size}`);
    console.log(`║ CHURN = ids_creados / máx_simultáneos = ${churn.toFixed(2)}  (1.0 = ideal; >3 = muchos switches)`);
    console.log(`║ matchKind (frame·track): ${JSON.stringify(kindCounts)}`);
    console.log(`╚${"═".repeat(52)}`);
    expect(allIds.size).toBeGreaterThan(0);
  }, 60000);
});
