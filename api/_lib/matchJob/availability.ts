/**
 * VITAS · Match job — ¿se ofrece la ruta de vídeo? (kill switch + configuración)
 *
 * Decisión del owner (2026-09-29, tras el spike sobre un partido real sub-10 donde Gemini
 * a 1 fps FABRICÓ eventos de equipo): se construye toda la infraestructura de la Fase 1
 * pero el análisis queda APAGADO hasta que el motor de observación supere el arnés de
 * validación (scripts/validate-match-observation.mjs contra fixtures/partido/ anotados
 * a mano). Solo el string exacto MATCH_VIDEO_ENABLED === "true" lo enciende; cualquier
 * otro valor ("1", "TRUE", "yes", vacío, sin definir) = apagado.
 *
 * Una sola implementación (inv #7) para: POST /api/match/start (503), GET
 * /api/match/availability (la UI muestra "En validación") y el protocolo step (kill
 * switch de jobs en vuelo). Sin imports pesados: se puede cargar desde cualquier runtime.
 */
import { matchAvailabilityResponseSchema, type MatchAvailabilityResponse } from "../../../src/lib/shared/matchJob/contract";
import type { ReportLocale } from "../../../src/lib/shared/locale";
import { availabilityReason } from "./messages";

type Env = Record<string, string | undefined>;

export function isMatchVideoEnabled(env: Env = process.env): boolean {
  return env.MATCH_VIDEO_ENABLED === "true";
}

/** Variables sin las que el job no puede correr (NOMBRES; nunca se devuelven valores). */
export function missingMatchEnv(env: Env = process.env): string[] {
  const missing: string[] = [];
  const need = (name: string, present = !!env[name]) => {
    if (!present) missing.push(name);
  };
  need("GEMINI_API_KEY");
  need("BUNNY_STREAM_API_KEY", !!(env.BUNNY_STREAM_API_KEY || env.BUNNY_API_KEY));
  need("BUNNY_STREAM_LIBRARY_ID");
  need("BUNNY_CDN_HOSTNAME", !!(env.BUNNY_CDN_HOSTNAME || env.VITE_BUNNY_CDN_HOSTNAME));
  need("MODAL_MATCH_START_URL");
  need("MODAL_API_KEY");
  need("MODAL_CALLBACK_SECRET");
  need("SUPABASE_URL", !!(env.SUPABASE_URL || env.VITE_SUPABASE_URL));
  need("SUPABASE_SERVICE_ROLE_KEY");
  return missing;
}

/**
 * Estado público de la ruta de vídeo, con el motivo en `locale`. No lista nombres de
 * variables (eso solo lo ve el operador en el 503 de /start).
 */
export function matchAvailability(locale: ReportLocale, env: Env = process.env): MatchAvailabilityResponse {
  if (!isMatchVideoEnabled(env)) {
    return matchAvailabilityResponseSchema.parse({
      enabled: false,
      code: "match_video_disabled",
      reason: availabilityReason(locale, "match_video_disabled"),
    });
  }
  if (missingMatchEnv(env).length > 0) {
    return matchAvailabilityResponseSchema.parse({
      enabled: false,
      code: "real_inference_disabled",
      reason: availabilityReason(locale, "real_inference_disabled"),
    });
  }
  return matchAvailabilityResponseSchema.parse({ enabled: true, code: null, reason: null });
}
