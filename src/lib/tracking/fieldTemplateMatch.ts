/**
 * VITAS · FIFA Field Template Matching (Sprint 5 — Auto Homography)
 *
 * Defines a standard FIFA 105×68m field template with ~30 reference points
 * (corners, penalty areas, center circle, penalty spots, goal areas).
 *
 * Provides a scoring function to find the best correspondence between
 * detected line intersections and template reference points.
 *
 * FORMAT-AWARE (T4/#20): matchToTemplate acepta la plantilla + dimensiones del
 * FORMATO activo. Un partido de fútbol-8 emparejado contra la plantilla de 11
 * (105×68) produce correspondencias en metros ERRÓNEAS → homografía con escala
 * ~1.75× → métricas físicas infladas. Con la plantilla F8 correcta (60×40 nominal
 * o las dims reales del campo) la escala es correcta.
 */

import { F8, type FieldFormat } from "@/lib/yolo/fieldFormats";

// ─── FIFA Standard Field Dimensions (meters) ─────────────────────────────

export const FIELD_LENGTH = 105;
export const FIELD_WIDTH = 68;

/** All reference points on a FIFA standard field (meters from top-left corner) */
export interface FieldReferencePoint {
  /** Point ID for matching */
  id: string;
  /** X position in meters (0 = left goal line, 105 = right goal line) */
  x: number;
  /** Y position in meters (0 = top sideline, 68 = bottom sideline) */
  y: number;
  /** What type of landmark this point represents */
  type: FieldLandmarkType;
}

export type FieldLandmarkType =
  | "field_corner"
  | "penalty_area_corner"
  | "goal_area_corner"
  | "center_circle_top"
  | "center_circle_bottom"
  | "center_mark"
  | "penalty_spot"
  | "goal_post"
  | "halfway_sideline";

// ─── Template Points ─────────────────────────────────────────────────────

/** Penalty area dimensions: 40.32m wide × 16.5m deep */
const PA_WIDTH_HALF = 40.32 / 2; // 20.16m from center
const PA_DEPTH = 16.5;

/** Goal area: 18.32m wide × 5.5m deep */
const GA_WIDTH_HALF = 18.32 / 2; // 9.16m from center
const GA_DEPTH = 5.5;

/** Center circle radius: 9.15m */
const CENTER_RADIUS = 9.15;

/** Goal posts: 7.32m apart, centered on goal line */
const GOAL_WIDTH_HALF = 7.32 / 2;

/** Penalty spot distance from goal line: 11m */
const PENALTY_SPOT = 11;

const CENTER_Y = FIELD_WIDTH / 2; // 34m
const CENTER_X = FIELD_LENGTH / 2; // 52.5m

