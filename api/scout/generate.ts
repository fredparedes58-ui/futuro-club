/**
 * VITAS Scout — Insight Generation Endpoint
 * POST /api/scout/generate
 *
 * Generates AI-powered scout insights for one or all players.
 * Enriches each insight with RAG context (drills, benchmarks, methodology).
 * Persists results to scout_insights table in Supabase.
 */
import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { MODELS } from "../_lib/models";
import { resolveMaturity, type MaturityAssessment, type MaturityTiming } from "../../src/lib/phv/maturity";
import { resolveChronologicalAge } from "../../src/lib/shared/age";

export const config = { runtime: "edge" };

const GenerateSchema = z.object({
  playerId: z.string().optional(),
});

interface PlayerRow {
  id: string;
  name: string;
  age: number;
  position: string;
  vsi: number;
  phv_category: string;
  phv_offset: number;
  metrics: Record<string, number>;
  vsi_history: number[];
  minutes_played: number;
  updated_at: string;
  /**
   * Blob `data` original: fuente ÚNICA de los inputs de maduración (igual que
   * api/rankings/_list.ts). Se lee de aquí y NO de las columnas normalizadas de
   * la migración 024 porque `gender` tiene DEFAULT 'M' a nivel de columna: leer
   * el sexo de la columna trataría a una jugadora (o a un sexo no registrado)
   * como varón y rompería la abstención del invariante #5. El blob solo trae el
   * dato si una persona lo introdujo.
   */
  data?: {
    gender?: string | null;
    birthDate?: string | null;
    age?: number | null;
    height?: number | null;
    weight?: number | null;
    sittingHeight?: number | null;
    legLength?: number | null;
    motherHeightCm?: number | null;
    fatherHeightCm?: number | null;
  } | null;
}

/**
 * Maduración canónica del jugador vía el motor gateado `resolveMaturity` — la
 * MISMA fuente, con los MISMOS inputs, que las fichas y Rankings (invariante #7,
 * una sola implementación y una sola decisión por jugador). Los inputs salen del
 * blob `data` (no de las columnas 024): sexo solo si es "M"/"F" explícito
 * (invariante #5) y edad DECIMAL desde birthDate cuando existe (evita que el
 * redondeo del entero cruce el umbral de timing y contradiga a la ficha).
 *
 * El motor se abstiene (timing "unknown") sin antropometría, sin sexo, o lejos
 * del PHV (p.ej. un pre-púber de 9 años, donde Mirwald pierde fiabilidad). En ese
 * caso NO se afirma nada de maduración al LLM (invariante #2: ante dato ausente,
 * se bloquea; nunca se rellena con el valor naive persistido).
 */
function canonicalMaturity(player: PlayerRow): MaturityAssessment {
  const d = player.data ?? {};
  return resolveMaturity({
    sex: d.gender === "M" || d.gender === "F" ? d.gender : undefined,
    ageYears: resolveChronologicalAge({ birthDate: d.birthDate, age: d.age ?? player.age }) ?? undefined,
    heightCm: d.height ?? undefined,
    weightKg: d.weight ?? undefined,
    sittingHeightCm: d.sittingHeight ?? undefined,
    legLengthCm: d.legLength ?? undefined,
    motherHeightCm: d.motherHeightCm ?? undefined,
    fatherHeightCm: d.fatherHeightCm ?? undefined,
  });
}

/**
 * Descripción de maduración para el LLM derivada del MOTOR (no de las columnas
 * persistidas): así lo que se AFIRMA es lo mismo que gatea (cierra el hueco
 * gate-source ≠ emit-source, invariante #7). Términos vs pares ya resueltos
 * —"tardío" ↔ engine timing "late" (PHV después de la media), "precoz" ↔ "early"—
 * para que el LLM no reinvierta la etiqueta. `null` cuando el motor se abstiene.
 */
