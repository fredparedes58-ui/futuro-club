/**
 * VITAS · PHV como producto (Sprint 2) — public API
 */
export { computeMirwald, canComputeMirwald } from "./mirwald";
export type { MirwaldInput, MirwaldResult } from "./mirwald";

export { assessMaturation } from "./maturation";
export type { MaturationStatus, MaturationAssessment } from "./maturation";

export {
  normalizeMetric,
  normalizeMetrics,
  METRIC_MATURATION_SENSITIVITY,
} from "./normalizer";
export type { NormalizedMetric } from "./normalizer";

export { projectToMaturity } from "./projection";
export type { MaturityProjection, ProjectionPoint } from "./projection";

export {
  BIO_BANDS,
  bioBandFor,
  chronoBandLabel,
  groupByBioBand,
} from "./bioBanding";
export type { BioBand, BioBandedPlayer } from "./bioBanding";

export { assessGrowthSpurtShield } from "./growthSpurtShield";
export type { GrowthSpurtShield, ShieldLevel } from "./growthSpurtShield";
