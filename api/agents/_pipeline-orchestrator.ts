/**
 * VITAS · Pipeline Orchestrator (refactor v2 · Sprint 3 día 4)
 * POST /api/agents/pipeline-orchestrator
 *
 * Llamado por modal-callback cuando Modal termina de procesar el vídeo.
 *
 * Body: { analysisId: string }
 *
 * Flujo:
 *   1. Lee analysis (con biomechanics + keypoints) desde BBDD
 *   2. Lee player + última anthropometrics (para PHV)
 *   3. Calcula deterministas: VSI + similarity (PHV ya está cacheado en anthro)
 *   4. Dispara los 6 reportes Claude en PARALELO
 *   5. Persiste cada reporte en `reports` table con prompt_version
 *   6. Marca analysis status='completed'
 *   7. Envía email "Análisis listo" via Resend
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";
import { normalizeLocale } from "../../src/lib/shared/locale";
import { resolveCategory } from "../../src/lib/shared/category";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PUBLIC_URL =
  process.env.VITAS_PUBLIC_URL ??
  process.env.VITAS_API_BASE_URL ??
  `https://${process.env.VERCEL_URL ?? "futuro-club.vercel.app"}`;
const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN ?? process.env.CRON_SECRET ?? "";
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";

const orchestratorSchema = z.object({
  analysisId: z.string().uuid(),
  /** Sprint 8: analysis mode — determines which report agents to invoke */
  mode: z.enum(["player", "team", "rival"]).optional().default("player"),
  /** Sprint 8: team/rival analysis data (only present in team/rival modes) */
  teamAnalysis: z.record(z.unknown()).optional(),
  /** FASE 5 · idioma de los reportes (default es); se propaga a todos los agentes */
  locale: z.enum(["es", "en"]).optional(),
  /** C1 multi-categoría · override explícito; si falta se deriva de la edad */
  category: z.enum(["youth", "senior"]).optional(),
});

/** Default report agents for individual player analysis */
const PLAYER_REPORT_AGENTS = [
  { name: "player-report", endpoint: "/api/agents/player-report", model: "sonnet" },
  { name: "lab-biomechanics", endpoint: "/api/agents/lab-biomechanics-report", model: "sonnet" },
  { name: "dna-profile", endpoint: "/api/agents/dna-profile", model: "haiku" },
  { name: "best-match", endpoint: "/api/agents/best-match-narrator", model: "haiku" },
  { name: "projection", endpoint: "/api/agents/projection-report", model: "haiku" },
  { name: "development-plan", endpoint: "/api/agents/development-plan", model: "haiku" },
  { name: "fatigue-report", endpoint: "/api/agents/fatigue-report", model: "haiku" },
  { name: "injury-risk-report", endpoint: "/api/agents/injury-risk-report", model: "haiku" },
  { name: "valuation-report", endpoint: "/api/agents/valuation-report", model: "sonnet" },
] as const;

/** Team-mode report agents (Sprint 8) */
const TEAM_REPORT_AGENTS = [
  { name: "team-report", endpoint: "/api/agents/team-report", model: "haiku" },
] as const;

/** Rival-mode report agents (Sprint 8) */
const RIVAL_REPORT_AGENTS = [
  { name: "rival-scout-report", endpoint: "/api/agents/rival-scout-report", model: "haiku" },
] as const;

const REPORT_AGENTS = PLAYER_REPORT_AGENTS;

type ReportName = (typeof REPORT_AGENTS)[number]["name"];

async function callInternal(endpoint: string, payload: unknown) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${PUBLIC_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${INTERNAL_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return { success: res.ok, data, latencyMs: Date.now() - t0 };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "fetch_failed",
      latencyMs: Date.now() - t0,
    };
  }
}

