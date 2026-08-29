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

// ── Admin allowlist (mirrors frontend usePlan ADMIN_EMAILS) ────────────────
// Los admins/owners omiten los checks de plan server-side, igual que en el cliente.
// Configurable vía ADMIN_EMAILS (server) o VITE_ADMIN_EMAILS. Si NINGUNA está puesta,
// el owner es el default (evita quedarse sin admin). Antes se hacía `.concat(owner)`
// SIEMPRE → el owner era admin aunque quisieras retirarlo por env (backdoor no
// desactivable). Ahora la env, si existe, MANDA (puedes controlar la allowlist entera).
const ADMIN_EMAILS = new Set(
  `${process.env.ADMIN_EMAILS ?? process.env.VITE_ADMIN_EMAILS ?? "fredparedes58@gmail.com"}`
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

/**
 * Comparación en tiempo constante (mitiga timing side-channels al validar secretos).
 * Recorre siempre la longitud máxima y no cortocircuita.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aB = enc.encode(a);
  const bB = enc.encode(b);
  let diff = aB.length ^ bB.length;
  const len = Math.max(aB.length, bB.length);
  for (let i = 0; i < len; i++) {
    diff |= (aB[i] ?? 0) ^ (bB[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Comprueba si el Authorization header trae un token de servicio válido
 * (llamada interna del orchestrator, cron, o herramienta admin).
 * Usa comparación en tiempo constante para no filtrar el secreto por timing.
 * (Preserva el comportamiento previo de serviceOnly: acepta CRON_SECRET /
 *  ADMIN_SECRET / INTERNAL_API_TOKEN / SUPABASE_SERVICE_ROLE_KEY.)
 */
function hasValidServiceToken(req: Request): boolean {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7).trim();
  if (!token) return false;
  const secrets = [
    process.env.CRON_SECRET,
    process.env.ADMIN_SECRET,
    process.env.INTERNAL_API_TOKEN,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter((s): s is string => Boolean(s));
  // No cortocircuitar: evaluamos todos los candidatos para no filtrar cuál coincide.
  let matched = false;
  for (const s of secrets) {
    if (constantTimeEqual(token, s)) matched = true;
  }
  return matched;
}

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
  /** Required subscription plan. Returns 403 if user doesn't have it. */
  requiredPlan?: string;
  /** Required user role (from user_profiles.user_type). Returns 403 if mismatch. */
  requiredRole?: string;
  /**
   * Permite que una llamada interna con token de servicio
   * (CRON_SECRET / ADMIN_SECRET / INTERNAL_API_TOKEN / SUPABASE_SERVICE_ROLE_KEY)
   * pase la puerta de auth y omita los checks de plan/rol.
   * Úsalo en agentes premium que TAMBIÉN llama el orchestrator/cron server-to-server.
   */
  allowServiceToken?: boolean;
}

type InferBody<T> = T extends z.ZodSchema ? z.infer<T> : unknown;

interface HandlerContext<T> {
  req: Request;
  body: T;
  ip: string;
  userId: string | null;
  /**
   * Tenant (academia) del usuario autenticado, extraído del JWT (claim raíz
   * `tenant_id` → `app_metadata.tenant_id`). Ancla de autorización a nivel de
   * objeto para recursos scopeados por tenant (mismo predicado que las RLS por
   * tenant · migraciones 003/004/055). Null en llamadas de servicio o cuando el
   * JWT no trae el claim.
   */
  tenantId: string | null;
  /**
   * true si la request entró con token de servicio (CRON/ADMIN/INTERNAL/SERVICE_ROLE).
   * Úsalo para checks de ownership — NO infieras "servicio" de userId===null,
   * que es un contrato implícito frágil (optionalAuth también deja userId null).
   */
  isServiceCall: boolean;
  method: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  rawBody: string | null;
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

    // 3. Rate limit — las llamadas internas con token de servicio
    // (cron / orchestrator / seed → ingest → embed) NO se estrangulan por IP.
    const ip = getClientIP(req);
    const serviceTokenValid = hasValidServiceToken(req);
    const rl = await checkRateLimit(ip, { windowMs, max: maxRequests });
    if (!serviceTokenValid && !rl.allowed) {
      return errorResponse("Rate limit exceeded", 429, "RATE_LIMITED", rateLimitHeaders(rl));
    }

    // 4. Auth check
    let userId: string | null = null;
    let userEmail: string | null = null;
    let userTenantId: string | null = null;
    let isServiceCall = false;

    if (options.serviceOnly) {
      if (!serviceTokenValid) {
        return errorResponse("Acceso denegado: se requiere service role", 403, "FORBIDDEN", rateLimitHeaders(rl));
      }
      isServiceCall = true;
    } else if (options.allowServiceToken && serviceTokenValid) {
      // Llamada interna de confianza (orchestrator / cron) — omite auth de usuario y plan/rol.
      isServiceCall = true;
    } else if (options.requireAuth) {
      const auth = await verifyAuth(req);
      if (!auth.userId) {
        return errorResponse(auth.error ?? "No autenticado", 401, "UNAUTHORIZED", rateLimitHeaders(rl));
      }
      userId = auth.userId;
      userEmail = auth.email;
      userTenantId = auth.tenantId;
    } else if (options.optionalAuth) {
      const auth = await verifyAuth(req);
      userId = auth.userId; // puede ser null, y eso esta bien
      userEmail = auth.email;
      userTenantId = auth.tenantId;
    }

