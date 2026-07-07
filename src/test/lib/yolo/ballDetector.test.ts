/**
 * VITAS · Tests de detección de balón (FASE 2 — vision pipeline)
 *
 * Valida detectBallFromModelOutput contra un tensor sintético con el layout
 * real de un modelo detect COCO: [1, 4+80, 8400] (yolo11s-detect, clase 32).
 */
import { describe, it, expect } from "vitest";
import { detectBallFromModelOutput } from "@/lib/yolo/ballDetector";
import { BALL_CONFIGS } from "@/lib/yolo/ballModelConfig";

const NUM_CLASSES = 80;
const NUM_ANCHORS = 8400;
const BALL_CLASS = 32; // COCO sports ball

/** Construye un output sintético [1, 84, 8400] con detecciones plantadas. */
function makeOutput(
  detections: Array<{ anchor: number; cx: number; cy: number; w: number; h: number; classId: number; score: number }>,
): Float32Array {
  const data = new Float32Array((4 + NUM_CLASSES) * NUM_ANCHORS); // scores init 0
  for (const d of detections) {
    data[0 * NUM_ANCHORS + d.anchor] = d.cx;
    data[1 * NUM_ANCHORS + d.anchor] = d.cy;
    data[2 * NUM_ANCHORS + d.anchor] = d.w;
    data[3 * NUM_ANCHORS + d.anchor] = d.h;
    data[(4 + d.classId) * NUM_ANCHORS + d.anchor] = d.score;
  }
  return data;
}

describe("detectBallFromModelOutput (layout COCO detect [1,84,8400])", () => {
  it("extrae el balón de la clase 32 con coordenadas correctas (imagen 640 cuadrada, sin letterbox)", () => {
    const out = makeOutput([
      { anchor: 100, cx: 320, cy: 320, w: 20, h: 20, classId: BALL_CLASS, score: 0.8 },
    ]);
    const det = detectBallFromModelOutput(out, NUM_CLASSES, BALL_CLASS, 640, 640, 640, { confThreshold: 0.15 });
    expect(det).not.toBeNull();
    expect(det!.source).toBe("model");
    expect(det!.confidence).toBeCloseTo(0.8, 5);
    expect(det!.bbox[0]).toBeCloseTo(310, 3); // x = cx - w/2
    expect(det!.bbox[1]).toBeCloseTo(310, 3);
    expect(det!.center.x).toBeCloseTo(320, 3);
    expect(det!.center.y).toBeCloseTo(320, 3);
  });

  it("deshace el letterbox para imágenes no cuadradas (1280x720 → scale 0.5, padY 60)", () => {
    // scale = min(640/1280, 640/720) = 0.5 · padX = 0 · padY = (640-360)/2 = 140
    const scale = 0.5;
    const padY = (640 - 720 * scale) / 2;
    // Balón real en (600, 400) de la imagen 1280x720, radio 8px
    const out = makeOutput([
      { anchor: 42, cx: 600 * scale, cy: 400 * scale + padY, w: 16 * scale, h: 16 * scale, classId: BALL_CLASS, score: 0.6 },
    ]);
    const det = detectBallFromModelOutput(out, NUM_CLASSES, BALL_CLASS, 1280, 720, 640, { confThreshold: 0.15 });
    expect(det).not.toBeNull();
    expect(det!.center.x).toBeCloseTo(600, 2);
    expect(det!.center.y).toBeCloseTo(400, 2);
  });

  it("ignora detecciones de otras clases (persona clase 0 no es balón)", () => {
    const out = makeOutput([
      { anchor: 10, cx: 100, cy: 100, w: 20, h: 20, classId: 0, score: 0.95 },
    ]);
    const det = detectBallFromModelOutput(out, NUM_CLASSES, BALL_CLASS, 640, 640, 640, { confThreshold: 0.15 });
    expect(det).toBeNull();
  });

  it("filtra cajas demasiado grandes para ser balón (maxBboxSize)", () => {
    const out = makeOutput([
      { anchor: 7, cx: 320, cy: 320, w: 120, h: 120, classId: BALL_CLASS, score: 0.9 },
    ]);
    const det = detectBallFromModelOutput(out, NUM_CLASSES, BALL_CLASS, 640, 640, 640, { confThreshold: 0.15, maxBboxSize: 48 });
    expect(det).toBeNull();
  });

  it("con varias candidatas se queda con la de mayor score", () => {
    const out = makeOutput([
      { anchor: 5,  cx: 100, cy: 100, w: 18, h: 18, classId: BALL_CLASS, score: 0.4 },
      { anchor: 50, cx: 500, cy: 300, w: 16, h: 16, classId: BALL_CLASS, score: 0.7 },
    ]);
    const det = detectBallFromModelOutput(out, NUM_CLASSES, BALL_CLASS, 640, 640, 640, { confThreshold: 0.15 });
    expect(det).not.toBeNull();
    expect(det!.confidence).toBeCloseTo(0.7, 5);
    expect(det!.center.x).toBeCloseTo(500, 3);
  });
});

describe("BALL_CONFIGS (FASE 2)", () => {
  it("yolo11s-detect apunta al modelo same-origin con clase 32 y 80 clases", () => {
    const cfg = BALL_CONFIGS["yolo11s-detect"];
    expect(cfg).toBeDefined();
    expect(cfg.ballClassId).toBe(32);
    expect(cfg.numClasses).toBe(80);
    expect(cfg.modelUrl).toBe("/models/yolo11s-detect.onnx"); // same-origin (prebuild lo despliega)
    expect(cfg.useHeuristicFallback).toBe(true); // nunca rompe si el modelo no carga
  });
});
