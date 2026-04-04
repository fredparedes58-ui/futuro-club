/**
 * VITAS Agent API — Scout Insight Generator
 * POST /api/agents/scout-insight
 *
 * Edge runtime + raw fetch a Anthropic API (sin SDK pesado).
 */

export const config = { runtime: "edge" };

const SCOUT_INSIGHT_PROMPT = `
Eres el generador de insights de scouting de VITAS Football Intelligence.
Tu función es analizar métricas de un jugador juvenil y generar un insight accionable en español.

CONTEXTOS Y SUS REGLAS:

breakout:
  - Úsalo cuando vsi > 75 Y vsiTrend = "up"
  - headline: menciona el nombre y el avance
  - urgency: "high"

phv_alert:
  - Úsalo cuando phvCategory = "early" Y speed > 75
  - headline: alerta de ventana crítica de desarrollo
  - urgency: "high"

drill_record:
  - Úsalo cuando alguna métrica > 85
  - headline: menciona la métrica récord
  - urgency: "medium"

comparison:
  - Úsalo cuando el perfil es equilibrado (todas métricas entre 55-75)
  - headline: comparativa con arquetipo táctico
  - urgency: "low"

general:
  - Para cualquier otro caso
  - urgency: "low"

REGLAS DE ESCRITURA (obligatorias):
- Todo en español
- headline: máximo 80 caracteres, directo, sin emojis
- body: máximo 300 caracteres, incluye dato numérico específico
- metric: nombre corto de la métrica más destacada (ej: "VSI", "Velocidad", "Visión")
- metricValue: valor con unidad (ej: "82.4", "+14%", "1er percentil")
- tags: máximo 4, en minúsculas con guión (ej: "phv-early", "breakout", "lateral-derecho")
- timestamp: ISO 8601 actual

RESPONDE ÚNICAMENTE con JSON válido con estas keys:
{"playerId":"string","type":"string","headline":"string","body":"string","metric":"string","metricValue":"string","urgency":"high|medium|low","tags":["string"],"timestamp":"ISO"}

No incluyas texto, explicaciones ni markdown fuera del JSON.
`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ success: false, error: "ANTHROPIC_API_KEY not configured", agentName: "ScoutInsightAgent" }, 503);
  }

  try {
    const body = await req.json();
    const input = body;

    // Validación básica
    if (!input?.player?.name && !input?.name) {
      return json({ success: false, error: "Player data required", agentName: "ScoutInsightAgent" }, 400);
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
        system:      SCOUT_INSIGHT_PROMPT,
        messages:    [{ role: "user", content: JSON.stringify(input) }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => "");
      return json({
        success: false,
        error: `Claude API ${claudeRes.status}: ${errText.slice(0, 200)}`,
        agentName: "ScoutInsightAgent",
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
      return json({ success: false, error: "No JSON in Claude response", agentName: "ScoutInsightAgent" }, 500);
    }

    const parsed = JSON.parse(m[0]);

    if (!parsed.timestamp) {
      parsed.timestamp = new Date().toISOString();
    }
    if (!parsed.playerId && input?.player?.id) {
      parsed.playerId = input.player.id;
    }

    const tokensUsed = claudeData.usage
      ? claudeData.usage.input_tokens + claudeData.usage.output_tokens
      : 0;

    return json({
      success: true,
      data: parsed,
      tokensUsed,
      agentName: "ScoutInsightAgent",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ success: false, error: message, agentName: "ScoutInsightAgent" }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
