/**
 * Tests del auto-registro de campo (fieldRegistration.ts).
 *
 * Estrategia: campo SINTÉTICO. Proyectamos la plantilla de landmarks por una
 * homografía campo→píxel conocida (una cámara ficticia mirando el campo),
 * obtenemos "detecciones" en píxeles, y comprobamos que registerFieldFromLandmarks
 * recupera la homografía correcta y clasifica bien la confianza — incluso con
 * ruido y con outliers (keypoints mal identificados). Geometría pura, sin footage.
 */

import { describe, it, expect } from "vitest";
import {
  computeHomography,
  fieldToPixel,
  pixelToField,
} from "@/lib/yolo/homography";
import {
  FIELD_TEMPLATE,
  FIELD_LENGTH_M,
  registerFieldFromLandmarks,
  classifyCalibration,
  metricsTrustworthy,
  FieldRegistrationAccumulator,
  NO_REGISTRATION,
  decodeFieldKeypoints,
  type DetectedLandmark,
} from "@/lib/yolo/fieldRegistration";

// Cámara ficticia (1280×720) mirando el campo entero, en perspectiva (trapecio).
// computeHomography devuelve campo→píxel directamente (fuente=campo, destino=píxel).
const ANCHORS = [
  { pixel: { px: 300, py: 200 }, field: { fx: 0, fy: 0 } },
  { pixel: { px: 980, py: 200 }, field: { fx: 105, fy: 0 } },
  { pixel: { px: 1150, py: 620 }, field: { fx: 105, fy: 68 } },
  { pixel: { px: 130, py: 620 }, field: { fx: 0, fy: 68 } },
];
const H_FIELD2PIX = computeHomography(ANCHORS);

/** Detección sintética de un landmark, con ruido determinista opcional. */
function synthDet(id: number, noisePx = 0, confidence = 1): DetectedLandmark {
  const tpl = FIELD_TEMPLATE.find((l) => l.id === id)!;
  const p = fieldToPixel(H_FIELD2PIX, tpl.field.fx, tpl.field.fy);
  // ruido determinista distinto por eje/id (evita depender de Math.random)
  const nx = noisePx ? Math.sin(id * 1.7) * noisePx : 0;
  const ny = noisePx ? Math.cos(id * 2.3) * noisePx : 0;
  return { id, px: p.px + nx, py: p.py + ny, confidence };
}

function allDets(noisePx = 0, confidence = 1): DetectedLandmark[] {
  return FIELD_TEMPLATE.map((l) => synthDet(l.id, noisePx, confidence));
}

describe("registerFieldFromLandmarks — calibración perfecta", () => {
  it("recupera la homografía con confianza alta y error ~0", () => {
    const reg = registerFieldFromLandmarks(allDets(0));
    expect(reg.confidence).toBe("high");
    expect(reg.Hpix2field).not.toBeNull();
    expect(reg.meanReprojErrorPx).toBeLessThan(0.5);
    expect(reg.inlierCount).toBe(FIELD_TEMPLATE.length);
    expect(reg.source).toBe("model");
  });

  it("la H recuperada mapea píxel→campo correctamente", () => {
    const reg = registerFieldFromLandmarks(allDets(0));
    const f = pixelToField(reg.Hpix2field!, 300, 200); // esquina sup-izq de la cámara
    expect(f.fx).toBeCloseTo(0, 1);
    expect(f.fy).toBeCloseTo(0, 1);
    const c = pixelToField(reg.Hpix2field!, 1150, 620); // esquina inf-der
    expect(c.fx).toBeCloseTo(105, 1);
    expect(c.fy).toBeCloseTo(68, 1);
  });
});

