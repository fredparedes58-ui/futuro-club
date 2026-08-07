/**
 * Tests de los FORMATOS de campo (fútbol-8 / fútbol-11) y la calibración
 * format-aware. Verifica la plantilla F8 (FFCV), su simetría de flip, y que
 * registerFieldFromLandmarks calibra correctamente cuando se le pasa la plantilla
 * del formato elegido (round-trip con homografía sintética).
 */
import { describe, it, expect } from "vitest";
import {
  buildF8Template,
  FIELD_TEMPLATE_F8,
  F8_FLIP_IDX,
  F8,
  FIELD_FORMATS,
} from "@/lib/yolo/fieldFormats";
import { getFieldTemplate, getFieldDimensions } from "@/lib/yolo/fieldFormatConfig";
import { FIELD_TEMPLATE, registerFieldFromLandmarks, type DetectedLandmark } from "@/lib/yolo/fieldRegistration";
import { computeHomography, fieldToPixel } from "@/lib/yolo/homography";

describe("Formato fútbol-8 (FFCV)", () => {
  it("plantilla F8 tiene 28 landmarks con dimensiones FFCV", () => {
    expect(FIELD_TEMPLATE_F8).toHaveLength(28);
    const L = Math.max(...FIELD_TEMPLATE_F8.map((l) => l.field.fx));
    const W = Math.max(...FIELD_TEMPLATE_F8.map((l) => l.field.fy));
    expect(L).toBe(F8.nominalLength); // 60
    expect(W).toBe(F8.nominalWidth); // 40
    // área grande 24 de ancho → top/bot a cy∓12
    const paTop = FIELD_TEMPLATE_F8.find((l) => l.id === 9)!;
    expect(paTop.field.fx).toBe(F8.penaltyAreaDepth); // 9
    expect(paTop.field.fy).toBe(W / 2 - F8.penaltyAreaWidth / 2); // 20-12=8
  });

  it("F8_FLIP_IDX es el espejo horizontal exacto (x→L-x) de la plantilla", () => {
    const t = buildF8Template(); // L=60, W=40
    const L = 60;
    const byPos = (fx: number, fy: number) =>
      t.find((l) => Math.abs(l.field.fx - fx) < 1e-6 && Math.abs(l.field.fy - fy) < 1e-6);
    const derived = t.map((l) => byPos(L - l.field.fx, l.field.fy)?.id ?? -1);
    expect(derived).toEqual(F8_FLIP_IDX);
    expect(F8_FLIP_IDX).toHaveLength(28);
  });

  it("getFieldTemplate/getFieldDimensions seleccionan por formato", () => {
    expect(getFieldTemplate("f11")).toBe(FIELD_TEMPLATE);
    expect(getFieldTemplate("f8")).toBe(FIELD_TEMPLATE_F8);
    expect(getFieldDimensions("f8")).toEqual({ length: 60, width: 40 });
    expect(getFieldDimensions("f11")).toEqual({ length: 105, width: 68 });
    expect(FIELD_FORMATS.f8.keypoints).toBe(28);
  });

  it("buildF8Template con dimensiones reales del campo reescala el marco métrico", () => {
    const t = buildF8Template(65, 45); // campo F8 grande
    expect(Math.max(...t.map((l) => l.field.fx))).toBe(65);
    expect(Math.max(...t.map((l) => l.field.fy))).toBe(45);
  });

  it("calibración format-aware: registra un campo F8 con su plantilla (round-trip)", () => {
    // Cámara ficticia mirando un campo F8 (60×40) en perspectiva (trapecio).
    const H = computeHomography([
      { pixel: { px: 260, py: 210 }, field: { fx: 0, fy: 0 } },
      { pixel: { px: 1020, py: 210 }, field: { fx: 60, fy: 0 } },
      { pixel: { px: 1180, py: 610 }, field: { fx: 60, fy: 40 } },
      { pixel: { px: 110, py: 610 }, field: { fx: 0, fy: 40 } },
    ]);
    // Detecciones sintéticas: proyectar cada landmark F8 por H.
    const dets: DetectedLandmark[] = FIELD_TEMPLATE_F8.map((l) => {
      const p = fieldToPixel(H, l.field.fx, l.field.fy);
      return { id: l.id, px: p.px, py: p.py, confidence: 1 };
    });
    const reg = registerFieldFromLandmarks(dets, { template: FIELD_TEMPLATE_F8 });
    expect(reg.confidence).toBe("high");
    expect(reg.Hpix2field).not.toBeNull();
    // El centro del campo F8 (30,20) debe reproyectar cerca de su píxel real.
    const centerPx = fieldToPixel(H, 30, 20);
    const back = fieldToPixel(reg.Hfield2pix!, 30, 20);
    expect(Math.hypot(back.px - centerPx.px, back.py - centerPx.py)).toBeLessThan(2);
  });

  it("usar la plantilla EQUIVOCADA (F11) sobre detecciones F8 no da alta confianza", () => {
    const H = computeHomography([
      { pixel: { px: 260, py: 210 }, field: { fx: 0, fy: 0 } },
      { pixel: { px: 1020, py: 210 }, field: { fx: 60, fy: 0 } },
      { pixel: { px: 1180, py: 610 }, field: { fx: 60, fy: 40 } },
      { pixel: { px: 110, py: 610 }, field: { fx: 0, fy: 40 } },
    ]);
    // Detecciones con ids F8 pero interpretadas con la plantilla F11 (coords erróneas).
    const dets: DetectedLandmark[] = FIELD_TEMPLATE_F8.map((l) => {
      const p = fieldToPixel(H, l.field.fx, l.field.fy);
      return { id: l.id, px: p.px, py: p.py, confidence: 1 };
    });
    const reg = registerFieldFromLandmarks(dets, { template: FIELD_TEMPLATE }); // F11 ❌
    expect(reg.confidence).not.toBe("high");
  });
});
