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
 * Para recursos scopeados por TENANT (p.ej. las tablas tácticas, cuya
 * propiedad se deriva del `analyses` dueño del `match_id`) se usa `ownsMatch`,
 * anclado en `analyses.tenant_id` — el mismo predicado que la RLS de tenant
 * (migración 055 · `analyses_tenant_isolation`). Se ancla en tenant y NO en
 * `analyses.user_id` porque el pipeline de partidos NO puebla user_id
 * (api/webhooks/bunny-uploaded.ts inserta analyses con tenant_id/player_id/
 * video_id, sin user_id); anclar en user_id daría 403 al dueño real.
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
 * ¿El usuario `userId` (o su tenant `tenantId`) gestiona al jugador `playerId`?
 *
 * Propiedad por usuario CON respaldo por tenant. Es el MISMO predicado que ya usan
 * inline api/analyses/share.ts y api/analyses/generate-reports.ts para el jugador de
 * un análisis: el pipeline de vídeo (bunny-uploaded) crea el análisis con
 * user_id=null pero player_id real, y players.user_id SÍ se puebla; el respaldo por
 * tenant deja acceder a otros miembros de la misma academia (que pueden generar y
 * compartir ese informe). Extraído aquí para que el READ (reports.ts) no sea más
 * estricto que el WRITE/SHARE (invariante #7: una sola implementación).
 * Fail-closed: sin playerId, sin userId ni tenantId, sin Supabase, query no-ok o
 * error → false.
 */
export async function ownsPlayerOrTenant(
  playerId: string | null | undefined,
  userId: string | null,
  tenantId: string | null,
): Promise<boolean> {
  if (!playerId) return false;
  if (!userId && !tenantId) return false;
  const env = supabaseEnv();
  if (!env) return false;
  try {
    const res = await fetch(
      `${env.url}/rest/v1/players?id=eq.${encodeURIComponent(playerId)}&select=user_id,tenant_id&limit=1`,
      { headers: serviceHeaders(env.key) },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ user_id: string | null; tenant_id: string | null }>;
    const p = rows[0];
    if (!p) return false;
    return (
      (!!p.user_id && p.user_id === userId) ||
      (!!p.tenant_id && !!tenantId && p.tenant_id === tenantId)
    );
  } catch {
    return false;
  }
}

/**
 * Cláusula PostgREST `.or(...)` para restringir una consulta de MÚLTIPLES jugadores
 * a los que gestiona el usuario (players.user_id) o su academia (players.tenant_id).
 * Es el análogo multi-fila de ownsPlayerOrTenant (que es por objeto único): mismos
 * campos, misma semántica. Se pasa a `query.or(ownedPlayersOrFilter(...))`.
 *
 * requireAuth garantiza userId, así que la cláusula nunca queda vacía. Si no hay
 * tenant (JWT sin claim) cae a solo user_id — no abre a otros tenants.
 */
const OWN_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ownedPlayersOrFilter(userId: string, tenantId: string | null): string {
  // Solo se interpola en la cláusula PostgREST `.or()` un valor con forma de UUID.
  // userId/tenantId vienen del JWT verificado (son UUIDs), pero validar la forma
  // evita cualquier inyección en el filtro si algún día no lo fueran (defensa en
  // profundidad). Sin cláusula válida → UUID nil, que no casa ningún jugador
  // (fail-closed, devuelve vacío en vez de abrir).
  const clauses: string[] = [];
  if (OWN_UUID_RE.test(userId)) clauses.push(`user_id.eq.${userId}`);
  if (tenantId && OWN_UUID_RE.test(tenantId)) clauses.push(`tenant_id.eq.${tenantId}`);
  return clauses.length > 0 ? clauses.join(",") : "user_id.eq.00000000-0000-0000-0000-000000000000";
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
 * ¿El partido `matchId` pertenece al tenant `tenantId`?
 *
 * En el flujo real no existe tabla `matches`: `match_id == analyses.id`. La
 * propiedad se deriva de la analysis dueña, exactamente como la RLS de tenant
 * (migración 055): `EXISTS analyses WHERE a.id = match_id AND a.tenant_id = tenant`.
 *
 * Fail-closed: sin tenantId (JWT sin claim), sin Supabase, query no-ok o error,
 * o matchId que no es una analysis (p.ej. match demo `demo-*`, que ni siquiera
 * es un UUID válido) → false. Un match sin analysis asociada no es de nadie.
 *
 * NO llamar en llamadas de servicio (isServiceCall): la cadena interna
 * (compute-from-video / modal-callback) opera con token de servicio sobre
 * cualquier tenant y debe omitir este check.
 */
export async function ownsMatch(matchId: string | null | undefined, tenantId: string | null): Promise<boolean> {
  if (!matchId || !tenantId) return false;
  const env = supabaseEnv();
  if (!env) return false;
  try {
    const res = await fetch(
      `${env.url}/rest/v1/analyses?id=eq.${encodeURIComponent(matchId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=id&limit=1`,
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