export const FIFA_TEMPLATE_POINTS: FieldReferencePoint[] = [
  // ── Field corners (4) ──
  { id: "fc_tl", x: 0, y: 0, type: "field_corner" },
  { id: "fc_tr", x: FIELD_LENGTH, y: 0, type: "field_corner" },
  { id: "fc_br", x: FIELD_LENGTH, y: FIELD_WIDTH, type: "field_corner" },
  { id: "fc_bl", x: 0, y: FIELD_WIDTH, type: "field_corner" },

  // ── Halfway line × sidelines (2) ──
  { id: "hw_top", x: CENTER_X, y: 0, type: "halfway_sideline" },
  { id: "hw_bot", x: CENTER_X, y: FIELD_WIDTH, type: "halfway_sideline" },

  // ── Center ──
  { id: "center", x: CENTER_X, y: CENTER_Y, type: "center_mark" },
  { id: "cc_top", x: CENTER_X, y: CENTER_Y - CENTER_RADIUS, type: "center_circle_top" },
  { id: "cc_bot", x: CENTER_X, y: CENTER_Y + CENTER_RADIUS, type: "center_circle_bottom" },

  // ── Left penalty area (4 corners) ──
  { id: "lpa_tl", x: 0, y: CENTER_Y - PA_WIDTH_HALF, type: "penalty_area_corner" },
  { id: "lpa_tr", x: PA_DEPTH, y: CENTER_Y - PA_WIDTH_HALF, type: "penalty_area_corner" },
  { id: "lpa_br", x: PA_DEPTH, y: CENTER_Y + PA_WIDTH_HALF, type: "penalty_area_corner" },
  { id: "lpa_bl", x: 0, y: CENTER_Y + PA_WIDTH_HALF, type: "penalty_area_corner" },

  // ── Right penalty area (4 corners) ──
  { id: "rpa_tl", x: FIELD_LENGTH - PA_DEPTH, y: CENTER_Y - PA_WIDTH_HALF, type: "penalty_area_corner" },
  { id: "rpa_tr", x: FIELD_LENGTH, y: CENTER_Y - PA_WIDTH_HALF, type: "penalty_area_corner" },
  { id: "rpa_br", x: FIELD_LENGTH, y: CENTER_Y + PA_WIDTH_HALF, type: "penalty_area_corner" },
  { id: "rpa_bl", x: FIELD_LENGTH - PA_DEPTH, y: CENTER_Y + PA_WIDTH_HALF, type: "penalty_area_corner" },

  // ── Left goal area (4 corners) ──
  { id: "lga_tl", x: 0, y: CENTER_Y - GA_WIDTH_HALF, type: "goal_area_corner" },
  { id: "lga_tr", x: GA_DEPTH, y: CENTER_Y - GA_WIDTH_HALF, type: "goal_area_corner" },
  { id: "lga_br", x: GA_DEPTH, y: CENTER_Y + GA_WIDTH_HALF, type: "goal_area_corner" },
  { id: "lga_bl", x: 0, y: CENTER_Y + GA_WIDTH_HALF, type: "goal_area_corner" },

  // ── Right goal area (4 corners) ──
  { id: "rga_tl", x: FIELD_LENGTH - GA_DEPTH, y: CENTER_Y - GA_WIDTH_HALF, type: "goal_area_corner" },
  { id: "rga_tr", x: FIELD_LENGTH, y: CENTER_Y - GA_WIDTH_HALF, type: "goal_area_corner" },
  { id: "rga_br", x: FIELD_LENGTH, y: CENTER_Y + GA_WIDTH_HALF, type: "goal_area_corner" },
  { id: "rga_bl", x: FIELD_LENGTH - GA_DEPTH, y: CENTER_Y + GA_WIDTH_HALF, type: "goal_area_corner" },

  // ── Penalty spots (2) ──
  { id: "lps", x: PENALTY_SPOT, y: CENTER_Y, type: "penalty_spot" },
  { id: "rps", x: FIELD_LENGTH - PENALTY_SPOT, y: CENTER_Y, type: "penalty_spot" },

  // ── Goal posts (4) ──
  { id: "lgp_t", x: 0, y: CENTER_Y - GOAL_WIDTH_HALF, type: "goal_post" },
  { id: "lgp_b", x: 0, y: CENTER_Y + GOAL_WIDTH_HALF, type: "goal_post" },
  { id: "rgp_t", x: FIELD_LENGTH, y: CENTER_Y - GOAL_WIDTH_HALF, type: "goal_post" },
  { id: "rgp_b", x: FIELD_LENGTH, y: CENTER_Y + GOAL_WIDTH_HALF, type: "goal_post" },
];

// ─── Fútbol-8 template (FFCV) ──────────────────────────────────────────────
// Misma estructura que FIFA_TEMPLATE_POINTS pero con la geometría de fútbol-8
// (área 24×9, área pequeña 8×3, círculo r6, spot 9m, portería 6m). Sus DIMENSIONES
// varían por campo (50-65×30-45) → se puede construir con las reales.

