/**
 * VITAS · IDP Milestone Scheduler
 *
 * Given a development plan and its goals, generate weekly milestones
 * (one per goal per week, 4 weeks/month typical). Pure function — the caller
 * persists the result.
 */

import type { DevelopmentPlan, IDPGoal, IDPMilestone } from "./idpTypes";

const uuid = () => crypto.randomUUID();

/** Generate `IDPMilestone[]` for all weeks of a plan's month. */
export function generateMilestonesForPlan(plan: DevelopmentPlan, goals: IDPGoal[]): IDPMilestone[] {
  const milestones: IDPMilestone[] = [];

  const start = new Date(plan.monthStart);
  const end = new Date(plan.monthEnd);
  const weeks = computeWeekBoundaries(start, end);

  for (const g of goals) {
    weeks.forEach((week, idx) => {
      milestones.push({
        id: uuid(),
        planId: plan.id,
        goalId: g.id,
        dueDate: week.end.toISOString().slice(0, 10),
        weekNumber: idx + 1,
        title: weeklyTitleFor(g, idx + 1, weeks.length),
        successCriteria: weeklyCriteriaFor(g, idx + 1, weeks.length),
        status: "pending",
        evidence: {},
        createdAt: new Date().toISOString(),
      });
    });
  }
  return milestones;
}

/** Split month into ~7-day buckets ending on Sundays. */
function computeWeekBoundaries(start: Date, end: Date): Array<{ start: Date; end: Date }> {
  const weeks: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const weekStart = new Date(cursor);
    // Push to next Sunday or month end, whichever comes first
    const daysToSunday = (7 - cursor.getDay()) % 7 || 7;
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + daysToSunday - 1);
    if (weekEnd > end) weekEnd.setTime(end.getTime());
    weeks.push({ start: weekStart, end: weekEnd });
    cursor = new Date(weekEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return weeks;
}

/** Per-week milestone title: progressive intensity through the month. */
function weeklyTitleFor(goal: IDPGoal, weekNumber: number, totalWeeks: number): string {
  if (weekNumber === 1) return `Baseline + introducción: ${goal.title.toLowerCase()}`;
  if (weekNumber === totalWeeks) return `Test final: medir progreso en ${goal.dimension}`;
  return `Semana ${weekNumber}: progresión en ${goal.dimension}`;
}

function weeklyCriteriaFor(goal: IDPGoal, weekNumber: number, totalWeeks: number): string {
  const expectedProgressPct = Math.round((weekNumber / totalWeeks) * 100);
  return `Completar ${goal.drillsAssigned.length || 3} sesiones de drills asignados. Progreso esperado ≥${expectedProgressPct}% hacia objetivo ${goal.targetMetric.value} ${goal.targetMetric.unit ?? ""}.`.trim();
}
