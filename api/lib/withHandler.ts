/**
 * VITAS · Centralized API Handler Wrapper
 *
 * Envuelve cada endpoint con:
 * 1. CORS preflight automatico
 * 2. Rate limiting por IP (Upstash Redis o in-memory fallback)
 * 3. Autenticacion JWT (requireAuth / optionalAuth / serviceOnly)
 * 4. Validacion Zod del body (para POST)
 * 5. Try/catch centralizado con logging
 * 6. Respuestas estandarizadas (apiResponse)
 */

import { z } from "zod";
import { checkRateLimit, getClientIP, rateLimitHeaders } from "./rateLimit";
import { successResponse, errorResponse, corsPreflightResponse } from "./apiResponse";
import { verifyAuth } from "./auth";

interface HandlerOptions<T extends z.ZodSchema | undefined> {
  /** HTTP method(s) permitidos. Default: "POST" */
  method?: string | string[];
  /** Schema Zod para validar body (solo POST). Si undefined, no valida. */
  schema?: T;
  /** Rate limit: max requests por ventana. Default: 30 */
  maxRequests?: number;
  /** Rate limit: ventana en ms. Default: 60_000 (1 min) */
  windowMs?: number;
  /** Requiere JWT auth. Retorna 401 si no hay token valido. */
  requireAuth?: boolean;
  /** Intenta auth pero no falla si no hay token. Pasa userId si existe. */
  optionalAuth?: boolean;
  /** Solo permite service role (CRON_SECRET o ADMIN_SECRET en Authorization header). */
  serviceOnly?: boolean;
  /** Si true, no parsea body como JSON (para webhooks que leen raw text). */
  rawBody?: boolean;
}

type InferBody<T> = T extends z.ZodSchema ? z.infer<T> : unknown;

interface HandlerContext<T> {
  req: Request;
  body: T;
  ip: string;
  userId: string | null;
}

/**
 * Crea un handler con rate limit, auth, validacion y error handling centralizados.
 *
 * Uso:
 * ```ts
 * const schema = z.object({ videoId: z.string() });
 * export default withHandler({ schema, requireAuth: true }, async ({ body, userId }) => {
 *   return successResponse({ id: body.videoId });
 * });
 * ```
 */
export function withHandler<T extends z.ZodSchema | undefined = undefined>(
  options: HandlerOptions<T>,
  handler: (ctx: HandlerContext<InferBody<T>>) => Promise<Response>,
) {
  const methods = Array.isArray(options.method)
    ? options.method.map((m) => m.toUpperCase())
    : [(options.method ?? "POST").toUpperCase()];
  const maxRequests = options.maxRequests ?? 30;
  const windowMs = options.windowMs ?? 60_000;

  return async function (req: Request): Promise<Response> {
    // 1. CORS preflight
    if (req.method === "OPTIONS") return corsPreflightResponse();

    // 2. Method check
    if (!methods.includes(req.method)) {
      return errorResponse("Method not allowed", 405);
    }

    // 3. Rate limit
    const ip = getClientIP(req);
    const rl = await checkRateLimit(ip, { windowMs, max: maxRequests });
    if (!rl.allowed) {
      return errorResponse("Rate limit exceeded", 429, "RATE_LIMITED", rateLimitHeaders(rl));
    }

    // 4. Auth check
    let userId: string | null = null;

    if (options.serviceOnly) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const cronSecret = process.env.CRON_SECRET;
      const adminSecret = process.env.ADMIN_SECRET;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const token = authHeader.replace("Bearer ", "");

      const isValid =
        (cronSecret && token === cronSecret) ||
        (adminSecret && token === adminSecret) ||
        (serviceKey && token === serviceKey);

      if (!isValid) {
        return errorResponse("Acceso denegado: se requiere service role", 403, "FORBIDDEN", rateLimitHeaders(rl));
      }
    } else if (options.requireAuth) {
      const auth = await verifyAuth(req);
      if (!auth.userId) {
        return errorResponse(auth.error ?? "No autenticado", 401, "UNAUTHORIZED", rateLimitHeaders(rl));
      }
      userId = auth.userId;
    } else if (options.optionalAuth) {
      const auth = await verifyAuth(req);
      userId = auth.userId; // puede ser null, y eso esta bien
    }

    // 5. Parse & validate body
    let body: InferBody<T> = undefined as InferBody<T>;
    if (methods.includes(req.method) && req.method === "POST" && !options.rawBody) {
      try {
        const raw = await req.json();
        if (options.schema) {
          const result = options.schema.safeParse(raw);
          if (!result.success) {
            const details = result.error.errors.map((e: z.ZodIssue) => `${e.path.join(".")}: ${e.message}`).join("; ");
            return errorResponse(`Datos invalidos: ${details}`, 400, "VALIDATION_ERROR", rateLimitHeaders(rl));
          }
          body = result.data;
        } else {
          body = raw;
        }
      } catch {
        return errorResponse("Invalid JSON body", 400, "PARSE_ERROR", rateLimitHeaders(rl));
      }
    }

    // 6. Execute handler with centralized error catching + request logging
    const start = Date.now();
    const pathname = new URL(req.url).pathname;
    try {
      const res = await handler({ req, body, ip, userId });
      const ms = Date.now() - start;
      console.log(JSON.stringify({
        level: "info", ts: new Date().toISOString(),
        method: req.method, path: pathname,
        status: res.status, ms, userId: userId ?? undefined,
      }));
      return res;
    } catch (err) {
      const ms = Date.now() - start;
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error(JSON.stringify({
        level: "error", ts: new Date().toISOString(),
        method: req.method, path: pathname,
        status: 500, ms, userId: userId ?? undefined,
        error: message, stack: err instanceof Error ? err.stack : undefined,
      }));
      return errorResponse(message, 500, "INTERNAL_ERROR", rateLimitHeaders(rl));
    }
  };
}