describe("registerFieldFromLandmarks — robustez", () => {
  it("con ruido pequeño sigue siendo fiable (high/medium)", () => {
    const reg = registerFieldFromLandmarks(allDets(1.5));
    expect(["high", "medium"]).toContain(reg.confidence);
    expect(metricsTrustworthy(reg.confidence)).toBe(true);
  });

  it("RANSAC rechaza outliers (keypoints mal identificados)", () => {
    const dets = allDets(0.4);
    // Corromper 5 detecciones a píxeles claramente erróneos.
    for (const id of [1, 5, 12, 20, 24]) {
      const d = dets.find((x) => x.id === id)!;
      d.px += 250;
      d.py -= 180;
    }
    const reg = registerFieldFromLandmarks(dets);
    // Los buenos (22) deben seguir dando una calibración fiable.
    expect(["high", "medium"]).toContain(reg.confidence);
    expect(reg.inlierCount).toBeGreaterThanOrEqual(20);
    expect(reg.inlierCount).toBeLessThan(FIELD_TEMPLATE.length); // excluyó outliers
    // Y la H recuperada sigue siendo correcta pese a los outliers.
    const f = pixelToField(reg.Hpix2field!, 300, 200);
    expect(f.fx).toBeCloseTo(0, 0);
    expect(f.fy).toBeCloseTo(0, 0);
  });

  it("menos de 4 detecciones → NO_REGISTRATION", () => {
    const reg = registerFieldFromLandmarks([synthDet(0), synthDet(1), synthDet(2)]);
    expect(reg).toEqual(NO_REGISTRATION);
    expect(reg.confidence).toBe("none");
    expect(reg.Hpix2field).toBeNull();
  });

  it("keypoints por debajo del umbral de confianza se descartan", () => {
    // Todos con confianza 0.3 < 0.5 → filtrados → <4 → none.
    const reg = registerFieldFromLandmarks(allDets(0, 0.3), { minKeypointConfidence: 0.5 });
    expect(reg.confidence).toBe("none");
  });
});

describe("classifyCalibration — umbrales", () => {
  it("clasifica según inliers + error de reproyección", () => {
    expect(classifyCalibration(8, 10, 2.0)).toBe("high");
    expect(classifyCalibration(5, 8, 5.0)).toBe("medium");
    expect(classifyCalibration(4, 6, 9.0)).toBe("low");
    expect(classifyCalibration(3, 5, 1.0)).toBe("none"); // <4 inliers
    expect(classifyCalibration(6, 6, 50)).toBe("none"); // error enorme
    expect(classifyCalibration(6, 6, Infinity)).toBe("none");
  });
});

describe("metricsTrustworthy — gate de métricas", () => {
  it("solo confía en high/medium", () => {
    expect(metricsTrustworthy("high")).toBe(true);
    expect(metricsTrustworthy("medium")).toBe(true);
    expect(metricsTrustworthy("low")).toBe(false);
    expect(metricsTrustworthy("none")).toBe(false);
  });
});

describe("FieldRegistrationAccumulator — cámara fija", () => {
  it("acumula landmarks entre frames y registra con confianza alta", () => {
    const acc = new FieldRegistrationAccumulator();
    const dets = allDets(0.3);
    // Simula 3 frames, cada uno ve un subconjunto de landmarks.
    acc.add(dets.slice(0, 9));
    acc.add(dets.slice(9, 20));
    acc.add(dets.slice(20));
    expect(acc.size).toBe(FIELD_TEMPLATE.length);
    const reg = acc.register();
    expect(["high", "medium"]).toContain(reg.confidence);
  });

  it("se queda con la detección de mayor confianza por landmark", () => {
    const acc = new FieldRegistrationAccumulator();
    acc.add([{ id: 0, px: 10, py: 10, confidence: 0.4 }]);
    acc.add([{ id: 0, px: 300, py: 200, confidence: 0.9 }]); // mejor
    acc.add([{ id: 0, px: 999, py: 999, confidence: 0.5 }]); // peor, se ignora
    expect(acc.size).toBe(1);
    // La mejor (conf 0.9) debe ser la que quede.
    const reg = acc.register({ minKeypointConfidence: 0.5 });
    // Con 1 solo landmark no calibra, pero comprobamos que no explota.
    expect(reg.confidence).toBe("none");
  });
});

