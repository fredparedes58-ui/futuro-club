/**
 * VITAS · Player Anthropometrics API
 *
 *   POST   /api/players/anthropometrics                 → nueva medida + calc PHV
 *   PATCH  /api/players/anthropometrics?id=<rowId>      → actualizar medida + recalc PHV
 *   DELETE /api/players/anthropometrics?id=<rowId>      → borrar medida
 *   GET    /api/players/anthropometrics?playerId=<id>   → última medida o histórico
 *
 * Cada POST inserta una nueva fila (histórico, no sobreescribe).
 * PATCH/DELETE operan sobre una fila concreta por su id.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ── Schemas ─────────────────────────────────────────────────────────
const postSchema = z.object({
  playerId: z.string().min(1).max(120),
  heightCm: z.number().min(80).max(230),
  weightKg: z.number().min(15).max(150),
  sittingHeightCm: z.number().min(40).max(130).optional(),
  legLengthCm: z.number().min(30).max(130).optional(),
  chronologicalAge: z.number().min(5).max(25),
  gender: z.enum(["M", "F"]).default("M"),
  notes: z.string().max(500).optional(),
});

const patchSchema = postSchema.partial({ playerId: true });

const getSchema = z.object({
  playerId: z.string().min(1),
  history: z.enum(["true", "false"]).default("false"),
});

// ── Helper · fórmula Mirwald (idéntica a _phv-calculator.ts) ─────────
function computePhv(input: {
  age: number;
  height: number;
  weight: number;
  sittingHeight?: number;
  legLength?: number;
  gender: "M" | "F";
}) {
  const sh = input.sittingHeight ?? input.height * 0.52;
  const ll = input.legLength ?? input.height * 0.48;

  let offset: number;
  if (input.gender === "M") {
    offset =
      -9.236 +
      0.0002708 * (ll * sh) -
      0.001663 * (input.age * ll) +
      0.007216 * (input.age * sh) +
      0.02292 * ((input.weight / input.height) * 100);
  } else {
    offset =
      -9.376 +
      0.0001882 * (ll * sh) +
      0.0022 * (input.age * ll) +
      0.005841 * (input.age * sh) -
      0.002658 * (input.age * input.weight) +
      0.07693 * ((input.weight / input.height) * 100);
  }

  offset = Number(offset.toFixed(2));

  let category: "early" | "ontime" | "late";
  let phv_status: "pre_phv" | "during_phv" | "post_phv";
  let development_window: "critical" | "active" | "stable";

  if (offset < -1.0) { category = "early"; phv_status = "pre_phv"; }
  else if (offset > 1.0) { category = "late"; phv_status = "post_phv"; }
  else { category = "ontime"; phv_status = "during_phv"; }

  if (phv_status === "during_phv") development_window = "critical";
  else if ((offset >= -2 && offset < -1) || (offset > 1 && offset <= 2)) development_window = "active";
  else development_window = "stable";

  return {
    offset,
    biologicalAge: Number((input.age + offset).toFixed(2)),
    category,
    phv_status,
    development_window,
  };
}

export default withHandler(
  {
    method: ["GET", "POST", "PATCH", "DELETE"],
    requireAuth: true,
    maxRequests: 60,
  },
  async ({ req, userId, method, query }) => {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // ── GET · histórico o última medida ──────────────────────────
    if (method === "GET") {
      const params = getSchema.safeParse(query);
      if (!params.success) {
        return errorResponse({ code: "invalid_params", message: "playerId requerido", status: 400 });
      }

      if (params.data.history === "true") {
        const { data, error } = await supabase
          .from("player_anthropometrics")
          .select("*")
          .eq("player_id", params.data.playerId)
          .order("measured_at", { ascending: false });

        if (error) return errorResponse({ code: "db_error", message: error.message, status: 500 });
        return successResponse({ history: data, count: data?.length ?? 0 });
      } else {
        const { data, error } = await supabase
          .from("player_latest_anthropometrics")
          .select("*")
          .eq("player_id", params.data.playerId)
          .maybeSingle();

        if (error) return errorResponse({ code: "db_error", message: error.message, status: 500 });
        return successResponse({ latest: data });
      }
    }

    // ── DELETE · borrar fila + revertir player record al anterior ─
    if (method === "DELETE") {
      const id = query.id;
      if (!id) return errorResponse({ code: "missing_id", message: "Falta id en query", status: 400 });

      // Leer la fila antes de borrar para saber el player_id
      const { data: rowToDelete } = await supabase
        .from("player_anthropometrics")
        .select("player_id")
        .eq("id", id)
        .single();

      const { error } = await supabase
        .from("player_anthropometrics")
        .delete()
        .eq("id", id);

      if (error) return errorResponse({ code: "delete_failed", message: error.message, status: 500 });

      // Buscar la nueva última medición y resincronizar el player record
      if (rowToDelete?.player_id) {
        const { data: latest } = await supabase
          .from("player_anthropometrics")
          .select("height_cm, weight_kg, sitting_height_cm, leg_length_cm, maturity_offset, phv_category")
          .eq("player_id", rowToDelete.player_id)
          .order("measured_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latest) {
          await supabase.from("players").update({
            height_cm: latest.height_cm,
            weight_kg: latest.weight_kg,
            sitting_height: latest.sitting_height_cm,
            leg_length: latest.leg_length_cm,
            phv_category: latest.phv_category,
            phv_offset: latest.maturity_offset,
          }).eq("id", rowToDelete.player_id);
        }
        // Si no quedan mediciones, dejamos el player con los valores que tuviera
      }

      return successResponse({ deleted: true, id });
    }

    // ── PATCH · actualizar fila + recalcular PHV ─────────────────
    if (method === "PATCH") {
      const id = query.id;
      if (!id) return errorResponse({ code: "missing_id", message: "Falta id en query", status: 400 });

      const body = (await req.json().catch(() => null)) as unknown;
      const parsed = patchSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse({
          code: "invalid_body",
          message: parsed.error.errors[0]?.message ?? "Body inválido",
          status: 400,
        });
      }
      const input = parsed.data;

      // Recalcular PHV con los nuevos valores (todos requeridos para el cálculo)
      if (
        input.heightCm === undefined ||
        input.weightKg === undefined ||
        input.chronologicalAge === undefined
      ) {
        return errorResponse({
          code: "missing_fields",
          message: "PATCH requiere heightCm, weightKg, chronologicalAge",
          status: 400,
        });
      }

      const phv = computePhv({
        age: input.chronologicalAge,
        height: input.heightCm,
        weight: input.weightKg,
        sittingHeight: input.sittingHeightCm,
        legLength: input.legLengthCm,
        gender: input.gender ?? "M",
      });

      const { data: row, error } = await supabase
        .from("player_anthropometrics")
        .update({
          height_cm: input.heightCm,
          weight_kg: input.weightKg,
          sitting_height_cm: input.sittingHeightCm ?? null,
          leg_length_cm: input.legLengthCm ?? null,
          chronological_age: input.chronologicalAge,
          maturity_offset: phv.offset,
          biological_age: phv.biologicalAge,
          phv_category: phv.category,
          phv_status: phv.phv_status,
          development_window: phv.development_window,
          notes: input.notes,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) return errorResponse({ code: "update_failed", message: error.message, status: 500 });

      // Si esta fila era la más reciente, sincronizar al player record
      if (row?.player_id) {
        const { data: latest } = await supabase
          .from("player_anthropometrics")
          .select("id")
          .eq("player_id", row.player_id)
          .order("measured_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latest?.id === id) {
          await supabase.from("players").update({
            height_cm: input.heightCm,
            weight_kg: input.weightKg,
            sitting_height: input.sittingHeightCm ?? null,
            leg_length: input.legLengthCm ?? null,
            phv_category: phv.category,
            phv_offset: phv.offset,
          }).eq("id", row.player_id);
        }
      }

      return successResponse({ updated: true, record: row, phv });
    }

    // ── POST · nueva medida + calcular PHV ───────────────────────
    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse({
        code: "invalid_body",
        message: parsed.error.errors[0]?.message ?? "Body inválido",
        status: 400,
      });
    }
    const input = parsed.data;

    const { data: player } = await supabase
      .from("players")
      .select("tenant_id")
      .eq("id", input.playerId)
      .single();

    if (!player) {
      return errorResponse({ code: "player_not_found", message: "Jugador no existe", status: 404 });
    }

    const phv = computePhv({
      age: input.chronologicalAge,
      height: input.heightCm,
      weight: input.weightKg,
      sittingHeight: input.sittingHeightCm,
      legLength: input.legLengthCm,
      gender: input.gender,
    });

    const { data: row, error } = await supabase
      .from("player_anthropometrics")
      .insert({
        tenant_id: player.tenant_id,
        player_id: input.playerId,
        height_cm: input.heightCm,
        weight_kg: input.weightKg,
        sitting_height_cm: input.sittingHeightCm,
        leg_length_cm: input.legLengthCm,
        chronological_age: input.chronologicalAge,
        maturity_offset: phv.offset,
        biological_age: phv.biologicalAge,
        phv_category: phv.category,
        phv_status: phv.phv_status,
        development_window: phv.development_window,
        measured_by_user: userId,
        notes: input.notes,
      })
      .select()
      .single();

    if (error) {
      return errorResponse({ code: "save_failed", message: error.message, status: 500 });
    }

    // Sincronizar al player record · POST siempre es la nueva más reciente
    await supabase.from("players").update({
      height_cm: input.heightCm,
      weight_kg: input.weightKg,
      sitting_height: input.sittingHeightCm ?? null,
      leg_length: input.legLengthCm ?? null,
      phv_category: phv.category,
      phv_offset: phv.offset,
    }).eq("id", input.playerId);

    return successResponse({ saved: true, record: row, phv });
  }
);
