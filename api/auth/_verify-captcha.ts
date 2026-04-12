/**
 * POST /api/auth/verify-captcha
 * Verifica un token de Cloudflare Turnstile.
 *
 * Body: { token: string }
 * Returns: { ok: true, data: { success: boolean } }
 *
 * Si TURNSTILE_SECRET_KEY no está configurado, retorna success: true
 * (graceful degradation — captcha deshabilitado).
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const schema = z.object({
  token: z.string().min(1),
});

export default withHandler(
  { schema, maxRequests: 60 },
  async ({ body, ip }) => {
    const secretKey = process.env.TURNSTILE_SECRET_KEY;

    // Graceful degradation: si no hay secret key, captcha está deshabilitado
    if (!secretKey) {
      return successResponse({ success: true });
    }

    try {
      const res = await fetch(TURNSTILE_VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: secretKey,
          response: body.token,
          remoteip: ip,
        }),
      });

      if (!res.ok) {
        console.error(`[captcha] Turnstile API error ${res.status}`);
        return errorResponse("Error al verificar captcha", 502);
      }

      const result = await res.json() as { success: boolean; "error-codes"?: string[] };

      if (!result.success) {
        console.warn(`[captcha] Verification failed: ${result["error-codes"]?.join(", ")}`);
        return successResponse({ success: false });
      }

      return successResponse({ success: true });
    } catch (err) {
      console.error("[captcha] Verification error:", err instanceof Error ? err.message : err);
      return errorResponse("Error al verificar captcha", 502);
    }
  },
);
