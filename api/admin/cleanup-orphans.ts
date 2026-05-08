/**
 * VITAS · TEMPORAL · ejecuta cleanup de huérfanos vía service role key.
 * Borrar tras uso. Protegido por TELEGRAM_WEBHOOK_SECRET.
 *
 * GET /api/admin/cleanup-orphans?secret=<secret>
 */
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

export default withHandler(
  { method: "GET", maxRequests: 5 },
  async ({ query }) => {
    if (!SECRET || query.secret !== SECRET) {
      return errorResponse("Bad secret", 401, "UNAUTHORIZED");
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Obtener IDs válidos de auth.users vía Admin API
    const { data: usersList } = await sb.auth.admin.listUsers();
    const validUserIds = new Set((usersList?.users ?? []).map(u => u.id));
    const out: Record<string, unknown> = { validUserIds: validUserIds.size };

    // Tablas a limpiar: filas con user_id NULL o user_id no presente en auth.users
    const tables = [
      "players",
      "player_analyses",
      "analyses",
      "telegram_messages",
      "coach_telegram_mapping",
      "telegram_link_tokens",
      "live_events",
      "live_matches",
      "team_analyses",
      "usage_log",
      "subscriptions",
    ];

    for (const t of tables) {
      try {
        // Borrar registros con user_id NULL
        const { count: nullCount } = await sb.from(t).delete({ count: "exact" }).is("user_id", null);
        // Para los huérfanos (user_id no en auth.users) seleccionamos primero los user_ids existentes
        const { data: rows } = await sb.from(t).select("user_id").not("user_id", "is", null);
        const orphanUserIds = [...new Set((rows ?? [])
          .map((r: { user_id?: string | null }) => r.user_id)
          .filter((u): u is string => !!u && !validUserIds.has(u)))];
        let orphanDeleted = 0;
        if (orphanUserIds.length > 0) {
          const { count } = await sb.from(t).delete({ count: "exact" }).in("user_id", orphanUserIds);
          orphanDeleted = count ?? 0;
        }
        out[t] = { nullDeleted: nullCount ?? 0, orphanDeleted, orphanUserIdsFound: orphanUserIds.length };
      } catch (err) {
        out[t] = { error: err instanceof Error ? err.message : String(err) };
      }
    }

    return successResponse(out);
  },
);
