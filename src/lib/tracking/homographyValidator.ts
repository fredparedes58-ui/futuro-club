/**
 * VITAS · Homography Validator (Sprint 5 — Auto Homography)
 *
 * Validates computed homography matrices for correctness:
 *   1. Determinant sign (must be positive for proper transform)
 *   2. Corner reprojection (field corners map to within image bounds)
 *   3. Dimension sanity (field dimensions approximately 105×68m)
 *   4. Ball position validation (>80% inside field when available)
 *
 * Returns a confidence score and list of issues found.
 */

import { pixelToField, fieldToPixel } from "@/lib/yolo/homography";
import { FIELD_LENGTH, FIELD_WIDTH } from "./fieldTemplateMatch";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HomographyValidation {
  /** Overall validity (true if all critical checks pass) */
  valid: boolean;
  /** Confidence score 0-1 */
  confidence: number;
  /** Individual check results */
  checks: ValidationCheck[];
  /** Human-readable issues */
  issues: string[];
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  score: number;
  detail: string;
}

// ─── Validator ──────────────────────────────────────────────────────────────

/**
 * Validate a homography matrix for correctness.
 *
 * @param H - 3×3 homography matrix (row-major Float64Array)
 * @param Hinv - Inverse homography
 * @param imageWidth - Source image width in pixels
 * @param imageHeight - Source image height in pixels
 * @param ballPositions - Optional ball field positions for cross-validation
 * @param opts - Dimensiones del FORMATO (metros). Default FIFA 11 (105×68). Para
 *   fútbol-8 pásale {fieldLength, fieldWidth} → el chequeo de dimensiones actúa como
 *   SCALE-PRIOR correcto (rechaza homografías con escala implausible para el formato).
 */
