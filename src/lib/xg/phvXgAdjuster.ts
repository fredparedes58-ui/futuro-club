/**
 * VITAS · PHV xG Adjuster (Sprint 6 — xG with PHV)
 *
 * Adjusts xG values based on player's biological maturity (PHV offset).
 *
 * Rationale:
 *   - Pre-PHV players (<-2 offset) have less physical power for long-range
 *     shots and headers. Their xG from distance should be lower.
 *   - Circa-PHV players (-2 to +1) are in growth spurt — coordination
 *     affected, slight xG reduction for complex shots.
 *   - Post-PHV players (>+1) — standard adult xG applies.
 *
 * These adjustments ensure the xG model doesn't overestimate youth players'
 * scoring probability from positions that require adult-level physicality.
 */

import type { XgResult } from "./xgModel";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MaturityBand = "pre_phv" | "circa_phv" | "post_phv";

export interface PhvXgAdjustment {
  /** Original xG */
  originalXg: number;
  /** Adjusted xG after PHV correction */
  adjustedXg: number;
  /** Multiplicative adjustment factor applied */
  adjustmentFactor: number;
  /** Player's maturity band */
  maturityBand: MaturityBand;
  /** PHV offset used */
  phvOffset: number;
  /** Human-readable explanation */
  explanation: string;
}

// ─── Maturity Band Classification ───────────────────────────────────────────

export function classifyMaturityBand(phvOffset: number): MaturityBand {
  if (phvOffset < -2) return "pre_phv";
  if (phvOffset <= 1) return "circa_phv";
  return "post_phv";
}

// ─── PHV Adjustment Factors ─────────────────────────────────────────────────

interface BandAdjustments {
  /** Multiplier for distance-based xG (shots > 15m) */
  distanceFactor: number;
  /** Multiplier for header xG */
  headerFactor: number;
  /** Multiplier for shots from acute angles */
  angleFactor: number;
  /** Overall xG floor (minimum xG won't go below this) */
  xgFloor: number;
}

const BAND_ADJUSTMENTS: Record<MaturityBand, BandAdjustments> = {
  pre_phv: {
    distanceFactor: 0.85, // 15% reduction for long-range
    headerFactor: 0.70,   // 30% reduction for headers
    angleFactor: 0.90,    // 10% reduction for tight angles
    xgFloor: 0.005,
  },
  circa_phv: {
    distanceFactor: 0.92, // 8% reduction
    headerFactor: 0.85,   // 15% reduction
    angleFactor: 0.95,    // 5% reduction
    xgFloor: 0.008,
  },
  post_phv: {
    distanceFactor: 1.00, // No adjustment
    headerFactor: 1.00,
    angleFactor: 1.00,
    xgFloor: 0.01,
  },
};

// ─── Distance / Angle Thresholds ────────────────────────────────────────────

/** Distance threshold: shots beyond this get the distance adjustment */
const LONG_RANGE_THRESHOLD_M = 15;

/** Angle threshold: shots with goal angle below this get the angle adjustment */
const TIGHT_ANGLE_THRESHOLD_RAD = 0.2; // ~11.5 degrees

// ─── Main Adjustment Function ───────────────────────────────────────────────

/**
 * Apply PHV-based adjustment to an xG result.
 *
 * @param xgResult - Original xG computation result
 * @param phvOffset - Player's PHV offset (years from peak height velocity)
 * @param shotType - "foot" or "header"
 * @returns PhvXgAdjustment with adjusted xG and explanation
 */
export function adjustXgForPhv(
  xgResult: XgResult,
  phvOffset: number,
  shotType: "foot" | "header" = "foot",
): PhvXgAdjustment {
  const band = classifyMaturityBand(phvOffset);
  const adj = BAND_ADJUSTMENTS[band];

  let factor = 1.0;
  const reasons: string[] = [];

  // Distance adjustment
  if (xgResult.distanceM > LONG_RANGE_THRESHOLD_M) {
    factor *= adj.distanceFactor;
    if (adj.distanceFactor < 1.0) {
      reasons.push(`dist>${LONG_RANGE_THRESHOLD_M}m (×${adj.distanceFactor})`);
    }
  }

  // Header adjustment
  if (shotType === "header") {
    factor *= adj.headerFactor;
    if (adj.headerFactor < 1.0) {
      reasons.push(`header (×${adj.headerFactor})`);
    }
  }

  // Tight angle adjustment
  if (xgResult.angleRad < TIGHT_ANGLE_THRESHOLD_RAD) {
    factor *= adj.angleFactor;
    if (adj.angleFactor < 1.0) {
      reasons.push(`tight angle (×${adj.angleFactor})`);
    }
  }

  const adjustedXg = Math.max(adj.xgFloor, xgResult.xg * factor);

  const explanation = band === "post_phv"
    ? "Sin ajuste PHV — madurez post-PHV (estándar adulto)"
    : reasons.length > 0
      ? `Ajuste ${band.replace("_", "-")}: ${reasons.join(", ")}`
      : `Sin ajuste específico para ${band.replace("_", "-")}`;

  return {
    originalXg: xgResult.xg,
    adjustedXg: Math.round(adjustedXg * 1000) / 1000,
    adjustmentFactor: Math.round(factor * 1000) / 1000,
    maturityBand: band,
    phvOffset,
    explanation,
  };
}

/**
 * Quick PHV-adjusted xG from position only (no ShotContext).
 * Used by event detection engine for real-time xG annotation.
 *
 * @param xg - Base xG value
 * @param distanceM - Distance to goal in meters
 * @param phvOffset - PHV offset (null = no adjustment)
 * @param isHeader - Whether the shot is a header
 * @returns Adjusted xG value
 */
export function quickPhvXgAdjust(
  xg: number,
  distanceM: number,
  phvOffset: number | null,
  isHeader: boolean = false,
): number {
  if (phvOffset === null) return xg;

  const band = classifyMaturityBand(phvOffset);
  const adj = BAND_ADJUSTMENTS[band];

  let factor = 1.0;
  if (distanceM > LONG_RANGE_THRESHOLD_M) factor *= adj.distanceFactor;
  if (isHeader) factor *= adj.headerFactor;

  return Math.max(adj.xgFloor, xg * factor);
}
