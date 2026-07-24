/**
 * VITAS · Ownership guards (autorización a nivel de objeto)
 *
 * withHandler({ requireAuth }) solo garantiza que hay un USUARIO válido, NO que
 * ese usuario sea dueño del recurso pedido. Como toda la API consulta Supabase
 * con SERVICE_ROLE_KEY (que salta RLS), el check de propiedad DEBE hacerse aquí.
 *
 * Modelo de propiedad: por usuario vía `players.user_id` — el mismo que ya usan
 * api/reports/_pdf.ts y api/players/_crud.ts. (Si el producto necesita acceso
 * compartido por academia/tenant, evolucionar aquí en un único sitio.)
 *
 * Uso en un handler:
 *   if (!isServiceCall && !(await ownsPlayer(playerId, userId))) {
 *     return errorResponse("No autorizado para este jugador", 403, "FORBIDDEN");
 *   }
 *
 * Las llamadas internas de servicio (isServiceCall) NO deben llamar a estos
 * helpers — omiten el check (cron/orchestrator operan sobre todos los jugadores).
 */

function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function serviceHeaders(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

/**
 * ¿El jugador `playerId` pertenece al usuario `userId`? (players.user_id)
 * Fail-closed: ante cualquier duda (sin Supabase, query no-ok, error) → false.
 */
export async function ownsPlayer(playerId: string | null | undefined, userId: string | null): Promise<boolean> {
  if (!playerId || !userId) return false;
  const env = supabaseEnv();
  if (!env) return false;
  try {
    const res = await fetch(
      `${env.url}/rest/v1/players?id=eq.${encodeURIComponent(playerId)}&user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
      { headers: serviceHeaders(env.key) },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ id: string }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * ¿La sesión de entrenamiento `sessionId` pertenece al coach `userId`?
 * (training_sessions.coach_id — se persiste en api/coaching/_analyze-session.ts)
 * Fail-closed.
 */
export async function ownsSession(sessionId: string | null | undefined, userId: string | null): Promise<boolean> {
  if (!sessionId || !userId) return false;
  const env = supabaseEnv();
  if (!env) return false;
  try {
    const res = await fetch(
      `${env.url}/rest/v1/training_sessions?id=eq.${encodeURIComponent(sessionId)}&coach_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
      { headers: serviceHeaders(env.key) },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ id: string }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * ¿El usuario `userId` puede ver datos del equipo `teamId`?
 * No existe tabla `teams` en el esquema — `training_sessions.team_id` es un
 * soft-ref (UUID sin FK). El único vínculo usuario↔equipo es ser coach de al
 * menos una sesión de ese equipo (training_sessions.coach_id), que es además
 * lo que exige la RLS de la tabla. Fail-closed.
 */
export async function ownsTeam(teamId: string | null | undefined, userId: string | null): Promise<boolean> {
  if (!teamId || !userId) return false;
  const env = supabaseEnv();
  if (!env) return false;
  try {
    const res = await fetch(
      `${env.url}/rest/v1/training_sessions?team_id=eq.${encodeURIComponent(teamId)}&coach_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
      { headers: serviceHeaders(env.key) },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ id: string }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}
