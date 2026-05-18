/**
 * VITAS · VSI Scoring Model (IA → 9/10)
 *
 * Deterministic scoring model that replaces Claude API for VSI calculation.
 * Claude only generates the TEXT report, not the score itself.
 *
 * This model is:
 *   - Reproducible: same input → always same output (no LLM randomness)
 *   - Auditable: every factor and weight is explicit
 *   - Trainable: weights can be tuned with real data from pilot academies
 *   - PHV-corrected: maturity offset adjusts the final score
 *
 * Architecture:
 *   Raw metrics → Feature extraction → Weighted scoring → PHV correction → VSI
 *
 * Future: replace the linear model with XGBoost trained on 500+ real evaluations
 */

/* ── Types ─────────────────────────────────────────────────────── */

export interface ScoringInput {
  /** Player info */
  player: {
    age: number;
    position: "Portero" | "Defensa" | "Mediocampista" | "Delantero";
    height?: number;
    weight?: number;
  };

  /** PHV maturity data */
  phv?: {
    category: "early" | "on-time" | "late";
    maturityOffset: number; // years from PHV
    maturityAge?: number;   // predicted adult equivalent age
  };

  /** Tracking metrics (if available) */
  tracking?: {
    maxSpeed: number;          // m/s
    avgSpeed: number;          // m/s
    distanceCovered: number;   // meters
    sprintCount: number;
    intensityZones?: {
      walk: number;   // % time
      jog: number;
      run: number;
      sprint: number;
    };
    scanCount?: number;
  };

  /** Video analysis metrics (if available) */
  video?: {
    qualityScore: number;      // 0-100 from videoQualityScore.ts
    framesAnalyzed: number;
    keypointConfidence: number; // avg confidence 0-1
  };

  /** Manual coach evaluation (if available) */
  coach?: {
    technicalScore: number;    // 1-10
    tacticalScore: number;     // 1-10
    physicalScore: number;     // 1-10
    mentalScore: number;       // 1-10
  };

  /** Data availability flags */
  dataFlags: {
    hasTracking: boolean;
    hasVideo: boolean;
    hasCoachEval: boolean;
    videoCount: number;
    trackingSessionCount: number;
  };
}

export interface ScoringOutput {
  /** Final VSI score (0-100) */
  vsi: number;
  /** Confidence level (0-100) */
  confidence: number;
  /** Breakdown by dimension */
  breakdown: {
    technical: { score: number; weight: number; source: string };
    physical: { score: number; weight: number; source: string };
    tactical: { score: number; weight: number; source: string };
    phvAdjustment: { score: number; weight: number; source: string };
    dataQuality: { score: number; weight: number; source: string };
  };
  /** PHV correction applied */
  phvCorrection: {
    applied: boolean;
    factor: number;
    rawVsi: number;
    correctedVsi: number;
  };
  /** What was evaluated and what wasn't */
  evaluated: string[];
  notEvaluated: { dimension: string; reason: string }[];
  /** Model version for reproducibility */
  modelVersion: string;
}

/* ── Position-specific benchmarks (age-adjusted) ───────────────── */

interface PositionBenchmark {
  maxSpeed: { p25: number; p50: number; p75: number; p90: number };
  avgSpeed: { p25: number; p50: number; p75: number; p90: number };
  distance: { p25: number; p50: number; p75: number; p90: number };
  sprints: { p25: number; p50: number; p75: number; p90: number };
}

// Benchmarks for U14-U17 youth football (from published research)
const BENCHMARKS: Record<string, PositionBenchmark> = {
  Portero: {
    maxSpeed: { p25: 5.5, p50: 6.2, p75: 6.8, p90: 7.5 },
    avgSpeed: { p25: 2.0, p50: 2.5, p75: 3.0, p90: 3.5 },
    distance: { p25: 3000, p50: 4000, p75: 5000, p90: 6000 },
    sprints: { p25: 2, p50: 4, p75: 6, p90: 10 },
  },
  Defensa: {
    maxSpeed: { p25: 6.5, p50: 7.2, p75: 7.8, p90: 8.5 },
    avgSpeed: { p25: 3.5, p50: 4.0, p75: 4.5, p90: 5.0 },
    distance: { p25: 7000, p50: 8000, p75: 9000, p90: 10000 },
    sprints: { p25: 5, p50: 8, p75: 12, p90: 16 },
  },
  Mediocampista: {
    maxSpeed: { p25: 6.8, p50: 7.5, p75: 8.2, p90: 8.8 },
    avgSpeed: { p25: 4.0, p50: 4.5, p75: 5.0, p90: 5.5 },
    distance: { p25: 8000, p50: 9000, p75: 10000, p90: 11000 },
    sprints: { p25: 6, p50: 10, p75: 14, p90: 18 },
  },
  Delantero: {
    maxSpeed: { p25: 7.0, p50: 7.8, p75: 8.5, p90: 9.2 },
    avgSpeed: { p25: 3.8, p50: 4.3, p75: 4.8, p90: 5.3 },
    distance: { p25: 7500, p50: 8500, p75: 9500, p90: 10500 },
    sprints: { p25: 8, p50: 12, p75: 16, p90: 22 },
  },
};

