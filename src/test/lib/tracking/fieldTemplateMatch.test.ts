/**
 * Tests de fieldTemplateMatch FORMAT-AWARE (#20).
 *
 * Verifica que matchToTemplate empareja las intersecciones detectadas contra la
 * plantilla del FORMATO correcto (F8 60×40 vs F11 105×68), de modo que las
 * coordenadas de campo (metros) — y por tanto la escala de la homografía — sean
 * correctas. Emparejar footage F8 con la plantilla F11 infla los metros ~1.75×.
 */

import { describe, it, expect } from "vitest";
import {
  computeHomography,
  fieldToPixel,
  pixelToField,
  invertMatrix3x3,
  computeHomographyRANSAC,
} from "@/lib/yolo/homography";
import {
  matchToTemplate,
  templateForFormat,
  buildF8TemplatePoints,
  FIFA_TEMPLATE_POINTS,
} from "@/lib/tracking/fieldTemplateMatch";

describe("templateForFormat", () => {
  it("f11 → plantilla FIFA + 105×68", () => {
    const t = templateForFormat("f11");
    expect(t.fieldLength).toBe(105);
    expect(t.fieldWidth).toBe(68);
    expect(t.template).toBe(FIFA_TEMPLATE_POINTS);
  });

  it("f8 → plantilla F8 + 60×40 nominal (centro a 30,20; esquina a 60,40)", () => {
    const t = templateForFormat("f8");
    expect(t.fieldLength).toBe(60);
    expect(t.fieldWidth).toBe(40);
    const br = t.template.find((p) => p.id === "fc_br")!;
    expect(br.x).toBe(60);
    expect(br.y).toBe(40);
    const c = t.template.find((p) => p.id === "center")!;
    expect(c.x).toBe(30);
    expect(c.y).toBe(20);
  });

  it("f8 con dimensiones reales → escala a esas dims", () => {
    const t = templateForFormat("f8", { length: 55, width: 35 });
    expect(t.fieldLength).toBe(55);
    expect(t.fieldWidth).toBe(35);
    const br = t.template.find((p) => p.id === "fc_br")!;
    expect(br.x).toBe(55);
    expect(br.y).toBe(35);
  });
});

describe("buildF8TemplatePoints — geometría FFCV", () => {
  it("área grande a 9m de profundidad y media anchura 12 (cy=20)", () => {
    const pts = buildF8TemplatePoints(60, 40);
    const lpaTr = pts.find((p) => p.id === "lpa_tr")!; // esquina interior sup, área grande izq
    expect(lpaTr.x).toBe(9);
    expect(lpaTr.y).toBe(8); // 20 - 12
  });

  it("áreas pequeñas, círculo, spots y porterías con las medidas correctas", () => {
    const pts = buildF8TemplatePoints(60, 40);
    const get = (id: string) => pts.find((p) => p.id === id)!;
    expect([get("lga_tr").x, get("lga_tr").y]).toEqual([3, 16]); // área pequeña izq int sup (cy-4)
    expect([get("lps").x, get("lps").y]).toEqual([9, 20]); //        penalti izq
    expect([get("rps").x, get("rps").y]).toEqual([51, 20]); //       penalti der (60-9)
    expect([get("cc_top").x, get("cc_top").y]).toEqual([30, 14]); // círculo arriba (20-6)
    expect([get("lgp_t").x, get("lgp_t").y]).toEqual([0, 17]); //    poste izq sup (20-3)
    expect([get("rpa_tl").x, get("rpa_tl").y]).toEqual([51, 8]); //  área grande der int sup (60-9)
  });

  it("las áreas son de tamaño ABSOLUTO (no escalan con el largo del campo)", () => {
    // Campo real 55×35: la profundidad del área sigue siendo 9m (no 9·55/60).
    const t = buildF8TemplatePoints(55, 35);
    const get = (id: string) => t.find((p) => p.id === id)!;
    expect(get("lpa_tr").x).toBe(9); //  profundidad absoluta a la izquierda
    expect(get("rpa_tl").x).toBe(46); // 55 - 9 (profundidad absoluta a la derecha)
    expect(get("lga_tr").x).toBe(3); //  área pequeña profundidad absoluta
  });
});

