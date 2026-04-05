/**
 * VITAS Agent API — PHV Calculator
 * POST /api/agents/phv-calculator
 *
 * Edge runtime + raw fetch a Anthropic API (sin SDK pesado).
 */

export const config = { runtime: "edge" };

const PHV_CALCULATOR_PROMPT = `
Eres el motor de cálculo PHV (Peak Height Velocity) de VITAS Football Intelligence.
Tu única función es calcular la maduración biológica de jugadores juveniles de fútbol.

FÓRMULA MIRWALD (obligatoria para género M):
Maturity Offset = -9.236 + (0.0002708 × leg_length × sitting_height)
  - (0.001663 × age × leg_length)
  + (0.007216 × age × sitting_height)
  + (0.02292 × weight/height × 100)

Si no tienes sitting_height ni leg_length, estima con:
- sitting_height ≈ height × 0.52
- leg_length ≈ height × 0.48

REGLAS DE CATEGORIZACIÓN (obligatorias):
- offset < -1.0 → category: "early", phvStatus: "pre_phv"
- offset entre -1.0 y +1.0 → category: "ontme", phvStatus: "during_phv"
- offset > +1.0 → category: "late", phvStatus: "post_phv"

VENTANA DE DESARROLLO:
- Si phvStatus es "during_phv" → developmentWindow: "critical"
- Si offset entre -2.0 y -1.0, o +1.0 y +2.0 → developmentWindow: "active"
- Resto → developmentWindow: "stable"

AJUSTE VSI POR PHV:
- early: el VSI real se multiplica × 1.12
- ontme: VSI sin ajuste × 1.0
- late: VSI real × 0.92
El adjustedVSI es el VSI original recibido multiplicado por el factor correspondiente, clamped a [0,100].
Si no recibes VSI explícito, usa 70 como base.

CONFIANZA:
- Con sitting_height y leg_length reales: 0.92
- Sin esos datos (estimados): 0.74

RESPONDE ÚNICAMENTE con JSON válido:
{"playerId":"string","biologicalAge":number,"chronologicalAge":number,"offset":number,"category":"early|ontme|late","phvStatus":"pre_phv|during_phv|post_phv","developmentWindow":"critical|active|stable","adjustedVSI":number,"recommendation":"string en español max 120 chars","confidence":number}

No incluyas texto, explicaciones ni markdown fuera del JSON.
`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ success: false, error: "ANTHROPIC_API_KEY not configured", agentName: "PHVCalculatorAgent" }, 503);
  }

  try {
    const body = await req.json();

    if (!body?.playerId || !body?.chronologicalAge) {
      return json({ success: false, error: "playerId and chronologicalAge required", agentName: "PHVCalculatorAgent" }, 400);
    }

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:       "claude-haiku-4-5-20251001",
        max_tokens:  1024,
        temperature: 0,
        system:      PHV_CALCULATOR_PROMPT,
        messages:    [{ role: "user", content: JSON.stringify(body) }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => "");
      return json({
        success: false,
        error: `Claude API ${claudeRes.status}: ${errText.slice(0, 200)}`,
        agentName: "PHVCalculatorAgent",
      }, 500);
    }

    const claudeData = await claudeRes.json() as {
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    let fullText = "";
    for (const block of claudeData.content) {
      if (block.type === "text" && block.text) fullText += block.text;
    }

    const m = fullText.match(/\{[\s\S]*\}/);
    if (!m) {
      return json({ success: false, error: "No JSON in Claude response", agentName: "PHVCalculatorAgent" }, 500);
    }

    const parsed = JSON.parse(m[0]);
    const tokensUsed = claudeData.usage
      ? claudeData.usage.input_tokens + claudeData.usage.output_tokens
      : 0;

    return json({
      success: true,
      data: parsed,
      tokensUsed,
      agentName: "PHVCalculatorAgent",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ success: false, error: message, agentName: "PHVCalculatorAgent" }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
