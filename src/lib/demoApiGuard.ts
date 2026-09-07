/**
 * VITAS · Demo API guard (cinturón de seguridad de red para el DEMO)
 *
 * En el demo (IS_DEMO) NO debe salir NINGUNA llamada real a la API: no hay
 * backend ni claves, así que cualquier `fetch('/api/...')` fallaría con 401/502
 * y, peor, si el proyecto del demo tuviera una clave, podría devolver salida
 * real fuera del camino de «Datos de ejemplo».
 *
 * Los hooks que pasan por `AgentService.callAgent` / `useScoutFeed` ya se
 * cortocircuitan con IS_DEMO. Pero hay hooks que hacen `fetch` crudo sin esa
 * guarda (injury-risk, valuation, updateInsight, behavioral, wellbeing,
 * transfer, live, legal, …). En vez de parchear cada uno (y arriesgar que el
 * próximo se olvide), interceptamos `window.fetch` UNA vez: toda petición
 * a `/api/*` del mismo origen se resuelve al instante con una respuesta benigna
 * y vacía, SIN tocar la red. Ningún hook puede filtrar.
 *
 * Forma de la respuesta: `200 { success: true, data: null }`. Elegida para que
 * los consumidores degraden con elegancia:
 *   - `json.data ?? fallback` → usa el fallback (estado vacío).
 *   - Páginas que exigen `res.ok && data.success` (p. ej. /live) → caen al
 *     estado vacío honesto en vez de a una tarjeta de error.
 *   - El gate legal (`useLegalAcceptance`) lee `data.data` (null) → objeto sin
 *     `needsAcceptance` → `?? false` → NO bloquea la app.
 * No se inventan cifras: `data: null` deja a cada superficie en su estado vacío,
 * y el banner global de demo declara que todo es de ejemplo.
 *
 * Solo intercepta `/api/*` del MISMO origen. El resto (modelos onnx en
 * `/models/*`, assets, orígenes externos como Supabase placeholder o Vercel)
 * pasa sin tocar.
 */

import { IS_DEMO } from "./demoMode";

let installed = false;

function isSameOriginApiPath(url: string): boolean {
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/");
  } catch {
    // URL relativa que no parsea con origin → trátala como ruta cruda
    return url.startsWith("/api/");
  }
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
}

/**
 * Instala el interceptor de red del demo. Idempotente y no-op fuera del demo o
 * sin `window`/`fetch`. Llamar UNA vez en el arranque, antes de renderizar.
 */
export function installDemoApiGuard(): void {
  if (installed) return;
  if (!IS_DEMO) return;
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;

  installed = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (isSameOriginApiPath(urlOf(input))) {
      const body = JSON.stringify({ success: true, data: null, _demo: true });
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };
}
