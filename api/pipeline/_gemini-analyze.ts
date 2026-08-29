/**
 * VITAS · Gemini Analyze Endpoint (Sprint 7 — Pipeline Automático)
 * POST /api/pipeline/gemini-analyze
 *
 * Dedicated endpoint for the Gemini video analysis step.
 * Decouples Gemini processing from the cron job for:
 *   - Cleaner separation of concerns
 *   - Independent retry on Gemini failures
 *   - Future support for manual re-analysis
 *
 * Body: { videoId: string, playerId: string, analysisId: string }
 *
 * Flow:
 *   1. Look up video URL from Bunny CDN
 *   2. Load player context (position, age, foot)
 *   3. Call video-observation agent (Gemini)
 *   4. Convert GeminiObservation → biomechanics format
 *   5. Persist to analyses table
 *   6. Return success with biomechanics
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

// maxDuration 300 (no 120): para un vídeo largo (~4 min) la observación Gemini puede
// acercarse a su propio tope de 120s; con solo 120s aquí, este endpoint moría antes de
// persistir → el análisis se reintentaba entero. 300s deja margen. Vercel lo clampa al
// tope del plan si es menor (nunca peor que hoy).
export const config = { runtime: "nodejs", maxDuration: 300 };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PUBLIC_URL =
  process.env.VITAS_PUBLIC_URL ??
  `https://${process.env.VERCEL_URL ?? "futuro-club.vercel.app"}`;
const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN ?? process.env.CRON_SECRET ?? "";

const geminiAnalyzeSchema = z.object({
  videoId: z.string(),
  playerId: z.string(),
  analysisId: z.string().uuid(),
});

interface GeminiObservation {
  timeline: Array<{ timestamp: string; tipo: string; descripcion: string }>;
  dimensiones: Record<string, { observaciones: string[]; score_estimado: number }>;
  momentosDestacados: Array<{ timestamp: string; tipo: string; descripcion: string }>;
  patronesJuego: string[];
  resumenGeneral: string;
  eventosContados: Record<string, number>;
}

/**
 * Convert Gemini observation to biomechanics-compatible format.
 * Same conversion as in process-analyses-queue.ts but centralized here.
 */
function geminiToBiomechanics(obs: GeminiObservation): Record<string, unknown> {
  const dims = obs.dimensiones ?? {};
  const events = obs.eventosContados ?? {};

  return {
    technical_score: dims.tecnicaConBalon?.score_estimado ?? 5,
    tactical_score: dims.inteligenciaTactica?.score_estimado ?? 5,
    physical_score: dims.capacidadFisica?.score_estimado ?? 5,
    decision_score: dims.velocidadDecision?.score_estimado ?? 5,
    leadership_score: dims.liderazgoPresencia?.score_estimado ?? 5,
    efficacy_score: dims.eficaciaCompetitiva?.score_estimado ?? 5,

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

    gemini_observation: obs,
    source: "gemini-2.0-flash",
  };
}

export default withHandler(
  // serviceOnly: paso INTERNO del pipeline (lee PII de menores, dispara Gemini de
  // pago, escribe biomechanics). Solo cron/orchestrator server-to-server con
  // INTERNAL_TOKEN; nunca un caller anónimo (era abuso de coste + overwrite ajeno).
  { schema: geminiAnalyzeSchema, serviceOnly: true, maxRequests: 20 },
  async ({ body }) => {
    const { videoId, playerId, analysisId } = body as z.infer<typeof geminiAnalyzeSchema>;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // ── 1. Get video URL ──
    const { data: video } = await supabase
      .from("videos")
      .select("bunny_video_id")
      .eq("id", videoId)
      .single();

    if (!video?.bunny_video_id) {
      return errorResponse({ code: "video_not_found", message: "Video not in DB", status: 404 });
    }

    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID ?? "";
    const cdnHost = process.env.BUNNY_CDN_HOSTNAME ?? "";
    const videoUrl = cdnHost
      ? `https://${cdnHost}/${video.bunny_video_id}/play_720p.mp4`
      : `https://video.bunnycdn.com/library/${libraryId}/videos/${video.bunny_video_id}/play.mp4`;

    // ── 2. Load player context ──
    const { data: player } = await supabase
      .from("players")
      .select("name, position, foot")
      .eq("id", playerId)
      .single();

    const { data: anthro } = await supabase
      .from("player_latest_anthropometrics")
      .select("chronological_age, height_cm, weight_kg")
      .eq("player_id", playerId)
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

    // ── 3. Call Gemini video-observation agent ──
    const startMs = Date.now();
    const geminiRes = await fetch(`${PUBLIC_URL}/api/agents/video-observation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${INTERNAL_TOKEN}`,
      },
      body: JSON.stringify({ videoUrl, playerContext }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "");
      return errorResponse({
        code: "gemini_failed",
        message: `Gemini returned ${geminiRes.status}: ${errText.slice(0, 200)}`,
        status: 502,
      });
    }

    const geminiData = await geminiRes.json() as {
      success?: boolean;
      data?: { observations?: GeminiObservation };
    };
    const observation = geminiData?.data?.observations;

    if (!observation) {
      return errorResponse({
        code: "gemini_no_observations",
        message: "Gemini returned no observations",
        status: 502,
      });
    }

    const geminiLatencyMs = Date.now() - startMs;

    // ── 4. Convert to biomechanics format ──
    const biomechanics = geminiToBiomechanics(observation);

    // ── 5. Persist to analyses table ──
    const { error: updateError } = await supabase
      .from("analyses")
      .update({
        status: "processing_reports",
        biomechanics,
      })
      .eq("id", analysisId);

    if (updateError) {
      return errorResponse({
        code: "db_update_failed",
        message: updateError.message,
        status: 500,
      });
    }

    return successResponse({
      analysisId,
      biomechanics,
      geminiLatencyMs,
      source: "gemini-2.0-flash",
    });
  },
);
