import { describe, it, expect, beforeEach } from "vitest";
import {
  computeTileRects,
  clampOverlap,
  cropImage,
  offsetDetection,
  iouXYWH,
  globalNms,
  parseTilingConfig,
  getTilingConfig,
  type ImageLike,
} from "@/lib/yolo/tiling";
import type { Detection } from "@/lib/yolo/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Detección mínima con bbox [x,y,w,h], confianza y (opcional) 1 keypoint. */
function mkDet(
  bbox: [number, number, number, number],
  confidence: number,
  kp?: { x: number; y: number; confidence: number },
): Detection {
  return {
    bbox,
    confidence,
    keypoints: kp ? [kp] : [],
  };
}

/** Imagen RGBA de test: el canal R de cada píxel codifica su índice lineal. */
function mkImage(width: number, height: number): ImageLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4 + 0] = i; // R = índice del píxel
    data[i * 4 + 1] = i; // G
    data[i * 4 + 2] = i; // B
    data[i * 4 + 3] = 255; // A
  }
  return { data, width, height };
}

// ─── computeTileRects ────────────────────────────────────────────────────────

describe("computeTileRects", () => {
  it("grid=1 → un solo rect que cubre todo el frame", () => {
    const rects = computeTileRects(900, 600, 1, 0.15);
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual({ sx: 0, sy: 0, sw: 900, sh: 600 });
  });

  it("grid=3 → 9 tiles en orden row-major", () => {
    const rects = computeTileRects(900, 600, 3, 0.15);
    expect(rects).toHaveLength(9);
    // Row-major: la primera fila comparte sy; la primera columna comparte sx.
    expect(rects[0].sx).toBe(0);
    expect(rects[0].sy).toBe(0);
    expect(rects[1].sy).toBe(rects[0].sy); // mismo row
    expect(rects[3].sx).toBe(rects[0].sx); // misma col, fila siguiente
  });

  it("la unión de los tiles cubre el frame completo sin huecos", () => {
    const W = 900, H = 600;
    const rects = computeTileRects(W, H, 3, 0.15);
    const minX = Math.min(...rects.map((r) => r.sx));
    const minY = Math.min(...rects.map((r) => r.sy));
    const maxX = Math.max(...rects.map((r) => r.sx + r.sw));
    const maxY = Math.max(...rects.map((r) => r.sy + r.sh));
    expect(minX).toBe(0);
    expect(minY).toBe(0);
    expect(maxX).toBe(W);
    expect(maxY).toBe(H);
  });

  it("tiles adyacentes SE SOLAPAN con overlap > 0 (no cortan jugadores en el borde)", () => {
    const rects = computeTileRects(900, 600, 3, 0.15);
    // Fila 0: col0 y col1 deben solaparse horizontalmente.
    const col0 = rects[0];
    const col1 = rects[1];
    expect(col0.sx + col0.sw).toBeGreaterThan(col1.sx); // borde derecho de col0 pasa el izquierdo de col1
    // Solape esperado ≈ 2·base·overlap = 2·300·0.15 = 90 px.
    const overlapPx = col0.sx + col0.sw - col1.sx;
    expect(overlapPx).toBeGreaterThan(50);
  });

  it("overlap=0 → tiles contiguos y NO solapados (los bordes se tocan)", () => {
    const rects = computeTileRects(900, 600, 3, 0);
    const col0 = rects[0];
    const col1 = rects[1];
    expect(col0.sx + col0.sw).toBe(col1.sx); // se tocan exactamente, sin solape
  });

  it("los tiles de borde se recortan contra los límites (no se salen del frame)", () => {
    const W = 640, H = 480;
    const rects = computeTileRects(W, H, 3, 0.2);
    for (const r of rects) {
      expect(r.sx).toBeGreaterThanOrEqual(0);
      expect(r.sy).toBeGreaterThanOrEqual(0);
      expect(r.sx + r.sw).toBeLessThanOrEqual(W);
      expect(r.sy + r.sh).toBeLessThanOrEqual(H);
    }
  });

  it("dimensiones inválidas → lanza", () => {
    expect(() => computeTileRects(0, 600, 3, 0.15)).toThrow();
    expect(() => computeTileRects(900, -1, 3, 0.15)).toThrow();
  });
});

describe("clampOverlap", () => {
  it("recorta a [0, 0.5) y trata valores no finitos/negativos como 0", () => {
    expect(clampOverlap(0.15)).toBeCloseTo(0.15);
    expect(clampOverlap(0.6)).toBeLessThan(0.5);
    expect(clampOverlap(-1)).toBe(0);
    expect(clampOverlap(Number.NaN)).toBe(0);
  });
});

// ─── cropImage ───────────────────────────────────────────────────────────────

