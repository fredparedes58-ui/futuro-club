/**
 * VITAS · Cron Worker · Process Analyses Queue (v2 · Gemini)
 * Vercel Cron: GET /api/crons/process-analyses-queue
 *
 * DECISIÓN Gemini vs Modal (Sprint 0.9): el ANÁLISIS de vídeo de este worker usa
 * Gemini video-observation (más barato/rápido para observación estructurada, sin
 * GPU). Modal (MODAL_TRACK_URL) queda reservado para el TRACKING de jugadores/balón
 * del heatmap táctico y set-pieces (api/coaching/_track-players.ts,
 * api/tactical/_compute-from-video.ts) — no lo usa este worker.
 *
 * Gemini analiza el video completo y devuelve observaciones estructuradas.
 * Luego dispara pipeline-orchestrator para los 6 reportes Claude.
 *
 * Flujo:
 *   1. SELECT analyses WHERE status='queued' LIMIT 2
 *   2. UPDATE status='processing'
 *   3. Construir URL de video desde Bunny CDN
 *   4. POST a /api/agents/video-observation (Gemini · hasta 120s)
 *   5. Convertir GeminiObservation → biomechanics format
 *   6. Persistir en analyses table
 *   7. POST a /api/agents/pipeline-orchestrator → 6 reportes Claude
 */

import { errorResponse, successResponse } from "../_lib/apiResponse";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Node.js runtime. maxDuration 300 (no 120): este worker encadena DOS pasos largos
// por análisis — gemini-analyze (hasta ~120s) + pipeline-orchestrator (6 informes
// Opus, ~60s). En 120s el segundo paso se guillotinaba a mitad → el análisis quedaba
// colgado en 'processing_reports' hasta que el reaper lo mataba a la hora (una espera
// de ~4 min se volvía fallo + reintento). 300s da holgura para ambos. Vercel clampa al
// tope del plan si es menor, así que nunca es peor que hoy.
export const config = { runtime: "nodejs", maxDuration: 300 };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PUBLIC_URL =
  process.env.VITAS_PUBLIC_URL ??
  `https://${process.env.VERCEL_URL ?? "futuro-club.vercel.app"}`;

const SLACK_WEBHOOK = process.env.SLACK_RETENTION_WEBHOOK ?? "";
const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN ?? process.env.CRON_SECRET ?? "";

// Batch reducido: Gemini tarda ~30-60s por video, max 2 en paralelo dentro del timeout
const BATCH_SIZE = 2;

async function notifySlack(message: string) {
  if (!SLACK_WEBHOOK) return;
  try {
    await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  } catch {
    /* silent */
  }
}

interface QueuedAnalysis {
  id: string;
  player_id: string;
  video_id: string;
  tenant_id: string;
  retry_count?: number;
}

// ─── Gemini Observation → Biomechanics adapter ────────────────────────────

interface GeminiObservation {
  timeline: Array<{ timestamp: string; tipo: string; descripcion: string }>;
  dimensiones: Record<string, { observaciones: string[]; score_estimado: number }>;
  momentosDestacados: Array<{ timestamp: string; tipo: string; descripcion: string }>;
  patronesJuego: string[];
  resumenGeneral: string;
  eventosContados: Record<string, number>;
}

/**
 * Convert Gemini observation to a biomechanics-compatible object
 * that the pipeline-orchestrator can use for VSI calculation + reports.
 */
function geminiToBiomechanics(obs: GeminiObservation): Record<string, unknown> {
  const dims = obs.dimensiones ?? {};
  const events = obs.eventosContados ?? {};

  return {
    // Scores from Gemini dimensions (1-10 → normalized)
    technical_score: dims.tecnicaConBalon?.score_estimado ?? 5,
    tactical_score: dims.inteligenciaTactica?.score_estimado ?? 5,
    physical_score: dims.capacidadFisica?.score_estimado ?? 5,
    decision_score: dims.velocidadDecision?.score_estimado ?? 5,
    leadership_score: dims.liderazgoPresencia?.score_estimado ?? 5,
    efficacy_score: dims.eficaciaCompetitiva?.score_estimado ?? 5,

    // Event counts
    passes_completed: events.pasesCompletados ?? 0,
    passes_failed: events.pasesFallados ?? 0,
    progressive_passes: events.pasesProgresivos ?? 0,
    dribbles_successful: events.regatesConVentaja ?? 0,
    dribbles_failed: events.regatesSinVentaja ?? 0,
    pressing_effective: events.pressingEfectivo ?? 0,
    recoveries: events.recuperaciones ?? 0,
    tackles: events.robos ?? 0,
    interceptions: events.anticipaciones ?? 0,
    turnovers: events.perdidas ?? 0,
    duels_won: events.duelosGanados ?? 0,
    duels_lost: events.duelosPerdidos ?? 0,
    shots_on_target: events.disparosAlArco ?? 0,
    shots_off_target: events.disparosFuera ?? 0,
    scans: events.escaneos ?? 0,

    // Full observation for report agents
    gemini_observation: obs,
    source: "gemini-2.0-flash",
  };
}

