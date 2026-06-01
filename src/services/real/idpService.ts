/**
 * VITAS · IDP Service (Supabase + localStorage hybrid)
 *
 * Manages the four IDP entities (development_plans, idp_goals, idp_milestones,
 * idp_checkins) with offline-first semantics:
 *   - All writes go to localStorage immediately (works offline / no auth)
 *   - When Supabase is configured + reachable, writes also persist there
 *   - Reads prefer Supabase, fall back to localStorage on error
 *
 * Plans are loaded "fully hydrated" — goals + milestones + checkins are
 * fetched alongside the plan so the UI gets everything in one call.
 */

import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import type {
  DevelopmentPlan,
  IDPCheckin,
  IDPGoal,
  IDPGoalStatus,
  IDPMilestone,
  IDPMilestoneStatus,
  IDPPlanStatus,
} from "@/lib/idp/idpTypes";

const PLANS_KEY = "vitas_idp_plans";
const GOALS_KEY = "vitas_idp_goals";
const MILESTONES_KEY = "vitas_idp_milestones";
const CHECKINS_KEY = "vitas_idp_checkins";

const uuid = (): string => crypto.randomUUID();

// ── localStorage helpers ─────────────────────────────────────────────
function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, items: T[]): void {
  try {
    // Cap cache size — 200 plans per key is plenty
    localStorage.setItem(key, JSON.stringify(items.slice(0, 200)));
  } catch (err) {
    console.error(`[idpService] cache write failed (${key})`, err);
  }
}

