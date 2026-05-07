/**
 * VITAS · Baseline Analysis (sin vídeo)
 * POST /api/players/baseline-analysis
 *
 * Genera los 6 reportes Claude usando ÚNICAMENTE el perfil del jugador
 * (métricas subjetivas del coach + PHV + antropometría). Sin biomecánica
 * ni similarity de vídeo.
 *
 * Útil cuando todavía no hay análisis de vídeo (Bunny no pagado, MVP, etc.)
 * y queremos llenar el dashboard de reportes con una valoración inicial.
 *
 * Body: { playerId: string }
 * Returns: { analysisId: string, reportsGenerated: number, vsi: number }
 *
 * Cost: ~€0.13 por jugador (1× Sonnet + 5× Haiku con prompt caching)
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

const PIPELINE_VERSION = "baseline-v1.0";

const bodySchema = z.object({
  playerId: z.string().min(1),
});

// ── Player profile shape ────────────────────────────────────────────
interface PlayerProfile {
  id: string;
  name: string | null;
  age: number | null;
  position: string | null;
  foot: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  competitive_level: string | null;
  metrics: {
    speed: number; technique: number; vision: number;
    stamina: number; shooting: number; defending: number;
  };
  phv: {
    category: string | null;
    offset: number | null;
    biological_age: number | null;
  };
  vsi: number;
  tenant_id: string;
}

// ── Claude SDK helpers ──────────────────────────────────────────────

async function callClaude(opts: {
  model: "claude-sonnet-4-5" | "claude-haiku-4-5";
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1500,
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw = data.content?.[0]?.text ?? "{}";
  // Strip markdown fences if any
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); }
  catch { return { _raw: raw, _parseError: true }; }
}

// ── Shared player context for the prompts ───────────────────────────

function profileBlock(p: PlayerProfile): string {
  const m = p.metrics;
  return `JUGADOR
- Nombre: ${p.name ?? "—"}
- Edad cronológica: ${p.age ?? "?"} años
- Posición: ${p.position ?? "?"}
- Pie dominante: ${p.foot ?? "?"}
- Altura: ${p.height_cm ?? "?"} cm · Peso: ${p.weight_kg ?? "?"} kg
- Nivel competitivo: ${p.competitive_level ?? "Regional"}

VALORACIÓN COACH (0-100, subjetiva)
- Velocidad: ${m.speed}    · Resistencia: ${m.stamina}
- Técnica: ${m.technique}  · Visión: ${m.vision}
- Tiro: ${m.shooting}      · Defensa: ${m.defending}

PHV (maduración biológica · Mirwald)
- Categoría: ${p.phv.category ?? "no calculado"}
- Offset: ${p.phv.offset !== null ? `${p.phv.offset > 0 ? "+" : ""}${p.phv.offset} años` : "?"}
- Edad biológica: ${p.phv.biological_age ?? "?"} años

VSI cacheado: ${p.vsi}/100

LIMITACIÓN: Esta es una valoración baseline SIN ANÁLISIS DE VÍDEO. No hay
métricas biomecánicas, scanning rate, ni similarity con jugadores pro.
Basa el reporte en el perfil del jugador y la valoración subjetiva del coach.
Sé honesto sobre las limitaciones del análisis sin vídeo.`;
}

// ── VSI trend · slope + momentum + confidence ──────────────────────

function computeVsiTrend(history: number[]): {
  slope: number | null;          // VSI puntos por medición
  momentum: "up" | "flat" | "down" | null;
  confidence: "high" | "medium" | "low";
  delta: number | null;          // ultimos 3 vs anteriores 3
  samples: number;
} {
  if (!Array.isArray(history) || history.length < 2) {
    return { slope: null, momentum: null, confidence: "low", delta: null, samples: history?.length ?? 0 };
  }

  const n = history.length;
  const xs = history.map((_, i) => i);
  const ys = history;

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  const num = xs.reduce((acc, x, i) => acc + (x - meanX) * (ys[i] - meanY), 0);
  const den = xs.reduce((acc, x) => acc + (x - meanX) ** 2, 0);
  const slope = den === 0 ? 0 : num / den;

  let momentum: "up" | "flat" | "down" = "flat";
  if (slope > 0.5) momentum = "up";
  else if (slope < -0.5) momentum = "down";

  let confidence: "high" | "medium" | "low" = "low";
  if (n >= 6) confidence = "high";
  else if (n >= 3) confidence = "medium";

  // Delta = media últimos 3 vs media anteriores 3
  let delta: number | null = null;
  if (n >= 6) {
    const recent = ys.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const older = ys.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;
    delta = Number((recent - older).toFixed(2));
  }

  return {
    slope: Number(slope.toFixed(2)),
    momentum,
    confidence,
    delta,
    samples: n,
  };
}

// ── Compute VSI score from metrics + PHV ────────────────────────────

function computeVsi(p: PlayerProfile): { vsi: number; tier: string; tierLabel: string } {
  const m = p.metrics;
  const avg = (m.speed + m.technique + m.vision + m.stamina + m.shooting + m.defending) / 6;
  let vsi = Math.round(avg);

  // Ajuste por PHV (precoz penaliza, tardío bonifica)
  if (p.phv.category === "early")  vsi = Math.max(0, vsi - 5);
  if (p.phv.category === "late")   vsi = Math.min(100, vsi + 5);

  let tier = "develop";
  let tierLabel = "En desarrollo";
  if (vsi >= 85)      { tier = "elite"; tierLabel = "Elite"; }
  else if (vsi >= 70) { tier = "pro"; tierLabel = "Profesional"; }
  else if (vsi >= 55) { tier = "talent"; tierLabel = "Talento"; }

  return { vsi, tier, tierLabel };
}

// ── Peer percentile · compara contra jugadores edad±1 + misma posición + mismo PHV stratum
async function computePeerPercentile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  player: PlayerProfile,
): Promise<{ percentile: number | null; peerCount: number; stratum: string }> {
  const age = player.age ?? null;
  const pos = player.position;
  const phvCat = player.phv.category;
  if (!age || !pos) return { percentile: null, peerCount: 0, stratum: "no-data" };

  let q = supabase
    .from("players")
    .select("vsi", { count: "exact", head: false })
    .gte("age", age - 1)
    .lte("age", age + 1)
    .eq("position", pos);

  if (phvCat) q = q.eq("phv_category", phvCat);

  const { data: peers, count } = await q as { data: Array<{ vsi: number | null }> | null; count: number | null };

  if (!peers || peers.length === 0) {
    return { percentile: null, peerCount: 0, stratum: `${pos} ${age}±1 ${phvCat ?? "todos"}` };
  }

  const total = count ?? peers.length;
  const below = peers.filter((r) => Number(r.vsi ?? 0) <= player.vsi).length;
  const percentile = total > 0 ? Math.round((below / total) * 100) : null;

  return {
    percentile,
    peerCount: total,
    stratum: `${pos} U${Math.round(age)}±1 ${phvCat ?? "todos"}`,
  };
}

// ── Prompts (compactos · sin biomecánica) ──────────────────────────

const PROMPTS = {
  "player-report": {
    model: "claude-sonnet-4-5" as const,
    system: `Eres el motor del Player Report VITAS · baseline mode (sin vídeo).
Genera un reporte ancla para padre/madre del jugador. Lenguaje claro, motivador, honesto.
Output JSON estricto:
{
  "title": "Análisis VITAS · [Nombre]",
  "vsi_score": number, "tier": "elite|pro|talent|develop", "tier_label": "string",
  "executive_summary": "string max 280 chars · resumen para padres",
  "phv_summary": "string max 200 chars · explicación PHV",
  "strengths": [{"title":"string","evidence":"string max 120 chars"}],
  "areas_to_improve": [{"title":"string","evidence":"string max 120 chars","priority":"high|medium|low"}],
  "next_4_weeks_focus": "string max 220 chars",
  "honesty_note": "string max 180 chars · matiz realista sobre análisis baseline"
}
2-3 fortalezas, 2-3 áreas de mejora. Sin markdown, solo JSON.`,
  },
  "lab-biomechanics": {
    model: "claude-sonnet-4-5" as const,
    system: `Eres el motor de LAB Biomecánica VITAS · baseline mode.
SIN vídeo, no hay métricas reales. Output un JSON con tabla de PROYECCIÓN basada en perfil.
{
  "title": "Proyección biomecánica · baseline",
  "summary": "string max 240 chars · qué se podría medir cuando haya vídeo",
  "metrics_table": [
    {"metric":"string","value":"≈ valor estimado","interpretation":"string"}
  ],
  "next_focus": "string max 200 chars · pendiente subir vídeo para análisis real"
}
4-6 métricas estimadas (sprint, ratio fuerza/peso, simetría, etc.) basadas en posición + edad + métricas coach.
Indica claramente que son ESTIMACIONES, no medidas reales. Sin markdown.`,
  },
  "dna-profile": {
    model: "claude-haiku-4-5" as const,
    system: `Eres el motor del ADN Futbolístico VITAS · baseline.
Output JSON:
{
  "playing_style": "string max 100 chars",
  "archetype": "string max 80 chars · arquetipo táctico",
  "mentality": "string max 120 chars",
  "patrones": [{"patron":"string","frecuencia":"alta|media|baja","descripcion":"string"}]
}
2-3 patrones inferidos del perfil. Sin markdown.`,
  },
  "best-match": {
    model: "claude-haiku-4-5" as const,
    system: `Eres el motor de Best-Match VITAS · baseline.
Sugiere TRES jugadores profesionales referentes diferenciados por LENS distinto:
  1. lens "tecnico" → match por estilo de juego y técnica
  2. lens "fisico"  → match por perfil físico, velocidad o resistencia
  3. lens "lider"   → match por mentalidad, liderazgo y juego sin balón

Cada match con su narrativa propia y un timeline (qué hacía el pro a la edad del jugador).

Output JSON estricto:
{
  "top3": [
    {
      "lens": "tecnico|fisico|lider",
      "nombre": "string · jugador profesional",
      "posicion": "string",
      "club": "string · último club conocido",
      "score": number 0-100 · similitud en este lens,
      "narrativa": "string max 180 chars · por qué se parecen en este lens",
      "timeline_at_age": "string max 140 chars · qué hacía el pro a la misma edad cronológica"
    }
  ],
  "primary": {
    "nombre": "string · el match con mayor score global",
    "posicion": "string",
    "club": "string",
    "score": number,
    "narrativa": "string max 180 chars"
  }
}

3 matches obligatorios, uno por cada lens. Sin markdown.`,
  },
  projection: {
    model: "claude-haiku-4-5" as const,
    system: `Eres el motor de Proyección 3 años VITAS · baseline.
Output JSON:
{
  "optimistic": {"description":"string max 160 chars","level":"string · ej. Top semipro"},
  "realistic":  {"description":"string max 160 chars","level":"string · ej. Amateur alto"},
  "key_factors": ["string","string","string"],
  "risks":       ["string","string"]
}
Sin markdown.`,
  },
  "development-plan": {
    model: "claude-haiku-4-5" as const,
    system: `Eres el motor del Plan de Desarrollo VITAS · baseline.
Output JSON:
{
  "goal_6months":  "string max 140 chars",
  "goal_18months": "string max 140 chars",
  "pillars": [
    {"pilar":"string","prioridad":"alta|media|baja","acciones":["string","string"]}
  ]
}
3-4 pilares, cada uno con 2-3 acciones concretas. Sin markdown.`,
  },
} as const;

type ReportType = keyof typeof PROMPTS;

// ── Handler ────────────────────────────────────────────────────────

export default withHandler(
  { schema: bodySchema, requireAuth: true, maxRequests: 10 },
  async ({ body, userId }) => {
    if (!ANTHROPIC_API_KEY) {
      return errorResponse({ code: "no_api_key", message: "ANTHROPIC_API_KEY missing", status: 500 });
    }
    const input = body as z.infer<typeof bodySchema>;
    const startedAt = Date.now();

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // ── 1. Cargar player ───────────────────────────────────────────
    const { data: playerRow, error: pErr } = await supabase
      .from("players")
      .select("id, tenant_id, name, age, position, foot, height_cm, weight_kg, competitive_level, metric_speed, metric_technique, metric_vision, metric_stamina, metric_shooting, metric_defending, vsi, vsi_history, phv_category, phv_offset")
      .eq("id", input.playerId)
      .single();

    if (pErr || !playerRow) {
      return errorResponse({ code: "player_not_found", message: pErr?.message ?? "Jugador no existe", status: 404 });
    }

    const { data: anthro } = await supabase
      .from("player_latest_anthropometrics")
      .select("biological_age, maturity_offset, phv_category")
      .eq("player_id", input.playerId)
      .maybeSingle();

    const profile: PlayerProfile = {
      id: playerRow.id,
      tenant_id: playerRow.tenant_id,
      name: playerRow.name,
      age: playerRow.age,
      position: playerRow.position,
      foot: playerRow.foot,
      height_cm: playerRow.height_cm,
      weight_kg: playerRow.weight_kg,
      competitive_level: playerRow.competitive_level,
      metrics: {
        speed:     Number(playerRow.metric_speed)     || 0,
        technique: Number(playerRow.metric_technique) || 0,
        vision:    Number(playerRow.metric_vision)    || 0,
        stamina:   Number(playerRow.metric_stamina)   || 0,
        shooting:  Number(playerRow.metric_shooting)  || 0,
        defending: Number(playerRow.metric_defending) || 0,
      },
      phv: {
        category:        anthro?.phv_category    ?? playerRow.phv_category ?? null,
        offset:          anthro?.maturity_offset ?? (Number(playerRow.phv_offset) || null),
        biological_age:  anthro?.biological_age  ?? null,
      },
      vsi: Number(playerRow.vsi) || 0,
    };

    const vsiBase = computeVsi(profile);
    const peer = await computePeerPercentile(supabase, profile);

    // VSI trend desde history del player (incluye el actual al final si no esta)
    const historyArr = Array.isArray(playerRow.vsi_history)
      ? (playerRow.vsi_history as unknown[]).map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : [];
    const fullHistory = historyArr.length > 0 && historyArr[historyArr.length - 1] !== vsiBase.vsi
      ? [...historyArr, vsiBase.vsi]
      : historyArr;
    const trend = computeVsiTrend(fullHistory);

    const vsiData = { ...vsiBase, peer, trend, history: fullHistory };

    // ── 2. Insertar analysis row (placeholder video_id sentinel) ───
    const sentinelVideoId = `baseline-${profile.id}-${Date.now()}`;
    const { data: analysis, error: aErr } = await supabase
      .from("analyses")
      .insert({
        tenant_id: profile.tenant_id,
        player_id: profile.id,
        video_id: sentinelVideoId,
        user_id: userId,
        status: "processing",
        started_at: new Date().toISOString(),
        pipeline_version: PIPELINE_VERSION,
        biomechanics: null,
        phv: profile.phv.category ? { ...profile.phv } : null,
        vsi: vsiData,
        similarity: null,
      })
      .select()
      .single();

    if (aErr || !analysis) {
      return errorResponse({ code: "analysis_create_failed", message: aErr?.message ?? "no analysis", status: 500 });
    }

    // ── 3. Generar 6 reportes Claude en paralelo ───────────────────
    const userMessage = profileBlock(profile);

    const reportPromises = (Object.keys(PROMPTS) as ReportType[]).map(async (reportType) => {
      const cfg = PROMPTS[reportType];
      try {
        const content = await callClaude({
          model: cfg.model,
          system: cfg.system,
          user: userMessage,
          maxTokens: reportType === "player-report" ? 2500 : 1500,
        });
        return { reportType, content, model: cfg.model, ok: true as const };
      } catch (err) {
        return {
          reportType,
          content: null,
          model: cfg.model,
          ok: false as const,
          error: err instanceof Error ? err.message : "unknown",
        };
      }
    });

    const results = await Promise.all(reportPromises);
    const successful = results.filter((r) => r.ok);

    // ── 4. Persistir reportes ──────────────────────────────────────
    if (successful.length > 0) {
      const inserts = successful.map((r) => ({
        tenant_id: profile.tenant_id,
        analysis_id: analysis.id,
        player_id: profile.id,
        report_type: r.reportType,
        content: r.content,
        prompt_version: PIPELINE_VERSION,
        model: r.model,
        input_tokens: 0,
        output_tokens: 0,
        cost_eur: 0,
        is_latest: true,
      }));
      const { error: rErr } = await supabase.from("reports").insert(inserts);
      if (rErr) {
        console.error("[baseline] reports insert failed:", rErr.message);
      }
    }

    // ── 5. Marcar analysis completed ───────────────────────────────
    const finalStatus = successful.length === 6 ? "completed" : "completed";
    // (no usamos completed_partial porque el CHECK constraint no lo permite)

    await supabase
      .from("analyses")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        total_latency_ms: Date.now() - startedAt,
      })
      .eq("id", analysis.id);

    return successResponse({
      analysisId: analysis.id,
      status: finalStatus,
      reportsGenerated: successful.length,
      reportsFailed: 6 - successful.length,
      vsi: vsiData.vsi,
      tier: vsiData.tier,
      tierLabel: vsiData.tierLabel,
      peer,
      totalLatencyMs: Date.now() - startedAt,
      failedReports: results.filter((r) => !r.ok).map((r) => ({
        type: r.reportType,
        error: "error" in r ? r.error : undefined,
      })),
    });
  }
);
