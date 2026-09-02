/**
 * GET  /api/team/join-code  → devuelve el join_code del director (lo genera si falta)
 * POST /api/team/join-code  → regenera el join_code (invalida el anterior)
 *
 * Solo directores. El código lo comparte el director para que le soliciten acceso
 * (POST /api/team/request-access con { code }).
 */

import { createClient } from "@supabase/supabase-js";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { randomHex } from "../_lib/edgeCrypto";

export const config = { runtime: "edge" };

export default withHandler(
  { method: ["GET", "POST"], requireAuth: true, maxRequests: 20 },
  async ({ method, userId }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return errorResponse("Supabase not configured", 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Solo directores tienen código de club.
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, join_code")
      .eq("user_id", userId)
      .single();

    if (!profile || profile.role !== "director") {
      return errorResponse("Solo los directores tienen código de club", 403, "FORBIDDEN");
    }

    // Regenerar (POST) o generar si aún no existe (GET).
    let code = profile.join_code as string | null;
    if (method === "POST" || !code) {
      code = randomHex(6); // 12 hex chars
      const { error } = await supabase
        .from("user_profiles")
        .update({ join_code: code })
        .eq("user_id", userId);
      if (error) return errorResponse(error.message, 500);
    }

    return successResponse({ code });
  },
);