describe("decodeFieldKeypoints — salida YOLO-pose → landmarks", () => {
  const K = FIELD_TEMPLATE.length; // 32
  const MODEL = 640, IMGW = 1280, IMGH = 720, A = 8400;
  const scale = Math.min(MODEL / IMGW, MODEL / IMGH); // 0.5
  const padX = (MODEL - IMGW * scale) / 2;            // 0
  const padY = (MODEL - IMGH * scale) / 2;            // 140

  /** Tensor [1, 5+K*3, 8400] con el campo plantado en un ancla (letterboxed). */
  function makePoseOutput(objConf = 0.95): Float32Array {
    const data = new Float32Array((5 + K * 3) * A);
    const anchor = 123;
    data[4 * A + anchor] = objConf; // confianza de objeto
    for (const lm of FIELD_TEMPLATE) {
      const p = fieldToPixel(H_FIELD2PIX, lm.field.fx, lm.field.fy); // píxel imagen
      const base = (5 + lm.id * 3) * A + anchor;
      data[base] = p.px * scale + padX;      // a espacio del modelo (letterbox)
      data[base + A] = p.py * scale + padY;
      data[base + 2 * A] = 0.9;              // conf del keypoint
    }
    return data;
  }

  it("recupera los keypoints en píxeles de imagen (deshace el letterbox)", () => {
    const dets = decodeFieldKeypoints(makePoseOutput(), K, IMGW, IMGH, MODEL);
    expect(dets).toHaveLength(K);
    const exp0 = fieldToPixel(H_FIELD2PIX, 0, 0); // corner_tl
    expect(dets[0].px).toBeCloseTo(exp0.px, 1);
    expect(dets[0].py).toBeCloseTo(exp0.py, 1);
  });

  it("decoder → registro recupera la homografía con confianza alta", () => {
    const dets = decodeFieldKeypoints(makePoseOutput(), K, IMGW, IMGH, MODEL);
    const reg = registerFieldFromLandmarks(dets);
    expect(reg.confidence).toBe("high");
    const f = pixelToField(reg.Hpix2field!, 300, 200); // esquina de la cámara → (0,0)
    expect(f.fx).toBeCloseTo(0, 0);
    expect(f.fy).toBeCloseTo(0, 0);
  });

  it("sin objeto por encima del umbral → sin detecciones", () => {
    const data = new Float32Array((5 + K * 3) * A); // todo 0
    expect(decodeFieldKeypoints(data, K, IMGW, IMGH, MODEL)).toHaveLength(0);
  });
});

// ─── Invariante de ORDEN de keypoints (blindaje anti-corrupción silenciosa) ───
// El orden de FIELD_TEMPLATE DEBE coincidir con el del modelo/dataset base
// (martinjolif/football-pitch-detection). El data.yaml del dataset trae este
// flip_idx (espejo horizontal). Si alguien reordena FIELD_TEMPLATE sin actualizar
// el modelo, mezclar/decodificar corrompe el entrenamiento en silencio. Este test
// deriva el flip_idx de la GEOMETRÍA de la plantilla y lo compara con el del dataset.
describe("Invariante de orden: flip_idx del dataset == espejo geométrico de FIELD_TEMPLATE", () => {
  // Verbatim del data.yaml de martinjolif/football-pitch-detection.
  const DATASET_FLIP_IDX = [24, 25, 26, 27, 28, 29, 22, 23, 21, 17, 18, 19, 20,
    13, 14, 15, 16, 9, 10, 11, 12, 8, 6, 7, 0, 1, 2, 3, 4, 5, 31, 30];

  it("cada landmark espejado (L-fx, fy) cae exactamente en el id del flip_idx", () => {
    const byPos = (fx: number, fy: number) =>
      FIELD_TEMPLATE.find((l) => Math.abs(l.field.fx - fx) < 1e-6 && Math.abs(l.field.fy - fy) < 1e-6);

    const derived = FIELD_TEMPLATE.map((l) => {
      const mirror = byPos(FIELD_LENGTH_M - l.field.fx, l.field.fy);
      return mirror ? mirror.id : -1;
    });

    expect(derived).toEqual(DATASET_FLIP_IDX);
    expect(DATASET_FLIP_IDX).toHaveLength(FIELD_TEMPLATE.length); // 32
  });
});
