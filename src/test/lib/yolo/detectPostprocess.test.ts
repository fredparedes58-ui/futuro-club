import { describe, it, expect } from "vitest";
import { decodeDetections } from "@/lib/yolo/detectPostprocess";

// ─── Helper: construir una salida de detector YOLO [1, 4+numClasses, A] ────────
// Layout canal-mayor: data[c*A + i]. Cada ancla lleva bbox (cx,cy,bw,bh en espacio
// del modelo) + numClasses class-scores.
function buildDetectOutput(
  anchors: Array<{ cx: number; cy: number; bw: number; bh: number; scores: number[] }>,
  numClasses: number,
): Float32Array {
  const A = anchors.length;
  const channels = 4 + numClasses;
  const data = new Float32Array(channels * A);
  anchors.forEach((a, i) => {
    data[0 * A + i] = a.cx;
    data[1 * A + i] = a.cy;
    data[2 * A + i] = a.bw;
    data[3 * A + i] = a.bh;
    a.scores.forEach((s, c) => {
      data[(4 + c) * A + i] = s;
    });
  });
  return data;
}

describe("decodeDetections", () => {
  it("imagen cuadrada (scale=1, sin pad): decodifica bbox como esquina superior-izquierda", () => {
    // cx=320, cy=320, bw=100, bh=200 → x=270, y=220, w=100, h=200
    const data = buildDetectOutput(
      [{ cx: 320, cy: 320, bw: 100, bh: 200, scores: [0.9, 0.1] }],
      2,
    );
    const dets = decodeDetections(data, 2, 0, 640, 640, 640, 0.3);
    expect(dets).toHaveLength(1);
    expect(dets[0].bbox[0]).toBeCloseTo(270, 5);
    expect(dets[0].bbox[1]).toBeCloseTo(220, 5);
    expect(dets[0].bbox[2]).toBeCloseTo(100, 5);
    expect(dets[0].bbox[3]).toBeCloseTo(200, 5);
    expect(dets[0].confidence).toBeCloseTo(0.9, 5);
  });

  it("las detecciones NO llevan keypoints (la biomecánica se rellena aparte)", () => {
    const data = buildDetectOutput([{ cx: 100, cy: 100, bw: 20, bh: 40, scores: [0.8] }], 1);
    const dets = decodeDetections(data, 1, 0, 640, 640, 640, 0.3);
    expect(dets[0].keypoints).toEqual([]);
  });

  it("filtra por umbral sobre la clase pedida, no sobre otras clases", () => {
    const data = buildDetectOutput(
      [
        { cx: 100, cy: 100, bw: 20, bh: 40, scores: [0.2, 0.95] }, // persona baja, otra clase alta
        { cx: 200, cy: 200, bw: 20, bh: 40, scores: [0.7, 0.1] },  // persona alta
      ],
      2,
    );
    const dets = decodeDetections(data, 2, 0, 640, 640, 640, 0.3);
    expect(dets).toHaveLength(1);
    expect(dets[0].bbox[0]).toBeCloseTo(190, 5); // solo la 2ª (persona ≥ 0.3)
  });

  it("aplica la inversa del letterbox en imagen no cuadrada (pad vertical)", () => {
    // 1280×720 → scale=0.5, newW=640, newH=360, padY=(640-360)/2=140, padX=0.
    // Detección centrada en el modelo (cx=320, cy=320) con bw=64, bh=64:
    //   x = (320 - 32 - 0)/0.5 = 576 ; y = (320 - 32 - 140)/0.5 = 296 ; w = h = 128
    const data = buildDetectOutput([{ cx: 320, cy: 320, bw: 64, bh: 64, scores: [0.9] }], 1);
    const dets = decodeDetections(data, 1, 0, 1280, 720, 640, 0.3);
    expect(dets[0].bbox[0]).toBeCloseTo(576, 4);
    expect(dets[0].bbox[1]).toBeCloseTo(296, 4);
    expect(dets[0].bbox[2]).toBeCloseTo(128, 4);
    expect(dets[0].bbox[3]).toBeCloseTo(128, 4);
  });

  it("deriva el nº de anclas del tamaño de la salida (no lo hardcodea)", () => {
    // 5 anclas, 3 clases → longitud 7×5 = 35, numAnchors = 5.
    const anchors = Array.from({ length: 5 }, (_, i) => ({
      cx: 100 + i, cy: 100, bw: 10, bh: 20, scores: [0.5, 0, 0],
    }));
    const data = buildDetectOutput(anchors, 3);
    const dets = decodeDetections(data, 3, 0, 640, 640, 640, 0.3);
    expect(dets).toHaveLength(5);
  });

  it("descarta cajas degeneradas (bw o bh ≤ 0)", () => {
    const data = buildDetectOutput([{ cx: 100, cy: 100, bw: 0, bh: 40, scores: [0.9] }], 1);
    expect(decodeDetections(data, 1, 0, 640, 640, 640, 0.3)).toHaveLength(0);
  });

  it("salida vacía → sin detecciones (no lanza)", () => {
    expect(decodeDetections(new Float32Array(0), 80, 0, 640, 640, 640, 0.3)).toEqual([]);
  });
});
