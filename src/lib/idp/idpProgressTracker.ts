/**
 * VITAS · IDP Progress Tracker
 *
 * Computes per-goal `currentValue` and overall progress summary from raw
 * metric data. Pure functions, no I/O — the caller (idpService) supplies
 * the metrics dict, this returns derived numbers.
 *
 * Progress formula per goal:
 *   progress = clamp(0, 100, (current - baseline) / (target - baseline) * 100)
 *   ↑ supports both "higher is better" (vsi up) and "lower is better"
 *     (sprint time down) — when target < baseline, the same formula gives
 *     a positive score as current moves toward target.
 */

import type {
  DevelopmentPlan,
  IDPDimension,
  IDPGoal,
  IDPProgressSummary,
} from "./idpTypes";

/** Compute progress 0-100 for a single goal given the latest metric value. */
export function computeGoalProgress(goal: IDPGoal, latestValue: number | undefined): number {
  if (latestValue == null) return 0;
  const baseline = goal.baselineMetric.value;
  const target = goal.targetMetric.value;
  if (baseline === target) return latestValue >= target ? 100 : 0;

  const span = target - baseline;
  const moved = latestValue - baseline;
  const pct = (moved / span) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/**
 * Map a goal to a metric key in the supplied metrics dictionary.
 * Used by `computeSummary` to look up `current_value`.
 */
export function metricKeyForGoal(goal: IDPGoal): string {
  return goal.baselineMetric.metric;
}

/** Days between today and month end (clamped to ≥0). */
export function daysRemainingInMonth(monthEnd: string, now = new Date()): number {
  const end = new Date(monthEnd);
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

/**
 * Whether a goal is "at risk": current trajectory will miss the target
 * given remaining time. Simple heuristic: if days elapsed > 50% of the
 * month but progress < 30%, flag it.
 */
function isAtRisk(progressPct: number, daysRemaining: number, monthEnd: string): boolean {
  const total = 30; // approx
  const elapsed = Math.max(0, total - daysRemaining);
  const elapsedPct = (elapsed / total) * 100;
  return elapsedPct > 50 && progressPct < 30;
}

/**
 * Aggregate plan progress for the dashboard summary card.
 *
 * @param plan       the development plan with `goals` populated
 * @param metrics    flat dict: { "vsi_technical": 70, "acwr": 1.2, ... }
 * @param now        clock injection for tests
 */
export function computeSummary(
  plan: DevelopmentPlan,
  metrics: Record<string, number> = {},
  now = new Date(),
): IDPProgressSummary {
  const goals = plan.goals ?? [];
  const days = daysRemainingInMonth(plan.monthEnd, now);

  let weightedSum = 0;
  let weightTotal = 0;
  const byDimensionSum: Partial<Record<IDPDimension, { sum: number; n: number }>> = {};
  const atRiskGoals: string[] = [];
  let achieved = 0;
  let open = 0;

  for (const g of goals) {
    const latest = metrics[metricKeyForGoal(g)] ?? g.currentValue;
    const progress = computeGoalProgress(g, latest);

    // weighted overall
    weightedSum += progress * g.weight;
    weightTotal += g.weight;

    // per-dimension aggregation
    const bucket = byDimensionSum[g.dimension] ?? { sum: 0, n: 0 };
    bucket.sum += progress;
    bucket.n += 1;
    byDimensionSum[g.dimension] = bucket;

    if (g.status === "achieved") achieved += 1;
    else if (g.status === "pending" || g.status === "in_progress") open += 1;

    if (isAtRisk(progress, days, plan.monthEnd)) atRiskGoals.push(g.id);
  }

  const byDimension: Record<IDPDimension, number> = {
    technical: 0,
    tactical: 0,
    physical: 0,
    mental: 0,
    maturation: 0,
  };
  for (const [dim, agg] of Object.entries(byDimensionSum)) {
    if (agg && agg.n > 0) {
      byDimension[dim as IDPDimension] = Math.round(agg.sum / agg.n);
    }
  }

  return {
    planId: plan.id,
    playerId: plan.playerId,
    monthStart: plan.monthStart,
    monthEnd: plan.monthEnd,
    overallProgress: weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0,
    goalsAchieved: achieved,
    goalsOpen: open,
    goalsTotal: goals.length,
    byDimension,
    atRiskGoals,
    daysRemaining: days,
  };
}

/**
 * Mutating helper: update each goal's `currentValue` and `status`
 * based on the latest metrics. Returns a new array (no in-place mutation).
 */
export function refreshGoalValues(
  goals: IDPGoal[],
  metrics: Record<string, number>,
): IDPGoal[] {
  return goals.map((g) => {
    const latest = metrics[metricKeyForGoal(g)];
    if (latest == null) return g;
    const progress = computeGoalProgress(g, latest);
    let nextStatus = g.status;
    if (progress >= 100 && g.status !== "achieved") nextStatus = "achieved";
    else if (progress > 0 && progress < 100 && g.status === "pending") {
      nextStatus = "in_progress";
    }
    return { ...g, currentValue: latest, status: nextStatus };
  });
}