/** Construye los puntos de referencia F8 para unas dimensiones dadas (metros). */
export function buildF8TemplatePoints(
  L: number = F8.nominalLength,
  W: number = F8.nominalWidth,
): FieldReferencePoint[] {
  const cy = W / 2;
  const PA = F8.penaltyAreaWidth / 2; // 12
  const PAD = F8.penaltyAreaDepth; //    9
  const GA = F8.goalAreaWidth / 2; //    4
  const GAD = F8.goalAreaDepth; //       3
  const R = F8.centreCircleRadius; //    6
  const SPOT = F8.penaltySpotDistance; //9
  const GH = F8.goalWidth / 2; //        3
  return [
    { id: "fc_tl", x: 0, y: 0, type: "field_corner" },
    { id: "fc_tr", x: L, y: 0, type: "field_corner" },
    { id: "fc_br", x: L, y: W, type: "field_corner" },
    { id: "fc_bl", x: 0, y: W, type: "field_corner" },
    { id: "hw_top", x: L / 2, y: 0, type: "halfway_sideline" },
    { id: "hw_bot", x: L / 2, y: W, type: "halfway_sideline" },
    { id: "center", x: L / 2, y: cy, type: "center_mark" },
    { id: "cc_top", x: L / 2, y: cy - R, type: "center_circle_top" },
    { id: "cc_bot", x: L / 2, y: cy + R, type: "center_circle_bottom" },
    { id: "lpa_tl", x: 0, y: cy - PA, type: "penalty_area_corner" },
    { id: "lpa_tr", x: PAD, y: cy - PA, type: "penalty_area_corner" },
    { id: "lpa_br", x: PAD, y: cy + PA, type: "penalty_area_corner" },
    { id: "lpa_bl", x: 0, y: cy + PA, type: "penalty_area_corner" },
    { id: "rpa_tl", x: L - PAD, y: cy - PA, type: "penalty_area_corner" },
    { id: "rpa_tr", x: L, y: cy - PA, type: "penalty_area_corner" },
    { id: "rpa_br", x: L, y: cy + PA, type: "penalty_area_corner" },
    { id: "rpa_bl", x: L - PAD, y: cy + PA, type: "penalty_area_corner" },
    { id: "lga_tl", x: 0, y: cy - GA, type: "goal_area_corner" },
    { id: "lga_tr", x: GAD, y: cy - GA, type: "goal_area_corner" },
    { id: "lga_br", x: GAD, y: cy + GA, type: "goal_area_corner" },
    { id: "lga_bl", x: 0, y: cy + GA, type: "goal_area_corner" },
    { id: "rga_tl", x: L - GAD, y: cy - GA, type: "goal_area_corner" },
    { id: "rga_tr", x: L, y: cy - GA, type: "goal_area_corner" },
    { id: "rga_br", x: L, y: cy + GA, type: "goal_area_corner" },
    { id: "rga_bl", x: L - GAD, y: cy + GA, type: "goal_area_corner" },
    { id: "lps", x: SPOT, y: cy, type: "penalty_spot" },
    { id: "rps", x: L - SPOT, y: cy, type: "penalty_spot" },
    { id: "lgp_t", x: 0, y: cy - GH, type: "goal_post" },
    { id: "lgp_b", x: 0, y: cy + GH, type: "goal_post" },
    { id: "rgp_t", x: L, y: cy - GH, type: "goal_post" },
    { id: "rgp_b", x: L, y: cy + GH, type: "goal_post" },
  ];
}

/** Plantilla F8 nominal (60×40). */
export const F8_TEMPLATE_POINTS: FieldReferencePoint[] = buildF8TemplatePoints();

export interface FormatTemplate {
  template: FieldReferencePoint[];
  fieldLength: number;
  fieldWidth: number;
}

/**
 * Plantilla + dimensiones para el formato activo. F8 opcionalmente con las dims
 * reales del campo (mejor exactitud métrica). Pásalo a matchToTemplate/validateHomography.
 */
export function templateForFormat(
  format: FieldFormat,
  dims?: { length: number; width: number },
): FormatTemplate {
  if (format === "f8") {
    const L = dims?.length ?? F8.nominalLength;
    const W = dims?.width ?? F8.nominalWidth;
    return { template: buildF8TemplatePoints(L, W), fieldLength: L, fieldWidth: W };
  }
  return { template: FIFA_TEMPLATE_POINTS, fieldLength: FIELD_LENGTH, fieldWidth: FIELD_WIDTH };
}

// ─── Correspondence Types ─────────────────────────────────────────────────

export interface PointCorrespondence {
  /** Pixel coordinates (detected intersection) */
  pixel: { x: number; y: number };
  /** Field coordinates (matched template point, meters) */
  field: { x: number; y: number };
  /** Template point ID */
  templateId: string;
  /** Match quality (0-1) */
  score: number;
}

// ─── Template Matching ────────────────────────────────────────────────────

