/**
 * VITAS · POST /api/idp/generate-plan
 *
 * Orchestrates the creation of an IDP DRAFT for a player:
 *   1. Calls _idp-architect agent (with Claude Sonnet → deterministic fallback)
 *   2. Matches drills from DRILLS_LIBRARY for each goal (idpDrillMatcher)
 *   3. Generates 4 weekly milestones per goal (idpMilestoneScheduler)
 *   4. Persists everything via Supabase service role (bypass RLS)
 *
 * Returns the fully hydrated draft plan — coach reviews + approves it
 * via /api/idp/approve-plan before it becomes "active".
 *
 * Idempotent on (player_id, month_start): if a draft/active plan already
 * exists for that month, returns it without regenerating.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { MODELS } from "../_lib/models";
import {
  IDPArchitectInputSchema,
  type IDPArchitectOutput,
} from "../../src/agents/contracts";
import { generatePlanDeterministic } from "../../src/lib/idp/idpGoalGenerator";
import { suggestDrillIds } from "../../src/lib/idp/idpDrillMatcher";
import { generateMilestonesForPlan } from "../../src/lib/idp/idpMilestoneScheduler";
import { buildIDPArchitectPrompt } from "../../src/lib/idp/idpArchitectPrompt";
import type {
  DevelopmentPlan,
  IDPGoal,
} from "../../src/lib/idp/idpTypes";

export const config = { runtime: "edge" };

const GeneratePlanInputSchema = z.object({
  /** Full architect input (player, vsi, phv, behavioral, team context...) */
  architectInput: IDPArchitectInputSchema,
  /** Override month_start (defaults to current month). */
  monthStart: z
    .string()
    .regex(/^\d{4}-\d{2}-01$/, "monthStart must be YYYY-MM-01")
    .optional(),
  /** Coach user_id; if set, plan is owned by them. */
  coachId: z.string().optional(),
  tenantId: z.string().optional(),
});

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Compute first/last day of a month from YYYY-MM-01 string. */
function monthBounds(monthStart: string): { start: string; end: string } {
  const d = new Date(monthStart);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    start: monthStart,
    end: last.toISOString().slice(0, 10),
  };
}

function currentMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

const uuid = (): string => crypto.randomUUID();

