/**
 * VITAS · Telegram Inspect endpoint (TEMPORAL · borrar tras debug)
 * GET /api/telegram/inspect?secret=<TELEGRAM_WEBHOOK_SECRET>
 *
 * Devuelve: mapping del coach + sus jugadores · para diagnosticar duplicados.
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

export default withHandler(
  { method: "GET", maxRequests: 30 },
  async ({ query }) => {
    if (!WEBHOOK_SECRET || query.secret !== WEBHOOK_SECRET) {
      return errorResponse("Bad secret", 401, "UNAUTHORIZED");
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Acción: limpiar historial conversacional de un chat
    if (query.action === "clear_history" && query.chat_id) {
      const cid = parseInt(query.chat_id, 10);
      const { error, count } = await supabase
        .from("telegram_messages")
        .delete({ count: "exact" })
        .eq("telegram_chat_id", cid);
      return successResponse({ cleared: count, error: error?.message });
    }

    // 1. Todos los mappings activos
    const { data: mappings } = await supabase
      .from("coach_telegram_mapping")
      .select("user_id, telegram_chat_id, telegram_username, telegram_first_name, linked_at")
      .is("unlinked_at", null);

    // 2. Para cada user_id, sus jugadores
    const result: Record<string, unknown> = { mappings, players: {} };
    const userIds = (mappings ?? []).map((m) => m.user_id as string);
    for (const uid of userIds) {
      const { data: players } = await supabase
        .from("players")
        .select("id, name, age, position, vsi, user_id, created_at")
        .eq("user_id", uid);
      (result.players as Record<string, unknown>)[uid] = players;
    }

    // 3. Jugadores con name ~ Samu (sin filtro user_id) · para detectar leaks
    const { data: allSamus } = await supabase
      .from("players")
      .select("id, name, user_id, age, position, vsi, created_at")
      .ilike("name", "%samu%");
    result.allSamusInDB = allSamus;

    // 4. Jugadores sin user_id (orphans)
    const { data: orphans } = await supabase
      .from("players")
      .select("id, name, age, position, vsi")
      .is("user_id", null);
    result.orphanPlayers = orphans;

    // 5. Historial de mensajes Telegram (para diagnóstico)
    const { data: msgs, count: msgCount } = await supabase
      .from("telegram_messages")
      .select("telegram_chat_id, role, content, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(20);
    result.telegramMessagesCount = msgCount;
    result.telegramMessagesSample = msgs;

    return successResponse(result);
  },
);
