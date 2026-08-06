/**
 * VITAS · Cross-club Peer Benchmark (Sprint B4 · día 3-4)
 * GET /api/benchmark/peer?playerId=<id>
 *
 * Compara un jugador contra el pool ANONIMIZADO cross-tenant de jugadores
 * con misma posición + edad±1 + (opcional) misma fase PHV. Solo expone
 * agregados estadísticos · jamás IDs, nombres ni datos personales.
 *
 * Network effect moat: cuanto más clubes usen VITAS, mejor el benchmark
 * para todos. Defendible vs Wyscout/Hudl que cobran €5K/año.
 *
 * Response shape:
 *   {
 *     stratum: { position, ageMin, ageMax, phvCategory },
 *     peerCount: number,
 *     vsi: { player: number, percentile: number, mean: number,
 *            p25: number, p50: number, p75: number, p90: number },
 *     byMetric: { speed: {...}, technique: {...}, ... },
 *     dataQuality: "high|medium|low|insufficient"
 *   }
 *
 * Data quality:
 *   - high:        peerCount >= 50
 *   - medium:      peerCount >= 20
 *   - low:         peerCount >= 10
 *   - insufficient peerCount < 10  (devuelve sin percentiles, solo count)
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { ownsPlayer } from "../_lib/ownership";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const querySchema = z.object({
  playerId: z.string().min(1),
  withPhv: z.enum(["true", "false"]).default("true"),
});

const METRICS = [
  "vsi", "metric_speed", "metric_technique", "metric_vision",
  "metric_stamina", "metric_shooting", "metric_defending",
] as const;

interface MetricStats {
  player: number;
  percentile: number | null;
  mean: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

function computeStats(values: number[], playerValue: number): MetricStats | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const pct = (p: number) => {
    const idx = Math.floor(n * p);
    return Number(sorted[Math.min(n - 1, idx)].toFixed(1));
  };
  const below = sorted.filter((v) => v <= playerValue).length;
  const percentile = n > 0 ? Math.round((below / n) * 100) : null;
  return {
    player: Number(playerValue.toFixed(1)),
    percentile,
    mean: Number(mean.toFixed(1)),
    p25: pct(0.25),
    p50: pct(0.5),
    p75: pct(0.75),
    p90: pct(0.9),
  };
}

export default withHandler(
  { method: "GET", requireAuth: true, allowServiceToken: true, maxRequests: 60 },
  async ({ query, userId, isServiceCall }) => {
    const params = querySchema.safeParse(query);
    if (!params.success) {
      return errorResponse({
        code: "invalid_params",
        message: params.error.errors[0]?.message ?? "playerId requerido",
        status: 400,
      });
    }

    // El jugador OBJETIVO debe pertenecer al usuario (el pool de peers es
    // anonimizado cross-tenant a propósito — solo agregados, sin IDs).
    if (!isServiceCall && !(await ownsPlayer(params.data.playerId, userId))) {
      return errorResponse({ code: "forbidden", message: "No autorizado para este jugador", status: 403 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // ── 1. Cargar jugador ─────────────────────────────────────
    const { data: player, error: pErr } = await supabase
      .from("players")
      .select("id, age, position, phv_category, vsi, metric_speed, metric_technique, metric_vision, metric_stamina, metric_shooting, metric_defending")
      .eq("id", params.data.playerId)
      .single();

    if (pErr || !player) {
      return errorResponse({ code: "player_not_found", message: pErr?.message ?? "no encontrado", status: 404 });
    }

    if (!player.age || !player.position) {
      return errorResponse({
        code: "missing_player_data",
        message: "Jugador necesita edad + posición para benchmark",
        status: 400,
      });
    }

    // ── 2. Query pool anonimizado cross-tenant ────────────────
    let q = supabase
      .from("players")
      .select("vsi, metric_speed, metric_technique, metric_vision, metric_stamina, metric_shooting, metric_defending")
      .neq("id", player.id)                    // excluir el propio jugador
      .gte("age", player.age - 1)
      .lte("age", player.age + 1)
      .eq("position", player.position);

    if (params.data.withPhv === "true" && player.phv_category) {
      q = q.eq("phv_category", player.phv_category);
    }

    const { data: peers, error: qErr } = await q.limit(2000);
    if (qErr) {
      return errorResponse({ code: "db_error", message: qErr.message, status: 500 });
    }

    const peerCount = peers?.length ?? 0;

    // ── 3. Determinar data quality ────────────────────────────
    let dataQuality: "high" | "medium" | "low" | "insufficient";
    if (peerCount >= 50) dataQuality = "high";
    else if (peerCount >= 20) dataQuality = "medium";
    else if (peerCount >= 10) dataQuality = "low";
    else dataQuality = "insufficient";

    const stratum = {
      position: player.position,
      ageMin: player.age - 1,
      ageMax: player.age + 1,
      phvCategory: params.data.withPhv === "true" ? player.phv_category : null,
    };

    if (dataQuality === "insufficient" || !peers) {
      return successResponse({
        stratum,
        peerCount,
        dataQuality,
        message: `Solo ${peerCount} jugadores comparables · necesitamos ≥10 para percentiles fiables.`,
      });
    }

    // ── 4. Computar stats por métrica ─────────────────────────
    const byMetric: Record<string, MetricStats | null> = {};
    for (const m of METRICS) {
      const playerVal = Number((player as Record<string, unknown>)[m] ?? 0);
      const peerVals = peers
        .map((p) => Number((p as Record<string, unknown>)[m] ?? 0))
        .filter((v) => v > 0);          // ignorar 0 (sin medir)
      if (peerVals.length < 5) {
        byMetric[m] = null;
        continue;
      }
      byMetric[m] = computeStats(peerVals, playerVal);
    }

    return successResponse({
      stratum,
      peerCount,
      dataQuality,
      vsi: byMetric.vsi,
      byMetric: {
        speed:     byMetric.metric_speed,
        technique: byMetric.metric_technique,
        vision:    byMetric.metric_vision,
        stamina:   byMetric.metric_stamina,
        shooting:  byMetric.metric_shooting,
        defending: byMetric.metric_defending,
      },
    });
  }
);
