/**
 * VITAS · IA Evaluation Framework (IA → 7/10)
 *
 * Measures AI agent quality with real data:
 *   1. Consistency: same player → same score (low variance across runs)
 *   2. Accuracy: AI score vs human expert score (correlation)
 *   3. Calibration: confidence levels match actual accuracy
 *   4. Completeness: % of dimensions successfully evaluated
 *   5. Anti-hallucination: detects invented stats
 *
 * Usage:
 *   const framework = new EvaluationFramework();
 *   const results = await framework.runFullEval(testDataset);
 *   console.log(results.summary);
 */

/* ── Types ─────────────────────────────────────────────────────── */

export interface PlayerTestCase {
  /** Unique test case ID */
  id: string;
  /** Player data to evaluate */
  player: {
    name: string;
    age: number;
    position: string;
    height?: number;
    weight?: number;
    phvCategory?: "early" | "on-time" | "late";
    maturityOffset?: number;
  };
  /** Known metrics (from real tracking or manual entry) */
  knownMetrics?: {
    maxSpeed?: number;
    avgSpeed?: number;
    distanceCovered?: number;
    sprintCount?: number;
  };
  /** Human expert VSI score (ground truth) */
  humanVsi?: number;
  /** Human expert notes */
  humanNotes?: string;
  /** Expected dimensions that CAN be evaluated */
  evaluableDimensions?: string[];
  /** Expected dimensions that CANNOT be evaluated */
  nonEvaluableDimensions?: string[];
}

export interface EvalRun {
  testCaseId: string;
  runNumber: number;
  timestamp: number;
  /** AI-generated VSI */
  aiVsi: number;
  /** AI confidence (0-100) */
  aiConfidence: number;
  /** Dimensions the AI evaluated */
  evaluatedDimensions: string[];
  /** Dimensions the AI said it couldn't evaluate */
  notEvaluated: string[];
  /** Raw AI response time (ms) */
  latencyMs: number;
  /** Whether the AI invented data (detected) */
  hallucinationDetected: boolean;
  /** Specific hallucinations found */
  hallucinations: string[];
}

export interface ConsistencyResult {
  testCaseId: string;
  runs: number;
  meanVsi: number;
  stddevVsi: number;
  minVsi: number;
  maxVsi: number;
  range: number;
  /** Coefficient of variation (lower = more consistent) */
  cv: number;
  /** PASS if CV < 10%, WARN if 10-20%, FAIL if > 20% */
  grade: "PASS" | "WARN" | "FAIL";
}

export interface AccuracyResult {
  testCaseId: string;
  humanVsi: number;
  aiMeanVsi: number;
  absoluteError: number;
  /** Percentage error */
  pctError: number;
  /** Within ±5 points of human score? */
  withinTolerance: boolean;
}

export interface CalibrationResult {
  /** Confidence bucket (e.g., "70-80%") */
  bucket: string;
  /** Number of evaluations in this bucket */
  count: number;
  /** Actual accuracy in this bucket (% within tolerance of human score) */
  actualAccuracy: number;
  /** Expected accuracy based on confidence level */
  expectedAccuracy: number;
  /** Calibration error (lower = better calibrated) */
  calibrationError: number;
}

export interface HallucinationResult {
  totalRuns: number;
  hallucinationsDetected: number;
  hallucinationRate: number;
  /** Specific types of hallucinations found */
  types: { type: string; count: number }[];
  grade: "PASS" | "WARN" | "FAIL";
}

export interface EvalSummary {
  timestamp: number;
  testCases: number;
  totalRuns: number;
  /** Overall consistency score (0-100, higher = more consistent) */
  consistencyScore: number;
  /** Overall accuracy score (0-100, higher = more accurate vs human) */
  accuracyScore: number;
  /** Calibration score (0-100, higher = better calibrated) */
  calibrationScore: number;
  /** Anti-hallucination score (0-100, higher = fewer hallucinations) */
  antiHallucinationScore: number;
  /** Composite score (weighted average) */
  overallScore: number;
  /** Grade: A (90+), B (75-89), C (60-74), D (40-59), F (<40) */
  grade: string;
  consistency: ConsistencyResult[];
  accuracy: AccuracyResult[];
  calibration: CalibrationResult[];
  hallucination: HallucinationResult;
}

