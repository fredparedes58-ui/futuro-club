/**
 * VITAS · Selección de FORMATO de campo (fútbol-11 / fútbol-8).
 *
 * El usuario elige el formato ANTES de empezar el análisis. Esa elección determina
 * internamente, de forma automática:
 *   - la PLANTILLA de landmarks (getFieldTemplate) → calibración correcta
 *   - las DIMENSIONES en metros (getFieldDimensions) → métricas físicas correctas
 *   - (a futuro) el MODELO de keypoints específico del formato
 *
 * Sin esto, un partido de fútbol-8 calibrado contra la plantilla de fútbol-11 daría
 * METROS ERRÓNEOS (velocidad, distancia) aunque las líneas encajaran.
 *
 * Persistencia: localStorage `vitas_field_format` (patrón de vitas_field_model /
 * vitas_ball_config). Debe fijarse por análisis; el UI obliga a elegir.
 */

import { FIELD_TEMPLATE, type FieldLandmark } from "./fieldRegistration";
import { FIELD_TEMPLATE_F8, FIELD_FORMATS, buildF8Template, type FieldFormat } from "./fieldFormats";

export type { FieldFormat } from "./fieldFormats";

const STORAGE_KEY = "vitas_field_format";
const DEFAULT_FORMAT: FieldFormat = "f11";

/** Formato activo elegido por el usuario (persistido). Default f11. */
export function getActiveFieldFormat(): FieldFormat {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "f8" || v === "f11") return v;
  } catch {
    /* SSR / storage no disponible */
  }
  return DEFAULT_FORMAT;
}

/** Fija el formato para los próximos análisis. */
export function setActiveFieldFormat(format: FieldFormat): void {
  try {
    localStorage.setItem(STORAGE_KEY, format);
  } catch {
    /* no-op */
  }
}

/**
 * Plantilla de landmarks del formato. Para fútbol-8, opcionalmente con las
 * dimensiones REALES del campo (metros) — si se conocen, mejoran la exactitud
 * métrica; si no, usa el nominal FFCV (60×40).
 */
export function getFieldTemplate(
  format: FieldFormat = getActiveFieldFormat(),
  f8Dims?: { length: number; width: number },
): readonly FieldLandmark[] {
  if (format === "f8") {
    return f8Dims ? buildF8Template(f8Dims.length, f8Dims.width) : FIELD_TEMPLATE_F8;
  }
  return FIELD_TEMPLATE;
}

/** Dimensiones nominales (metros) del formato — marco métrico. */
export function getFieldDimensions(format: FieldFormat = getActiveFieldFormat()): { length: number; width: number } {
  const f = FIELD_FORMATS[format];
  return { length: f.length, width: f.width };
}

/** Etiqueta legible del formato (para el UI). */
export function getFieldFormatLabel(format: FieldFormat = getActiveFieldFormat()): string {
  return FIELD_FORMATS[format].label;
}