/* ── Scoring Weights ───────────────────────────────────────────── */

const WEIGHTS = {
  technical: 0.30,
  physical: 0.25,
  tactical: 0.20,
  phv: 0.15,
  dataQuality: 0.10,
} as const;

const MODEL_VERSION = "vsi-scoring-v1.0.0";

/* ── Helper: percentile to score ───────────────────────────────── */

function percentileScore(
  value: number,
  bench: { p25: number; p50: number; p75: number; p90: number },
): number {
  if (value <= bench.p25) return Math.max(10, (value / bench.p25) * 35);
  if (value <= bench.p50) return 35 + ((value - bench.p25) / (bench.p50 - bench.p25)) * 15;
  if (value <= bench.p75) return 50 + ((value - bench.p50) / (bench.p75 - bench.p50)) * 20;
  if (value <= bench.p90) return 70 + ((value - bench.p75) / (bench.p90 - bench.p75)) * 15;
  return Math.min(95, 85 + ((value - bench.p90) / bench.p90) * 30);
}

/* ── PHV Correction Factor ─────────────────────────────────────── */

function phvCorrectionFactor(
  phv?: ScoringInput["phv"],
): number {
  if (!phv) return 1.0;

  // Early developers: their physical metrics are inflated relative to talent
  // Late developers: their physical metrics underrepresent their potential
  switch (phv.category) {
    case "early":
      // Penalize slightly — current metrics overestimate long-term potential
      return 0.92 + Math.max(0, phv.maturityOffset * 0.02);
    case "late":
      // Boost — current metrics underestimate potential
      return 1.08 + Math.min(0.12, Math.abs(phv.maturityOffset) * 0.04);
    case "on-time":
    default:
      return 1.0;
  }
}

/* ── Confidence Calculation ────────────────────────────────────── */

function calculateConfidence(input: ScoringInput): number {
  let conf = 20; // Base confidence for having player info

  if (input.dataFlags.hasTracking) conf += 25;
  if (input.dataFlags.hasVideo) conf += 20;
  if (input.dataFlags.hasCoachEval) conf += 15;
  if (input.phv) conf += 10;
  if (input.dataFlags.videoCount >= 3) conf += 5;
  if (input.dataFlags.trackingSessionCount >= 2) conf += 5;

  return Math.min(100, conf);
}

/* ── Main Scoring Function ─────────────────────────────────────── */

