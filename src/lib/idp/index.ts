/**
 * VITAS · IDP module — public API
 */
export type {
  IDPDimension,
  IDPPlanStatus,
  IDPGoalStatus,
  IDPMilestoneStatus,
  IDPGeneratedBy,
  IDPMetricRef,
  IDPGoal,
  IDPMilestone,
  IDPCheckin,
  DevelopmentPlan,
  IDPProgressSummary,
  IDPArchitectInput,
  IDPArchitectOutput,
} from "./idpTypes";

export { matchDrillsForGoal, suggestDrillIds } from "./idpDrillMatcher";

export {
  computeGoalProgress,
  computeSummary,
  daysRemainingInMonth,
  metricKeyForGoal,
  refreshGoalValues,
} from "./idpProgressTracker";

export { generatePlanDeterministic } from "./idpGoalGenerator";

export { generateMilestonesForPlan } from "./idpMilestoneScheduler";