// ─── Dispatch to Gemini via dedicated endpoint (Sprint 7) ────────────────

async function dispatchToGeminiEndpoint(
  analysis: QueuedAnalysis,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${PUBLIC_URL}/api/pipeline/gemini-analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${INTERNAL_TOKEN}`,
      },
      body: JSON.stringify({
        videoId: analysis.video_id,
        playerId: analysis.player_id,
        analysisId: analysis.id,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { success: false, error: `gemini-analyze ${res.status}: ${errText.slice(0, 200)}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

// ─── Dispatch to Gemini (inline fallback) ────────────────────────────────

async function dispatchToGemini(
  analysis: QueuedAnalysis,
  videoUrl: string,
): Promise<{ success: boolean; observation?: GeminiObservation; error?: string }> {
  try {
    // Load player context for Gemini prompt
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });
    const { data: player } = await supabase
      .from("players")
      .select("name, position, foot, tenant_id")
      .eq("id", analysis.player_id)
      .single();

    const { data: anthro } = await supabase
      .from("player_latest_anthropometrics")
      .select("chronological_age, height_cm, weight_kg")
      .eq("player_id", analysis.player_id)
      .maybeSingle();

    const playerContext = {
      name: player?.name ?? "Jugador",
      age: anthro?.chronological_age ?? 12,
      position: player?.position ?? "MID",
      foot: player?.foot ?? "derecho",
      height: anthro?.height_cm,
      weight: anthro?.weight_kg,
      competitiveLevel: "formativo",
    };

    const res = await fetch(`${PUBLIC_URL}/api/agents/video-observation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${INTERNAL_TOKEN}`,
      },
      body: JSON.stringify({ videoUrl, playerContext }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { success: false, error: `Gemini agent returned ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json() as { success?: boolean; data?: { observations?: GeminiObservation } };
    const observation = data?.data?.observations;
    if (!observation) {
      return { success: false, error: "Gemini returned no observations" };
    }

    return { success: true, observation };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

// ─── Trigger pipeline orchestrator ──────────────────────────────────────

async function triggerOrchestrator(analysisId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${PUBLIC_URL}/api/agents/pipeline-orchestrator`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${INTERNAL_TOKEN}`,
      },
      body: JSON.stringify({ analysisId }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { success: false, error: `orchestrator ${res.status}: ${errText.slice(0, 200)}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

// ─── Main queue processor ───────────────────────────────────────────────

/**
 * Reaper de análisis colgados: marca 'failed' los que llevan en 'processing' /
 * 'processing_reports' más de `staleHours` (el worker murió a mitad — edge timeout,
 * crash, Gemini colgado). Filtra por started_at para no pisar uno que se complete en
 * la carrera. Antes solo se rescataban tracking_jobs, NO los `analyses` (#56).
 */
export async function reapStuckAnalyses(supabase: SupabaseClient, staleHours: number): Promise<number> {
  const staleBefore = new Date(Date.now() - staleHours * 3600_000).toISOString();
  const { data: reaped } = await supabase
    .from("analyses")
    .update({ status: "failed", status_message: `Rescatado: colgado en procesamiento más de ${staleHours}h` })
    .in("status", ["processing", "processing_reports"])
    // started_at < staleBefore, PERO también las filas con started_at NULL (algún claim
    // no lo setea): `.lt` excluye NULLs en Postgres → sin el fallback a created_at, una
    // fila colgada sin started_at NO se rescataba nunca. Se usa created_at como respaldo.
    .or(`started_at.lt.${staleBefore},and(started_at.is.null,created_at.lt.${staleBefore})`)
    .select("id");
  return reaped?.length ?? 0;
}

async function processQueue() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // ── 0. Reaper de análisis colgados en 'processing' (ver reapStuckAnalyses) ──
  const reapedCount = await reapStuckAnalyses(supabase, Number(process.env.STALE_ANALYSIS_HOURS ?? 1));
  if (reapedCount > 0) {
    console.warn(`[queue] reaper: ${reapedCount} análisis colgados → failed`);
    await notifySlack(`♻️ VITAS reaper: ${reapedCount} análisis colgados en 'processing' → failed`);
  }

  // ── 1. Claim queued analyses ──
  let queuedAnalyses: QueuedAnalysis[] = [];

  const { data: rpcResult, error: rpcError } = await supabase
    .rpc("claim_queued_analyses", { batch_size: BATCH_SIZE });

  if (!rpcError && rpcResult && rpcResult.length > 0) {
    queuedAnalyses = rpcResult as QueuedAnalysis[];
  } else {
    if (rpcError) console.warn("[queue] RPC not available, using fallback:", rpcError.message);
    const { data: fallbackData, error: queryError } = await supabase
      .from("analyses")
      .select("id, player_id, video_id, tenant_id")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (queryError) {
      return { processed: 0, error: queryError.message };
    }
    queuedAnalyses = (fallbackData ?? []) as QueuedAnalysis[];
  }

  if (queuedAnalyses.length === 0) {
    return { processed: 0, reaped: reapedCount, message: "no queued analyses" };
  }

  const usedRpc = !rpcError;
  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const analysis of queuedAnalyses) {
    // Lock row if using fallback
    if (!usedRpc) {
      const { error: lockError } = await supabase
        .from("analyses")
        .update({ status: "processing", started_at: new Date().toISOString() })
        .eq("id", analysis.id)
        .eq("status", "queued");

      if (lockError) {
        results.push({ id: analysis.id, status: "skip", error: lockError.message });
        continue;
      }
    }

    // ── 2. Get video URL from Bunny ──
    const { data: video } = await supabase
      .from("videos")
      .select("bunny_video_id")
      .eq("id", analysis.video_id)
      .single();

    if (!video?.bunny_video_id) {
      await supabase
        .from("analyses")
        .update({ status: "failed", status_message: "video not found" })
        .eq("id", analysis.id);
      results.push({ id: analysis.id, status: "failed", error: "no_video" });
      continue;
    }

    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID ?? "";
    const cdnHost = process.env.BUNNY_CDN_HOSTNAME ?? "";
    const videoUrl = cdnHost
      ? `https://${cdnHost}/${video.bunny_video_id}/play_720p.mp4`
      : `https://video.bunnycdn.com/library/${libraryId}/videos/${video.bunny_video_id}/play.mp4`;

    // ── 3. Dispatch to Gemini via dedicated endpoint (Sprint 7 refactor) ──
    console.log(`[queue] Dispatching ${analysis.id} to gemini-analyze...`);
    const geminiRes = await dispatchToGeminiEndpoint(analysis);

    if (!geminiRes.success) {
      // Fallback: try inline Gemini if endpoint fails
      console.log(`[queue] gemini-analyze endpoint failed, trying inline...`);
      const gemini = await dispatchToGemini(analysis, videoUrl);

      if (!gemini.success || !gemini.observation) {
        await supabase
          .from("analyses")
          .update({
            status: "failed",
            status_message: `Gemini failed: ${gemini.error}`,
          })
          .eq("id", analysis.id);
        results.push({ id: analysis.id, status: "gemini_failed", error: gemini.error });
        await notifySlack(`⚠️ VITAS Gemini falló: ${analysis.id} · ${gemini.error}`);
        continue;
      }

      // Persist inline Gemini results
      const biomechanics = geminiToBiomechanics(gemini.observation);
      await supabase
        .from("analyses")
        .update({ status: "processing_reports", biomechanics })
        .eq("id", analysis.id);
    }

    // ── 5. Trigger pipeline orchestrator → 6 Claude reports ──
    const orch = await triggerOrchestrator(analysis.id);
    if (orch.success) {
      results.push({ id: analysis.id, status: "completed" });
    } else {
      // Gemini worked but orchestrator failed — data is saved, can be re-triggered
      results.push({ id: analysis.id, status: "reports_failed", error: orch.error });
      await notifySlack(`⚠️ VITAS orchestrator falló (Gemini OK): ${analysis.id} · ${orch.error}`);
    }
  }

  return {
    processed: results.length,
    reaped: reapedCount,
    completed: results.filter((r) => r.status === "completed").length,
    failed: results.filter((r) => r.status !== "completed").length,
    details: results,
  };
}

export default async function handler(req: Request) {
  // Verificar que viene de Vercel Cron
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return errorResponse({
      code: "unauthorized",
      message: "Invalid cron auth",
      status: 401,
    });
  }

  try {
    const result = await processQueue();
    return successResponse({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    await notifySlack(
      `🚨 VITAS cron process-analyses-queue FAILED: ${err instanceof Error ? err.message : "unknown"}`
    );
    return errorResponse({
      code: "queue_processor_failed",
      message: err instanceof Error ? err.message : "unknown",
      status: 500,
    });
  }
}