const TIMING_ES: Record<Exclude<MaturityTiming, "unknown">, string> = {
  early: "madurador precoz",
  on_time: "madurador en fase",
  late: "madurador tardío",
};
const STATUS_ES: Record<string, string> = {
  pre_phv: "pre-estirón",
  circa_phv: "en pleno estirón (ventana crítica de desarrollo)",
  post_phv: "post-estirón",
};
function phvForLLM(m: MaturityAssessment): {
  phvTiming?: string;
  phvEstado?: string;
  phvOffsetAnios?: number;
} | null {
  // El motor separa dos cosas y aquí se respeta esa separación:
  //  · ESTADO (pre/circa/post-estirón): DÓNDE está en SU propia curva. Se conoce
  //    en cuanto el motor computa (%PAH o Mirwald) y es una afirmación factual
  //    segura → se emite siempre que status !== "unknown".
  //  · TIMING (precoz/tardío vs pares): solo se AFIRMA con timing firme (blindaje
  //    anti-falso-positivo del motor) → phvTiming solo si timing !== "unknown".
  // Así el detonante de phv-alert (status === "circa_phv") NUNCA queda sin sustancia
  // (el estado acompaña), y no se afirma precoz/tardío sin confianza (inv #2/#3).
  const timingFirm = m.timing !== "unknown";
  const estado = m.status !== "unknown" ? STATUS_ES[m.status] : undefined;
  if (!timingFirm && !estado) return null;
  return {
    ...(timingFirm ? { phvTiming: TIMING_ES[m.timing as Exclude<MaturityTiming, "unknown">] } : {}),
    ...(estado ? { phvEstado: estado } : {}),
    // El offset solo con timing firme: ahí Mirwald está dentro de su ventana de
    // validez y el número es coherente con el estado; si no, se omite (no dar un
    // offset que el propio motor considera poco fiable).
    ...(timingFirm && typeof m.maturityOffset === "number"
      ? { phvOffsetAnios: Math.round(m.maturityOffset * 10) / 10 }
      : {}),
  };
}

interface AnalysisRow {
  id: string;
  player_id: string;
  created_at: string;
  // player_analyses.video_id es NULLABLE (000_full_schema.sql:100): el análisis
  // puede no tener vídeo asociado. select=* ya lo baja; lo declaramos para leerlo.
  video_id?: string | null;
  report_data: {
    estadoActual?: {
      dimensiones?: Record<string, { score: number }>;
      nivelActual?: string;
      fortalezasPrimarias?: string[];
      areasDesarrollo?: string[];
    };
    planDesarrollo?: {
      pilaresTrabajo?: Array<{ pilar: string; acciones: string[] }>;
    };
  };
}

