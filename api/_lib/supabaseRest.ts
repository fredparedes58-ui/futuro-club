/**
 * VITAS · Helpers mínimos para Supabase REST (PostgREST) desde Edge Functions.
 *
 * Motivación (code review V4): los endpoints nuevos duplicaban el builder de
 * headers y la resolución de env con precedencia OPUESTA a api/_lib/env.ts
 * (VITE_ primero vs SUPABASE_URL primero) — si ambas vars apuntan a proyectos
 * distintos, unos endpoints escriben en un proyecto y otros leen del otro.
 * Fuente única: env.ts.
 */

import { env } from "./env";

/** URL base del proyecto (SUPABASE_URL ?? VITE_SUPABASE_URL — igual que env.ts). */
export function supabaseRestUrl(): string {
  return env.supabaseUrl;
}

/** Headers REST con service role. `extra` para Prefer/Content-Type adicionales. */
export function serviceHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = env.supabaseServiceRoleKey;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/** ¿Está Supabase configurado? (para 503 tempranos sin lanzar). */
export function supabaseConfigured(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * URL de una fila de tracking_jobs filtrada por id — SIEMPRE encodeURIComponent
 * (el jobId del webhook viene de un body externo: sin encode, un id con `&`/`#`
 * inyecta parámetros PostgREST en un PATCH con service role).
 */
export function trackingJobUrl(jobId: string, params = ""): string {
  return `${supabaseRestUrl()}/rest/v1/tracking_jobs?id=eq.${encodeURIComponent(jobId)}${params}`;
}

/** PATCH parcial de una fila de tracking_jobs. Devuelve la Response (el caller decide). */
export function patchTrackingJob(
  jobId: string,
  patch: Record<string, unknown>,
  params = "",
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  return fetch(trackingJobUrl(jobId, params), {
    method: "PATCH",
    headers: serviceHeaders(extraHeaders),
    body: JSON.stringify(patch),
  });
}
