/**
 * coordSpace — una sola fuente para los espacios de píxel del tracking en navegador.
 *
 * Fija los contratos que rompían las físicas del Lab: el worker detecta en un frame
 * 640×640 APLASTADO y todo lo demás (homografía, overlays, recortes de color) vive en
 * píxeles NATIVOS del vídeo. Aquí se comprueba el escalado 640→nativo de cajas, la
 * re-expresión exacta de la homografía PÍXEL→CAMPO entre espacios, la calibración
 * independiente de la resolución y el mapeo a pantalla con object-contain (letterbox).
 */

import { describe, it, expect } from "vitest";
import {
  PERCENT_SPACE,
  calibrationFromPercentPoints,
  containTransform,
  fieldToPixelIn,
  fromDisplay,
  pixelToFieldIn,
  rescalePixelToField,
  sameSpace,
  scaleBox,
  scaleDetection,
  scaleDetections,
  toDisplay,
  videoSpaceOf,
} from "@/lib/yolo/coordSpace";
import { fieldToPixel, pixelToField } from "@/lib/yolo/homography";
import { FIELD_ANCHOR_PRESETS, type Detection, type PixelSpace } from "@/lib/yolo/types";

const FRAME: PixelSpace = { width: 640, height: 640 };
const NATIVE_1080: PixelSpace = { width: 1920, height: 1080 };
const NATIVE_720: PixelSpace = { width: 1280, height: 720 };

/** Esquinas del campo vistas por una cámara de tribuna, en % del frame del vídeo. */
const CORNERS_PCT = [
  { x: 25, y: 30 }, // TL → (0, 0)
  { x: 75, y: 30 }, // TR → (105, 0)
  { x: 95, y: 90 }, // BR → (105, 68)
  { x: 5, y: 90 },  // BL → (0, 68)
];
const calib = calibrationFromPercentPoints(CORNERS_PCT, FIELD_ANCHOR_PRESETS.full_corners)!;

describe("escalado de cajas 640² (frame) → nativo", () => {
  it("escala caja y keypoints por eje (el aplastado es anisótropo) y conserva la confianza", () => {
    const det: Detection = {
      bbox: [320, 320, 32, 64],
      confidence: 0.83,
      keypoints: [{ x: 336, y: 330, confidence: 0.9 }],
    };
    const out = scaleDetection(det, FRAME, NATIVE_1080);
    // x ×3 (1920/640), y ×1.6875 (1080/640)
    expect(out.bbox).toEqual([960, 540, 96, 108]);
    expect(out.keypoints[0].x).toBeCloseTo(1008, 9);
    expect(out.keypoints[0].y).toBeCloseTo(556.875, 9);
    expect(out.keypoints[0].confidence).toBe(0.9);
    expect(out.confidence).toBe(0.83);
    // No muta la entrada
    expect(det.bbox).toEqual([320, 320, 32, 64]);
  });

  it("la esquina inferior del frame cae en la esquina inferior del vídeo nativo", () => {
    expect(scaleBox([0, 0, 640, 640], FRAME, NATIVE_720)).toEqual([0, 0, 1280, 720]);
  });

  it("mismo espacio → devuelve el mismo objeto/array (sin copia)", () => {
    const det: Detection = { bbox: [1, 2, 3, 4], confidence: 0.5, keypoints: [] };
    expect(scaleDetection(det, NATIVE_1080, { ...NATIVE_1080 })).toBe(det);
    const arr = [det];
    expect(scaleDetections(arr, FRAME, { width: 640, height: 640 })).toBe(arr);
    expect(sameSpace(FRAME, NATIVE_1080)).toBe(false);
  });

  it("ida y vuelta frame→nativo→frame es la identidad", () => {
    const det: Detection = { bbox: [100, 200, 30, 60], confidence: 0.7, keypoints: [{ x: 115, y: 210, confidence: 1 }] };
    const back = scaleDetection(scaleDetection(det, FRAME, NATIVE_1080), NATIVE_1080, FRAME);
    back.bbox.forEach((v, i) => expect(v).toBeCloseTo(det.bbox[i], 9));
    expect(back.keypoints[0].x).toBeCloseTo(115, 9);
    expect(back.keypoints[0].y).toBeCloseTo(210, 9);
  });
});

