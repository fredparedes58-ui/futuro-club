/**
 * VITAS Phase 2 — Bunny Stream Video Init
 * POST /api/upload/video-init
 *
 * Flow: Client calls this → we create a Bunny video entry → return signed TUS
 * credentials. Client then uploads DIRECTLY to Bunny (bypasses Vercel 4.5MB body limit).
 *
 * Además (fase 0 partido completo) SIEMBRA la fila `videos` server-side:
 *   - con el JWT del USUARIO vía PostgREST (NO service role): el trigger
 *     auto_assign_org_id (mig 038) usa auth.uid() y la RLS de insert exige
 *     user_id = auth.uid() → con service role el org_id quedaría NULL.
 *   - id = bunny_video_id = GUID de Bunny (misma convención que el cliente:
 *     useVideoUpload usa el GUID como id del VideoRecord y pushOne hace upsert por id).
 *   - tenant_id del JWT verificado; player_id SOLO si el jugador es visible para este
 *     usuario bajo RLS (mismo predicado que SupabaseVideoService.pushOne).
 *   - duration_sec SOLO si el navegador la leyó de los metadatos (nunca un default).
 *   Así el webhook de Bunny encuentra la fila por bunny_video_id aunque el cliente
 *   cierre la pestaña antes de su upsert. Sin Supabase configurado → se omite (no rompe).
 *
 * Env vars needed (Vercel):
 *   BUNNY_STREAM_LIBRARY_ID  — numeric Library ID from Bunny dashboard
 *   BUNNY_STREAM_API_KEY     — library-level API key (AccessKey)
 *   VITE_SUPABASE_URL / SUPABASE_URL + VITE_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY (opcional)
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse, degradedResponse } from "../_lib/apiResponse";
import { signTusUpload } from "../_lib/bunnyStream";
import {
  checkMatchDuration,
  durationMinutesForDisplay,
  MATCH_DURATION_GATE_CODE,
  MAX_MATCH_DURATION_MIN,
} from "../../src/lib/shared/videoLimits";

const BodySchema = z.object({
  title: z.string().min(1).max(200),
  playerId: z.string().optional(),
  collection: z.string().optional(), // Bunny collection GUID (optional)
  /** Duración leída de los metadatos del NAVEGADOR (s). Opcional: si no se leyó, no viene. */
  durationSec: z.number().positive().finite().optional(),
});

const BUNNY_BASE = "https://video.bunnycdn.com/library";

type VideoRowResult = "inserted" | "skipped" | "failed";

/**
 * Inserta la fila `videos` con el JWT del usuario (RLS + trigger de org con auth.uid()).
 * Best-effort: cualquier fallo se registra y NO rompe la subida (el cliente sigue
 * pudiendo crear la fila con su upsert; el webhook solo la necesita para encolar).
 */
async function insertVideoRow(opts: {
  userJwt: string | null;
  userId: string;
  tenantId: string | null;
  guid: string;
  title: string;
  playerId: string | null;
  durationSec: number | null;
}): Promise<VideoRowResult> {
  const sbUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";
  if (!sbUrl || !anonKey || !opts.userJwt) return "skipped";

  const authHeaders = { apikey: anonKey, Authorization: `Bearer ${opts.userJwt}` };

  try {
    // player_id solo si ESTE usuario ve al jugador bajo RLS (no se adjuntan vídeos a
    // menores ajenos). La FK a players no aplica RLS → este check es obligatorio.
    let safePlayerId: string | null = null;
    if (opts.playerId) {
      const pRes = await fetch(
        `${sbUrl}/rest/v1/players?id=eq.${encodeURIComponent(opts.playerId)}&select=id&limit=1`,
        { headers: authHeaders },
      );
      if (pRes.ok) {
        const rows = (await pRes.json().catch(() => [])) as Array<{ id?: string }>;
        if (Array.isArray(rows) && rows.some((r) => r?.id === opts.playerId)) safePlayerId = opts.playerId;
      }
    }

    const nowIso = new Date().toISOString();
    // `data` = stub mínimo con SOLO lo conocido (pullAll del cliente lee row.data).
    // Sin duration/width/height/fps a 0: no se sabe todavía (invariante #2).
    const dataStub = {
      id: opts.guid,
      title: opts.title,
      playerId: safePlayerId,
      status: "created",
      statusCode: 0,
      encodeProgress: 0,
      thumbnailUrl: null,
      embedUrl: "",
      streamUrl: null,
      dateUploaded: nowIso,
      analysisResult: null,
    };

    const row: Record<string, unknown> = {
      id: opts.guid,
      user_id: opts.userId,
      bunny_video_id: opts.guid,
      title: opts.title,
      status: "created",
      status_code: 0,
      date_uploaded: nowIso,
      data: dataStub,
    };
    if (opts.tenantId) row.tenant_id = opts.tenantId;
    if (safePlayerId) row.player_id = safePlayerId;
    if (opts.durationSec !== null) row.duration_sec = opts.durationSec;

    const res = await fetch(`${sbUrl}/rest/v1/videos`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn(`[video-init] insert videos ${res.status}: ${txt.slice(0, 200)}`);
      return "failed";
    }
    return "inserted";
  } catch (err) {
    console.warn("[video-init] insert videos falló (best-effort):", err);
    return "failed";
  }
}