describe("cropImage", () => {
  it("extrae el sub-rectángulo correcto (píxel a píxel)", () => {
    const img = mkImage(4, 3); // índices 0..11
    const tile = cropImage(img, { sx: 1, sy: 1, sw: 2, sh: 2 });
    expect(tile.width).toBe(2);
    expect(tile.height).toBe(2);
    // Píxeles esperados (canal R = índice lineal en la imagen original):
    //   original (1,1)=5  (2,1)=6
    //            (1,2)=9  (2,2)=10
    expect(tile.data[0 * 4 + 0]).toBe(5); // tile (0,0)
    expect(tile.data[1 * 4 + 0]).toBe(6); // tile (1,0)
    expect(tile.data[2 * 4 + 0]).toBe(9); // tile (0,1)
    expect(tile.data[3 * 4 + 0]).toBe(10); // tile (1,1)
    // El canal alfa se preserva.
    expect(tile.data[0 * 4 + 3]).toBe(255);
  });

  it("recorta el rect contra los límites de la imagen (defensivo)", () => {
    const img = mkImage(4, 3);
    const tile = cropImage(img, { sx: 3, sy: 2, sw: 10, sh: 10 });
    expect(tile.width).toBe(1); // 4 - 3
    expect(tile.height).toBe(1); // 3 - 2
  });
});

// ─── offsetDetection (mapeo tile-local → frame completo) ─────────────────────

describe("offsetDetection", () => {
  it("desplaza bbox y keypoints por el offset del tile; conserva tamaño y confianzas", () => {
    const local = mkDet([10, 20, 30, 40], 0.9, { x: 15, y: 25, confidence: 0.8 });
    const global = offsetDetection(local, 100, 200);

    // bbox: (x,y) desplazados; (w,h) intactos.
    expect(global.bbox).toEqual([110, 220, 30, 40]);
    // keypoint desplazado; su confianza intacta.
    expect(global.keypoints[0]).toEqual({ x: 115, y: 225, confidence: 0.8 });
    // confianza de la detección intacta.
    expect(global.confidence).toBe(0.9);
  });

  it("es un round-trip exacto: un tile en (sx,sy) recupera la coord global original", () => {
    // Un jugador en el frame en (500, 300). El tile empieza en (450, 250) → local (50, 50).
    const sx = 450, sy = 250;
    const localX = 500 - sx, localY = 300 - sy;
    const local = mkDet([localX, localY, 20, 40], 0.7, { x: localX + 10, y: localY, confidence: 0.6 });
    const global = offsetDetection(local, sx, sy);
    expect(global.bbox[0]).toBe(500);
    expect(global.bbox[1]).toBe(300);
    expect(global.keypoints[0].x).toBe(510);
    expect(global.keypoints[0].y).toBe(300);
  });

  it("no muta la detección de entrada", () => {
    const local = mkDet([10, 20, 30, 40], 0.9, { x: 15, y: 25, confidence: 0.8 });
    offsetDetection(local, 100, 200);
    expect(local.bbox).toEqual([10, 20, 30, 40]);
    expect(local.keypoints[0]).toEqual({ x: 15, y: 25, confidence: 0.8 });
  });
});

// ─── iouXYWH ─────────────────────────────────────────────────────────────────

describe("iouXYWH", () => {
  it("cajas idénticas → IoU 1", () => {
    expect(iouXYWH([0, 0, 10, 10], [0, 0, 10, 10])).toBeCloseTo(1);
  });
  it("cajas disjuntas → IoU 0", () => {
    expect(iouXYWH([0, 0, 10, 10], [100, 100, 10, 10])).toBe(0);
  });
  it("solape parcial → IoU intermedio conocido", () => {
    // Dos cajas 10×10 desplazadas 5px en x: intersección 5×10=50, unión 150 → 1/3.
    expect(iouXYWH([0, 0, 10, 10], [5, 0, 10, 10])).toBeCloseTo(50 / 150, 5);
  });
});

// ─── globalNms (dedupe entre tiles solapados) ────────────────────────────────

