/**
 * Tests de homographyValidator FORMAT-AWARE + SCALE-PRIOR (#20).
 *
 * El chequeo de "dimensions" actúa como scale-prior: verifica que el campo visible
 * tiene una escala plausible para el FORMATO (rangos relativos a L×Wd, no fijos a
 * 105×68). Rechaza homografías con escala absurda (degeneradas / plantilla equivocada).
 */

import { describe, it, expect } from "vitest";
import { computeHomography, invertMatrix3x3 } from "@/lib/yolo/homography";
import { validateHomography } from "@/lib/tracking/homographyValidator";

const W = 1280;
const H = 720;

/** Homografía plausible de un campo F8 (60×40) visto en perspectiva. */
function f8H() {
  const anchors = [
    { pixel: { px: 300, py: 200 }, field: { fx: 0, fy: 0 } },
    { pixel: { px: 980, py: 200 }, field: { fx: 60, fy: 0 } },
    { pixel: { px: 1150, py: 620 }, field: { fx: 60, fy: 40 } },
    { pixel: { px: 130, py: 620 }, field: { fx: 0, fy: 40 } },
  ];
  const Hf2p = computeHomography(anchors); // field→pixel
  return { Hp2f: invertMatrix3x3(Hf2p), Hf2p };
}

describe("validateHomography — scale-prior format-aware", () => {
  it("H de F8 validada con dims F8 → dimensiones OK y 'expected ~60×40'", () => {
    const { Hp2f, Hf2p } = f8H();
    const v = validateHomography(Hp2f, Hf2p, W, H, undefined, { fieldLength: 60, fieldWidth: 40 });
    const dim = v.checks.find((c) => c.name === "dimensions")!;
    expect(dim.passed).toBe(true);
    expect(dim.detail).toContain("60");
    expect(dim.detail).toContain("40");
  });

  it("el default sigue siendo F11 (105×68) — backward compat", () => {
    const { Hp2f, Hf2p } = f8H();
    const v = validateHomography(Hp2f, Hf2p, W, H);
    const dim = v.checks.find((c) => c.name === "dimensions")!;
    expect(dim.detail).toContain("105");
  });

  it("default === explícito {105,68}: comportamiento EXACTO previo (backward-compat)", () => {
    // Prueba que introducir opts no alteró NINGÚN check en el path por defecto.
    const { Hp2f, Hf2p } = f8H();
    const def = validateHomography(Hp2f, Hf2p, W, H);
    const explicit = validateHomography(Hp2f, Hf2p, W, H, undefined, { fieldLength: 105, fieldWidth: 68 });
    expect(def).toEqual(explicit);
  });

  it("contrato REAL (honesto) del scale-prior: un campo F8 válido PASA con dims F11", () => {
    // El prior es un límite LAXO: por sí solo NO detecta plantilla equivocada (un
    // campo F8 de ~60m cae dentro del rango F11). Se fija aquí para no dar falsa
    // confianza — la escala correcta la fija matchToTemplate, no este check.
    const { Hp2f, Hf2p } = f8H();
    const v = validateHomography(Hp2f, Hf2p, W, H); // dims F11 sobre un campo F8
    expect(v.checks.find((c) => c.name === "dimensions")!.passed).toBe(true);
  });

  it("scale-prior rechaza escala absurda (campo visible gigante)", () => {
    // 60m del campo mapeados a solo 10px → el frame completo abarca miles de metros.
    const anchors = [
      { pixel: { px: 635, py: 355 }, field: { fx: 0, fy: 0 } },
      { pixel: { px: 645, py: 355 }, field: { fx: 60, fy: 0 } },
      { pixel: { px: 645, py: 365 }, field: { fx: 60, fy: 40 } },
      { pixel: { px: 635, py: 365 }, field: { fx: 0, fy: 40 } },
    ];
    const Hf2p = computeHomography(anchors);
    const Hp2f = invertMatrix3x3(Hf2p);
    const v = validateHomography(Hp2f, Hf2p, W, H, undefined, { fieldLength: 60, fieldWidth: 40 });
    const dim = v.checks.find((c) => c.name === "dimensions")!;
    expect(dim.passed).toBe(false);
  });

  it("center_mapping usa el centro del FORMATO (F8: 30,20 · F11: 52.5,34)", () => {
    // Prueba que las dims del formato fluyen a los checks geométricos (no solo al
    // texto): el chequeo del centro evalúa (L/2, Wd/2) del formato, no 105/68 fijo.
    const { Hp2f, Hf2p } = f8H();
    const f8 = validateHomography(Hp2f, Hf2p, W, H, undefined, { fieldLength: 60, fieldWidth: 40 });
    const f11 = validateHomography(Hp2f, Hf2p, W, H);
    expect(f8.checks.find((c) => c.name === "center_mapping")!.detail).toContain("30.0");
    expect(f11.checks.find((c) => c.name === "center_mapping")!.detail).toContain("52.5");
  });
});
