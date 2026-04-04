/**
 * VITAS Agent API — Scout Insight Generator
 * Vercel Serverless Function
 * POST /api/agents/scout-insight
 */

import Anthropic from "@anthropic-ai/sdk";
import { ScoutInsightInputSchema, ScoutInsightOutputSchema } from "../../src/agents/contracts";
import { SCOUT_INSIGHT_PROMPT, AGENT_CONFIG } from "../../src/agents/prompts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const body = await req.json();
    const input = ScoutInsightInputSchema.parse(body);

    const message = await anthropic.messages.create({
      model: AGENT_CONFIG.model,
      max_tokens: AGENT_CONFIG.maxTokens,
      temperature: AGENT_CONFIG.temperature,
      system: SCOUT_INSIGHT_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    });

    const raw = (message.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(raw);

    // Inyecta timestamp real si Claude no lo incluyó correctamente
    if (!parsed.timestamp) {
      parsed.timestamp = new Date().toISOString();
    }
    parsed.playerId = input.player.id;

    const output = ScoutInsightOutputSchema.parse(parsed);

    return new Response(
      JSON.stringify({
        success: true,
        data: output,
        tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
        agentName: "ScoutInsightAgent",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message, agentName: "ScoutInsightAgent" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