/**
 * Match detected intersections to FIFA template points.
 *
 * Strategy:
 *   1. Normalize detected points to [0,1] range
 *   2. For each detected point, find the nearest template point
 *   3. Score based on distance and structural consistency
 *
 * @param detectedPoints - Pixel coordinates of line intersections
 * @param imageWidth - Source image width
 * @param imageHeight - Source image height
 * @param opts - Plantilla + dimensiones del formato (default FIFA 11, 105×68).
 *               Para fútbol-8 usa templateForFormat("f8", dims).
 * @returns Sorted correspondences (best first)
 */
export function matchToTemplate(
  detectedPoints: Array<{ x: number; y: number }>,
  imageWidth: number,
  imageHeight: number,
  opts: { template?: FieldReferencePoint[]; fieldLength?: number; fieldWidth?: number } = {},
): PointCorrespondence[] {
  if (detectedPoints.length < 4) return [];

  const template = opts.template ?? FIFA_TEMPLATE_POINTS;
  const fL = opts.fieldLength ?? FIELD_LENGTH;
  const fW = opts.fieldWidth ?? FIELD_WIDTH;

  const correspondences: PointCorrespondence[] = [];
  const usedTemplate = new Set<string>();

  // Normalize detected points to [0, 1]
  const normalized = detectedPoints.map((p) => ({
    nx: p.x / imageWidth,
    ny: p.y / imageHeight,
    orig: p,
  }));

  // Normalize template points to [0, 1] (según las dimensiones del FORMATO)
  const templateNorm = template.map((tp) => ({
    nx: tp.x / fL,
    ny: tp.y / fW,
    ref: tp,
  }));

  // Greedy matching: for each detected point, find best template match
  // Build distance matrix and sort all pairs
  const pairs: Array<{ di: number; ti: number; dist: number }> = [];

  for (let di = 0; di < normalized.length; di++) {
    for (let ti = 0; ti < templateNorm.length; ti++) {
      const dx = normalized[di].nx - templateNorm[ti].nx;
      const dy = normalized[di].ny - templateNorm[ti].ny;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.3) { // Max 30% of image distance for a valid match
        pairs.push({ di, ti, dist });
      }
    }
  }

  // Sort by distance (best matches first)
  pairs.sort((a, b) => a.dist - b.dist);

  const usedDetected = new Set<number>();

  for (const { di, ti, dist } of pairs) {
    if (usedDetected.has(di) || usedTemplate.has(templateNorm[ti].ref.id)) continue;

    usedDetected.add(di);
    usedTemplate.add(templateNorm[ti].ref.id);

    const score = Math.max(0, 1.0 - dist * 3.0); // Linear score, 0 at dist=0.33

    correspondences.push({
      pixel: normalized[di].orig,
      field: { x: templateNorm[ti].ref.x, y: templateNorm[ti].ref.y },
      templateId: templateNorm[ti].ref.id,
      score,
    });
  }

  return correspondences.sort((a, b) => b.score - a.score);
}

/**
 * Score a set of correspondences for structural consistency.
 *
 * Checks:
 *   - At least 4 correspondences
 *   - Points span a reasonable area (not collinear)
 *   - Distance ratios between point pairs are consistent
 *
 * @returns 0-1 quality score
 */
export function scoreCorrespondences(
  correspondences: PointCorrespondence[],
): number {
  if (correspondences.length < 4) return 0;

  // Factor 1: Number of matches (more = better, diminishing returns)
  const countScore = Math.min(1.0, correspondences.length / 8);

  // Factor 2: Average match quality
  const avgScore =
    correspondences.reduce((s, c) => s + c.score, 0) / correspondences.length;

  // Factor 3: Spatial spread (points shouldn't be clustered)
  const pixelXs = correspondences.map((c) => c.pixel.x);
  const pixelYs = correspondences.map((c) => c.pixel.y);
  const xSpread = Math.max(...pixelXs) - Math.min(...pixelXs);
  const ySpread = Math.max(...pixelYs) - Math.min(...pixelYs);
  const maxDim = Math.max(
    ...correspondences.map((c) => Math.max(c.pixel.x, c.pixel.y)),
  );
  const spreadScore =
    maxDim > 0 ? Math.min(1.0, (xSpread * ySpread) / (maxDim * maxDim * 0.1)) : 0;

  return countScore * 0.3 + avgScore * 0.4 + spreadScore * 0.3;
}
