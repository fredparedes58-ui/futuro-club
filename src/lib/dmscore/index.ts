/**
 * VITAS · DM-Score module — public API (Sprint 1.1 + 1.2)
 */
export {
  SCAN_BENCHMARKS,
  DECISION_SPEED_BENCHMARKS,
  scanBandForAge,
} from "./benchmarks";
export type { AgeBandBenchmark } from "./benchmarks";

export { computeScanIQ } from "./scanIQ";
export type { ScanIQResult } from "./scanIQ";

export {
  computeDMScore,
  DM_WEIGHTS,
  DM_COMPONENT_LABELS,
} from "./dmScore";
export type {
  DMScoreInput,
  DMScoreResult,
  DMScoreBreakdownItem,
  DMComponentKey,
} from "./dmScore";
