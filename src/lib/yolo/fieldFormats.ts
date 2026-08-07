/**
 * VITAS · Formatos de campo (fútbol-11 y fútbol-8).
 *
 * El fútbol-8 NO es un fútbol-11 escalado: tiene su propia geometría (área 24×9,
 * área pequeña 8×3, portería 6×2, círculo r=6) y sus campos VARÍAN (50-65 × 30-45 m,
 * FFCV). La calibración píxel→metros solo es correcta si la plantilla usada coincide
 * con el formato REAL del partido — por eso el pipeline debe ser "format-aware".
 *
 * Medidas fútbol-8: Reglamento FFCV (Federació de Futbol de la Comunitat Valenciana).
 * Fuentes: ffcv.es (Reglamento_F8.pdf), valenciabase.com.
 *
 * OJO: el modelo de keypoints actual (field-keypoints-s) está entrenado en
 * BROADCAST de fútbol-11 y detecta líneas de 11 (blancas). NO detecta la geometría
 * de fútbol-8 (líneas amarillas). Esta plantilla es el objetivo de etiquetado para
 * el modelo de fútbol-8 (campaña de fine-tune) y define el marco métrico correcto.
 */

import type { FieldLandmark } from "./fieldRegistration";

export type FieldFormat = "f11" | "f8";

// ─── Fútbol-8 (FFCV) ─────────────────────────────────────────────────────────
export const F8 = {
  // Rango reglamentario; para métricas fiables usar las dimensiones REALES del campo.
  lengthRange: [50, 65] as const,
  widthRange: [30, 45] as const,
  // Nominal por defecto (mid-range; los campos F8 sobre césped de 11 rondan esto).
  nominalLength: 60,
  nominalWidth: 40,
  centreCircleRadius: 6,
  penaltyAreaDepth: 9,
  penaltyAreaWidth: 24, // → media anchura 12 a cada lado del centro
  goalAreaDepth: 3,
  goalAreaWidth: 8, //   → media anchura 4
  penaltySpotDistance: 9,
  goalWidth: 6,
} as const;

/**
 * Construye la plantilla de 28 landmarks de fútbol-8 para unas dimensiones dadas.
 * Orden por convención (izq→der, arriba→abajo), simétrico horizontal para permitir
 * flip_idx limpio en el entrenamiento. Cambia L/W a las medidas reales del campo
 * para que los metros sean correctos.
 */
export function buildF8Template(L: number = F8.nominalLength, W: number = F8.nominalWidth): FieldLandmark[] {
  const cy = W / 2;
  const PA = F8.penaltyAreaWidth / 2; // 12
  const GA = F8.goalAreaWidth / 2; //    4
  const PAD = F8.penaltyAreaDepth; //    9
  const GAD = F8.goalAreaDepth; //       3
  const SPOT = F8.penaltySpotDistance; //9
  const R = F8.centreCircleRadius; //    6
  return [
    // Línea de gol izquierda (x=0)
    { id: 0, name: "f8_left_goalline_top_corner", field: { fx: 0, fy: 0 } },
    { id: 1, name: "f8_left_goalline_penaltybox_top", field: { fx: 0, fy: cy - PA } },
    { id: 2, name: "f8_left_goalline_goalbox_top", field: { fx: 0, fy: cy - GA } },
    { id: 3, name: "f8_left_goalline_goalbox_bot", field: { fx: 0, fy: cy + GA } },
    { id: 4, name: "f8_left_goalline_penaltybox_bot", field: { fx: 0, fy: cy + PA } },
    { id: 5, name: "f8_left_goalline_bot_corner", field: { fx: 0, fy: W } },
    // Área izquierda hacia el campo
    { id: 6, name: "f8_left_goalbox_top", field: { fx: GAD, fy: cy - GA } },
    { id: 7, name: "f8_left_goalbox_bot", field: { fx: GAD, fy: cy + GA } },
    { id: 8, name: "f8_left_penalty_spot", field: { fx: SPOT, fy: cy } },
    { id: 9, name: "f8_left_penaltybox_top", field: { fx: PAD, fy: cy - PA } },
    { id: 10, name: "f8_left_penaltybox_bot", field: { fx: PAD, fy: cy + PA } },
    // Línea media + círculo central (x=L/2)
    { id: 11, name: "f8_halfway_top", field: { fx: L / 2, fy: 0 } },
    { id: 12, name: "f8_centre_circle_top", field: { fx: L / 2, fy: cy - R } },
    { id: 13, name: "f8_centre_circle_bot", field: { fx: L / 2, fy: cy + R } },
    { id: 14, name: "f8_halfway_bot", field: { fx: L / 2, fy: W } },
    { id: 15, name: "f8_centre_circle_left", field: { fx: L / 2 - R, fy: cy } },
    { id: 16, name: "f8_centre_circle_right", field: { fx: L / 2 + R, fy: cy } },
    // Área derecha hacia el campo
    { id: 17, name: "f8_right_penaltybox_top", field: { fx: L - PAD, fy: cy - PA } },
    { id: 18, name: "f8_right_penalty_spot", field: { fx: L - SPOT, fy: cy } },
    { id: 19, name: "f8_right_penaltybox_bot", field: { fx: L - PAD, fy: cy + PA } },
    { id: 20, name: "f8_right_goalbox_top", field: { fx: L - GAD, fy: cy - GA } },
    { id: 21, name: "f8_right_goalbox_bot", field: { fx: L - GAD, fy: cy + GA } },
    // Línea de gol derecha (x=L)
    { id: 22, name: "f8_right_goalline_top_corner", field: { fx: L, fy: 0 } },
    { id: 23, name: "f8_right_goalline_penaltybox_top", field: { fx: L, fy: cy - PA } },
    { id: 24, name: "f8_right_goalline_goalbox_top", field: { fx: L, fy: cy - GA } },
    { id: 25, name: "f8_right_goalline_goalbox_bot", field: { fx: L, fy: cy + GA } },
    { id: 26, name: "f8_right_goalline_penaltybox_bot", field: { fx: L, fy: cy + PA } },
    { id: 27, name: "f8_right_goalline_bot_corner", field: { fx: L, fy: W } },
  ];
}

/** Espejo horizontal (x→L-x) de la plantilla F8 — flip_idx para entrenar. */
export const F8_FLIP_IDX = [
  22, 23, 24, 25, 26, 27, // 0-5 ↔ línea de gol derecha
  20, 21, 18, 17, 19, //     6,7↔20,21 · 8↔18 · 9↔17 · 10↔19
  11, 12, 13, 14, 16, 15, // 11-14 sobre eje → sí mismos · 15↔16
  9, 8, 10, 6, 7, //         17↔9 · 18↔8 · 19↔10 · 20↔6 · 21↔7
  0, 1, 2, 3, 4, 5, //       22-27 ↔ línea de gol izquierda
];

export const FIELD_TEMPLATE_F8: readonly FieldLandmark[] = buildF8Template();

/** Metadatos por formato (dimensiones nominales para el marco métrico). */
export const FIELD_FORMATS: Record<FieldFormat, { length: number; width: number; keypoints: number; label: string }> = {
  f11: { length: 105, width: 68, keypoints: 32, label: "Fútbol 11" },
  f8: { length: F8.nominalLength, width: F8.nominalWidth, keypoints: FIELD_TEMPLATE_F8.length, label: "Fútbol 8" },
};
