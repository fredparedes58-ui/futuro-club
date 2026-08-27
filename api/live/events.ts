/**
 * VITAS · Live Events API (Sprint B2 · Match-day Live Mode)
 *
 *   POST   /api/live/events                       → registrar 1 o batch eventos
 *   GET    /api/live/events?matchId=<id>          → listar eventos de un partido
 *   DELETE /api/live/events?id=<id>               → eliminar evento (mistap)
 *
 * Body POST single:
 *   {
 *     matchId, playerId, eventType, timestampSeconds,
 *     half?, zoneRow?, zoneCol?, metadata?, notes?, clientEventId?
 *   }
 *
 * Body POST batch (sync de offline queue):
 *   { matchId, events: [<single sin matchId>] }
 *
 * Idempotencia: clientEventId UUID generado en cliente · UNIQUE
 * sobre (match_id, client_event_id) evita duplicados al sync.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const EVENT_TYPES = [
  "gol", "pase_clave", "recuperacion", "perdida",
  "duelo_ganado", "duelo_perdido",
  "asistencia", "tarjeta_amarilla", "tarjeta_roja",
  "parada_portero", "penalti_provocado", "penalti_cometido",
] as const;

const eventBaseSchema = z.object({
  playerId: z.string().nullable().optional(),
  eventType: z.enum(EVENT_TYPES),
  timestampSeconds: z.number().int().min(0).max(36_000),
  half: z.number().int().min(1).max(4).optional(),
  zoneRow: z.enum(["defensa", "medio", "ataque"]).optional(),
  zoneCol: z.enum(["izq", "cen", "dcha"]).optional(),
  metadata: z.record(z.unknown()).optional(),
  notes: z.string().max(200).optional(),
  clientEventId: z.string().max(64).optional(),
});

const singleSchema = eventBaseSchema.extend({
  matchId: z.string().uuid(),
});

const batchSchema = z.object({
  matchId: z.string().uuid(),
  events: z.array(eventBaseSchema).min(1).max(200),
});

export default withHandler(
  {
    method: ["GET", "POST", "DELETE"],
    requireAuth: true,
    maxRequests: 200,
  },
  async ({ req, userId, method, query }) => {
    if (!userId) {
      return errorResponse({ code: "unauthorized", message: "Login requerido", status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // ── GET ─────────────────────────────────────────────────────
    if (method === "GET") {
      const matchId = query.matchId;
      if (!matchId) {
        return errorResponse({ code: "missing_matchId", message: "matchId requerido", status: 400 });
      }
      // Ownership: sin .eq(user_id) cualquier autenticado leía los eventos
      // (player_id de menores, notas, metadata) de un partido ajeno con solo su
      // matchId. POST/DELETE ya gatean por user_id; el GET no lo hacía. Los
      // live_events se insertan con user_id del creador (:140/:192), así que
      // filtrar por user_id acota al dueño (igual que el DELETE).
      const { data: events, error } = await supabase
        .from("live_events")
        .select("*")
        .eq("match_id", matchId)
        .eq("user_id", userId)
        .order("timestamp_seconds", { ascending: true });

      if (error) {
        return errorResponse({ code: "db_error", message: error.message, status: 500 });
      }
      return successResponse({ events: events ?? [] });
    }

    // ── DELETE ──────────────────────────────────────────────────
    if (method === "DELETE") {
      const id = query.id;
      if (!id) {
        return errorResponse({ code: "missing_id", message: "id requerido", status: 400 });
      }
      const { error } = await supabase
        .from("live_events")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) {
        return errorResponse({ code: "delete_failed", message: error.message, status: 500 });
      }
      return successResponse({ deleted: true, id });
    }

    // ── POST · single o batch ───────────────────────────────────
    const body = (await req.json().catch(() => null)) as unknown;

    // Detectar batch vs single
    const isBatch = !!(body && typeof body === "object" && "events" in (body as Record<string, unknown>));
    if (isBatch) {
      const parsed = batchSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse({
          code: "invalid_body",
          message: parsed.error.errors[0]?.message ?? "Body inválido",
          status: 400,
        });
      }
      const input = parsed.data;

      // Verificar que el match es del user
      const { data: match } = await supabase
        .from("live_matches")
        .select("id, tenant_id, user_id")
        .eq("id", input.matchId)
        .single();
      if (!match || match.user_id !== userId) {
        return errorResponse({ code: "forbidden", message: "Partido no es tuyo", status: 403 });
      }

      const inserts = input.events.map((e) => ({
        tenant_id: match.tenant_id,
        match_id: input.matchId,
        player_id: e.playerId ?? null,
        user_id: userId,
        event_type: e.eventType,
        timestamp_seconds: e.timestampSeconds,
        half: e.half ?? 1,
        zone_row: e.zoneRow ?? null,
        zone_col: e.zoneCol ?? null,
        metadata: e.metadata ?? {},
        notes: e.notes ?? null,
        client_event_id: e.clientEventId ?? null,
      }));

      // upsert con onConflict en (match_id, client_event_id) para idempotencia
      const { data: rows, error } = await supabase
        .from("live_events")
        .upsert(inserts, { onConflict: "match_id,client_event_id", ignoreDuplicates: true })
        .select();

      if (error) {
        return errorResponse({ code: "insert_failed", message: error.message, status: 500 });
      }
      return successResponse({
        inserted: rows?.length ?? 0,
        skipped: inserts.length - (rows?.length ?? 0),
      });
    }

    // Single event
    const parsed = singleSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse({
        code: "invalid_body",
        message: parsed.error.errors[0]?.message ?? "Body inválido",
        status: 400,
      });
    }
    const input = parsed.data;

    const { data: match } = await supabase
      .from("live_matches")
      .select("id, tenant_id, user_id")
      .eq("id", input.matchId)
      .single();
    if (!match || match.user_id !== userId) {
      return errorResponse({ code: "forbidden", message: "Partido no es tuyo", status: 403 });
    }

    const { data: row, error } = await supabase
      .from("live_events")
      .insert({
        tenant_id: match.tenant_id,
        match_id: input.matchId,
        player_id: input.playerId ?? null,
        user_id: userId,
        event_type: input.eventType,
        timestamp_seconds: input.timestampSeconds,
        half: input.half ?? 1,
        zone_row: input.zoneRow ?? null,
        zone_col: input.zoneCol ?? null,
        metadata: input.metadata ?? {},
        notes: input.notes ?? null,
        client_event_id: input.clientEventId ?? null,
      })
      .select()
      .single();

    if (error) {
      return errorResponse({ code: "insert_failed", message: error.message, status: 500 });
    }
    return successResponse({ event: row });
  }
);
