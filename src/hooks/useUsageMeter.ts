/**
 * useUsageMeter — Real-time AI usage consumption data
 *
 * Returns current plan usage (analyses used vs limit),
 * percentage consumed, and status level for visual feedback.
 */

import { usePlan } from "@/hooks/usePlan";

export type UsageStatus = "ok" | "warning" | "critical" | "exceeded";

export interface UsageMeterData {
  /** Current plan name */
  plan: string;
  /** Analyses used this billing month */
  used: number;
  /** Max analyses for this plan (-1 = unlimited) */
  limit: number;
  /** Remaining analyses (Infinity if unlimited) */
  remaining: number;
  /** 0–100 percentage consumed */
  percent: number;
  /** Visual status for color coding */
  status: UsageStatus;
  /** Whether the user can still run analyses */
  canRunAnalysis: boolean;
  /** Whether the plan is unlimited */
  isUnlimited: boolean;
  /** Whether user has admin bypass */
  isAdmin: boolean;
}

function getStatus(percent: number, isUnlimited: boolean): UsageStatus {
  if (isUnlimited) return "ok";
  if (percent >= 100) return "exceeded";
  if (percent >= 80) return "critical";
  if (percent >= 60) return "warning";
  return "ok";
}

export function useUsageMeter(): UsageMeterData {
  const planState = usePlan();

  const used = planState.analysesUsed;
  const rawLimit = planState.limits.analyses;
  const isUnlimited = rawLimit >= 9999 || planState.isAdmin;
  const limit = isUnlimited ? -1 : rawLimit;
  const remaining = isUnlimited ? Infinity : Math.max(0, rawLimit - used);
  const percent = isUnlimited ? 0 : rawLimit > 0 ? Math.min(100, Math.round((used / rawLimit) * 100)) : 0;
  const status = getStatus(percent, isUnlimited);

  return {
    plan: planState.plan,
    used,
    limit,
    remaining,
    percent,
    status,
    canRunAnalysis: planState.canRunAnalysis,
    isUnlimited,
    isAdmin: planState.isAdmin,
  };
}