describe("globalNms", () => {
  it("deduplica el MISMO jugador detectado en dos tiles solapados", () => {
    // A y B son el mismo jugador (cajas casi idénticas) vistos desde tiles distintos.
    const a = mkDet([100, 100, 50, 100], 0.9, { x: 125, y: 130, confidence: 0.8 });
    const b = mkDet([104, 102, 50, 100], 0.7); // IoU alto con A → se suprime
    const c = mkDet([400, 100, 50, 100], 0.85); // jugador distinto, lejos → se conserva

    const kept = globalNms([a, b, c], 0.45);
    expect(kept).toHaveLength(2);
    // Se conserva la de MAYOR confianza del grupo solapado (A, no B).
    expect(kept).toContain(a);
    expect(kept).not.toContain(b);
    expect(kept).toContain(c);
  });

  it("detecciones NO solapadas se conservan todas", () => {
    const dets = [
      mkDet([0, 0, 20, 20], 0.9),
      mkDet([100, 0, 20, 20], 0.8),
      mkDet([200, 0, 20, 20], 0.7),
    ];
    expect(globalNms(dets, 0.45)).toHaveLength(3);
  });

  it("devuelve las supervivientes en orden de confianza descendente", () => {
    const dets = [
      mkDet([0, 0, 20, 20], 0.5),
      mkDet([100, 0, 20, 20], 0.9),
      mkDet([200, 0, 20, 20], 0.7),
    ];
    const kept = globalNms(dets, 0.45);
    expect(kept.map((d) => d.confidence)).toEqual([0.9, 0.7, 0.5]);
  });

  it("conserva los keypoints de las supervivientes", () => {
    const a = mkDet([100, 100, 50, 100], 0.9, { x: 125, y: 130, confidence: 0.8 });
    const b = mkDet([104, 102, 50, 100], 0.7);
    const kept = globalNms([a, b], 0.45);
    expect(kept).toHaveLength(1);
    expect(kept[0].keypoints[0]).toEqual({ x: 125, y: 130, confidence: 0.8 });
  });

  it("lista vacía → lista vacía", () => {
    expect(globalNms([], 0.45)).toEqual([]);
  });

  it("integración crop→infer(simulado)→offset→NMS: dos tiles solapados sobre 1 jugador → 1 detección", () => {
    // Simula el pipeline del worker sin ONNX: dos tiles adyacentes que solapan
    // sobre un jugador que cae en la franja de solape. Cada tile lo detecta en sus
    // coords locales; tras offset a coords globales, las cajas coinciden y el NMS
    // global las funde en una.
    const tileLeft = { sx: 0, sy: 0, sw: 500, sh: 600 };
    const tileRight = { sx: 400, sy: 0, sw: 500, sh: 600 }; // solapa [400,500] con el izq.

    // Jugador global en (450, 200) 40×80. Local a cada tile:
    const detFromLeft = offsetDetection(mkDet([450 - 0, 200, 40, 80], 0.82), tileLeft.sx, tileLeft.sy);
    const detFromRight = offsetDetection(mkDet([450 - 400, 200, 40, 80], 0.88), tileRight.sx, tileRight.sy);

    // Ambas apuntan al mismo lugar global → misma caja.
    expect(detFromLeft.bbox).toEqual(detFromRight.bbox);

    const merged = globalNms([detFromLeft, detFromRight], 0.45);
    expect(merged).toHaveLength(1);
    expect(merged[0].confidence).toBe(0.88); // gana la de mayor confianza
  });
});

// ─── parseTilingConfig / getTilingConfig (opt-in) ────────────────────────────

describe("parseTilingConfig", () => {
  it("grid < 2 → null (equivale a un solo paso; no tiene sentido activarlo)", () => {
    expect(parseTilingConfig({ grid: 1, overlap: 0.15 })).toBeNull();
    expect(parseTilingConfig({ grid: 0 })).toBeNull();
  });

  it("config válida → grid + overlap saneados", () => {
    expect(parseTilingConfig({ grid: 3, overlap: 0.15 })).toEqual({ grid: 3, overlap: 0.15 });
  });

  it("overlap ausente → default 0.15", () => {
    expect(parseTilingConfig({ grid: 3 })).toEqual({ grid: 3, overlap: 0.15 });
  });

  it("grid se limita a 6 (tope de coste)", () => {
    expect(parseTilingConfig({ grid: 20, overlap: 0.1 })?.grid).toBe(6);
  });

  it("entrada no-objeto → null", () => {
    expect(parseTilingConfig(null)).toBeNull();
    expect(parseTilingConfig("3x3")).toBeNull();
    expect(parseTilingConfig(3)).toBeNull();
  });
});

describe("getTilingConfig", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("sin la clave vitas_tiling → null (tracking en vivo plano por defecto)", () => {
    expect(getTilingConfig()).toBeNull();
  });

  it("clave válida → config parseada", () => {
    localStorage.setItem("vitas_tiling", JSON.stringify({ grid: 3, overlap: 0.15 }));
    expect(getTilingConfig()).toEqual({ grid: 3, overlap: 0.15 });
  });

  it("JSON inválido → null (nunca rompe)", () => {
    localStorage.setItem("vitas_tiling", "{ not json");
    expect(getTilingConfig()).toBeNull();
  });

  it("config sin sentido (grid=1) → null", () => {
    localStorage.setItem("vitas_tiling", JSON.stringify({ grid: 1 }));
    expect(getTilingConfig()).toBeNull();
  });
});
