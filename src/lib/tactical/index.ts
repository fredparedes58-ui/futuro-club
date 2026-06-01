/**
 * VITAS · Tactical Heatmap module — public API
 */
export type {
  GamePhase,
  BallPossession,
  PhaseSource,
  PhaseSegment,
  HeatmapBin,
  HotZone,
  PhaseHeatmap,
  TacticalMatchSummary,
  TacticalInsights,
  TacticalPatternInput,
} from "./tacticalTypes";

export {
  GRID_COLS,
  GRID_ROWS,
  PITCH_W,
  PITCH_H,
  pixelToPitch,
  coordToBin,
  binToCoord,
  dist,
  zoneLabel,
  centroidOfBins,
} from "./pitchGeometry";

export { detectPhases, resolvePossession } from "./phaseDetector";
export {
  aggregateBins,
  combineHeatmaps,
  detectCoverageGaps,
} from "./heatmapAggregator";
export { findHotZones } from "./clusterAnalyzer";
