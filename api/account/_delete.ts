/**
 * VITAS · DELETE /api/account/delete
 * Elimina permanentemente todos los datos del usuario y su cuenta auth.
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { deleteBunnyVideos } from "../_lib/bunnyCleanup";

export const config = { runtime: "edge" };

/** Tables to purge (order matters: children first to avoid FK violations). */
const USER_TABLES = [
  "scout_insights",
  "player_analyses",
  "videos",
  "players",
  "push_subscriptions",
  "notification_preferences",
  "notification_log",
  "tracking_sessions",
  "team_members",
  "legal_acceptances",
  "usage_log",
  "analyses_used",
  "subscriptions",
  "user_profiles",
] as const;

export default withHandler(
  { method: "DELETE", requireAuth: true, maxRequests: 5, windowMs: 60_000 },
  async ({ userId }) => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return errorResponse("Supabase no configurado", 503, "CONFIG_MISSING");
    }

    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    const errors: string[] = [];

    // 0. Capturar los bunny_video_id ANTES de purgar (borrar la fila videos —o el
    //    ON DELETE CASCADE al borrar el auth user— pierde la referencia al fichero
    //    en Bunny → el vídeo del menor quedaría huérfano en el CDN para siempre).
    //    RGPD Art. 17: el borrado debe alcanzar el dato biométrico, no solo la fila.
    //    FAIL-SAFE: si NO podemos leer qué vídeos hay, ABORTAMOS antes de tocar nada.
    //    Proceder destruiría la referencia (fila + cascade) sin haberla mandado a
    //    Bunny → huérfano irrecuperable. Mejor no borrar aún y que el cliente
    //    reintente que borrar dejando el vídeo del menor en el CDN.
    const bunnyVideoIds: Array<string | null> = [];
    try {
      const vres = await fetch(
        `${supabaseUrl}/rest/v1/videos?user_id=eq.${userId}&select=bunny_video_id`,
        { headers },
      );
      if (!vres.ok) {
        return errorResponse(
          "No se pudo verificar los vídeos a eliminar. Reintenta en unos segundos.",
          503, "VIDEOS_READ_FAILED",
        );
      }
      const rows = (await vres.json()) as Array<{ bunny_video_id: string | null }>;
      for (const r of rows) bunnyVideoIds.push(r.bunny_video_id);
    } catch {
      return errorResponse(
        "No se pudo verificar los vídeos a eliminar. Reintenta en unos segundos.",
        503, "VIDEOS_READ_FAILED",
      );
    }

    // 1. Delete all user data from each table
    for (const table of USER_TABLES) {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/${table}?user_id=eq.${userId}`,
          { method: "DELETE", headers },
        );
        if (!res.ok && res.status !== 404) {
          const errText = await res.text().catch(() => "unknown");
          errors.push(`${table}: ${res.status} ${errText}`);
        }
      } catch (err) {
        errors.push(`${table}: ${err instanceof Error ? err.message : "fetch error"}`);
      }
    }

    // 1b. Borrado real en Bunny Stream del fichero de vídeo (best-effort: un fallo
    //     aquí no aborta el resto, pero SÍ se registra para no dar por borrado algo
    //     que sigue en el CDN). Si Bunny no está configurado, deleteBunnyVideos lo
    //     reporta como failed y lo dejamos anotado.
    if (bunnyVideoIds.some(Boolean)) {
      try {
        const bunny = await deleteBunnyVideos(bunnyVideoIds);
        if (!bunny.configured) {
          errors.push(`bunny: sin configurar, ${bunny.attempted} vídeo(s) NO borrados del CDN`);
        } else if (bunny.failed > 0) {
          errors.push(`bunny: ${bunny.failed} de ${bunny.attempted} vídeo(s) no borrados del CDN`);
        }
      } catch (err) {
        errors.push(`bunny: ${err instanceof Error ? err.message : "cleanup error"}`);
      }
    }

    // 2. Delete the auth user via Supabase Admin API
    try {
      const authRes = await fetch(
        `${supabaseUrl}/auth/v1/admin/users/${userId}`,
        { method: "DELETE", headers },
      );
      if (!authRes.ok) {
        const errText = await authRes.text().catch(() => "unknown");
        errors.push(`auth_user: ${authRes.status} ${errText}`);
      }
    } catch (err) {
      errors.push(`auth_user: ${err instanceof Error ? err.message : "fetch error"}`);
    }

    // 3. Audit log
    console.log(
      JSON.stringify({
        level: "warn",
        ts: new Date().toISOString(),
        event: "ACCOUNT_DELETED",
        userId,
        errors: errors.length > 0 ? errors : undefined,
      }),
    );

    if (errors.length > 0) {
      // Fallo parcial — algún dato pudo no borrarse (p.ej. Bunny caído). Aún así
      // devolvemos deleted:true para que el cliente cierre sesión, pero marcamos
      // partial:true en vez de afirmar un borrado completo que no ocurrió.
      console.warn(`[account/delete] Partial errors for ${userId}:`, errors);
      return successResponse({ deleted: true, partial: true });
    }

    return successResponse({ deleted: true, partial: false });
  },
);
