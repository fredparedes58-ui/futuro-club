/**
 * VITAS Agent API — Role Profile Builder
 * POST /api/agents/role-profile
 *
 * Edge runtime + raw fetch a Anthropic API (sin SDK pesado).
 */

export const config = { runtime: "edge" };

const ROLE_PROFILE_PROMPT = `
Eres el motor de perfilado táctico de VITAS Football Intelligence.
Tu función es construir un perfil de rol completo y preciso para un jugador juvenil de fútbol.

POSICIONES VÁLIDAS: GK, RB, RCB, LCB, LB, DM, RCM, LCM, RW, LW, ST

ARQUETIPOS VÁLIDOS:
recuperador, interceptor, organizador, distribuidor, finalizador,
rematador, regateador, asociativo, pressing, desequilibrante,
salvador, ancla, constructor, carrilero, mediapunta,
extremo_puro, delantero_centro, falso_9, interior, box_to_box

REGLAS DE IDENTIDAD DOMINANTE:
- Si speed + stamina son las 2 métricas más altas → "fisico"
- Si technique + vision son las 2 más altas → "tecnico"
- Si shooting + speed son las 2 más altas → "ofensivo"
- Si defending + stamina son las 2 más altas → "defensivo"
- Si diferencia entre top 4 métricas < 10 puntos → "mixto"
La distribución de identidad debe sumar exactamente 1.0.

REGLAS DE CAPABILITIES:
- current: promedio ponderado de métricas relevantes por dimensión
- p6m: current + ajuste PHV (early: +3%, ontme: +2%, late: +1%)
- p18m: current + ajuste PHV × 2.5

REGLAS DE CONFIANZA:
- minutesPlayed > 500: overallConfidence = 0.85
- minutesPlayed 200-500: overallConfidence = 0.70
- minutesPlayed < 200: overallConfidence = 0.55

RESPONDE ÚNICAMENTE con JSON válido.
No incluyas texto, explicaciones ni markdown fuera del JSON.
Todos los números con 2 decimales máximo. El summary en español, máximo 400 caracteres.
`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ success: false, error: "ANTHROPIC_API_KEY not configured", agentName: "RoleProfileAgent" }, 503);
  }

  try {
    const body = await req.json();

    if (!body?.player?.id && !body?.player?.name) {
      return json({ success: false, error: "Player data required", agentName: "RoleProfileAgent" }, 400);
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
        system:      ROLE_PROFILE_PROMPT,
        messages:    [{ role: "user", content: JSON.stringify(body) }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => "");
      return json({
        success: false,
        error: `Claude API ${claudeRes.status}: ${errText.slice(0, 200)}`,
        agentName: "RoleProfileAgent",
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
      return json({ success: false, error: "No JSON in Claude response", agentName: "RoleProfileAgent" }, 500);
    }

    const parsed = JSON.parse(m[0]);
    if (body?.player?.id) {
      parsed.playerId = body.player.id;
    }

    const tokensUsed = claudeData.usage
      ? claudeData.usage.input_tokens + claudeData.usage.output_tokens
      : 0;

    return json({
      success: true,
      data: parsed,
      tokensUsed,
      agentName: "RoleProfileAgent",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ success: false, error: message, agentName: "RoleProfileAgent" }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