export default withHandler(
  { method: "POST", schema: BodySchema, requireAuth: true, maxRequests: 10 },
  async ({ req, body, userId, tenantId }) => {
    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
    const apiKey = process.env.BUNNY_STREAM_API_KEY ?? process.env.BUNNY_API_KEY;

    // Degradación elegante: sin almacenamiento en la nube configurado, el cliente
    // procesa el vídeo LOCALMENTE (el análisis de visión corre en el navegador).
    // Devolvemos 200 + { success:false, phase2Pending:true } a nivel raíz — el contrato
    // que useVideoUpload ya consume — en vez de un 503 con jerga: NUNCA exponemos
    // nombres de variables de entorno al usuario final.
    if (!libraryId || !apiKey) {
      return degradedResponse({ phase2Pending: true });
    }

    const { title, playerId, collection } = body;
    const durationSec = body.durationSec ?? null;

    // Mismo gate de duración que el cliente (límite compartido · inv #7). Solo aplica si
    // el navegador leyó la duración; si no, no se bloquea ni se inventa.
    const durationGate = checkMatchDuration(durationSec);
    if (!durationGate.allowed) {
      return errorResponse({
        code: MATCH_DURATION_GATE_CODE,
        message: `El vídeo dura ${durationMinutesForDisplay(durationGate.durationSec)} min; el máximo es ${MAX_MATCH_DURATION_MIN} min.`,
        status: 422,
        details: { durationSec: durationGate.durationSec, maxDurationSec: durationGate.maxDurationSec },
      });
    }

    // Step 1: Create video entry in Bunny Stream
    const createPayload: Record<string, string> = { title };
    if (collection) createPayload.collectionId = collection;

    const createRes = await fetch(`${BUNNY_BASE}/${libraryId}/videos`, {
      method: "POST",
      headers: {
        AccessKey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createPayload),
    });

    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => "");
      console.warn(`[video-init] Bunny Stream API ${createRes.status}: ${errText || "sin cuerpo"}`);
      return errorResponse(
        `Almacenamiento de vídeo no disponible temporalmente (${createRes.status}). Inténtalo de nuevo en unos minutos.`,
        502,
        "BUNNY_ERROR",
      );
    }

    const video = (await createRes.json()) as { guid: string; title: string };

    // Step 2: Firma TUS válida 24 h (Bunny valida AuthorizationExpire en CADA
    // POST/HEAD/PATCH y re-firmar NO extiende la caducidad del recurso → la ventana
    // debe cubrir la subida completa de un partido). Helper compartido con create-upload.
    const { signature, expire } = await signTusUpload({
      libraryId,
      apiKey,
      videoGuid: video.guid,
    });

    // Step 3: fila `videos` con el JWT del usuario (best-effort, ver insertVideoRow).
    const authHeader = req.headers.get("Authorization") ?? "";
    const userJwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() || null : null;
    const videoRow = await insertVideoRow({
      userJwt,
      userId: userId as string,
      tenantId,
      guid: video.guid,
      title: video.title ?? title,
      playerId: playerId ?? null,
      durationSec,
    });

    // Return upload credentials — use signed auth, NEVER expose raw API key
    return successResponse({
      videoId:        video.guid,
      libraryId:      Number(libraryId),
      uploadUrl:      `${BUNNY_BASE}/${libraryId}/videos/${video.guid}`,
      authSignature:  signature,
      authExpire:     expire,
      title:          video.title,
      playerId:       playerId ?? null,
      cdnHostname:    process.env.BUNNY_CDN_HOSTNAME ?? process.env.VITE_BUNNY_CDN_HOSTNAME ?? null,
      videoRow,
    });
  },
);

export const config = { runtime: "edge" };
