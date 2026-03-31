/**
 * VITAS Agent API — Tactical Label Agent (Fase 2 - Video)
 * Vercel Serverless Function
 * POST /api/agents/tactical-label
 */

import Anthropic from "@anthropic-ai/sdk";
import { TacticalLabelInputSchema, TacticalLabelOutputSchema } from "../../src/agents/contracts";
import { TACTICAL_LABEL_PROMPT, AGENT_CONFIG } from "../../src/agents/prompts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const body = await req.json();
    const input = TacticalLabelInputSchema.parse(body);

    const message = await anthropic.messages.create({
      model: AGENT_CONFIG.model,
      max_tokens: AGENT_CONFIG.maxTokens,
      temperature: AGENT_CONFIG.temperature,
      system: TACTICAL_LABEL_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    });

    const raw = (message.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(raw);
    parsed.frameId = input.frameId;

    const output = TacticalLabelOutputSchema.parse(parsed);

    return new Response(
      JSON.stringify({
        success: true,
        data: output,
        tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
        agentName: "TacticalLabelAgent",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message, agentName: "TacticalLabelAgent" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export const config = { runtime: "edge" };
