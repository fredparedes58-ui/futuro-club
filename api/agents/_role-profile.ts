/**
 * VITAS Agent API — Role Profile Builder
 * POST /api/agents/role-profile
 *
 * Edge runtime + raw fetch a Anthropic API (sin SDK pesado).
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { checkUsageQuota, incrementUsage, usageExceededResponse } from "../_lib/usageGuard";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { hashInput, getCached, setCached, incrementHitCount } from "../_lib/agentCache";
import { roleProfileFallback } from "../_lib/agentFallbacks";

export const config = { runtime: "edge" };

const roleSchema = z.object({
  player: z.object({
    id: z.string().optional(),
    name: z.string().min(1),
  }).passthrough(),
}).passthrough();

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

export default withHandler(
  { schema: roleSchema, requireAuth: true, maxRequests: 30 },
  async ({ body, userId }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return successResponse(roleProfileFallback(body, "no_api_key"));
    }

    // ── Usage quota check ───────────────────────────────────────
    if (userId) {
      const usage = await checkUsageQuota(userId);
      if (!usage.allowed) return usageExceededResponse(usage);
    }

    // ── Cache check ─────────────────────────────────────────────
    const sbUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const playerId = body?.player?.id ?? null;

    if (sbUrl && sbKey && userId) {
      try {
        const cacheKey = await hashInput("role-profile", userId, body);
        const cached = await getCached(cacheKey, sbUrl, sbKey);
        if (cached) {
          incrementHitCount(cacheKey, sbUrl, sbKey).catch(() => {});
          return successResponse({ ...cached.response, _cached: true });
        }
      } catch { /* cache miss — proceed to Claude */ }
    }

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:       "claude-haiku-4-5",
        max_tokens:  1024,
        temperature: 0,
        system:      ROLE_PROFILE_PROMPT,
        messages:    [{ role: "user", content: JSON.stringify(body) }],
      }),
    });

    if (!claudeRes.ok) {
      console.warn(`[RoleProfile] Claude API ${claudeRes.status}, using fallback`);
      return successResponse(roleProfileFallback(body, "claude_error"));
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
      console.warn("[RoleProfile] No JSON in Claude response, using fallback");
      return successResponse(roleProfileFallback(body, "parse_error"));
    }

    const parsed = JSON.parse(m[0]);
    if (body?.player?.id) {
      parsed.playerId = body.player.id;
    }

    const tokensUsed = claudeData.usage
      ? claudeData.usage.input_tokens + claudeData.usage.output_tokens
      : 0;

    const result = { ...parsed, tokensUsed, agentName: "RoleProfileAgent" };

    // ── Cache store ─────────────────────────────────────────────
    if (sbUrl && sbKey && userId) {
      hashInput("role-profile", userId, body).then(cacheKey =>
        setCached(cacheKey, "role-profile", userId, playerId, null, result, tokensUsed, sbUrl, sbKey)
      ).catch(() => {});
    }

    // ── Usage log (non-blocking) ────────────────────────────────
    if (userId) incrementUsage(userId, "role-profile").catch(() => {});

    return successResponse(result);
  },
);