export function validateHomography(
  H: Float64Array,
  Hinv: Float64Array,
  imageWidth: number,
  imageHeight: number,
  ballPositions?: Array<{ x: number; y: number }>,
  opts: { fieldLength?: number; fieldWidth?: number } = {},
): HomographyValidation {
  const checks: ValidationCheck[] = [];
  const issues: string[] = [];
  const L = opts.fieldLength ?? FIELD_LENGTH;
  const Wd = opts.fieldWidth ?? FIELD_WIDTH;

  // ── Check 1: Determinant sign ──
  const det = H[0] * (H[4] * H[8] - H[5] * H[7])
            - H[1] * (H[3] * H[8] - H[5] * H[6])
            + H[2] * (H[3] * H[7] - H[4] * H[6]);

  const detPositive = det > 0;
  checks.push({
    name: "determinant",
    passed: detPositive,
    score: detPositive ? 1 : 0,
    detail: `det(H) = ${det.toFixed(6)} (${detPositive ? "positive ✓" : "negative ✗"})`,
  });
  if (!detPositive) issues.push("Determinante negativo: la transformación invierte la orientación");

  // ── Check 2: Field corners reproject to within image bounds ──
  const fieldCorners = [
    { fx: 0, fy: 0 },
    { fx: L, fy: 0 },
    { fx: L, fy: Wd },
    { fx: 0, fy: Wd },
  ];

  let cornersInImage = 0;
  const margin = 0.2; // Allow 20% outside image bounds
  for (const fc of fieldCorners) {
    const px = fieldToPixel(Hinv, fc.fx, fc.fy);
    const inBounds =
      px.px >= -imageWidth * margin &&
      px.px <= imageWidth * (1 + margin) &&
      px.py >= -imageHeight * margin &&
      px.py <= imageHeight * (1 + margin);
    if (inBounds) cornersInImage++;
  }

  const cornerScore = cornersInImage / 4;
  checks.push({
    name: "corner_reprojection",
    passed: cornersInImage >= 2,
    score: cornerScore,
    detail: `${cornersInImage}/4 field corners reproject within image bounds`,
  });
  if (cornersInImage < 2) issues.push("Menos de 2 esquinas del campo caen dentro de la imagen");

  // ── Check 3: Dimension sanity ──
  // Map image corners to field and check if dimensions are reasonable
  const imgCenter = pixelToField(H, imageWidth / 2, imageHeight / 2);
  const imgTopLeft = pixelToField(H, 0, 0);
  const imgBottomRight = pixelToField(H, imageWidth, imageHeight);

  const fieldW = Math.abs(imgBottomRight.fx - imgTopLeft.fx);
  const fieldH = Math.abs(imgBottomRight.fy - imgTopLeft.fy);

  // SCALE-PRIOR (format-aware): el campo visible en el frame debe tener una escala
  // plausible para el FORMATO. Las cotas se derivan de las ABSOLUTAS históricas de
  // F11 (10–250m largo, 10–200m ancho) escaladas por L/105 y Wd/68 → con el default
  // F11 son EXACTAMENTE las de antes (backward-compat), y escalan proporcionalmente a
  // F8. Rechaza escalas absurdas (degeneradas / plantilla muy equivocada). Es un
  // límite LAXO de plausibilidad: un campo F8 real (~60m) todavía cae dentro del
  // rango F11, así que por sí solo NO discrimina el formato — la escala correcta la
  // fija matchToTemplate; el discriminador fuerte es lineSupport.
  const sL = L / FIELD_LENGTH;
  const sW = Wd / FIELD_WIDTH;
  const dimOk = fieldW > 10 * sL && fieldW < 250 * sL && fieldH > 10 * sW && fieldH < 200 * sW;
  const dimScore = dimOk ? Math.min(1.0, 1.0 - Math.abs(fieldW - L) / L * 0.5) : 0;

  checks.push({
    name: "dimensions",
    passed: dimOk,
    score: Math.max(0, dimScore),
    detail: `Visible field: ${fieldW.toFixed(1)}m × ${fieldH.toFixed(1)}m (expected ~${L}×${Wd})`,
  });
  if (!dimOk) issues.push(`Dimensiones de campo implausibles: ${fieldW.toFixed(0)}m × ${fieldH.toFixed(0)}m`);

  // ── Check 4: Center field maps to reasonable location ──
  const centerPixel = fieldToPixel(Hinv, L / 2, Wd / 2);
  const centerInImage =
    centerPixel.px >= -imageWidth * 0.5 &&
    centerPixel.px <= imageWidth * 1.5 &&
    centerPixel.py >= -imageHeight * 0.5 &&
    centerPixel.py <= imageHeight * 1.5;

  checks.push({
    name: "center_mapping",
    passed: centerInImage,
    score: centerInImage ? 1 : 0,
    detail: `Center field (${(L / 2).toFixed(1)}, ${(Wd / 2).toFixed(1)}) → pixel (${centerPixel.px.toFixed(0)}, ${centerPixel.py.toFixed(0)})`,
  });
  if (!centerInImage) issues.push("El centro del campo no se proyecta dentro de la imagen");

  // ── Check 5: Finite values (no NaN/Infinity) ──
  const allFinite = Array.from(H).every(v => isFinite(v)) && Array.from(Hinv).every(v => isFinite(v));
  checks.push({
    name: "finite_values",
    passed: allFinite,
    score: allFinite ? 1 : 0,
    detail: allFinite ? "All matrix values finite" : "NaN or Infinity in matrix",
  });
  if (!allFinite) issues.push("La matriz contiene valores NaN o Infinito");

  // ── Check 6: Ball positions inside field (if available) ──
  if (ballPositions && ballPositions.length > 0) {
    let insideCount = 0;
    for (const bp of ballPositions) {
      const inField =
        bp.x >= -5 && bp.x <= L + 5 &&
        bp.y >= -5 && bp.y <= Wd + 5;
      if (inField) insideCount++;
    }
    const ballRatio = insideCount / ballPositions.length;
    const ballOk = ballRatio >= 0.8;

    checks.push({
      name: "ball_inside_field",
      passed: ballOk,
      score: ballRatio,
      detail: `${insideCount}/${ballPositions.length} ball positions inside field (${(ballRatio * 100).toFixed(0)}%)`,
    });
    if (!ballOk) issues.push(`Solo ${(ballRatio * 100).toFixed(0)}% de posiciones de pelota dentro del campo (min 80%)`);
  }

  // ── Aggregate score ──
  const criticalPassed = checks
    .filter(c => ["determinant", "finite_values"].includes(c.name))
    .every(c => c.passed);

  const avgScore = checks.reduce((s, c) => s + c.score, 0) / checks.length;
  const confidence = criticalPassed ? avgScore : avgScore * 0.3;

  return {
    valid: criticalPassed && avgScore > 0.4,
    confidence: Math.round(confidence * 100) / 100,
    checks,
    issues,
  };
}

/**
 * Quick validation for RANSAC: just check if a homography is degenerate.
 * Faster than full validation — used during RANSAC iterations.
 */
export function isHomographyDegenerate(H: Float64Array): boolean {
  // Check for NaN/Infinity
  for (let i = 0; i < 9; i++) {
    if (!isFinite(H[i])) return true;
  }

  // Check determinant is positive and not too small
  const det = H[0] * (H[4] * H[8] - H[5] * H[7])
            - H[1] * (H[3] * H[8] - H[5] * H[6])
            + H[2] * (H[3] * H[7] - H[4] * H[6]);

  if (det <= 1e-10) return true;

  // Check h8 is not too small (would indicate near-singular)
  if (Math.abs(H[8]) < 1e-10) return true;

  return false;
}
