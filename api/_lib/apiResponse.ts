/**
 * VITAS · Standardized API Response Helpers
 *
 * Todas las respuestas de la API usan el formato:
 * - Éxito: { ok: true, data: ... }
 * - Error: { ok: false, error: { message: string, code?: string } }
 */

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "https://futuro-club.vercel.app";

const CORS_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Vary": "Origin",
};

/**
 * Respuesta exitosa estandarizada.
 */
export function successResponse(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ ok: true, success: true, data }),
    {
      status,
      headers: { ...CORS_HEADERS, ...extraHeaders },
    }
  );
}

/**
 * Respuesta de error estandarizada.
 * Acepta dos formas:
 *   errorResponse("mensaje", 400, "code")
 *   errorResponse({ message: "mensaje", status: 400, code: "code" })
 */
export interface ErrorResponseOpts {
  message: string;
  status?: number;
  code?: string;
  extraHeaders?: Record<string, string>;
}
export function errorResponse(message: string, status?: number, code?: string, extraHeaders?: Record<string, string>): Response;
export function errorResponse(opts: ErrorResponseOpts): Response;
export function errorResponse(
  arg1: string | ErrorResponseOpts,
  status: number = 400,
  code?: string,
  extraHeaders?: Record<string, string>
): Response {
  const opts: ErrorResponseOpts =
    typeof arg1 === "string"
      ? { message: arg1, status, code, extraHeaders }
      : { status: 400, ...arg1 };
  const finalStatus = opts.status ?? 400;
  return new Response(
    JSON.stringify({
      ok: false,
      success: false,
      error: opts.message,
      errorDetail: { message: opts.message, code: opts.code },
    }),
    {
      status: finalStatus,
      headers: { ...CORS_HEADERS, ...opts.extraHeaders },
    }
  );
}

/**
 * Respuesta para OPTIONS (CORS preflight).
 */
export function corsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