export function calculateVSI(input: ScoringInput): ScoringOutput {
  const bench = BENCHMARKS[input.player.position] ?? BENCHMARKS.Mediocampista;
  const evaluated: string[] = [];
  const notEvaluated: { dimension: string; reason: string }[] = [];

  /* ── Physical score ────────────────────────────────────────── */
  let physicalScore = 50; // default if no data
  let physicalSource = "estimado (sin datos de tracking)";

  if (input.tracking) {
    const speedScore = percentileScore(input.tracking.maxSpeed, bench.maxSpeed);
    const enduranceScore = percentileScore(input.tracking.distanceCovered, bench.distance);
    const sprintScore = percentileScore(input.tracking.sprintCount, bench.sprints);
    const avgSpeedScore = percentileScore(input.tracking.avgSpeed, bench.avgSpeed);

    physicalScore = speedScore * 0.30 + enduranceScore * 0.25 + sprintScore * 0.25 + avgSpeedScore * 0.20;
    physicalSource = "tracking real";
    evaluated.push("velocidad_maxima", "resistencia", "sprints", "velocidad_media");
  } else {
    notEvaluated.push(
      { dimension: "velocidad_maxima", reason: "Sin sesión de tracking" },
      { dimension: "resistencia", reason: "Sin sesión de tracking" },
      { dimension: "sprints", reason: "Sin sesión de tracking" },
    );
  }

  /* ── Technical score ───────────────────────────────────────── */
  let technicalScore = 50;
  let technicalSource = "estimado (sin evaluación técnica)";

  if (input.coach) {
    technicalScore = input.coach.technicalScore * 10;
    technicalSource = "evaluación del entrenador";
    evaluated.push("tecnica", "control", "pase");
  } else if (input.video) {
    // Video gives partial technical insight
    technicalScore = 40 + (input.video.keypointConfidence * 20);
    technicalSource = "inferido de video (parcial)";
    evaluated.push("postura_corporal");
    notEvaluated.push(
      { dimension: "tecnica_balon", reason: "Requiere evaluación del entrenador" },
      { dimension: "pase_precision", reason: "Requiere evaluación del entrenador" },
    );
  } else {
    notEvaluated.push(
      { dimension: "tecnica", reason: "Sin video ni evaluación del entrenador" },
      { dimension: "pase", reason: "Sin video ni evaluación del entrenador" },
    );
  }

  /* ── Tactical score ────────────────────────────────────────── */
  let tacticalScore = 50;
  let tacticalSource = "estimado (sin datos tácticos)";

  if (input.coach) {
    tacticalScore = ((input.coach.tacticalScore + input.coach.mentalScore) / 2) * 10;
    tacticalSource = "evaluación del entrenador";
    evaluated.push("posicionamiento", "vision_juego", "decision");
  } else if (input.tracking?.scanCount !== undefined && input.tracking.scanCount > 0) {
    // Scan count is a proxy for awareness
    const scanScore = Math.min(80, input.tracking.scanCount * 5);
    tacticalScore = scanScore;
    tacticalSource = "scan count (proxy parcial)";
    evaluated.push("escaneo_visual");
    notEvaluated.push(
      { dimension: "posicionamiento_tactico", reason: "Requiere evaluación del entrenador o análisis IA avanzado" },
    );
  } else {
    notEvaluated.push(
      { dimension: "posicionamiento", reason: "Sin datos tácticos" },
      { dimension: "vision_juego", reason: "Sin evaluación del entrenador" },
    );
  }

  /* ── PHV adjustment score ──────────────────────────────────── */
  let phvScore = 50;
  let phvSource = "sin datos PHV";

  if (input.phv) {
    // PHV category contributes to score
    const ageFactor = Math.max(0, Math.min(100,
      50 + (input.phv.maturityOffset * -10) // late developers score higher (potential)
    ));
    phvScore = ageFactor;
    phvSource = `${input.phv.category} (offset ${input.phv.maturityOffset.toFixed(1)})`;
    evaluated.push("maduracion_biologica");
  } else {
    notEvaluated.push({ dimension: "maduracion_biologica", reason: "Sin datos de altura/peso para calcular PHV" });
  }

  /* ── Data quality score ────────────────────────────────────── */
  let dataQualityScore = 30; // base
  let dataQualitySource = "datos limitados";

  if (input.video) {
    dataQualityScore += input.video.qualityScore * 0.3;
    if (input.video.qualityScore > 70) dataQualitySource = "video de buena calidad";
  }
  if (input.dataFlags.videoCount >= 3) dataQualityScore += 15;
  if (input.dataFlags.trackingSessionCount >= 2) dataQualityScore += 15;
  if (input.dataFlags.hasCoachEval) dataQualityScore += 10;
  dataQualityScore = Math.min(100, dataQualityScore);

  /* ── Weighted composite ────────────────────────────────────── */
  const rawVsi =
    technicalScore * WEIGHTS.technical +
    physicalScore * WEIGHTS.physical +
    tacticalScore * WEIGHTS.tactical +
    phvScore * WEIGHTS.phv +
    dataQualityScore * WEIGHTS.dataQuality;

  /* ── PHV correction ────────────────────────────────────────── */
  const factor = phvCorrectionFactor(input.phv);
  const correctedVsi = Math.max(0, Math.min(100, Math.round(rawVsi * factor * 10) / 10));

  /* ── Confidence ────────────────────────────────────────────── */
  const confidence = calculateConfidence(input);

  return {
    vsi: correctedVsi,
    confidence,
    breakdown: {
      technical: { score: Math.round(technicalScore * 10) / 10, weight: WEIGHTS.technical, source: technicalSource },
      physical: { score: Math.round(physicalScore * 10) / 10, weight: WEIGHTS.physical, source: physicalSource },
      tactical: { score: Math.round(tacticalScore * 10) / 10, weight: WEIGHTS.tactical, source: tacticalSource },
      phvAdjustment: { score: Math.round(phvScore * 10) / 10, weight: WEIGHTS.phv, source: phvSource },
      dataQuality: { score: Math.round(dataQualityScore * 10) / 10, weight: WEIGHTS.dataQuality, source: dataQualitySource },
    },
    phvCorrection: {
      applied: !!input.phv,
      factor,
      rawVsi: Math.round(rawVsi * 10) / 10,
      correctedVsi,
    },
    evaluated,
    notEvaluated,
    modelVersion: MODEL_VERSION,
  };
}

/* ── Batch scoring for rankings ────────────────────────────────── */

export function batchScoreForRanking(
  inputs: (ScoringInput & { playerId: string })[],
): { playerId: string; vsi: number; confidence: number; trend?: string }[] {
  return inputs
    .map(input => {
      const result = calculateVSI(input);
      return {
        playerId: input.playerId,
        vsi: result.vsi,
        confidence: result.confidence,
      };
    })
    .sort((a, b) => b.vsi - a.vsi);
}
