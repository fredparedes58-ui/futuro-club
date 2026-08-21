import { describe, it, expect } from "vitest";
import { runRecallFrame, bboxToPoseCrop, type RecallInferers } from "@/lib/yolo/recallPipeline";
import type { ImageLike } from "@/lib/yolo/tiling";
import type { Detection } from "@/lib/yolo/types";

/** Imagen RGBA válida (para que cropImage no falle); el contenido es irrelevante. */
function mkImage(w: number, h: number): ImageLike {
  return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
}

function det(bbox: [number, number, number, number], conf = 0.8): Detection {
  return { bbox, confidence: conf, keypoints: [] };
}

const OPTS = {
  tiling: { grid: 1, overlap: 0 },
  minPoseBoxHeightPx: 96,
  nmsIouThresh: 0.45,
  posePadFrac: 0.15,
};

describe("bboxToPoseCrop", () => {
  it("añade margen y recorta contra los límites de la imagen", () => {
    // box [50,40,60,120], pad 0.15 → padX=9, padY=18
    const r = bboxToPoseCrop([50, 40, 60, 120], 200, 200, 0.15);
    expect(r.sx).toBe(41);
    expect(r.sy).toBe(22);
    expect(r.sw).toBe(119 - 41); // ex=ceil(110+9)=119
    expect(r.sh).toBe(178 - 22); // ey=ceil(160+18)=178
  });

  it("clampa en el borde 0 (no sale de la imagen)", () => {
    const r = bboxToPoseCrop([0, 0, 40, 40], 200, 200, 0.5);
    expect(r.sx).toBe(0);
    expect(r.sy).toBe(0);
  });
});

describe("runRecallFrame", () => {
  it("posición para todas; keypoints (con offset) solo en la caja cercana", async () => {
    const img = mkImage(200, 200);
    const near = det([50, 40, 60, 120]); // alto 120 ≥ 96 → pose
    const far = det([150, 10, 20, 40]);  // alto 40 < 96 → solo posición
    const inferers: RecallInferers = {
      detect: async () => [near, far],
      pose: async () => ({
        bbox: [0, 0, 1, 1],
        confidence: 0.9,
        keypoints: [{ x: 10, y: 20, confidence: 0.8 }],
      }),
    };

    const res = await runRecallFrame(img, OPTS, inferers);

    expect(res.totalCount).toBe(2);
    expect(res.poseMeasuredCount).toBe(1); // la cercana recibió keypoints → medida
    expect(res.detections).toHaveLength(2);

    const nearOut = res.detections.find((d) => d.bbox[0] === 50)!;
    const farOut = res.detections.find((d) => d.bbox[0] === 150)!;
    // Crop de la cercana: sx=41, sy=22 → keypoint (10,20) → global (51,42)
    expect(nearOut.keypoints).toHaveLength(1);
    expect(nearOut.keypoints[0].x).toBe(51);
    expect(nearOut.keypoints[0].y).toBe(42);
    // La lejana conserva keypoints vacíos (biomecánica no medida — honesto)
    expect(farOut.keypoints).toEqual([]);
  });

  it("si la pose no halla nada, la caja cercana conserva keypoints vacíos (no se inventan)", async () => {
    const img = mkImage(200, 200);
    const inferers: RecallInferers = {
      detect: async () => [det([50, 40, 60, 120])],
      pose: async () => null,
    };
    const res = await runRecallFrame(img, OPTS, inferers);
    // Elegible por TAMAÑO pero la pose no halló nada → NO medida (0), no 1:
    // la cobertura refleja gait medido de verdad, no elegible-por-tamaño (fix should-fix #4).
    expect(res.poseMeasuredCount).toBe(0);
    expect(res.detections[0].keypoints).toEqual([]);
  });

  it("aplica el offset del tile a coords del frame completo (tiling 2×2)", async () => {
    const img = mkImage(200, 200);
    // Cada tile (100×100) devuelve una caja local pequeña (lejana → sin pose).
    const inferers: RecallInferers = {
      detect: async () => [det([10, 10, 20, 30])],
      pose: async () => null,
    };
    const res = await runRecallFrame(
      img,
      { ...OPTS, tiling: { grid: 2, overlap: 0 } },
      inferers,
    );
    expect(res.detections).toHaveLength(4);
    const xs = new Set(res.detections.map((d) => d.bbox[0]));
    const ys = new Set(res.detections.map((d) => d.bbox[1]));
    expect([...xs].sort((a, b) => a - b)).toEqual([10, 110]);
    expect([...ys].sort((a, b) => a - b)).toEqual([10, 110]);
  });

  it("deduplica con NMS global la misma caja vista en tiles solapados", async () => {
    const img = mkImage(200, 200);
    const dup = det([30, 30, 40, 40]);
    const inferers: RecallInferers = {
      detect: async () => [dup, { ...dup }], // dos idénticas
      pose: async () => null,
    };
    const res = await runRecallFrame(img, OPTS, inferers);
    expect(res.detections).toHaveLength(1);
  });
});
