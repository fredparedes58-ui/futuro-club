/**
 * VITAS · GET /api/idp/get-plan?playerId=...&monthStart=YYYY-MM-01
 *
 * Returns the fully-hydrated active plan for a player + month, including
 * goals, milestones, checkins, and computed progress summary.
 *
 * Falls through to 404 if no plan exists for the requested month.
 */

import { successResponse, errorResponse } from "../_lib/apiResponse";
import { withHandler } from "../_lib/withHandler";
import { ownsPlayer } from "../_lib/ownership";
import { computeSummary } from "../../src/lib/idp/idpProgressTracker";
import type {
  DevelopmentPlan,
  IDPCheckin,
  IDPGoal,
  IDPMilestone,
} from "../../src/lib/idp/idpTypes";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function currentMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

// Minimal mapping inline (we don't want to import the full service in Edge)
interface DbPlan {
  id: string;
  player_id: string;
  coach_id: string | null;
  tenant_id: string | null;
  month_start: string;
  month_end: string;
  status: DevelopmentPlan["status"];
  overall_focus: string | null;
  context_notes: string | null;
  agent_summary: string | null;
  generated_by: DevelopmentPlan["generatedBy"];
  agent_version: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DbGoal {
  id: string;
  plan_id: string;
  dimension: IDPGoal["dimension"];
  title: string;
  description: string | null;
  rationale: string | null;
  baseline_metric: IDPGoal["baselineMetric"];
  target_metric: IDPGoal["targetMetric"];
  current_value: number | null;
  drills_assigned: string[];
  weight: number;
  status: IDPGoal["status"];
  ai_proposed: boolean;
  coach_edited: boolean;
  created_at: string;
  updated_at: string;
}

interface DbMilestone {
  id: string;
  plan_id: string;
  goal_id: string;
  due_date: string;
  week_number: number;
  title: string;
  success_criteria: string | null;
  status: IDPMilestone["status"];
  evidence: IDPMilestone["evidence"];
  completed_at: string | null;
  created_at: string;
}

interface DbCheckin {
  id: string;
  plan_id: string;
  goal_id: string | null;
  reviewer_id: string | null;
  reviewed_at: string;
  progress_score: number | null;
  qualitative_notes: string | null;
  questionnaire_answers: Record<string, unknown>;
  adjustments_proposed: IDPCheckin["adjustmentsProposed"];
  created_at: string;
}

function rowToPlan(r: DbPlan): DevelopmentPlan {
  return {
    id: r.id,
    playerId: r.player_id,
    coachId: r.coach_id ?? undefined,
    tenantId: r.tenant_id ?? undefined,
    monthStart: r.month_start,
    monthEnd: r.month_end,
    status: r.status,
    overallFocus: r.overall_focus ?? undefined,
    contextNotes: r.context_notes ?? undefined,
    agentSummary: r.agent_summary ?? undefined,
    generatedBy: r.generated_by,
    agentVersion: r.agent_version ?? undefined,
    approvedBy: r.approved_by ?? undefined,
    approvedAt: r.approved_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToGoal(r: DbGoal): IDPGoal {
  return {
    id: r.id,
    planId: r.plan_id,
    dimension: r.dimension,
    title: r.title,
    description: r.description ?? undefined,
    rationale: r.rationale ?? undefined,
    baselineMetric: r.baseline_metric,
    targetMetric: r.target_metric,
    currentValue: r.current_value ?? undefined,
    drillsAssigned: r.drills_assigned ?? [],
    weight: r.weight,
    status: r.status,
    aiProposed: r.ai_proposed,
    coachEdited: r.coach_edited,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToMilestone(r: DbMilestone): IDPMilestone {
  return {
    id: r.id,
    planId: r.plan_id,
    goalId: r.goal_id,
    dueDate: r.due_date,
    weekNumber: r.week_number,
    title: r.title,
    successCriteria: r.success_criteria ?? undefined,
    status: r.status,
    evidence: r.evidence ?? {},
    completedAt: r.completed_at ?? undefined,
    createdAt: r.created_at,
  };
}

function rowToCheckin(r: DbCheckin): IDPCheckin {
  return {
    id: r.id,
    planId: r.plan_id,
    goalId: r.goal_id ?? undefined,
    reviewerId: r.reviewer_id ?? undefined,
    reviewedAt: r.reviewed_at,
    progressScore: r.progress_score ?? undefined,
    qualitativeNotes: r.qualitative_notes ?? undefined,
    questionnaireAnswers: r.questionnaire_answers ?? {},
    adjustmentsProposed: r.adjustments_proposed ?? {},
    createdAt: r.created_at,
  };
}

// GET /api/idp/get-plan?playerId=...&monthStart=YYYY-MM-01
// requireAuth: cierra el acceso anónimo (antes público → cualquiera podía leer
// el plan de desarrollo completo + PII del staff de cualquier jugador).
// allowServiceToken: permite llamadas internas (orchestrator/cron).
// NOTA: el check de PROPIEDAD del jugador se añade en el PR de ownership.
export default withHandler(
  { method: "GET", requireAuth: true, allowServiceToken: true, maxRequests: 60 },
  async ({ query, userId, isServiceCall }) => {
  const playerId = query.playerId;
  const monthStart = query.monthStart ?? currentMonthStart();
  const includeMetrics = query.includeMetrics;

  if (!playerId) return errorResponse("playerId required", 400);

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return successResponse({ plan: null, source: "no_supabase" });
  }

  // Ownership: solo el dueño del jugador (players.user_id) puede leer su plan.
  if (!isServiceCall && !(await ownsPlayer(playerId, userId))) {
    return errorResponse("No autorizado para este jugador", 403, "FORBIDDEN");
  }

  try {
    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    };

    // 1. Find the plan
    const planRes = await fetch(
      `${SUPABASE_URL}/rest/v1/development_plans?player_id=eq.${encodeURIComponent(playerId)}&month_start=eq.${encodeURIComponent(monthStart)}&select=*&order=created_at.desc&limit=1`,
      { headers },
    );
    if (!planRes.ok) {
      const text = await planRes.text().catch(() => "");
      return errorResponse(
        `Supabase fetch plan failed: ${planRes.status} ${text.slice(0, 200)}`,
        500,
      );
    }
    const planRows = (await planRes.json()) as DbPlan[];
    if (!planRows.length) {
      return successResponse({ plan: null, message: "No plan for that month" });
    }
    const plan = rowToPlan(planRows[0]);

    // 2. Hydrate relations in parallel
    const [goalsRes, milestonesRes, checkinsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/idp_goals?plan_id=eq.${plan.id}&select=*`, { headers }),
      fetch(
        `${SUPABASE_URL}/rest/v1/idp_milestones?plan_id=eq.${plan.id}&select=*&order=due_date.asc`,
        { headers },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/idp_checkins?plan_id=eq.${plan.id}&select=*&order=reviewed_at.desc`,
        { headers },
      ),
    ]);

    const [goalRows, milestoneRows, checkinRows] = (await Promise.all([
      goalsRes.json(),
      milestonesRes.json(),
      checkinsRes.json(),
    ])) as [DbGoal[], DbMilestone[], DbCheckin[]];

    plan.goals = (goalRows ?? []).map(rowToGoal);
    plan.milestones = (milestoneRows ?? []).map(rowToMilestone);
    plan.checkins = (checkinRows ?? []).map(rowToCheckin);

    // 3. Optional: compute summary if requested
    let summary = null;
    if (includeMetrics === "1") {
      // No metrics dict passed via URL; computeSummary handles empty gracefully
      summary = computeSummary(plan, {}, new Date());
    }

    return successResponse({ plan, summary });
  } catch (err) {
    console.error("[get-plan] error:", err);
    return errorResponse("Internal error fetching plan", 500);
  }
  },
);