/* ── Hallucination Detector ────────────────────────────────────── */

interface HallucinationCheck {
  type: string;
  description: string;
  check: (run: EvalRun, testCase: PlayerTestCase) => boolean;
}

const HALLUCINATION_CHECKS: HallucinationCheck[] = [
  {
    type: "speed_impossible",
    description: "AI reported speed > 40 km/h (impossible in football)",
    check: (_run, testCase) => {
      const maxSpeed = testCase.knownMetrics?.maxSpeed;
      return maxSpeed !== undefined && maxSpeed > 11.11; // 40 km/h
    },
  },
  {
    type: "vsi_out_of_range",
    description: "AI generated VSI outside valid range (0-100)",
    check: (run) => run.aiVsi < 0 || run.aiVsi > 100,
  },
  {
    type: "confidence_mismatch",
    description: "High confidence (>80) with very few data points",
    check: (run, testCase) => {
      const hasTracking = !!testCase.knownMetrics;
      return run.aiConfidence > 80 && !hasTracking;
    },
  },
  {
    type: "evaluated_without_data",
    description: "AI claimed to evaluate dimension without supporting data",
    check: (run, testCase) => {
      if (!testCase.nonEvaluableDimensions) return false;
      return testCase.nonEvaluableDimensions.some(dim =>
        run.evaluatedDimensions.includes(dim)
      );
    },
  },
  {
    type: "perfect_score_no_data",
    description: "AI gave near-perfect VSI (>90) with incomplete data",
    check: (run, testCase) => {
      const hasFullData = !!testCase.knownMetrics?.maxSpeed && !!testCase.knownMetrics?.distanceCovered;
      return run.aiVsi > 90 && !hasFullData;
    },
  },
];

function detectHallucinations(run: EvalRun, testCase: PlayerTestCase): string[] {
  return HALLUCINATION_CHECKS
    .filter(check => check.check(run, testCase))
    .map(check => check.type);
}

/* ── Statistical Helpers ───────────────────────────────────────── */

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1));
}

/* ── Evaluation Framework ──────────────────────────────────────── */

export class EvaluationFramework {
  private runs: Map<string, EvalRun[]> = new Map();

  /**
   * Record an evaluation run result.
   * In production, this would call the actual AI agent and record the response.
   */
  recordRun(testCaseId: string, run: EvalRun): void {
    const existing = this.runs.get(testCaseId) ?? [];
    existing.push(run);
    this.runs.set(testCaseId, existing);
  }

  /**
   * Simulate multiple runs for a test case.
   * In production, this calls the AI agent N times with the same input.
   */
  async simulateRuns(
    testCase: PlayerTestCase,
    agentFn: (tc: PlayerTestCase) => Promise<{ vsi: number; confidence: number; evaluated: string[]; notEvaluated: string[] }>,
    numRuns: number = 5,
  ): Promise<EvalRun[]> {
    const runs: EvalRun[] = [];

    for (let i = 0; i < numRuns; i++) {
      const start = Date.now();
      const result = await agentFn(testCase);
      const latencyMs = Date.now() - start;

      const run: EvalRun = {
        testCaseId: testCase.id,
        runNumber: i + 1,
        timestamp: Date.now(),
        aiVsi: result.vsi,
        aiConfidence: result.confidence,
        evaluatedDimensions: result.evaluated,
        notEvaluated: result.notEvaluated,
        latencyMs,
        hallucinationDetected: false,
        hallucinations: [],
      };

      // Run hallucination checks
      run.hallucinations = detectHallucinations(run, testCase);
      run.hallucinationDetected = run.hallucinations.length > 0;

      runs.push(run);
      this.recordRun(testCase.id, run);
    }

    return runs;
  }

  /** Measure consistency: same input → same output? */
  analyzeConsistency(testCaseId: string): ConsistencyResult | null {
    const runs = this.runs.get(testCaseId);
    if (!runs || runs.length < 2) return null;

    const scores = runs.map(r => r.aiVsi);
    const m = mean(scores);
    const sd = stddev(scores);
    const cv = m > 0 ? (sd / m) * 100 : 0;

    return {
      testCaseId,
      runs: runs.length,
      meanVsi: Math.round(m * 10) / 10,
      stddevVsi: Math.round(sd * 10) / 10,
      minVsi: Math.min(...scores),
      maxVsi: Math.max(...scores),
      range: Math.max(...scores) - Math.min(...scores),
      cv: Math.round(cv * 10) / 10,
      grade: cv < 10 ? "PASS" : cv < 20 ? "WARN" : "FAIL",
    };
  }

