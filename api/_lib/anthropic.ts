/**
 * VITAS · Acceso mínimo a la Messages API de Anthropic (fetch crudo, Edge-safe)
 *
 * Existe por la migración del tier reasoning a Opus 5.5 (ver `./models`):
 * - Opus 5.5 siempre piensa → `content` puede empezar por bloques `thinking`
 *   con texto vacío. `responseText()` lee por `type`, no por posición.
 * - Sus clasificadores pueden declinar con HTTP 200 + `stop_reason:"refusal"`,
 *   y una cuenta sin acceso al modelo recibe 404. En ambos casos
 *   `fetchMessages()` reintenta UNA vez en REASONING_FALLBACK_MODEL en vez de
 *   dejar que el agente caiga a mock en silencio.
 */
import { MODELS, REASONING_FALLBACK_MODEL } from "./models";

export const MESSAGES_URL = "https://api.anthropic.com/v1/messages";

/** Texto visible de una respuesta de /v1/messages ("" si no hay bloques text). */
export function responseText(data: unknown): string {
  const content = (data as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: "text"; text: string } =>
      !!b && (b as { type?: unknown }).type === "text" && typeof (b as { text?: unknown }).text === "string")
    .map((b) => b.text)
    .join("");
}

/**
 * `fetch(MESSAGES_URL, init)` con reintento en REASONING_FALLBACK_MODEL cuando
 * el request usa MODELS.reasoning y la respuesta es 404 o un `refusal`.
 * Devuelve un `Response` normal: el caller lo consume igual que antes.
 */
export async function fetchMessages(init: RequestInit): Promise<Response> {
  const res = await fetch(MESSAGES_URL, init);

  let body: Record<string, unknown> | null = null;
  try {
    body = typeof init.body === "string" ? JSON.parse(init.body) : null;
  } catch {
    body = null;
  }
  if (!body || body.model !== MODELS.reasoning) return res;

  let reason: string | null = null;
  if (res.status === 404) {
    reason = "404";
  } else if (res.ok) {
    const data = await res.clone().json().catch(() => null) as { stop_reason?: string } | null;
    if (data?.stop_reason === "refusal") reason = "refusal";
  }
  if (!reason) return res;

  console.warn(`[anthropic] ${MODELS.reasoning} → ${REASONING_FALLBACK_MODEL} (${reason})`);
  return fetch(MESSAGES_URL, {
    ...init,
    body: JSON.stringify({ ...body, model: REASONING_FALLBACK_MODEL }),
  });
}
