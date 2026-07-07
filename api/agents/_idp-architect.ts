/**
 * VITAS · IDP Architect Agent (Sprint IDP)
 * POST /api/agents/idp-architect
 *
 * Generates a monthly Individual Development Plan proposal (3-5 goals
 * across 5 dimensions) for one player. Coach edits + approves before the
 * plan becomes "active". Hybrid workflow: agent proposes, coach decides.
 *
 * Model: Claude Sonnet (richer reasoning needed than Haiku — pondering
 * multi-dimensional weakness/strength tradeoffs + age + team context).
 *
 * Fallback chain:
 *   1. ANTHROPIC_API_KEY set → call Claude → validate output with Zod
 *   2. API call fails → fallback to deterministic generator
 *   3. Output validation fails → fallback to deterministic generator
 *
 * The deterministic generator (`generatePlanDeterministic`) produces the
 * SAME shape as the agent output, so callers don't branch on source.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";
import { MODELS } from "../_lib/models";
import {
  IDPArchitectInputSchema,
  IDPArchitectOutputSchema,
} from "../../src/agents/contracts";
import { generatePlanDeterministic } from "../../src/lib/idp/idpGoalGenerator";
import {
  buildIDPArchitectPrompt,
  IDP_PROMPT_VERSION,
} from "../../src/lib/idp/idpArchitectPrompt";

export const config = { runtime: "edge" };

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const PROMPT_VERSION = IDP_PROMPT_VERSION;
const MODEL = MODELS.reasoning;

export default withHandler(
  { schema: IDPArchitectInputSchema, requireAuth: false, maxRequests: 30 },
  async ({ body }) => {
    const data = body as z.infer<typeof IDPArchitectInputSchema>;

    // Branch 1: no API key → deterministic fallback
    if (!ANTHROPIC_API_KEY) {
      const plan = generatePlanDeterministic(data);
      return successResponse({
        plan,
        promptVersion: PROMPT_VERSION,
        model: "deterministic-fallback",
        source: "no_api_key",
      });
    }

    try {
      const prompt = buildIDPArchitectPrompt(data);

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2500,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error(
          "[idp-architect] Anthropic error:",
          response.status,
          errText.slice(0, 200),
        );
        const plan = generatePlanDeterministic(data);
        return successResponse({
          plan,
          promptVersion: PROMPT_VERSION,
          model: "deterministic-fallback",
          source: "fallback_api_error",
        });
      }

      const result = (await response.json()) as {
        content: Array<{ type: string; text: string }>;
        usage?: { input_tokens: number; output_tokens: number };
      };

      const text = result.content?.[0]?.text ?? "";

      // Robust JSON extraction (Claude may wrap in ```json blocks)
      let parsed: unknown;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        parsed = null;
      }

      // Validate against contract
      const validated = IDPArchitectOutputSchema.safeParse(parsed);
      if (!validated.success) {
        console.warn(
          "[idp-architect] Output validation failed, falling back:",
          validated.error.issues.slice(0, 3),
        );
        const plan = generatePlanDeterministic(data);
        return successResponse({
          plan,
          promptVersion: PROMPT_VERSION,
          model: "deterministic-fallback",
          source: "fallback_validation_error",
          validationErrors: validated.error.issues.slice(0, 5),
        });
      }

      return successResponse({
        plan: validated.data,
        promptVersion: PROMPT_VERSION,
        model: MODEL,
        inputTokens: result.usage?.input_tokens ?? 0,
        outputTokens: result.usage?.output_tokens ?? 0,
        source: "agent",
      });
    } catch (err) {
      console.error("[idp-architect] Unhandled error:", err);
      const plan = generatePlanDeterministic(data);
      return successResponse({
        plan,
        promptVersion: PROMPT_VERSION,
        model: "deterministic-fallback",
        source: "fallback_exception",
      });
    }
  },
);