interface RAGResult {
  content: string;
  category: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

type InsightContext = "breakout" | "comparison" | "phv-alert" | "drill-record" | "regression" | "milestone";

async function fetchPlayerHistory(
  supabaseUrl: string,
  supabaseKey: string,
  playerId: string,
  userId: string,
): Promise<Array<{ report: Record<string, unknown>; created_at: string }> | null> {
  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
  const res = await fetch(
    `${supabaseUrl}/rest/v1/player_analyses?player_id=eq.${playerId}&user_id=eq.${userId}&select=report,created_at&order=created_at.desc&limit=2`,
    { headers },
  );
  if (!res.ok) return null;
  const rows = await res.json() as Array<{ report: Record<string, unknown>; created_at: string }>;
  return rows;
}

function detectContext(
  player: PlayerRow,
  latestAnalysis: AnalysisRow | null,
  previousAnalysis: AnalysisRow | null,
  maturity: MaturityAssessment,
): InsightContext {
  const vsiHistory = player.vsi_history ?? [player.vsi];
  const currentVSI = player.vsi;
  const prevVSI = vsiHistory.at(-2) ?? currentVSI;
  const vsiDelta = currentVSI - prevVSI;

  // Check metric deltas if analyses exist
  let maxMetricDelta = 0;
  if (latestAnalysis?.report_data?.estadoActual?.dimensiones && previousAnalysis?.report_data?.estadoActual?.dimensiones) {
    const latest = latestAnalysis.report_data.estadoActual.dimensiones;
    const prev = previousAnalysis.report_data.estadoActual.dimensiones;
    for (const key of Object.keys(latest)) {
      const delta = (latest[key]?.score ?? 0) - (prev[key]?.score ?? 0);
      if (Math.abs(delta) > maxMetricDelta) maxMetricDelta = delta;
    }
  }

  // Regression: VSI dropped > 5 points
  if (vsiDelta < -5) return "regression";

  // Milestone: crossed VSI threshold
  if ((currentVSI >= 80 && prevVSI < 80) || (currentVSI >= 90 && prevVSI < 90)) return "milestone";

  // Breakout: VSI up >5 or metric up >1.5 (on 0-10 scale = >15 on 0-100)
  if (vsiDelta > 5 || maxMetricDelta > 1.5) return "breakout";

  // PHV Alert: ventana crítica de desarrollo = el jugador está EN pleno estirón,
  // según el ESTADO que calcula el motor canónico (circa_phv), no la columna
  // phv_category persistida (naive/estancada). Un estado circa_phv solo lo produce
  // el motor con antropometría real cerca del PHV, así que un menor sin datos —o un
  // pre-púber— nunca dispara esta alerta sobre un hueco (invariantes #2/#7).
  if (maturity.status === "circa_phv") return "phv-alert";

  // Drill record: any metric above 85
  const metrics = player.metrics ?? {};
  if (Object.values(metrics).some(v => v > 85)) return "drill-record";

  // Comparison: balanced profile (all metrics 55-75)
  const vals = Object.values(metrics);
  if (vals.length > 0 && vals.every(v => v >= 55 && v <= 75)) return "comparison";

  return "breakout"; // default
}

export default withHandler(
  { schema: GenerateSchema, requireAuth: true, maxRequests: 10, windowMs: 120_000 },
  async ({ body, req, userId }) => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase not configured", 503, "CONFIG_ERROR");
    }
    if (!anthropicKey) {
      return errorResponse("Anthropic API not configured", 503, "CONFIG_ERROR");
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const baseUrl = new URL(req.url).origin;

    // 1. Fetch players
    let playersUrl = `${supabaseUrl}/rest/v1/players?select=*&user_id=eq.${userId}`;
    if (body.playerId) {
      playersUrl += `&id=eq.${body.playerId}`;
    }
    playersUrl += "&order=updated_at.desc&limit=50";

    const playersRes = await fetch(playersUrl, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });

    if (!playersRes.ok) {
      return errorResponse("Failed to fetch players", 500);
    }

    const players: PlayerRow[] = await playersRes.json();
    if (players.length === 0) {
      return successResponse({ insights: [], message: "No players found" });
    }