  /** Measure accuracy: AI score vs human expert score */
  analyzeAccuracy(testCaseId: string, humanVsi: number): AccuracyResult | null {
    const runs = this.runs.get(testCaseId);
    if (!runs || runs.length === 0) return null;

    const aiMean = mean(runs.map(r => r.aiVsi));
    const absError = Math.abs(aiMean - humanVsi);
    const pctError = humanVsi > 0 ? (absError / humanVsi) * 100 : 0;

    return {
      testCaseId,
      humanVsi,
      aiMeanVsi: Math.round(aiMean * 10) / 10,
      absoluteError: Math.round(absError * 10) / 10,
      pctError: Math.round(pctError * 10) / 10,
      withinTolerance: absError <= 5,
    };
  }

  /** Measure calibration: does confidence match actual accuracy? */
  analyzeCalibration(testCases: PlayerTestCase[]): CalibrationResult[] {
    const buckets = [
      { label: "0-30%", min: 0, max: 30 },
      { label: "30-50%", min: 30, max: 50 },
      { label: "50-70%", min: 50, max: 70 },
      { label: "70-85%", min: 70, max: 85 },
      { label: "85-100%", min: 85, max: 100 },
    ];

    return buckets.map(bucket => {
      const runsInBucket: { run: EvalRun; testCase: PlayerTestCase }[] = [];

      for (const tc of testCases) {
        const runs = this.runs.get(tc.id) ?? [];
        for (const run of runs) {
          if (run.aiConfidence >= bucket.min && run.aiConfidence < bucket.max) {
            runsInBucket.push({ run, testCase: tc });
          }
        }
      }

      const count = runsInBucket.length;
      const withinTolerance = runsInBucket.filter(({ run, testCase }) => {
        if (!testCase.humanVsi) return false;
        return Math.abs(run.aiVsi - testCase.humanVsi) <= 5;
      }).length;

      const actualAccuracy = count > 0 ? (withinTolerance / count) * 100 : 0;
      const expectedAccuracy = (bucket.min + bucket.max) / 2;

      return {
        bucket: bucket.label,
        count,
        actualAccuracy: Math.round(actualAccuracy),
        expectedAccuracy,
        calibrationError: Math.abs(actualAccuracy - expectedAccuracy),
      };
    });
  }

  /** Analyze hallucination rates across all runs */
  analyzeHallucinations(): HallucinationResult {
    let totalRuns = 0;
    let hallucinationsDetected = 0;
    const typeCounts: Record<string, number> = {};

    for (const runs of this.runs.values()) {
      for (const run of runs) {
        totalRuns++;
        if (run.hallucinationDetected) {
          hallucinationsDetected++;
          for (const h of run.hallucinations) {
            typeCounts[h] = (typeCounts[h] ?? 0) + 1;
          }
        }
      }
    }

    const rate = totalRuns > 0 ? hallucinationsDetected / totalRuns : 0;

    return {
      totalRuns,
      hallucinationsDetected,
      hallucinationRate: Math.round(rate * 1000) / 10,
      types: Object.entries(typeCounts)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      grade: rate < 0.05 ? "PASS" : rate < 0.15 ? "WARN" : "FAIL",
    };
  }

