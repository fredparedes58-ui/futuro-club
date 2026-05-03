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
});

const REPORT_AGENTS = [
  { name: "player-report", endpoint: "/api/agents/player-report", model: "sonnet" },
  { name: "lab-biomechanics", endpoint: "/api/agents/lab-biomechanics-report", model: "sonnet" },
  { name: "dna-profile", endpoint: "/api/agents/dna-profile", model: "haiku" },
  { name: "best-match", endpoint: "/api/agents/best-match-narrator", model: "haiku" },
  { name: "projection", endpoint: "/api/agents/projection-report", model: "haiku" },
  { name: "development-plan", endpoint: "/api/agents/development-plan", model: "haiku" },
] as const;

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
    const { analysisId } = body as z.infer<typeof orchestratorSchema>;
    const startedAt = Date.now();

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

    const { data: player } = await supabase
      .from("players")
      .select("id, name, position, tenant_id")
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

    // ── 3. Similarity (best-match) ──────────────────────────────────
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

    // ── 5. Disparar 6 reportes LLM EN PARALELO ──────────────────────
    const sharedContext = {
      playerId: analysis.player_id,
      videoId: analysis.video_id,
      analysisId: analysis.id,
      biomechanics: analysis.biomechanics,
      phv: anthro,
      vsi: vsi,
      similarity: similarityRes.success ? similarityRes.data?.data ?? similarityRes.data : null,
      playerContext: {
        chronologicalAge: anthro?.chronological_age ?? 12,
        position: player?.position,
      },
    };

    const reportPromises = REPORT_AGENTS.map((agent) =>
      callInternal(agent.endpoint, sharedContext).then((r) => ({
        name: agent.name as ReportName,
        model: agent.model,
        ...r,
      }))
    );

    const reports = await Promise.all(reportPromises);
    const successfulReports = reports.filter((r) => r.success);

    // ── 6. Persistir cada reporte exitoso en `reports` table ────────
    const reportInserts = successfulReports.map((r) => ({
      tenant_id: analysis.tenant_id,
      analysis_id: analysis.id,
      player_id: analysis.player_id,
      report_type: r.name,
      content: r.data?.data?.report ?? r.data ?? {},
      prompt_version: r.data?.data?.promptVersion ?? "v1.0.0",
      model: r.model,
      input_tokens: 0,
      output_tokens: 0,
      cost_eur: 0,
      is_latest: true,
    }));

    if (reportInserts.length > 0) {
      await supabase.from("reports").insert(reportInserts);
    }

    // ── 7. Marcar analysis completed ───────────────────────────────
    const totalLatencyMs = Date.now() - startedAt;
    await supabase
      .from("analyses")
      .update({
        status: successfulReports.length === 6 ? "completed" : "completed_partial",
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
      status: successfulReports.length === 6 ? "completed" : "completed_partial",
      reportsGenerated: successfulReports.length,
      reportsFailed: 6 - successfulReports.length,
      vsi: (vsi as { vsi?: number })?.vsi ?? null,
      totalLatencyMs,
      emailSent,
    });
  }
);