    // 2. Fetch latest analyses for each player
    const playerIds = players.map(p => p.id);
    const analysesUrl = `${supabaseUrl}/rest/v1/player_analyses?select=*&player_id=in.(${playerIds.join(",")})&order=created_at.desc&limit=100`;
    const analysesRes = await fetch(analysesUrl, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });

    const analyses: AnalysisRow[] = analysesRes.ok ? await analysesRes.json() : [];

    // Group analyses by player
    const analysesByPlayer = new Map<string, AnalysisRow[]>();
    for (const a of analyses) {
      const list = analysesByPlayer.get(a.player_id) ?? [];
      list.push(a);
      analysesByPlayer.set(a.player_id, list);
    }

    // 3. Generate insights for each player
    const generatedInsights: Array<Record<string, unknown>> = [];
    const errors: string[] = [];
    const skipped: string[] = [];

    for (const player of players) {
      try {
        const playerAnalyses = analysesByPlayer.get(player.id) ?? [];
        const latestAnalysis = playerAnalyses[0] ?? null;
        const previousAnalysis = playerAnalyses[1] ?? null;

        // Sin datos reales (0 minutos jugados Y sin análisis completado) → NO
        // fabricamos una narrativa de scouting. El jugador entra al feed cuando
        // tenga minutos jugados o un análisis de vídeo. (Evita insights inventados
        // sobre cero datos, p.ej. "sugiere capacidad para acelerar desarrollo".)
        const hasRealData = (player.minutes_played ?? 0) > 0 || playerAnalyses.length > 0;
        if (!hasRealData) {
          skipped.push(player.name);
          continue;
        }

        // Maduración canónica (una sola vez por jugador). El motor decide qué se
        // afirma: si se abstiene (timing "unknown") no se manda nada de PHV al LLM.
        const maturity = canonicalMaturity(player);
        const phv = phvForLLM(maturity);
        const context = detectContext(player, latestAnalysis, previousAnalysis, maturity);

        // Query RAG for enrichment
        let ragContext = "";
        let ragDrills: RAGResult[] = [];
        try {
          const ragQuery = `${player.position} ${context} ${player.age} años métricas: velocidad ${player.metrics?.speed ?? 0} técnica ${player.metrics?.technique ?? 0} visión ${player.metrics?.vision ?? 0}`;
          const ragRes = await fetch(`${baseUrl}/api/rag/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: authHeader },
            body: JSON.stringify({ query: ragQuery, limit: 5 }),
          });
          if (ragRes.ok) {
            const ragData = await ragRes.json() as { data?: { context?: string; results?: RAGResult[] } };
            ragContext = ragData.data?.context ?? "";
            ragDrills = ragData.data?.results ?? [];
          }
        } catch {
          // RAG failure is non-blocking
        }

        // Build analysis context for Claude
        let analysisContext = "";
        if (latestAnalysis?.report_data?.estadoActual) {
          const ea = latestAnalysis.report_data.estadoActual;
          analysisContext += `\nÚltimo análisis (${latestAnalysis.created_at}):`;
          analysisContext += `\n- Nivel: ${ea.nivelActual ?? "N/A"}`;
          if (ea.fortalezasPrimarias) analysisContext += `\n- Fortalezas: ${ea.fortalezasPrimarias.join(", ")}`;
          if (ea.areasDesarrollo) analysisContext += `\n- Áreas desarrollo: ${ea.areasDesarrollo.join(", ")}`;
          if (ea.dimensiones) {
            analysisContext += `\n- Dimensiones: ${Object.entries(ea.dimensiones).map(([k, v]) => `${k}: ${v.score}/10`).join(", ")}`;
          }
        }
        if (previousAnalysis?.report_data?.estadoActual) {
          const ea = previousAnalysis.report_data.estadoActual;
          analysisContext += `\nAnálisis anterior (${previousAnalysis.created_at}):`;
          analysisContext += `\n- Nivel: ${ea.nivelActual ?? "N/A"}`;
          if (ea.dimensiones) {
            analysisContext += `\n- Dimensiones: ${Object.entries(ea.dimensiones).map(([k, v]) => `${k}: ${v.score}/10`).join(", ")}`;
          }
        }

        // Historical comparison: fetch last 2 player_analyses and compute dimension deltas
        let historicalContext = "";
        try {
          const history = await fetchPlayerHistory(supabaseUrl, supabaseKey!, player.id, userId!);
          if (history && history.length >= 2) {
            type ReportShape = {
              estadoActual?: {
                vsi?: number;
                dimensiones?: Record<string, { score?: number }>;
              };
            };
            const latest = (history[0].report ?? {}) as ReportShape;
            const previous = (history[1].report ?? {}) as ReportShape;
            const latestDims = latest?.estadoActual?.dimensiones;
            const prevDims = previous?.estadoActual?.dimensiones;
            const latestVSI: number = (latest?.estadoActual?.vsi ?? player.vsi ?? 0) as number;
            const prevVSI: number = (previous?.estadoActual?.vsi ?? player.vsi_history?.at(-2) ?? player.vsi ?? 0) as number;
            if (latestDims && prevDims) {
              const dimNames = Object.keys(latestDims);
              const deltas = dimNames.map((d: string) => {
                const curr = Number(latestDims[d]?.score ?? 0);
                const prev = Number(prevDims[d]?.score ?? 0);
                const delta = curr - prev;
                return `${d}: ${prev}→${curr} (${delta > 0 ? "+" : ""}${delta})`;
              });
              historicalContext = `\n\nHISTORIAL DE EVOLUCIÓN (comparación últimos 2 análisis):\n${deltas.join("\n")}`;
              const vsiDeltaSimple = latestVSI - prevVSI;
              historicalContext += `\nVSI previo: ${prevVSI} → VSI actual: ${latestVSI} (${vsiDeltaSimple > 0 ? "+" : ""}${vsiDeltaSimple})`;

              // Override context detection based on real analysis deltas
              const maxDelta = Math.max(...dimNames.map((d: string) => {
                return Number(latestDims[d]?.score ?? 0) - Number(prevDims[d]?.score ?? 0);
              }));
              const vsiDelta = latestVSI - prevVSI;
              if (maxDelta > 1.5) {
                // 15+ points on 0-100 scale → breakout
                historicalContext += `\n→ DETECCIÓN: Breakout (dimensión subió ${(maxDelta * 10).toFixed(0)}+ puntos)`;
              } else if (vsiDelta < -5) {
                historicalContext += `\n→ DETECCIÓN: Regresión (VSI cayó ${Math.abs(vsiDelta)} puntos)`;
              } else if ((latestVSI >= 80 && prevVSI < 80) || (latestVSI >= 90 && prevVSI < 90)) {
                historicalContext += `\n→ DETECCIÓN: Milestone (VSI cruzó umbral ${latestVSI >= 90 ? 90 : 80})`;
              }
            }
          }
        } catch {
          // Historical query is non-blocking
        }

        // Prompt for Claude
        const systemPrompt = `Eres el generador de insights de scouting de VITAS Football Intelligence.
Analiza datos de un jugador juvenil y genera un insight accionable en español.

CONTEXTO DETECTADO: ${context}
${ragContext ? `\nCONTEXTO RAG (base de conocimiento):\n${ragContext.slice(0, 1500)}` : ""}
${analysisContext ? `\nHISTORIAL DE ANÁLISIS:${analysisContext}` : ""}${historicalContext}

REGLAS:
- headline: máximo 80 caracteres, directo, sin emojis
- body: máximo 400 caracteres, incluye dato numérico específico, compara con análisis anterior si existe
- metric: nombre corto de la métrica más destacada
- metricValue: valor con unidad (ej: "82.4", "+14%")
- urgency: "high" para breakout/regression/milestone, "medium" para phv-alert/drill-record, "low" para comparison
- tags: máximo 4
- recommendedDrills: array de máximo 3 objetos {name, reason} basados en el contexto RAG
- actionItems: array de máximo 3 acciones concretas para el entrenador
- benchmark: una frase comparativa con percentil o referencia (ej: "Percentil 85 en velocidad para Sub-15")
- MADURACIÓN: usa ÚNICAMENTE los campos phvTiming / phvEstado / phvOffsetAnios del jugador si vienen. Si NINGUNO viene, NO menciones maduración, PHV, estirón ni offset: no hay dato fiable e inventarlo es un error. phvEstado (p.ej. "en pleno estirón (ventana crítica de desarrollo)") describe DÓNDE está en SU propia curva y puedes mencionarlo cuando venga. phvTiming es la comparación vs pares y solo existe cuando es fiable: úsalo TAL CUAL, sin invertirlo — "madurador tardío" = su estirón llega más tarde que la media (nivel físico aún por llegar; talento a menudo infravalorado), "madurador precoz" = estirón antes que la media (ventaja física temporal que sus pares igualarán), "madurador en fase" = a la par. Si viene phvEstado pero NO phvTiming, describe el estado SIN afirmar precoz/tardío. phvOffsetAnios = años respecto al pico de crecimiento (negativo = antes del estirón).

RESPONDE ÚNICAMENTE JSON:
{"type":"string","headline":"string","body":"string","metric":"string","metricValue":"string","urgency":"high|medium|low","tags":["string"],"recommendedDrills":[{"name":"string","reason":"string"}],"actionItems":["string"],"benchmark":"string"}`;

        const playerData = JSON.stringify({
          id: player.id,
          name: player.name,
          age: player.age,
          position: player.position,
          vsi: player.vsi,
          vsiHistory: player.vsi_history,
          // Maduración = lo que AFIRMA el motor canónico (mismos datos y misma
          // decisión que la ficha), ya traducido a términos vs pares. Si el motor
          // se abstiene, `phv` es null y el spread no añade campos: el LLM no ve
          // categoría ni offset persistidos que pudiera citar como hecho (inv #2/#7).
          ...(phv ?? {}),
          metrics: player.metrics,
          minutesPlayed: player.minutes_played,
        });

        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: MODELS.fast,
            max_tokens: 1024,
            temperature: 0.3,
            system: systemPrompt,
            messages: [{ role: "user", content: playerData }],
          }),
        });

        if (!claudeRes.ok) {
          errors.push(`Claude error for ${player.name}: ${claudeRes.status}`);
          continue;
        }

        const claudeData = await claudeRes.json() as {
          content: Array<{ type: string; text?: string }>;
        };

        let fullText = "";
        for (const block of claudeData.content) {
          if (block.type === "text" && block.text) fullText += block.text;
        }

        const match = fullText.match(/\{[\s\S]*\}/);
        if (!match) {
          errors.push(`No JSON for ${player.name}`);
          continue;
        }

        const parsed = JSON.parse(match[0]);

        // Map type to valid insight_type
        const typeMap: Record<string, string> = {
          breakout: "breakout", comparison: "comparison",
          phv_alert: "phv-alert", "phv-alert": "phv-alert",
          drill_record: "drill-record", "drill-record": "drill-record",
          regression: "regression", milestone: "milestone",
          general: "breakout",
        };

        const insightRow = {
          user_id: userId,
          player_id: player.id,
          player_name: player.name,
          insight_type: typeMap[parsed.type ?? context] ?? context,
          title: parsed.headline ?? "Insight generado",
          description: parsed.body ?? "",
          metric: parsed.metric ?? null,
          metric_value: parsed.metricValue ?? null,
          urgency: parsed.urgency ?? "low",
          tags: parsed.tags ?? [],
          context_data: {
            vsi: player.vsi,
            position: player.position,
            age: player.age,
            detectedContext: context,
            // Origen del insight (docx-13b): permite enlazar al vídeo/análisis desde
            // el Histórico del PlayerHub. NULL explícito cuando el insight nace de
            // minutos jugados sin análisis (latestAnalysis === null) → nunca inventado.
            source_video_id: latestAnalysis?.video_id ?? null,
            source_analysis_id: latestAnalysis?.id ?? null,
          },
          rag_drills: parsed.recommendedDrills ?? [],
          action_items: parsed.actionItems ?? [],
          benchmark: parsed.benchmark ?? null,
        };

        // Save to Supabase
        const insertRes = await fetch(`${supabaseUrl}/rest/v1/scout_insights`, {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(insightRow),
        });

        if (insertRes.ok) {
          const [saved] = await insertRes.json() as Array<Record<string, unknown>>;
          generatedInsights.push(saved);
        } else {
          const errText = await insertRes.text();
          errors.push(`Save error for ${player.name}: ${errText.slice(0, 200)}`);
        }
      } catch (err) {
        errors.push(`Exception for ${player.name}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    return successResponse({
      generated: generatedInsights.length,
      insights: generatedInsights,
      skippedNoData: skipped.length,
      skipped: skipped.length > 0 ? skipped : undefined,
      errors: errors.length > 0 ? errors : undefined,
      totalPlayers: players.length,
    });
  },
);
