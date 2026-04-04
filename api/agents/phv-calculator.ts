/**
 * VITAS Agent API — PHV Calculator
 * Vercel Serverless Function
 * POST /api/agents/phv-calculator
 */

import Anthropic from "@anthropic-ai/sdk";
import { PHVInputSchema, PHVOutputSchema } from "../../src/agents/contracts";
import { PHV_CALCULATOR_PROMPT, AGENT_CONFIG } from "../../src/agents/prompts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const body = await req.json();
    const input = PHVInputSchema.parse(body);

    const message = await anthropic.messages.create({
      model: AGENT_CONFIG.model,
      max_tokens: AGENT_CONFIG.maxTokens,
      temperature: AGENT_CONFIG.temperature,
      system: PHV_CALCULATOR_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    });

    const raw = (message.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(raw);
    const output = PHVOutputSchema.parse(parsed);

    return new Response(
      JSON.stringify({
        success: true,
        data: output,
        tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
        agentName: "PHVCalculatorAgent",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message, agentName: "PHVCalculatorAgent" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export const config = { maxDuration: 60 };
