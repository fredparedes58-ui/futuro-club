/**
 * VITAS · POST /api/legal/accept
 * Registra la aceptación de un documento legal (terms, privacy, parental_consent).
 * Almacena versión, IP, user-agent para compliance GDPR.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { getClientIP } from "../_lib/rateLimit";

export const config = { runtime: "edge" };

const acceptSchema = z.object({
  document: z.enum(["terms", "privacy", "parental_consent"]),
  version: z.string().min(1),
});

export default withHandler(
  { schema: acceptSchema, requireAuth: true, maxRequests: 20 },
  async ({ body, req, userId }) => {
    const sbUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!sbUrl || !sbKey) {
      return errorResponse("Supabase no configurado", 503, "CONFIG_MISSING");
    }

    const headers = {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    };

    const ip = getClientIP(req);
    const userAgent = req.headers.get("User-Agent") ?? "";

    try {
      const res = await fetch(`${sbUrl}/rest/v1/legal_acceptances`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          user_id: userId,
          document: body.document,
          version: body.version,
          ip_address: ip,
          user_agent: userAgent.substring(0, 500),
          accepted_at: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "unknown");
        console.error("[legal/accept] Supabase error:", res.status, errText);
        return errorResponse("Error registrando aceptación", 500);
      }

      return successResponse({
        accepted: true,
        document: body.document,
        version: body.version,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[legal/accept] Error:", err);
      return errorResponse("Error interno", 500);
    }
  },
);