async function sendCompletionEmail(
  to: string,
  playerName: string,
  vsi: number,
  analysisLink: string
) {
  if (!RESEND_API_KEY) return false;

  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui;color:#0F172A;background:#F4F7FB;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:40px;border:1px solid #E2E8F0;">
    <h1 style="font-size:22px;color:#0066CC;margin:0 0 16px;">VITAS · Tu análisis está listo</h1>
    <p>El análisis biomecánico de <strong>${playerName}</strong> ya está disponible.</p>
    <div style="background:linear-gradient(135deg,#0066CC,#B82BD9);color:#fff;padding:24px;border-radius:14px;text-align:center;margin:24px 0;">
      <div style="font-size:14px;opacity:0.9;letter-spacing:0.1em;text-transform:uppercase;">VSI Score</div>
      <div style="font-size:56px;font-weight:700;line-height:1;margin:8px 0;">${vsi}</div>
      <div style="font-size:13px;opacity:0.9;">/100 · sobre todos los reportes</div>
    </div>
    <p>Has recibido <strong>6 reportes profesionales</strong>:</p>
    <ul style="line-height:1.8;color:#475569;">
      <li>📊 <strong>Player Report</strong> · resumen ejecutivo</li>
      <li>🦴 <strong>LAB Biomechanics</strong> · análisis técnico</li>
      <li>🧬 <strong>ADN Futbolístico</strong> · perfil de juego</li>
      <li>🎯 <strong>Best-Match</strong> · comparable profesional</li>
      <li>📈 <strong>Proyección 3 años</strong> · curva PHV</li>
      <li>📋 <strong>Plan de desarrollo</strong> · 12 semanas</li>
    </ul>
    <p style="text-align:center;margin:32px 0;">
      <a href="${analysisLink}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#0066CC,#B82BD9);color:#fff;text-decoration:none;border-radius:100px;font-weight:600;">
        Ver reportes →
      </a>
    </p>
    <p style="font-size:12px;color:#94a3b8;text-align:center;">VITAS · Football Intelligence</p>
  </div>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "VITAS <onboarding@resend.dev>",
      to: [to],
      subject: `VITAS · Análisis de ${playerName} listo · VSI ${vsi}`,
      html,
    }),
  });
  return res.ok;
}

