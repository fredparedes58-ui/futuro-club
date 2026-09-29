/**
 * GET /api/admin/vsi-suspects
 * Lista para REVISIÓN HUMANA de jugadores cuyo historial VSI legacy contiene el 57.5
 * fabricado (barras por defecto guardadas sin evaluación antes de #146). Lee la vista
 * v_vsi_default_suspects (migración 070). Nada se borra ni se corrige aquí: una persona
 * revisa y resuelve (SQL documentado en la 070).
 * Auth: adminOnly — JWT de un admin de plataforma (email en ADMIN_EMAILS).
 *
 * Minimización (RGPD, menores): NO devuelve el nombre del jugador; el id basta para
 * localizarlo en el SQL editor (la vista sí lo trae para el operador).
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

export interface VsiSuspectRow {
  id: string;
  user_id: string;
  created_at: string;
  vsi: number | null;
  vsi_history: number[] | null;
  data_vsi_history: unknown;
  review_reason: string;
  flagged_at: string;
  current_vsi_is_default: boolean;
  metrics_are_default: boolean;
}

const SELECT = [
  "id", "user_id", "created_at", "vsi", "vsi_history", "data_vsi_history",
  "review_reason", "flagged_at", "current_vsi_is_default", "metrics_are_default",
].join(",");

export default withHandler(
  { method: "GET", requireAuth: true, adminOnly: true, maxRequests: 30 },
  async () => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return errorResponse("Supabase not configured", 503, "CONFIG_ERROR");
    }

    const res = await fetch(
      `${supabaseUrl}/rest/v1/v_vsi_default_suspects?select=${SELECT}&order=created_at.asc&limit=500`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );

    if (!res.ok) {
      // Lo más probable: la migración 070 aún no está aplicada (la vista no existe:
      // PostgREST 404 PGRST205 / 42P01). 503 = gate explícito hasta aplicarla; solo afecta
      // a esta pestaña nueva del panel /admin (el resto del panel no la consulta).
      const detail = await res.text().catch(() => "");
      return errorResponse(
        `No se pudo leer v_vsi_default_suspects (¿migración 070 aplicada?): ${res.status} ${detail.slice(0, 160)}`,
        503,
        "VSI_REVIEW_UNAVAILABLE",
      );
    }

    const suspects = (await res.json()) as VsiSuspectRow[];
    return successResponse({ suspects, total: suspects.length });
  },
);