    // 4a-bis. Fail-closed: si el endpoint exige plan/rol pero no hay ni llamada de
    // servicio ni usuario autenticado (p.ej. configurado solo con optionalAuth),
    // NO servimos la feature premium — rechazamos en vez de dejar pasar silenciosamente.
    if (!isServiceCall && !userId && (options.requiredPlan || options.requiredRole)) {
      return errorResponse("No autenticado", 401, "UNAUTHORIZED", rateLimitHeaders(rl));
    }

    // 4b. Plan & Role checks (se omiten para llamadas de servicio y para admins)
    if (!isServiceCall && userId && (options.requiredPlan || options.requiredRole)) {
      const isAdmin = userEmail ? ADMIN_EMAILS.has(userEmail.toLowerCase()) : false;

      if (!isAdmin) {
        const sbUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        // Sin Supabase no podemos verificar el plan de una feature premium → fail-closed.
        if (!sbUrl || !sbKey) {
          return errorResponse(
            "Verificación de plan no disponible. Contacte al administrador.",
            503, "PLAN_CHECK_UNAVAILABLE", rateLimitHeaders(rl),
          );
        }

        const sbHeaders = { apikey: sbKey, Authorization: `Bearer ${sbKey}` };

        if (options.requiredPlan) {
          try {
            const planRes = await fetch(
              `${sbUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=plan,status`,
              { headers: sbHeaders }
            );
            // No-ok (tabla/permiso/red) → fail-closed: NO servimos la feature de pago.
            if (!planRes.ok) {
              console.error(`[withHandler] Plan query non-ok (${planRes.status}) — blocking for safety`);
              return errorResponse("No se pudo verificar el plan. Intenta de nuevo.", 503, "PLAN_CHECK_FAILED", rateLimitHeaders(rl));
            }
            const rows = await planRes.json() as Array<{ plan: string; status: string }>;
            const active = rows.find(r => r.status === "active" || r.status === "trialing");
            const allowed = options.requiredPlan.split(",").map(p => p.trim());
            if (!active || !allowed.includes(active.plan)) {
              return errorResponse(
                `Plan requerido: ${options.requiredPlan}`,
                403, "PLAN_REQUIRED", rateLimitHeaders(rl)
              );
            }
          } catch (planErr) {
            console.error("[withHandler] Plan check failed — blocking request for safety:", planErr);
            return errorResponse("No se pudo verificar el plan. Intenta de nuevo.", 503, "PLAN_CHECK_FAILED", rateLimitHeaders(rl));
          }
        }

        if (options.requiredRole) {
          try {
            const roleRes = await fetch(
              `${sbUrl}/rest/v1/user_profiles?user_id=eq.${userId}&select=user_type`,
              { headers: sbHeaders }
            );
            if (!roleRes.ok) {
              console.error(`[withHandler] Role query non-ok (${roleRes.status}) — blocking for safety`);
              return errorResponse("No se pudo verificar el rol. Intenta de nuevo.", 503, "ROLE_CHECK_FAILED", rateLimitHeaders(rl));
            }
            const rows = await roleRes.json() as Array<{ user_type: string }>;
            const allowed = options.requiredRole.split(",").map(r => r.trim());
            if (rows.length === 0 || !allowed.includes(rows[0].user_type)) {
              return errorResponse(
                `Rol requerido: ${options.requiredRole}`,
                403, "ROLE_REQUIRED", rateLimitHeaders(rl)
              );
            }
          } catch (roleErr) {
            console.error("[withHandler] Role check failed — blocking request for safety:", roleErr);
            return errorResponse("No se pudo verificar el rol. Intenta de nuevo.", 503, "ROLE_CHECK_FAILED", rateLimitHeaders(rl));
          }
        }
      }
    }

    // 5. Parse & validate body
    let body: InferBody<T> = undefined as InferBody<T>;
    let rawBodyStr: string | null = null;
    if (methods.includes(req.method) && req.method === "POST") {
      if (options.rawBody) {
        try {
          rawBodyStr = await req.text();
          body = (rawBodyStr as unknown) as InferBody<T>;
        } catch {
          return errorResponse("Cannot read raw body", 400, "PARSE_ERROR", rateLimitHeaders(rl));
        }
      } else {
        // Tolerante a body vacio: si no hay body o no es JSON valido,
        // pasamos {} cuando no hay schema · solo falla si schema requiere datos.
        let raw: unknown = null;
        try {
          const text = await req.text();
          raw = text.trim() ? JSON.parse(text) : null;
        } catch {
          return errorResponse("Invalid JSON body", 400, "PARSE_ERROR", rateLimitHeaders(rl));
        }

        if (options.schema) {
          const result = options.schema.safeParse(raw ?? {});
          if (!result.success) {
            const details = result.error.errors.map((e: z.ZodIssue) => `${e.path.join(".")}: ${e.message}`).join("; ");
            return errorResponse(`Datos invalidos: ${details}`, 400, "VALIDATION_ERROR", rateLimitHeaders(rl));
          }
          body = result.data;
        } else {
          body = (raw ?? {}) as InferBody<T>;
        }
      }
    }

    // 6. Build context (method, query, headers)
    const url = new URL(req.url);
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { query[k] = v; });
    const headersMap: Record<string, string> = {};
    req.headers.forEach((v, k) => { headersMap[k.toLowerCase()] = v; });

    // 7. Execute handler with centralized error catching + request logging
    const start = Date.now();
    const pathname = url.pathname;
    try {
      const res = await handler({
        req,
        body,
        ip,
        userId,
        tenantId: userTenantId,
        isServiceCall,
        method: req.method,
        query,
        headers: headersMap,
        rawBody: rawBodyStr,
      });
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
