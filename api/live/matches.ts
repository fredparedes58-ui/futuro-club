/**
 * VITAS · Live Matches API (Sprint B2 · Match-day Live Mode)
 *
 *   POST   /api/live/matches                       → crear partido (start)
 *   GET    /api/live/matches?id=<id>               → leer 1 partido + sus eventos
 *   GET    /api/live/matches                       → listar mis partidos
 *   PATCH  /api/live/matches?id=<id>               → actualizar (pause/finish/score)
 *   DELETE /api/live/matches?id=<id>               → eliminar (cascade events)
 *
 * Body POST:   { teamName?, opponentName?, competition?, matchDate?, notes? }
 * Body PATCH:  { status?, scoreHome?, scoreAway?, durationSeconds?, endedAt?, notes? }
 *
 * Auth: requiere usuario autenticado · RLS isola por tenant.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ── Schemas ─────────────────────────────────────────────────────────
const createSchema = z.object({
  teamName: z.string().max(80).optional(),
  opponentName: z.string().max(80).optional(),
  competition: z.string().max(80).optional(),
  matchDate: z.string().optional(),
  notes: z.string().max(500).optional(),
  videoUrl: z.string().url().max(500).optional(),
});

const patchSchema = z.object({
  status: z.enum(["live", "paused", "finished", "aborted"]).optional(),
  scoreHome: z.number().int().min(0).max(99).optional(),
  scoreAway: z.number().int().min(0).max(99).optional(),
  durationSeconds: z.number().int().min(0).max(36_000).optional(),
  endedAt: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export default withHandler(
  {
    method: ["GET", "POST", "PATCH", "DELETE"],
    requireAuth: true,
    maxRequests: 60,
  },
  async ({ req, userId, method, query }) => {
    if (!userId) {
      return errorResponse({ code: "unauthorized", message: "Login requerido", status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Resolver tenant_id del usuario (cogemos cualquier player suyo)
    const { data: anyPlayer } = await supabase
      .from("players")
      .select("tenant_id")
      .limit(1)
      .maybeSingle();
    const tenantId = anyPlayer?.tenant_id ?? userId; // fallback usa userId

    // ── GET ─────────────────────────────────────────────────────
    if (method === "GET") {
      const id = query.id;
      if (id) {
        // Ownership: sin el filtro user_id, cualquier autenticado leía el partido
        // (analysis_result + eventos con player_id de menores) de otro usuario con
        // solo su id. list/PATCH/DELETE ya filtran por user_id; el GET-by-id no lo
        // hacía. Al acotar el match, los eventos (que se leen después) quedan
        // cubiertos porque solo se alcanzan tras confirmar la propiedad del match.
        const { data: match, error: mErr } = await supabase
          .from("live_matches")
          .select("*")
          .eq("id", id)
          .eq("user_id", userId)
          .single();

        if (mErr || !match) {
          return errorResponse({ code: "not_found", message: "Partido no existe", status: 404 });
        }

        const { data: events } = await supabase
          .from("live_events")
          .select("*")
          .eq("match_id", id)
          .order("timestamp_seconds", { ascending: true });

        return successResponse({ match, events: events ?? [] });
      }

      // Listar mis partidos
      const { data: matches, error: lErr } = await supabase
        .from("live_matches")
        .select("id, team_name, opponent_name, status, started_at, ended_at, score_home, score_away, duration_seconds, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40);

      if (lErr) {
        return errorResponse({ code: "db_error", message: lErr.message, status: 500 });
      }
      return successResponse({ matches: matches ?? [] });
    }

    // ── DELETE ──────────────────────────────────────────────────
    if (method === "DELETE") {
      const id = query.id;
      if (!id) {
        return errorResponse({ code: "missing_id", message: "id requerido", status: 400 });
      }
      const { error } = await supabase
        .from("live_matches")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) {
        return errorResponse({ code: "delete_failed", message: error.message, status: 500 });
      }
      return successResponse({ deleted: true, id });
    }

    // ── PATCH ───────────────────────────────────────────────────
    if (method === "PATCH") {
      const id = query.id;
      if (!id) {
        return errorResponse({ code: "missing_id", message: "id requerido", status: 400 });
      }
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

      const update: Record<string, unknown> = {};
      if (input.status !== undefined) update.status = input.status;
      if (input.scoreHome !== undefined) update.score_home = input.scoreHome;
      if (input.scoreAway !== undefined) update.score_away = input.scoreAway;
      if (input.durationSeconds !== undefined) update.duration_seconds = input.durationSeconds;
      if (input.endedAt !== undefined) update.ended_at = input.endedAt;
      if (input.notes !== undefined) update.notes = input.notes;
      // Si status pasa a finished y no hay ended_at, ponerlo ahora
      if (input.status === "finished" && !input.endedAt) {
        update.ended_at = new Date().toISOString();
      }

      const { data: match, error } = await supabase
        .from("live_matches")
        .update(update)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();

      if (error || !match) {
        return errorResponse({ code: "update_failed", message: error?.message ?? "no match", status: 500 });
      }
      return successResponse({ match });
    }

    // ── POST · crear partido ────────────────────────────────────
    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse({
        code: "invalid_body",
        message: parsed.error.errors[0]?.message ?? "Body inválido",
        status: 400,
      });
    }
    const input = parsed.data;

    const { data: match, error } = await supabase
      .from("live_matches")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        team_name: input.teamName ?? "Mi equipo",
        opponent_name: input.opponentName,
        competition: input.competition,
        match_date: input.matchDate,
        notes: input.notes,
        video_url: input.videoUrl ?? null,
        status: "live",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !match) {
      return errorResponse({ code: "create_failed", message: error?.message ?? "no match", status: 500 });
    }
    return successResponse({ match });
  }
);