  /** Run full evaluation and produce summary */
  generateSummary(testCases: PlayerTestCase[]): EvalSummary {
    const consistency = testCases
      .map(tc => this.analyzeConsistency(tc.id))
      .filter((r): r is ConsistencyResult => r !== null);

    const accuracy = testCases
      .filter(tc => tc.humanVsi !== undefined)
      .map(tc => this.analyzeAccuracy(tc.id, tc.humanVsi!))
      .filter((r): r is AccuracyResult => r !== null);

    const calibration = this.analyzeCalibration(testCases);
    const hallucination = this.analyzeHallucinations();

    // Score calculations (0-100)
    const consistencyScore = consistency.length > 0
      ? Math.max(0, 100 - mean(consistency.map(c => c.cv)) * 5)
      : 0;

    const accuracyScore = accuracy.length > 0
      ? Math.max(0, 100 - mean(accuracy.map(a => a.pctError)) * 2)
      : 0;

    const calibrationScore = calibration.length > 0
      ? Math.max(0, 100 - mean(calibration.filter(c => c.count > 0).map(c => c.calibrationError)))
      : 0;

    const antiHallucinationScore = Math.max(0, 100 - hallucination.hallucinationRate * 10);

    // Weighted composite
    const overallScore = Math.round(
      consistencyScore * 0.25 +
      accuracyScore * 0.35 +
      calibrationScore * 0.15 +
      antiHallucinationScore * 0.25
    );

    const grade = overallScore >= 90 ? "A" : overallScore >= 75 ? "B" : overallScore >= 60 ? "C" : overallScore >= 40 ? "D" : "F";

    return {
      timestamp: Date.now(),
      testCases: testCases.length,
      totalRuns: Array.from(this.runs.values()).reduce((sum, runs) => sum + runs.length, 0),
      consistencyScore: Math.round(consistencyScore),
      accuracyScore: Math.round(accuracyScore),
      calibrationScore: Math.round(calibrationScore),
      antiHallucinationScore: Math.round(antiHallucinationScore),
      overallScore,
      grade,
      consistency,
      accuracy,
      calibration,
      hallucination,
    };
  }

  /** Reset all recorded runs */
  clear(): void {
    this.runs.clear();
  }
}

/* ── Sample Test Dataset ───────────────────────────────────────── */

/** Starter dataset — replace with real player data from pilot academies */
export const SAMPLE_TEST_DATASET: PlayerTestCase[] = [
  {
    id: "eval-001",
    player: { name: "Test Delantero U15", age: 14, position: "Delantero", height: 168, weight: 55, phvCategory: "on-time", maturityOffset: 0.2 },
    knownMetrics: { maxSpeed: 7.8, avgSpeed: 4.2, distanceCovered: 8500, sprintCount: 12 },
    humanVsi: 68,
    evaluableDimensions: ["velocidad", "resistencia", "sprint", "posicionamiento"],
    nonEvaluableDimensions: ["pase_largo", "regate", "vision_juego"],
  },
  {
    id: "eval-002",
    player: { name: "Test Portero U14", age: 13, position: "Portero", height: 172, weight: 58, phvCategory: "early", maturityOffset: 1.1 },
    humanVsi: 55,
    evaluableDimensions: ["posicionamiento"],
    nonEvaluableDimensions: ["velocidad", "sprint", "resistencia", "pase_largo"],
  },
  {
    id: "eval-003",
    player: { name: "Test Mediocampista U16", age: 15, position: "Mediocampista", height: 165, weight: 54, phvCategory: "late", maturityOffset: -0.8 },
    knownMetrics: { maxSpeed: 7.2, avgSpeed: 4.8, distanceCovered: 9200, sprintCount: 8 },
    humanVsi: 72,
    humanNotes: "Talento oculto — desarrollo tardío pero lectura táctica excelente",
    evaluableDimensions: ["velocidad", "resistencia", "sprint", "vision_juego"],
    nonEvaluableDimensions: ["regate"],
  },
  {
    id: "eval-004",
    player: { name: "Test Defensa U13", age: 12, position: "Defensa", height: 152, weight: 42, phvCategory: "late", maturityOffset: -1.2 },
    humanVsi: 48,
    evaluableDimensions: ["posicionamiento"],
    nonEvaluableDimensions: ["velocidad", "sprint", "resistencia", "pase_largo", "regate"],
  },
  {
    id: "eval-005",
    player: { name: "Test Delantero U17 completo", age: 16, position: "Delantero", height: 178, weight: 68, phvCategory: "on-time", maturityOffset: 0.0 },
    knownMetrics: { maxSpeed: 8.9, avgSpeed: 5.1, distanceCovered: 9800, sprintCount: 18 },
    humanVsi: 82,
    evaluableDimensions: ["velocidad", "resistencia", "sprint", "posicionamiento", "vision_juego"],
    nonEvaluableDimensions: [],
  },
];