// ── DB row <-> domain mappers ─────────────────────────────────────────
interface DbPlan {
  id: string;
  player_id: string;
  coach_id: string | null;
  tenant_id: string | null;
  month_start: string;
  month_end: string;
  status: IDPPlanStatus;
  overall_focus: string | null;
  context_notes: string | null;
  agent_summary: string | null;
  generated_by: "coach" | "agent" | "hybrid";
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
  status: IDPGoalStatus;
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
  status: IDPMilestoneStatus;
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

function planToRow(p: DevelopmentPlan): Partial<DbPlan> {
  return {
    id: p.id?.length === 36 ? p.id : undefined,
    player_id: p.playerId,
    coach_id: p.coachId ?? null,
    tenant_id: p.tenantId ?? null,
    month_start: p.monthStart,
    month_end: p.monthEnd,
    status: p.status,
    overall_focus: p.overallFocus ?? null,
    context_notes: p.contextNotes ?? null,
    agent_summary: p.agentSummary ?? null,
    generated_by: p.generatedBy,
    agent_version: p.agentVersion ?? null,
    approved_by: p.approvedBy ?? null,
    approved_at: p.approvedAt ?? null,
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

function goalToRow(g: IDPGoal): Partial<DbGoal> {
  return {
    id: g.id?.length === 36 ? g.id : undefined,
    plan_id: g.planId,
    dimension: g.dimension,
    title: g.title,
    description: g.description ?? null,
    rationale: g.rationale ?? null,
    baseline_metric: g.baselineMetric,
    target_metric: g.targetMetric,
    current_value: g.currentValue ?? null,
    drills_assigned: g.drillsAssigned,
    weight: g.weight,
    status: g.status,
    ai_proposed: g.aiProposed,
    coach_edited: g.coachEdited,
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

function milestoneToRow(m: IDPMilestone): Partial<DbMilestone> {
  return {
    id: m.id?.length === 36 ? m.id : undefined,
    plan_id: m.planId,
    goal_id: m.goalId,
    due_date: m.dueDate,
    week_number: m.weekNumber,
    title: m.title,
    success_criteria: m.successCriteria ?? null,
    status: m.status,
    evidence: m.evidence,
    completed_at: m.completedAt ?? null,
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

function checkinToRow(c: IDPCheckin): Partial<DbCheckin> {
  return {
    id: c.id?.length === 36 ? c.id : undefined,
    plan_id: c.planId,
    goal_id: c.goalId ?? null,
    reviewer_id: c.reviewerId ?? null,
    reviewed_at: c.reviewedAt,
    progress_score: c.progressScore ?? null,
    qualitative_notes: c.qualitativeNotes ?? null,
    questionnaire_answers: c.questionnaireAnswers ?? {},
    adjustments_proposed: c.adjustmentsProposed ?? {},
  };
}

// ── Local hydration: combine plan + goals + milestones + checkins ────
function hydrate(plan: DevelopmentPlan): DevelopmentPlan {
  const goals = read<IDPGoal>(GOALS_KEY).filter((g) => g.planId === plan.id);
  const milestones = read<IDPMilestone>(MILESTONES_KEY).filter((m) => m.planId === plan.id);
  const checkins = read<IDPCheckin>(CHECKINS_KEY).filter((c) => c.planId === plan.id);
  return { ...plan, goals, milestones, checkins };
}

// ── Public service ──────────────────────────────────────────────────
export const IDPService = {
  /**
   * Get the active or draft plan for a player for a given month.
   * `monthStart` is "YYYY-MM-01"; if omitted, current month is used.
   */
  async getCurrentPlan(playerId: string, monthStart?: string): Promise<DevelopmentPlan | null> {
    const ms = monthStart ?? new Date().toISOString().slice(0, 8) + "01";

    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase
          .from("development_plans")
          .select("*")
          .eq("player_id", playerId)
          .eq("month_start", ms)
          .in("status", ["draft", "active"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          const plan = rowToPlan(data as DbPlan);
          // Hydrate goals/milestones/checkins from DB
          const [{ data: g }, { data: m }, { data: c }] = await Promise.all([
            supabase.from("idp_goals").select("*").eq("plan_id", plan.id),
            supabase.from("idp_milestones").select("*").eq("plan_id", plan.id).order("due_date"),
            supabase.from("idp_checkins").select("*").eq("plan_id", plan.id).order("reviewed_at", { ascending: false }),
          ]);
          plan.goals = ((g as DbGoal[]) ?? []).map(rowToGoal);
          plan.milestones = ((m as DbMilestone[]) ?? []).map(rowToMilestone);
          plan.checkins = ((c as DbCheckin[]) ?? []).map(rowToCheckin);
          // Refresh cache
          this._upsertCache(plan);
          return plan;
        }
      } catch (err) {
        console.warn("[idpService] supabase getCurrentPlan failed, using cache:", err);
      }
    }

    // Cache fallback
    const cached = read<DevelopmentPlan>(PLANS_KEY).find(
      (p) =>
        p.playerId === playerId &&
        p.monthStart === ms &&
        (p.status === "draft" || p.status === "active"),
    );
    return cached ? hydrate(cached) : null;
  },

  /**
   * Get historical plans (completed/abandoned) for a player.
   */
  async getPlanHistory(playerId: string, limit = 12): Promise<DevelopmentPlan[]> {
    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase
          .from("development_plans")
          .select("*")
          .eq("player_id", playerId)
          .order("month_start", { ascending: false })
          .limit(limit);
        if (error) throw error;
        if (data) return (data as DbPlan[]).map(rowToPlan);
      } catch (err) {
        console.warn("[idpService] supabase history failed:", err);
      }
    }
    return read<DevelopmentPlan>(PLANS_KEY)
      .filter((p) => p.playerId === playerId)
      .sort((a, b) => b.monthStart.localeCompare(a.monthStart))
      .slice(0, limit)
      .map(hydrate);
  },

  /**
   * Get all active plans for a list of players (team view / director dashboard).
   */
  async getTeamActive(playerIds: string[]): Promise<DevelopmentPlan[]> {
    if (playerIds.length === 0) return [];
    const ms = new Date().toISOString().slice(0, 8) + "01";

    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase
          .from("development_plans")
          .select("*")
          .in("player_id", playerIds)
          .eq("month_start", ms)
          .in("status", ["draft", "active"]);
        if (error) throw error;
        if (data) return (data as DbPlan[]).map(rowToPlan);
      } catch (err) {
        console.warn("[idpService] supabase team active failed:", err);
      }
    }

    return read<DevelopmentPlan>(PLANS_KEY)
      .filter(
        (p) =>
          playerIds.includes(p.playerId) &&
          p.monthStart === ms &&
          (p.status === "draft" || p.status === "active"),
      )
      .map(hydrate);
  },

  /**
   * Save (insert or update) a fully-hydrated plan. Goals, milestones, and
   * checkins are persisted alongside via parallel writes.
   */
  async savePlan(plan: DevelopmentPlan): Promise<DevelopmentPlan> {
    const finalPlan: DevelopmentPlan = {
      ...plan,
      id: plan.id || uuid(),
      createdAt: plan.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this._upsertCache(finalPlan);

    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase
          .from("development_plans")
          .upsert(planToRow(finalPlan), { onConflict: "id" })
          .select()
          .maybeSingle();
        if (error) throw error;
        if (data) {
          const serverPlan = rowToPlan(data as DbPlan);
          serverPlan.goals = finalPlan.goals;
          serverPlan.milestones = finalPlan.milestones;
          serverPlan.checkins = finalPlan.checkins;
          this._upsertCache(serverPlan);

          // Cascade goals
          if (finalPlan.goals?.length) {
            await supabase
              .from("idp_goals")
              .upsert(
                finalPlan.goals.map((g) => goalToRow({ ...g, planId: serverPlan.id })),
                { onConflict: "id" },
              );
          }
          // Cascade milestones
          if (finalPlan.milestones?.length) {
            await supabase
              .from("idp_milestones")
              .upsert(
                finalPlan.milestones.map((m) => milestoneToRow({ ...m, planId: serverPlan.id })),
                { onConflict: "id" },
              );
          }
          return serverPlan;
        }
      } catch (err) {
        console.warn("[idpService] supabase savePlan failed, kept in cache:", err);
      }
    }
    return finalPlan;
  },

  /** Update a single goal (used by coach edits). */
  async updateGoal(goal: IDPGoal): Promise<IDPGoal> {
    const next: IDPGoal = {
      ...goal,
      coachEdited: true,
      updatedAt: new Date().toISOString(),
    };
    const all = read<IDPGoal>(GOALS_KEY).filter((g) => g.id !== next.id);
    all.unshift(next);
    write(GOALS_KEY, all);

    if (SUPABASE_CONFIGURED) {
      try {
        await supabase.from("idp_goals").upsert(goalToRow(next), { onConflict: "id" });
      } catch (err) {
        console.warn("[idpService] updateGoal failed:", err);
      }
    }
    return next;
  },

  /** Mark a milestone as completed/missed/partial with optional evidence. */
  async updateMilestone(milestone: IDPMilestone): Promise<IDPMilestone> {
    const next: IDPMilestone = {
      ...milestone,
      completedAt:
        milestone.status === "completed" && !milestone.completedAt
          ? new Date().toISOString()
          : milestone.completedAt,
    };
    const all = read<IDPMilestone>(MILESTONES_KEY).filter((m) => m.id !== next.id);
    all.unshift(next);
    write(MILESTONES_KEY, all);

    if (SUPABASE_CONFIGURED) {
      try {
        await supabase
          .from("idp_milestones")
          .upsert(milestoneToRow(next), { onConflict: "id" });
      } catch (err) {
        console.warn("[idpService] updateMilestone failed:", err);
      }
    }
    return next;
  },

  /** Record a coach check-in (monthly review). */
  async saveCheckin(checkin: IDPCheckin): Promise<IDPCheckin> {
    const next: IDPCheckin = {
      ...checkin,
      id: checkin.id || uuid(),
      createdAt: checkin.createdAt || new Date().toISOString(),
      reviewedAt: checkin.reviewedAt || new Date().toISOString(),
    };
    const all = read<IDPCheckin>(CHECKINS_KEY).filter((c) => c.id !== next.id);
    all.unshift(next);
    write(CHECKINS_KEY, all);

    if (SUPABASE_CONFIGURED) {
      try {
        await supabase
          .from("idp_checkins")
          .upsert(checkinToRow(next), { onConflict: "id" });
      } catch (err) {
        console.warn("[idpService] saveCheckin failed:", err);
      }
    }
    return next;
  },

  /**
   * Transition plan status (typically draft → active when coach approves).
   */
  async transitionStatus(
    planId: string,
    newStatus: IDPPlanStatus,
    approvedBy?: string,
  ): Promise<void> {
    const all = read<DevelopmentPlan>(PLANS_KEY);
    const idx = all.findIndex((p) => p.id === planId);
    if (idx >= 0) {
      all[idx] = {
        ...all[idx],
        status: newStatus,
        approvedBy: newStatus === "active" ? approvedBy ?? all[idx].approvedBy : all[idx].approvedBy,
        approvedAt: newStatus === "active" ? new Date().toISOString() : all[idx].approvedAt,
        updatedAt: new Date().toISOString(),
      };
      write(PLANS_KEY, all);
    }
    if (SUPABASE_CONFIGURED) {
      try {
        await supabase
          .from("development_plans")
          .update({
            status: newStatus,
            approved_by: newStatus === "active" ? approvedBy ?? null : null,
            approved_at: newStatus === "active" ? new Date().toISOString() : null,
          })
          .eq("id", planId);
      } catch (err) {
        console.warn("[idpService] transitionStatus failed:", err);
      }
    }
  },

  /** Delete plan + cascade (DB CASCADE handles related rows). */
  async deletePlan(planId: string): Promise<void> {
    write(PLANS_KEY, read<DevelopmentPlan>(PLANS_KEY).filter((p) => p.id !== planId));
    write(GOALS_KEY, read<IDPGoal>(GOALS_KEY).filter((g) => g.planId !== planId));
    write(MILESTONES_KEY, read<IDPMilestone>(MILESTONES_KEY).filter((m) => m.planId !== planId));
    write(CHECKINS_KEY, read<IDPCheckin>(CHECKINS_KEY).filter((c) => c.planId !== planId));
    if (SUPABASE_CONFIGURED && planId.length === 36) {
      try {
        await supabase.from("development_plans").delete().eq("id", planId);
      } catch (err) {
        console.warn("[idpService] deletePlan failed:", err);
      }
    }
  },

  // ── private cache helper ─────────────────────────────────────────
  _upsertCache(plan: DevelopmentPlan): void {
    const planRow: DevelopmentPlan = {
      ...plan,
      goals: undefined,
      milestones: undefined,
      checkins: undefined,
    };
    const plans = read<DevelopmentPlan>(PLANS_KEY).filter((p) => p.id !== plan.id);
    plans.unshift(planRow);
    write(PLANS_KEY, plans);

    if (plan.goals?.length) {
      const goalIds = new Set(plan.goals.map((g) => g.id));
      const goals = read<IDPGoal>(GOALS_KEY).filter(
        (g) => g.planId !== plan.id || !goalIds.has(g.id),
      );
      write(GOALS_KEY, [...plan.goals, ...goals]);
    }
    if (plan.milestones?.length) {
      const msIds = new Set(plan.milestones.map((m) => m.id));
      const ms = read<IDPMilestone>(MILESTONES_KEY).filter(
        (m) => m.planId !== plan.id || !msIds.has(m.id),
      );
      write(MILESTONES_KEY, [...plan.milestones, ...ms]);
    }
    if (plan.checkins?.length) {
      const ciIds = new Set(plan.checkins.map((c) => c.id));
      const cis = read<IDPCheckin>(CHECKINS_KEY).filter(
        (c) => c.planId !== plan.id || !ciIds.has(c.id),
      );
      write(CHECKINS_KEY, [...plan.checkins, ...cis]);
    }
  },
};