describe("matchToTemplate — format-aware (F8 vs F11)", () => {
  const W = 1280;
  const H = 720;
  // Cámara ficticia F8 (perspectiva): proyecta el campo F8 (60×40) al frame.
  const f8Anchors = [
    { pixel: { px: 300, py: 200 }, field: { fx: 0, fy: 0 } },
    { pixel: { px: 980, py: 200 }, field: { fx: 60, fy: 0 } },
    { pixel: { px: 1150, py: 620 }, field: { fx: 60, fy: 40 } },
    { pixel: { px: 130, py: 620 }, field: { fx: 0, fy: 40 } },
  ];
  const Hf2p = computeHomography(f8Anchors); // field→pixel
  const f8 = templateForFormat("f8").template;
  // Puntos F8 bien separados proyectados a píxeles = "intersecciones detectadas".
  const picks = ["fc_tl", "fc_tr", "fc_br", "fc_bl", "center", "lps", "rps"];
  const pixels = picks.map((id) => {
    const tp = f8.find((p) => p.id === id)!;
    const p = fieldToPixel(Hf2p, tp.x, tp.y);
    return { x: p.px, y: p.py };
  });
  const centerPix = fieldToPixel(Hf2p, 30, 20);

  it("con F8 opts asigna coords de campo en el espacio F8", () => {
    const corr = matchToTemplate(pixels, W, H, templateForFormat("f8"));
    const nearest = corr.reduce((a, b) =>
      Math.hypot(b.pixel.x - centerPix.px, b.pixel.y - centerPix.py) <
      Math.hypot(a.pixel.x - centerPix.px, a.pixel.y - centerPix.py)
        ? b
        : a,
    );
    expect(nearest.field.x).toBeCloseTo(30, 0);
    expect(nearest.field.y).toBeCloseTo(20, 0);
    for (const c of corr) {
      expect(c.field.x).toBeLessThanOrEqual(60 + 1e-6);
      expect(c.field.y).toBeLessThanOrEqual(40 + 1e-6);
    }
  });

  it("con el DEFAULT (F11) las MISMAS píxeles caen en el espacio 105×68 (bug de escala)", () => {
    const corr = matchToTemplate(pixels, W, H); // default F11
    const maxX = Math.max(...corr.map((c) => c.field.x));
    expect(maxX).toBeGreaterThan(60); // prueba que el formato importa
  });

  it("recupera una homografía F8 correcta end-to-end", () => {
    const corr = matchToTemplate(pixels, W, H, templateForFormat("f8"));
    const res = computeHomographyRANSAC(
      corr.map((c) => ({ pixel: c.pixel, field: c.field })),
      200,
      5,
    );
    expect(res).not.toBeNull();
    const Hp2f = invertMatrix3x3(res!.H);
    const f = pixelToField(Hp2f, centerPix.px, centerPix.py);
    expect(f.fx).toBeCloseTo(30, 0);
    expect(f.fy).toBeCloseTo(20, 0);
  });

  it("el MISMO punto (centro) → F11 lo sitúa a ~1.75× la escala de F8 (metros inflados)", () => {
    // Métrica que de verdad importa, medida de forma DETERMINISTA (sin RANSAC, que usa
    // Math.random): el píxel del centro se empareja sin ambigüedad al punto "center" en
    // AMBOS formatos, así que sus coords de campo revelan la escala. Con la plantilla
    // equivocada (F11 sobre footage F8) el centro sale a (52.5,34) en vez de (30,20) →
    // distancias en metros infladas ~105/60=1.75× (largo) y ~68/40=1.70× (ancho).
    const nearestTo = (corr: ReturnType<typeof matchToTemplate>, px: { px: number; py: number }) =>
      corr.reduce((a, b) =>
        Math.hypot(b.pixel.x - px.px, b.pixel.y - px.py) < Math.hypot(a.pixel.x - px.px, a.pixel.y - px.py)
          ? b
          : a,
      );
    const c8 = nearestTo(matchToTemplate(pixels, W, H, templateForFormat("f8")), centerPix);
    const c11 = nearestTo(matchToTemplate(pixels, W, H), centerPix); // default F11
    expect([c8.field.x, c8.field.y]).toEqual([30, 20]);
    expect([c11.field.x, c11.field.y]).toEqual([52.5, 34]);
    expect(c11.field.x / c8.field.x).toBeCloseTo(1.75, 2);
    expect(c11.field.y / c8.field.y).toBeCloseTo(1.7, 2);
  });
});