describe("homografía PÍXEL→CAMPO por espacio", () => {
  it("rescalePixelToField es exacta: el mismo punto físico da los mismos metros en 640² y en nativo", () => {
    const Hn = pixelToFieldIn(calib, NATIVE_1080);
    const Hf = rescalePixelToField(Hn, NATIVE_1080, FRAME);
    const native = { x: 1100, y: 700 };
    const inFrame = { x: native.x * (640 / 1920), y: native.y * (640 / 1080) };
    const a = pixelToField(Hn, native.x, native.y);
    const b = pixelToField(Hf, inFrame.x, inFrame.y);
    expect(b.fx).toBeCloseTo(a.fx, 9);
    expect(b.fy).toBeCloseTo(a.fy, 9);
  });

  it("la calibración en % no depende de la resolución del vídeo (antes caía a 1280×720)", () => {
    // Esquina BR del campo en % (95, 90) → en cualquier resolución da (105, 68) m.
    for (const space of [NATIVE_1080, NATIVE_720, FRAME]) {
      const H = pixelToFieldIn(calib, space);
      const br = pixelToField(H, 0.95 * space.width, 0.9 * space.height);
      expect(br.fx).toBeCloseTo(105, 6);
      expect(br.fy).toBeCloseTo(68, 6);
      const tl = pixelToField(H, 0.25 * space.width, 0.3 * space.height);
      expect(tl.fx).toBeCloseTo(0, 6);
      expect(tl.fy).toBeCloseTo(0, 6);
    }
  });

  it("la matriz materializada es PÍXEL→CAMPO (no la campo→píxel de computeHomography)", () => {
    const Hn = pixelToFieldIn(calib, NATIVE_1080);
    const center = pixelToField(Hn, 0.5 * 1920, 0.6 * 1080);
    // Un píxel central del campo visible cae DENTRO del campo en metros.
    expect(center.fx).toBeGreaterThan(0);
    expect(center.fx).toBeLessThan(105);
    expect(center.fy).toBeGreaterThan(0);
    expect(center.fy).toBeLessThan(68);
  });

  it("fieldToPixelIn es la inversa (render Voronoi en el espacio de los tracks)", () => {
    const Hp2f = pixelToFieldIn(calib, NATIVE_1080);
    const Hf2p = fieldToPixelIn(calib, NATIVE_1080);
    const px = fieldToPixel(Hf2p, 52.5, 34);
    const back = pixelToField(Hp2f, px.px, px.py);
    expect(back.fx).toBeCloseTo(52.5, 6);
    expect(back.fy).toBeCloseTo(34, 6);
  });

  it("sin calibración → identidad (comportamiento previo, sin inventar una)", () => {
    expect(Array.from(pixelToFieldIn(null, NATIVE_1080))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("puntos insuficientes o degenerados → null (se mantiene la calibración previa)", () => {
    expect(calibrationFromPercentPoints(CORNERS_PCT.slice(0, 3), FIELD_ANCHOR_PRESETS.full_corners)).toBeNull();
    const collinear = [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 }, { x: 40, y: 40 }];
    expect(calibrationFromPercentPoints(collinear, FIELD_ANCHOR_PRESETS.full_corners)).toBeNull();
  });

  it("la calibración declara su espacio (PERCENT)", () => {
    expect(calib.space).toEqual(PERCENT_SPACE);
  });
});

describe("nativo/PERCENT → pantalla con <video object-contain> (letterbox)", () => {
  // Vídeo 16:9 en un contenedor 4:3 → bandas arriba y abajo.
  const container: PixelSpace = { width: 800, height: 600 };

  it("centra el vídeo con bandas: (0,0) nativo cae bajo la banda superior, no en la esquina", () => {
    const t = containTransform(NATIVE_1080, NATIVE_1080, container);
    // escala = min(800/1920, 600/1080) → vídeo pintado a 800×450, banda de 75 px.
    expect(toDisplay(t, 0, 0)).toEqual({ x: 0, y: 75 });
    const c = toDisplay(t, 960, 540);
    expect(c.x).toBeCloseTo(400, 9);
    expect(c.y).toBeCloseTo(300, 9);
    const br = toDisplay(t, 1920, 1080);
    expect(br.x).toBeCloseTo(800, 9);
    expect(br.y).toBeCloseTo(525, 9);
  });

  it("los puntos de calibración (%) se pintan con el mismo letterbox que las cajas", () => {
    const tPct = containTransform(PERCENT_SPACE, NATIVE_1080, container);
    const tNat = containTransform(NATIVE_1080, NATIVE_1080, container);
    const a = toDisplay(tPct, 95, 90);
    const b = toDisplay(tNat, 0.95 * 1920, 0.9 * 1080);
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
  });

  it("fromDisplay invierte toDisplay (ratón → % del vídeo)", () => {
    const t = containTransform(PERCENT_SPACE, NATIVE_1080, container);
    const d = toDisplay(t, 25, 30);
    const back = fromDisplay(t, d.x, d.y);
    expect(back.x).toBeCloseTo(25, 9);
    expect(back.y).toBeCloseTo(30, 9);
    // Un clic en la banda superior queda FUERA del vídeo (<0 %), no en el 0-12 %.
    expect(fromDisplay(t, 400, 10).y).toBeLessThan(0);
  });

  it("sin vídeo (imagen del campo) el contenido llena el contenedor (comportamiento previo)", () => {
    const t = containTransform(PERCENT_SPACE, null, container);
    expect(toDisplay(t, 50, 50)).toEqual({ x: 400, y: 300 });
    expect(toDisplay(t, 100, 100)).toEqual({ x: 800, y: 600 });
  });

  it("videoSpaceOf: null hasta que el vídeo tiene dimensiones (sin resolución inventada)", () => {
    expect(videoSpaceOf(null)).toBeNull();
    expect(videoSpaceOf({ videoWidth: 0, videoHeight: 0 })).toBeNull();
    expect(videoSpaceOf({ videoWidth: 1920, videoHeight: 1080 })).toEqual(NATIVE_1080);
  });
});
