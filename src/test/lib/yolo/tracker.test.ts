/**
 * Tests de groundContactPx (#13): el punto que se proyecta a metros debe ser el de
 * los PIES (contacto con el suelo = borde inferior del bbox), no el centro del bbox
 * (torso). Usar el centro mete un error sistemático de varios metros al aplicar la
 * homografía px→m, y ese error CRECE con la perspectiva → contamina distancia/velocidad.
 */

import { describe, it, expect } from "vitest";
import { groundContactPx, CentroidTracker } from "@/lib/yolo/tracker";
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

describe("CentroidTracker — asociación ByteTrack 2-etapas (#14)", () => {
  // Homografía píxel→campo simple (px/20) → coords dentro de límites del campo.
  const H = new Float64Array([1 / 20, 0, 0, 0, 1 / 20, 0, 0, 0, 1]);
  function det(
    x: number,
    y: number,
    w: number,
    h: number,
    confidence: number,
  ): Detection {
    const keypoints: Keypoint[] = Array.from({ length: 17 }, () => ({ x: 0, y: 0, confidence: 0 }));
    return { bbox: [x, y, w, h], confidence, keypoints };
  }

  it("detección de ALTA confianza crea track; el siguiente frame la asocia por IoU (id estable)", () => {
    const tr = new CentroidTracker();
    const f1 = tr.update([det(100, 100, 20, 40, 0.9)], H, 0);
    expect(f1.length).toBe(1);
    expect(f1[0].lastMatchKind).toBe("new");
    const id = f1[0].id;
    const f2 = tr.update([det(102, 101, 20, 40, 0.9)], H, 125); // bbox solapado
    expect(f2.length).toBe(1);
    expect(f2[0].id).toBe(id);
    expect(f2[0].lastMatchKind).toBe("iou");
  });

  it("spawn INCLUSIVO: una detección de baja sin track existente SÍ crea track (no se pierde)", () => {
    // Anti-regresión: un jugador lejano/borroso a 0.30-0.50 no debe desaparecer del
    // tracking. La supresión de fantasmas (baja no crea) es #25 con el worker low-conf.
    const tr = new CentroidTracker();
    const f1 = tr.update([det(100, 100, 20, 40, 0.35)], H, 0);
    expect(f1.length).toBe(1);
  });

  it("PRIORIDAD ByteTrack: una detección de baja NO roba el match a una de alta", () => {
    const tr = new CentroidTracker();
    const id = tr.update([det(100, 100, 20, 40, 0.9)], H, 0)[0].id;
    // Frame 2: dos detecciones solapan el track — una ALTA algo desplazada y una BAJA
    // justo encima (IoU mayor). El track debe emparejar la de ALTA (etapa 1), no la baja.
    const f2 = tr.update([det(104, 100, 20, 40, 0.9), det(100, 100, 20, 40, 0.35)], H, 125);
    const kept = f2.find((t) => t.id === id)!;
    expect(kept.lastMatchKind).toBe("iou");
    expect(kept.bbox[0]).toBe(104); // tomó la de ALTA (pese a que la baja tenía IoU mayor)
  });

  it("recupera un track ocluido con detección de BAJA confianza → mismo id, sin ID-switch", () => {
    const tr = new CentroidTracker();
    const a = tr.update([det(100, 100, 20, 40, 0.9)], H, 0);
    const id = a[0].id;
    // Frame 2: el jugador sigue ahí pero la detección cae a baja confianza.
    const b = tr.update([det(103, 101, 20, 40, 0.35)], H, 125);
    expect(b.length).toBe(1);
    expect(b[0].id).toBe(id); // NO se crea un id nuevo
    expect(b[0].lastMatchKind).toBe("recovered");
  });

  it("fallback Kalman: sin solape IoU pero cerca en metros → mismo id (kind kalman)", () => {
    const tr = new CentroidTracker();
    const a = tr.update([det(100, 100, 20, 40, 0.9)], H, 0);
    const id = a[0].id;
    // bbox sin solape (x 140 vs 100) pero a ~2 m en campo → lo recupera Kalman.
    const b = tr.update([det(140, 100, 20, 40, 0.9)], H, 125);
    expect(b.length).toBe(1);
    expect(b[0].id).toBe(id);
    expect(b[0].lastMatchKind).toBe("kalman");
  });

  it("dos jugadores separados mantienen ids distintos entre frames (sin swap)", () => {
    const tr = new CentroidTracker();
    const f1 = tr.update([det(100, 100, 20, 40, 0.9), det(400, 300, 20, 40, 0.9)], H, 0);
    expect(f1.length).toBe(2);
    const idA = f1.find((t) => t.bbox[0] === 100)!.id;
    const idC = f1.find((t) => t.bbox[0] === 400)!.id;
    expect(idA).not.toBe(idC);
    const f2 = tr.update([det(104, 102, 20, 40, 0.9), det(396, 298, 20, 40, 0.9)], H, 125);
    expect(f2.find((t) => Math.abs(t.bbox[0] - 104) < 2)!.id).toBe(idA);
    expect(f2.find((t) => Math.abs(t.bbox[0] - 396) < 2)!.id).toBe(idC);
  });

  it("dos frames de BAJA confianza consecutivos mantienen el id (recuperación en cadena)", () => {
    const tr = new CentroidTracker();
    const id = tr.update([det(100, 100, 20, 40, 0.9)], H, 0)[0].id;
    tr.update([det(102, 101, 20, 40, 0.35)], H, 125); // recovered
    const c = tr.update([det(104, 102, 20, 40, 0.35)], H, 250);
    expect(c.find((t) => t.id === id)?.lastMatchKind).toBe("recovered");
  });

  it("preserva la acumulación de distancia con detecciones de alta a lo largo de frames", () => {
    const tr = new CentroidTracker();
    tr.update([det(100, 100, 20, 40, 0.9)], H, 0);
    tr.update([det(110, 100, 20, 40, 0.9)], H, 200); // solapa → iou; ~0.5 m
    const f = tr.update([det(120, 100, 20, 40, 0.9)], H, 400);
    expect(f[0].lastMatchKind).toBe("iou");
    expect(f[0].distanceM).toBeGreaterThan(0);
  });

  it("un track sin detección este frame → lastMatchKind 'lost' (señal honesta para #24)", () => {
    const tr = new CentroidTracker();
    const id = tr.update([det(100, 100, 20, 40, 0.9)], H, 0)[0].id;
    // Frame 2: detección MUY lejos (sin IoU ni <4 m) → el track no se asocia.
    const f2 = tr.update([det(900, 700, 20, 40, 0.9)], H, 125);
    expect(f2.find((t) => t.id === id)!.lastMatchKind).toBe("lost");
  });
});
