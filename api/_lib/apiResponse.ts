/**
 * VITAS · Standardized API Response Helpers
 *
 * Todas las respuestas de la API usan el formato:
 * - Éxito: { ok: true, data: ... }
 * - Error: { ok: false, error: { message: string, code?: string } }
 */

const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN ?? "https://futuro-club.vercel.app",
  "https://futuro-club.vercel.app",
];

/** Build CORS origin dynamically — allow Vercel preview deploys + configured origins */
function getAllowedOrigin(requestOrigin?: string | null): string {
  if (!requestOrigin) return ALLOWED_ORIGINS[0];
  // Exact match
  if (ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  // Vercel preview deploys: *.vercel.app
  if (/^https:\/\/futuro-club[a-z0-9-]*\.vercel\.app$/.test(requestOrigin)) return requestOrigin;
  // Localhost dev
  if (/^https?:\/\/localhost(:\d+)?$/.test(requestOrigin)) return requestOrigin;
  return ALLOWED_ORIGINS[0];
}

function corsHeaders(requestOrigin?: string | null): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": getAllowedOrigin(requestOrigin),
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

/** @deprecated Use corsHeaders(origin) instead — kept for backward compat */
const CORS_HEADERS = corsHeaders(null);

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
 * Respuesta 200 de DEGRADACIÓN ELEGANTE.
 *
 * HTTP 200 (para que el cliente no lance) con `success:false` + los campos indicados
 * a NIVEL RAÍZ, de modo que el cliente pueda ramificar a un camino alternativo
 * (p.ej. `phase2Pending:true` ⇒ procesar el vídeo localmente cuando el CDN no está
 * configurado). No se expone jerga técnica ni nombres de variables de entorno.
 */
export function degradedResponse(extra: Record<string, unknown>, extraHeaders?: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ ok: true, success: false, ...extra }),
    {
      status: 200,
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
