/**
 * VITAS — Modo DEMO (piso piloto)
 *
 * El demo público (proyecto Vercel `vitas-demo`) corre la MISMA app con datos
 * de ejemplo en local/memoria y SIN base de datos. Se enciende con la variable
 * de entorno `VITE_DEMO=1` (fijada una sola vez en ese proyecto de Vercel).
 *
 * DOBLE GUARDA a propósito (blindaje de seguridad):
 *   IS_DEMO = VITE_DEMO=1  Y  Supabase NO configurado.
 *
 * Si por error `VITE_DEMO=1` acabara en un entorno CON Supabase (producción/
 * desarrollo real), IS_DEMO queda `false` → jamás se siembran datos de ejemplo
 * ni se saltan guardas sobre datos reales. El demo es imposible de activar donde
 * hay datos de verdad. (Coherente con la regla de honestidad de CLAUDE.md.)
 */

import { SUPABASE_CONFIGURED } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

/** true solo en el despliegue del demo (bandera encendida Y sin Supabase). */
export const IS_DEMO: boolean =
  (import.meta.env.VITE_DEMO as string | undefined) === "1" && !SUPABASE_CONFIGURED;

/**
 * Usuario ficticio con el que se "entra" en el demo: un director de club.
 * Solo es cosmético (nombre/avatar). Todas las rutas de datos siguen gateadas
 * por `SUPABASE_CONFIGURED` (false en demo) → leen de local, nunca de Supabase.
 */
export const DEMO_USER: User = {
  id: "demo-director",
  aud: "authenticated",
  role: "authenticated",
  email: "director@vitas.demo",
  app_metadata: { provider: "demo", providers: ["demo"] },
  user_metadata: { display_name: "Director (Demo)", user_type: "director" },
  created_at: "2026-01-01T00:00:00.000Z",
} as unknown as User;