/** Call the architect agent inline (no HTTP round-trip, save latency). */
async function callArchitect(
  input: z.infer<typeof IDPArchitectInputSchema>,
): Promise<{ output: IDPArchitectOutput; source: string; model: string }> {
  // No API key → deterministic
  if (!ANTHROPIC_API_KEY) {
    return {
      output: generatePlanDeterministic(input),
      source: "no_api_key",
      model: "deterministic-fallback",
    };
  }

  try {
    const prompt = buildIDPArchitectPrompt(input);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELS.reasoning,
        max_tokens: 2500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Anthropic ${response.status}`);
    const data = (await response.json()) as { content: Array<{ text: string }> };
    const text = data.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");
    const parsed = JSON.parse(match[0]);

    // Light validation (full validation already in the agent endpoint)
    if (!parsed.goals || !Array.isArray(parsed.goals)) {
      throw new Error("Missing goals array");
    }

    return { output: parsed as IDPArchitectOutput, source: "agent", model: MODELS.reasoning };
  } catch (err) {
    console.warn("[generate-plan] Architect call failed, falling back:", err);
    return {
      output: generatePlanDeterministic(input),
      source: "fallback_after_error",
      model: "deterministic-fallback",
    };
  }
}

export default withHandler(
  {
    method: "POST",
    schema: GeneratePlanInputSchema,
    requireAuth: true,
    maxRequests: 20,
    allowServiceToken: true,
    requiredPlan: "pro,club",
  },
  async ({ body, userId }) => {
    const input = body as z.infer<typeof GeneratePlanInputSchema>;
    const monthStart = input.monthStart ?? currentMonthStart();
    const { start, end } = monthBounds(monthStart);
    const playerId = input.architectInput.player.id;
    const coachId = input.coachId ?? userId ?? undefined;

    // 1. Idempotency check — if a draft/active plan exists, return it
    if (SUPABASE_URL && SUPABASE_KEY) {
      try {
        const headers = {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        };
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/development_plans?player_id=eq.${playerId}&month_start=eq.${start}&status=in.(draft,active)&select=*&order=created_at.desc&limit=1`,
          { headers },
        );
        if (res.ok) {
          const existing = (await res.json()) as Array<{ id: string }>;
          if (existing.length > 0) {
            // Return existing — caller can re-fetch via /get-plan
            return successResponse({
              planId: existing[0].id,
              status: "exists",
              message: "Plan already exists for this month",
            });
          }
        }
      } catch (err) {
        console.warn("[generate-plan] idempotency check failed:", err);
      }
    }

    // 2. Call architect (Claude or deterministic)
    const { output, source, model } = await callArchitect(input.architectInput);

    // 3. Build hydrated plan
    const planId = uuid();
    const now = new Date().toISOString();

    const goals: IDPGoal[] = output.goals.map((g) => {
      const goalId = uuid();
      // Match drills if the architect didn't supply any
      const drills =
        g.suggestedDrills && g.suggestedDrills.length > 0
          ? g.suggestedDrills
          : suggestDrillIds({
              dimension: g.dimension,
              age: input.architectInput.player.chronologicalAge,
              position: input.architectInput.player.position,
              goalTitle: g.title,
              limit: 4,
              preferEasy: g.dimension === "maturation",
            });
      return {
        id: goalId,
        planId,
        dimension: g.dimension,
        title: g.title,
        description: g.description,
        rationale: g.rationale,
        baselineMetric: g.baselineMetric,
        targetMetric: g.targetMetric,
        currentValue: undefined,
        drillsAssigned: drills,
        weight: g.weight,
        status: "pending" as const,
        aiProposed: source === "agent",
        coachEdited: false,
        createdAt: now,
        updatedAt: now,
      };
    });

    const plan: DevelopmentPlan = {
      id: planId,
      playerId,
      coachId,
      tenantId: input.tenantId,
      monthStart: start,
      monthEnd: end,
      status: "draft",
      overallFocus: output.overallFocus,
      contextNotes: undefined,
      agentSummary: output.agentSummary,
      generatedBy: source === "agent" ? "agent" : "agent", // both go through agent flow
      agentVersion: model === "deterministic-fallback" ? "deterministic-v1" : "v1.0.0",
      createdAt: now,
      updatedAt: now,
      goals,
    };

    const milestones = generateMilestonesForPlan(plan, goals);
    plan.milestones = milestones;

    // 4. Persist (best-effort — if Supabase not available, return plan anyway
    //    so the client can save it locally)
    if (SUPABASE_URL && SUPABASE_KEY) {
      try {
        const headers = {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        };

        const planRow = {
          id: planId,
          player_id: playerId,
          coach_id: coachId ?? null,
          tenant_id: input.tenantId ?? null,
          month_start: start,
          month_end: end,
          status: "draft",
          overall_focus: output.overallFocus,
          agent_summary: output.agentSummary,
          generated_by: "agent",
          agent_version: plan.agentVersion,
        };

        await fetch(`${SUPABASE_URL}/rest/v1/development_plans`, {
          method: "POST",
          headers,
          body: JSON.stringify(planRow),
        });

        const goalRows = goals.map((g) => ({
          id: g.id,
          plan_id: g.planId,
          dimension: g.dimension,
          title: g.title,
          description: g.description ?? null,
          rationale: g.rationale ?? null,
          baseline_metric: g.baselineMetric,
          target_metric: g.targetMetric,
          drills_assigned: g.drillsAssigned,
          weight: g.weight,
          status: g.status,
          ai_proposed: g.aiProposed,
          coach_edited: g.coachEdited,
        }));

        if (goalRows.length > 0) {
          await fetch(`${SUPABASE_URL}/rest/v1/idp_goals`, {
            method: "POST",
            headers,
            body: JSON.stringify(goalRows),
          });
        }

        const milestoneRows = milestones.map((m) => ({
          id: m.id,
          plan_id: m.planId,
          goal_id: m.goalId,
          due_date: m.dueDate,
          week_number: m.weekNumber,
          title: m.title,
          success_criteria: m.successCriteria ?? null,
          status: m.status,
          evidence: m.evidence,
        }));

        if (milestoneRows.length > 0) {
          await fetch(`${SUPABASE_URL}/rest/v1/idp_milestones`, {
            method: "POST",
            headers,
            body: JSON.stringify(milestoneRows),
          });
        }
      } catch (err) {
        console.warn(
          "[generate-plan] Supabase persistence failed, returning plan anyway:",
          err,
        );
        // Continue — client will keep plan in localStorage
      }
    }

    return successResponse({
      plan,
      source,
      model,
      status: "draft_created",
    });
  },
);
