/**
 * Tests de groundContactPx (#13): el punto que se proyecta a metros debe ser el de
 * los PIES (contacto con el suelo = borde inferior del bbox), no el centro del bbox
 * (torso). Usar el centro mete un error sistemático de varios metros al aplicar la
 * homografía px→m, y ese error CRECE con la perspectiva → contamina distancia/velocidad.
 */

import { describe, it, expect } from "vitest";
import { groundContactPx } from "@/lib/yolo/tracker";
import type { Detection, Keypoint } from "@/lib/yolo/types";

function mkDet(bbox: [number, number, number, number]): Detection {
  const keypoints: Keypoint[] = Array.from({ length: 17 }, () => ({ x: 0, y: 0, confidence: 0 }));
  return { bbox, confidence: 0.9, keypoints };
}

describe("groundContactPx", () => {
  it("devuelve el borde INFERIOR-centro del bbox (pies), no el centro (torso)", () => {
    const det = mkDet([50, 100, 80, 400]);
    const g = groundContactPx(det);
    expect(g).toEqual({ x: 90, y: 500 }); // x+w/2=90, y+h=500
  });

  it("la Y es el borde inferior (y+h), NUNCA el centro vertical (y+h/2)", () => {
    const det = mkDet([50, 100, 80, 400]);
    const centerY = det.bbox[1] + det.bbox[3] / 2; // 300 (torso)
    const g = groundContactPx(det);
    expect(g.y).toBe(500);
    expect(g.y).toBeGreaterThan(centerY); // los pies quedan por debajo del torso
  });

  it("es una referencia ESTABLE: no depende de keypoints (sin flicker)", () => {
    // Dos detecciones con el mismo bbox pero keypoints distintos → mismo punto.
    const a = mkDet([0, 0, 100, 200]);
    const b: Detection = {
      bbox: [0, 0, 100, 200],
      confidence: 0.9,
      keypoints: Array.from({ length: 17 }, (_, i) => ({ x: i * 3, y: i * 7, confidence: 0.95 })),
    };
    expect(groundContactPx(a)).toEqual(groundContactPx(b));
    expect(groundContactPx(a)).toEqual({ x: 50, y: 200 });
  });

  it("funciona con distintos tamaños de bbox", () => {
    expect(groundContactPx(mkDet([0, 0, 100, 100]))).toEqual({ x: 50, y: 100 });
    expect(groundContactPx(mkDet([200, 300, 40, 120]))).toEqual({ x: 220, y: 420 });
  });
});