export default withHandler(
  { schema: orchestratorSchema, requireAuth: false, maxRequests: 50 },
  async ({ body }) => {
    const { analysisId, mode = "player", teamAnalysis, locale, category } = body as z.infer<typeof orchestratorSchema>;
    const reportLocale = normalizeLocale(locale);
    const startedAt = Date.now();

    // Sprint 8: select report agents based on mode
    let activeAgents: { name: string; endpoint: string; model: string }[] = mode === "team"
      ? [...PLAYER_REPORT_AGENTS, ...TEAM_REPORT_AGENTS]
      : mode === "rival"
        ? [...PLAYER_REPORT_AGENTS, ...RIVAL_REPORT_AGENTS]
        : [...PLAYER_REPORT_AGENTS];

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // ── 1. Cargar analysis + player + anthropometrics ───────────────
    const { data: analysis, error: aErr } = await supabase
      .from("analyses")
      .select("*")
      .eq("id", analysisId)
      .single();

    if (aErr || !analysis) {
      return errorResponse({ code: "analysis_not_found", message: "Analysis not in DB", status: 404 });
    }

    // FASE 3: valoración = feature Club (usa Sonnet, la más cara). El orchestrator
    // corre con service token → no lo gatea withHandler; lo gateamos aquí para NO
    // pagar Sonnet en cada análisis de usuarios <Club. Dueño = analyses.user_id (mig 004).
    if (activeAgents.some((a) => a.name === "valuation-report")) {
      let plan = "free";
      if (analysis.user_id) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("plan,status")
          .eq("user_id", analysis.user_id)
          .maybeSingle();
        if (sub && (sub.status === "active" || sub.status === "trialing")) plan = sub.plan as string;
      }
      if (plan !== "club") {
        activeAgents = activeAgents.filter((a) => a.name !== "valuation-report");
        console.log(`[orchestrator] valuation-report omitido (plan=${plan}, requiere club)`);
      }
    }

    const { data: player } = await supabase
      .from("players")
      .select("id, name, position, secondary_positions, foot, tenant_id")
      .eq("id", analysis.player_id)
      .single();

    const { data: anthro } = await supabase
      .from("player_latest_anthropometrics")
      .select("*")
      .eq("player_id", analysis.player_id)
      .maybeSingle();

    // ── 2. Calcular VSI (servicio determinista) ─────────────────────
    // Subscores derivados de biomechanics + heuristics MVP
    const bm = (analysis.biomechanics ?? {}) as Record<string, number>;
    const sprintNorm = Math.min(100, (bm.stride_frequency_hz ?? 0) * 25);
    const asymmetryPen = 100 - Math.min(100, (bm.asymmetry_pct ?? 0) * 5);

    const subscores = {
      technique: 65,
      physical: Math.round((sprintNorm + asymmetryPen) / 2),
      mental: 60,
      tactical: 55,
      projection: anthro?.adjusted_vsi ?? 70,
    };

    const vsiRes = await callInternal("/api/agents/vsi-calculator", {
      playerId: analysis.player_id,
      subscores,
      context: { videoId: analysis.video_id, position: player?.position },
    });

    const vsi = vsiRes.success ? (vsiRes.data?.data ?? vsiRes.data) : null;

    // ── 3a. Scan rate detection (NUEVO Sprint 4) ────────────────────
    // Si Modal devolvió keypoints, calcular scan rate del jugador
    let scanResult: unknown = null;
    const keypointsRaw = (analysis as { keypoints?: unknown[] }).keypoints;
    if (Array.isArray(keypointsRaw) && keypointsRaw.length >= 10) {
      const ageGroup = anthro?.chronological_age
        ? `sub-${Math.floor(anthro.chronological_age / 2) * 2}`
        : "default";
      const scanRes = await callInternal("/api/agents/scan-detector", {
        playerId: analysis.player_id,
        frames: keypointsRaw,
        ageGroup,
      });
      if (scanRes.success) {
        scanResult = scanRes.data?.data ?? scanRes.data;
      }
    }

    // ── 3b. Similarity (best-match) ──────────────────────────────────
    const similarityRes = await callInternal("/api/agents/player-similarity", {
      metrics: {
        speed: subscores.physical,
        shooting: subscores.technique,
        vision: subscores.mental,
        technique: subscores.technique,
        defending: subscores.tactical,
        stamina: subscores.physical,
      },
      position: player?.position ?? "MID",
      youthAge: anthro?.chronological_age,
      phvOffset: anthro?.maturity_offset,
    });

    // ── 4. Persistir resultados deterministas en analysis ───────────
    await supabase
      .from("analyses")
      .update({
        vsi: vsi,
        phv: anthro
          ? {
              biological_age: anthro.biological_age,
              chronological_age: anthro.chronological_age,
              offset: anthro.maturity_offset,
              category: anthro.phv_category,
            }
          : null,
        similarity: similarityRes.success ? similarityRes.data?.data ?? similarityRes.data : null,
      })
      .eq("id", analysis.id);

    // ── 4b. Lookup fatigue session for fatigue-report agent (Sprint 7) ──
    let fatigueReport: unknown = null;
    let fatigueHistory: unknown[] = [];
    try {
      const { data: fatigueSessions } = await supabase
        .from("fatigue_sessions")
        .select("*")
        .eq("player_id", analysis.player_id)
        .order("session_date", { ascending: false })
        .limit(10);

      if (fatigueSessions && fatigueSessions.length > 0) {
        fatigueReport = fatigueSessions[0];
        fatigueHistory = fatigueSessions.map((s: Record<string, unknown>) => ({
          date: s.session_date,
          load: s.total_load,
          fatigueIndex: s.fatigue_index,
          acwrValue: s.acwr_value,
        }));
      }
    } catch {
      // Fatigue data is optional — pipeline continues without it
    }

    // ── 4b-bis. Historial de lesiones + snapshots de VSI ──────────────
    // Alimentan al injury calculator (historial) y al valuation model (VSI trend).
    let injuryHistory: Array<{ type: string; severity: string; daysOut: number | null; date: string; bodyPart?: string }> = [];
    let daysSinceLastInjury: number | null = null;
    let vsiHistory: Array<{ date: string; vsi: number }> = [];
    try {
      const { data: injuries } = await supabase
        .from("player_injuries")
        .select("injury_type, severity, days_out, injury_date, body_part")
        .eq("player_id", analysis.player_id)
        .order("injury_date", { ascending: false })
        .limit(20);
      if (injuries && injuries.length > 0) {
        injuryHistory = injuries.map((i: Record<string, unknown>) => ({
          type: String(i.injury_type ?? "other"),
          severity: String(i.severity ?? "minor"),
          daysOut: typeof i.days_out === "number" ? i.days_out : null,
          date: String(i.injury_date ?? ""),
          bodyPart: i.body_part ? String(i.body_part) : undefined,
        }));
        const lastDate = injuries[0]?.injury_date as string | undefined;
        if (lastDate) {
          daysSinceLastInjury = Math.max(
            0,
            Math.round((Date.now() - new Date(lastDate).getTime()) / 86_400_000),
          );
        }
      }
    } catch {
      // Historial de lesiones opcional — la pipeline continúa
    }
    try {
      const { data: snapshots } = await supabase
        .from("player_metric_snapshots")
        .select("snapshot_date, vsi")
        .eq("player_id", analysis.player_id)
        .not("vsi", "is", null)
        .order("snapshot_date", { ascending: false })
        .limit(12);
      if (snapshots && snapshots.length > 0) {
        vsiHistory = snapshots
          .filter((s: Record<string, unknown>) => typeof s.vsi === "number")
          .map((s: Record<string, unknown>) => ({
            date: String(s.snapshot_date ?? ""),
            vsi: s.vsi as number,
          }));
      }
    } catch {
      // Snapshots de VSI opcionales — la pipeline continúa
    }

    // ── 4c. Injury risk calculator (deterministic, Sprint 10) ─────────
    let injuryRiskResult: unknown = null;
    try {
      const injuryCalcRes = await callInternal("/api/agents/injury-risk-calculator", {
        playerId: analysis.player_id,
        age: anthro?.chronological_age ?? null,
        phvOffset: anthro?.maturity_offset ?? null,
        phvCategory: anthro?.phv_category ?? null,
        acwrValue: (fatigueReport as Record<string, unknown> | null)?.acwr_value ?? null,
        acwrZone: (fatigueReport as Record<string, unknown> | null)?.acwr_zone ?? null,
        fatigueIndex: (fatigueReport as Record<string, unknown> | null)?.fatigue_index ?? null,
        fatigueSeverity: (fatigueReport as Record<string, unknown> | null)?.fatigue_severity ?? null,
        biomechanicsInjuryRisk: bm.injury_risk ?? null,
        asymmetryPct: bm.asymmetry_pct ?? null,
        injuryHistory,
        daysSinceLastInjury,
        sessionsLast28Days: fatigueHistory.length,
      });
      if (injuryCalcRes.success) {
        injuryRiskResult = injuryCalcRes.data?.data?.report ?? injuryCalcRes.data?.data ?? null;
      }
    } catch {
      // Injury risk is non-blocking — pipeline continues
    }

    // ── 4d. Valuation model (deterministic, Sprint 12) ────────────────
    let valuationResult: unknown = null;
    try {
      const valuationRes = await callInternal("/api/agents/valuation-model", {
        playerId: analysis.player_id,
        age: anthro?.chronological_age ?? null,
        position: player?.position ?? null,
        currentVsi: (vsi as { vsi?: number })?.vsi ?? null,
        vsiHistory,
        phvOffset: anthro?.maturity_offset ?? null,
        phvCategory: anthro?.phv_category ?? null,
        biologicalAge: anthro?.biological_age ?? null,
        injuryRisk: (injuryRiskResult as Record<string, unknown> | null)?.overallRisk ?? null,
        injuryCategory: (injuryRiskResult as Record<string, unknown> | null)?.riskCategory ?? null,
        positionFitScores: [],
        sessionCount: fatigueHistory.length,
        analysisCount: 1, // Single analysis context
        competitiveLevel: "academy",
      });
      if (valuationRes.success) {
        valuationResult = valuationRes.data?.data?.report ?? valuationRes.data?.data ?? null;
      }
    } catch {
      // Valuation is non-blocking — pipeline continues
    }

    // ── 5. Disparar 9 reportes LLM EN PARALELO ──────────────────────
    // Posición jugada en este video específico · default a la principal
    const playedPosition =
      (analysis as { played_position?: string | null }).played_position
      ?? player?.position
      ?? null;

    const sharedContext = {
      playerId: analysis.player_id,
      videoId: analysis.video_id,
      analysisId: analysis.id,
      biomechanics: analysis.biomechanics,
      scanning: scanResult, // NUEVO Sprint 4 · scan rate detection
      phv: anthro,
      vsi: vsi,
      similarity: similarityRes.success ? similarityRes.data?.data ?? similarityRes.data : null,
      playerContext: {
        chronologicalAge: anthro?.chronological_age ?? 12,
        position: player?.position,
        secondaryPositions: (player as { secondary_positions?: string[] } | null)?.secondary_positions ?? [],
        foot: (player as { foot?: string } | null)?.foot,
      },
      // Contexto del video específico · agentes lo usan para análisis polivalente
      videoContext: {
        videoId: analysis.video_id,
        playedPosition,
        analyzedAt: (analysis as { completed_at?: string }).completed_at ?? new Date().toISOString(),
      },
      // Sprint 7: fatigue data for fatigue-report agent
      fatigueReport,
      fatigueHistory,
      // Sprint 10: injury risk calculator result (deterministic)
      injuryRisk: injuryRiskResult,
      // Sprint 12: valuation model result (deterministic)
      valuationModel: valuationResult,
      // Sprint 8: team/rival analysis data (if mode is team or rival)
      teamAnalysis: teamAnalysis ?? null,
      analysisMode: mode,
      // FASE 5 · idioma propagado a todos los agentes de reporte
      locale: reportLocale,
      // C1 multi-categoría · override explícito o derivada de la edad real del
      // jugador (anthro). Default youth (framing más protegido) si no hay datos.
      category: resolveCategory({ age: anthro?.chronological_age, category }),
    };

    const reportPromises = activeAgents.map((agent) =>
      callInternal(agent.endpoint, sharedContext).then((r) => ({
        name: agent.name,
        model: agent.model,
        ...r,
      }))
    );

    const reports = await Promise.all(reportPromises);
    const successfulReports = reports.filter((r) => r.success);

    // ── 6. Persistir cada reporte exitoso en `reports` table ────────
    // Si el agente respondió con fallback/mock, propagar el flag DENTRO del
    // content — antes se despojaba el envelope (source/fallback/model:"mock")
    // y la UI mostraba datos ficticios como reales.
    const reportInserts = successfulReports.map((r) => {
      const envelope = (r.data?.data ?? {}) as Record<string, unknown>;
      let content = (envelope.report ?? r.data ?? {}) as Record<string, unknown>;
      const isFallback =
        envelope.fallback === true ||
        envelope.model === "mock" ||
        (typeof envelope.source === "string" && envelope.source.startsWith("fallback"));
      if (isFallback && content && typeof content === "object") {
        content = { ...content, _fallback: true, _source: (envelope.source as string) ?? "fallback" };
      }
      return {
        tenant_id: analysis.tenant_id,
        analysis_id: analysis.id,
        player_id: analysis.player_id,
        report_type: r.name,
        content,
        prompt_version: r.data?.data?.promptVersion ?? "v1.0.0",
        model: r.model,
        input_tokens: 0,
        output_tokens: 0,
        cost_eur: 0,
        is_latest: true,
      };
    });

    if (reportInserts.length > 0) {
      await supabase.from("reports").insert(reportInserts);
    }

    // ── 6a. Flywheel: muestra etiquetada del dataset propietario (Sprint 5.3) ──
    // Base legal: ≥14 años (not_required) o consent parental verificado. No bloqueante.
    try {
      const dsAge = typeof anthro?.chronological_age === "number" ? anthro.chronological_age : null;
      let consentBasis: "not_required" | "parental_verified" | null =
        dsAge != null && dsAge >= 14 ? "not_required" : null;
      if (!consentBasis) {
        const { data: consent } = await supabase
          .from("parental_consents")
          .select("id")
          .eq("player_id", analysis.player_id)
          .eq("email_verified", true)
          .limit(1)
          .maybeSingle();
        if (consent) consentBasis = "parental_verified";
      }
      if (consentBasis) {
        await supabase.from("labeled_datasets").upsert(
          {
            tenant_id: analysis.tenant_id,
            analysis_id: analysis.id,
            player_id: analysis.player_id,
            chronological_age: dsAge,
            biological_age: anthro?.biological_age ?? null,
            phv_offset: anthro?.maturity_offset ?? null,
            phv_category: anthro?.phv_category ?? null,
            position: player?.position ?? null,
            features: {
              biomechanics: analysis.biomechanics ?? null,
              scanning: scanResult ?? null,
              similarity: similarityRes.success ? (similarityRes.data?.data ?? similarityRes.data) : null,
              subscores,
            },
            labels: {
              vsi: (vsi as { vsi?: number } | null)?.vsi ?? null,
              injuryRisk: (injuryRiskResult as Record<string, unknown> | null)?.overallRisk ?? null,
              valuation: valuationResult ?? null,
              reportTypes: successfulReports.map((r) => r.name),
            },
            consent_basis: consentBasis,
          },
          { onConflict: "analysis_id" },
        );
      }
    } catch {
      // Flywheel es no bloqueante — la pipeline continúa
    }

    // ── 6b. Save metric snapshot for progression tracking (Sprint 9) ──
    try {
      const fatigueData = fatigueReport as Record<string, unknown> | null;
      await callInternal("/api/agents/progression-tracker", {
        playerId: analysis.player_id,
        analysisId: analysis.id,
        vsi: (vsi as { vsi?: number })?.vsi ?? null,
        phvOffset: anthro?.maturity_offset ?? null,
        phvCategory: anthro?.phv_category ?? null,
        injuryRisk: (injuryRiskResult as Record<string, unknown> | null)?.overallRisk ?? bm.injury_risk ?? null,
        fatigueIndex: fatigueData?.fatigue_index ?? null,
        acwr: fatigueData?.acwr_value ?? null,
        xgAccumulated: null, // xG comes from client-side accumulator
        source: "video_analysis",
      });
    } catch {
      // Progression tracking is non-blocking — pipeline continues
    }

    // ── 7. Marcar analysis completed ───────────────────────────────
    const totalLatencyMs = Date.now() - startedAt;
    await supabase
      .from("analyses")
      .update({
        status: successfulReports.length === activeAgents.length ? "completed" : "completed_partial",
        completed_at: new Date().toISOString(),
        candidates: null, // limpiamos los crops · ya no se necesitan
      })
      .eq("id", analysis.id);

    // ── 8. Email Resend ────────────────────────────────────────────
    let emailSent = false;
    try {
      const { data: parentEmail } = await supabase
        .from("parental_consents")
        .select("parent_email")
        .eq("player_id", analysis.player_id)
        .eq("email_verified", true)
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (parentEmail?.parent_email && player) {
        const vsiScore = (vsi as { vsi?: number })?.vsi ?? 0;
        emailSent = await sendCompletionEmail(
          parentEmail.parent_email,
          player.name,
          vsiScore,
          `${PUBLIC_URL}/player/${analysis.player_id}/analysis/${analysis.id}`
        );
      }
    } catch {
      /* email opcional, no bloqueante */
    }

    return successResponse({
      analysisId: analysis.id,
      status: successfulReports.length === activeAgents.length ? "completed" : "completed_partial",
      reportsGenerated: successfulReports.length,
      reportsFailed: activeAgents.length - successfulReports.length,
      vsi: (vsi as { vsi?: number })?.vsi ?? null,
      totalLatencyMs,
      emailSent,
    });
  }
);
