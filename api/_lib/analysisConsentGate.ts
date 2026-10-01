/**
 * VITAS · Gate de consentimiento ANTES de analizar un clip (servidor)
 *
 * Una sola implementación (invariante #7) de la decisión del owner del 30 sep 2026
 * (regla pura en src/lib/shared/videoConsent.ts). La usan:
 *   - creación de subidas: api/upload/_video-init.ts, api/videos/create-upload.ts
 *   - inicio de análisis:  api/videos/finalize.ts, api/_lib/enqueueAnalysis.ts (webhook de
 *     Bunny + finalize), api/crons/process-analyses-queue.ts (defensa en profundidad),
 *     api/agents/video-observation.ts (llamadas con JWT de usuario), team-observation,
 *     _team-intelligence, api/pipeline/_start.ts, api/analyses/generate-reports.ts,
 *     api/coaching/_track-players.ts / _track-async.ts (llamadas de usuario),
 *     api/tactical/_compute-from-video.ts (llamadas de usuario), api/live/aggregate.ts.
 *
 * DÓNDE SE GUARDA LA DECLARACIÓN (sin migración nueva): una fila append-only, escrita
 * SOLO por el servidor con service_role, en public.gdpr_audit_log (migración 003):
 *   user_id       = usuario del JWT verificado (nunca del body)   → QUIÉN
 *   created_at    = reloj de la base (DEFAULT now())             → CUÁNDO
 *   metadata      = { version, scope, player_id, bunny_video_id, endpoint } (jsonb) → VERSIÓN
 *   action        = 'video_analysis_attested'
 *   resource_type = 'videos' (fila de videos con propiedad comprobada) | 'video_ref'
 *   resource_id   = id del vídeo (o referencia del cliente)
 * Por qué no una columna jsonb de `videos`: `videos.data` lo sobrescribe entero el
 * navegador en cada sincronización (supabaseVideoService: `data: v`) y la RLS de update
 * deja al dueño cambiar cualquier columna; `analysis_result` también lo reenvía el
 * cliente; `target_player_bbox` tiene semántica de identidad. PRECONDICIÓN (no
 * verificada en prod): la 072 cerró el INSERT de authenticated en gdpr_audit_log; antes,
 * la política 003 `audit_insert_authenticated` (WITH CHECK true) permitía falsificarla.
 *
 * FALLA CERRADO: sin Supabase, con un error de la base o si no se puede guardar la
 * declaración → consent_check_failed (500). Nunca 503 (ver CLIP_CONSENT_HTTP_STATUS).
 * Única degradación: si la columna players.birth_date no existiera (036 sin aplicar), la
 * fecha se trata como DESCONOCIDA (regla 3 del owner: basta la declaración) y se registra
 * en el log; nunca se infiere la edad.
 *
 * Sin `node:*` → vale para Edge y Node.
 */

import { errorResponse } from "./apiResponse";
import {
  CLIP_ATTESTATION_VERSION,
  CLIP_CONSENT_HTTP_STATUS,
  VIDEO_ANALYSIS_ATTESTED_ACTION,
  clipConsentGateReason,
  evaluateClipConsent,
  minorStatusFromBirthDate,
  parseClipAttestation,
  type ClipAttestation,
  type ClipAttestationResourceType,
  type ClipConsentCode,
  type MinorStatus,
} from "../../src/lib/shared/videoConsent";
import { isMissingBirthDateColumnError } from "../../src/lib/shared/birthDate";

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Quién hace la petición (null en rutas automáticas: webhook de Bunny, cola). */
export interface ConsentActor {
  userId: string | null;
  tenantId: string | null;
  ip?: string | null;
}

/** El clip: una fila `videos` propia (ya comprobada por el llamador) o una referencia. */
export type ConsentResource =
  | { type: "videos"; id: string; bunnyVideoId?: string | null }
  | { type: "video_ref"; id: string | null };

export interface EnforceClipConsentInput {
  /** `body.attestation` tal cual (se valida aquí). Ignorado si `storedOnly`. */
  attestation?: unknown;
  /**
   * Ruta automática (webhook, cola): solo cuenta una declaración YA guardada para una
   * fila `videos`; el body no puede declarar nada.
   */
  storedOnly?: boolean;
  /**
   * false ⇒ no se busca una declaración guardada (la petición DEBE traerla). Por
   * defecto se busca solo para `type: "videos"`.
   */
  lookupStored?: boolean;
  resource: ConsentResource;
  /** Jugador del vídeo; null = vídeo de equipo (la comprobación por jugador no aplica). */
  playerId: string | null;
  actor: ConsentActor;
  /** Endpoint que declara (queda en metadata). */
  endpoint: string;
  scope?: "player" | "team";
  locale?: unknown;
  /**
   * false ⇒ se decide pero NO se guarda la declaración del body (el llamador la guarda
   * luego con recordClipAttestation, p. ej. cuando el id del vídeo aún no existe).
   */
  record?: boolean;
  now?: Date;
}

export type ClipConsentGateResult =
  | {
      allowed: true;
      /** "recorded" = se guardó ahora · "stored" = ya estaba · "pending" = el llamador la guardará. */
      attestation: "recorded" | "stored" | "pending";
      /** Declaración del body lista para guardar (solo si `attestation === "pending"`). */
      pendingAttestation: ClipAttestation | null;
      minor: MinorStatus | null;
    }
  | {
      allowed: false;
      code: ClipConsentCode;
      status: 400 | 403 | 500;
      gate_reason: string;
      minor: MinorStatus | null;
    };

// ─── REST (service role) ─────────────────────────────────────────────────────

function sbEnv(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function headers(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

class ConsentDbError extends Error {}

async function getRows<T>(path: string): Promise<T[]> {
  const env = sbEnv();
  if (!env) throw new ConsentDbError("supabase_not_configured");
  const res = await fetch(`${env.url}/rest/v1/${path}`, { headers: headers(env.key) });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new ConsentDbError(`${res.status} ${text.slice(0, 300)}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ConsentDbError("invalid_json");
  }
  if (!Array.isArray(parsed)) throw new ConsentDbError("not_an_array");
  return parsed as T[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6_RE = /^[0-9a-f:]+$/i;

/** Solo un uuid va a una columna uuid (un valor raro haría fallar el INSERT → bloquearía todo). */
function uuidOrNull(v: string | null | undefined): string | null {
  return v && UUID_RE.test(v) ? v : null;
}

/** Solo una IP literal va a la columna inet (getClientIP puede dar "unknown"). */
function ipOrNull(v: string | null | undefined): string | null {
  if (!v) return null;
  if (IPV4_RE.test(v)) return v;
  if (v.includes(":") && IPV6_RE.test(v)) return v;
  return null;
}

function resourceFilter(resource: ConsentResource): string {
  const idFilter = resource.id === null ? "resource_id=is.null" : `resource_id=eq.${encodeURIComponent(resource.id)}`;
  return (
    `action=eq.${VIDEO_ANALYSIS_ATTESTED_ACTION}` +
    `&resource_type=eq.${resource.type}` +
    `&${idFilter}` +
    `&metadata->>version=eq.${encodeURIComponent(CLIP_ATTESTATION_VERSION)}`
  );
}

/** ¿Hay una declaración VIGENTE guardada para esta fila `videos`? (cualquier usuario autorizado). */
export async function hasStoredClipAttestation(videoId: string): Promise<boolean> {
  const rows = await getRows<{ id: unknown }>(
    `gdpr_audit_log?${resourceFilter({ type: "videos", id: videoId })}&select=id&limit=1`,
  );
  return rows.length > 0;
}

/**
 * Guarda la declaración (append-only, service role). Idempotente por (recurso, versión,
 * usuario): si ya existe no se duplica (finalize se sondea hasta 12 veces).
 * Lanza ConsentDbError si no se puede comprobar o insertar.
 */
export async function recordClipAttestation(input: {
  attestation: ClipAttestation;
  resource: ConsentResource;
  actor: ConsentActor;
  playerId: string | null;
  endpoint: string;
  scope?: "player" | "team";
}): Promise<void> {
  const env = sbEnv();
  if (!env) throw new ConsentDbError("supabase_not_configured");
  const userId = uuidOrNull(input.actor.userId);
  if (!userId) throw new ConsentDbError("attestation_without_user");

  const existing = await getRows<{ id: unknown }>(
    `gdpr_audit_log?${resourceFilter(input.resource)}&user_id=eq.${userId}&select=id&limit=1`,
  );
  if (existing.length > 0) return;

  const row = {
    user_id: userId,
    tenant_id: uuidOrNull(input.actor.tenantId),
    action: VIDEO_ANALYSIS_ATTESTED_ACTION,
    resource_type: input.resource.type as ClipAttestationResourceType,
    resource_id: input.resource.id,
    metadata: {
      version: input.attestation.version,
      scope: input.scope ?? (input.playerId ? "player" : "team"),
      player_id: input.playerId,
      bunny_video_id: input.resource.type === "videos" ? input.resource.bunnyVideoId ?? null : null,
      endpoint: input.endpoint,
    },
    ip: ipOrNull(input.actor.ip),
  };
  const res = await fetch(`${env.url}/rest/v1/gdpr_audit_log`, {
    method: "POST",
    headers: headers(env.key, { Prefer: "return=minimal" }),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ConsentDbError(`insert ${res.status} ${text.slice(0, 300)}`);
  }
}

/**
 * players.birth_date del jugador. `found:false` = no hay fila. Si la columna no existe
 * (036 sin aplicar) → fecha DESCONOCIDA (null) con aviso en el log: nunca se infiere.
 */
async function readPlayerBirthDate(playerId: string): Promise<{ found: boolean; birthDate: string | null }> {
  try {
    const rows = await getRows<{ birth_date: string | null }>(
      `players?id=eq.${encodeURIComponent(playerId)}&select=birth_date&limit=1`,
    );
    if (rows.length === 0) return { found: false, birthDate: null };
    const bd = rows[0]?.birth_date;
    return { found: true, birthDate: typeof bd === "string" && bd !== "" ? bd : null };
  } catch (err) {
    if (err instanceof ConsentDbError && isMissingBirthDateColumnError(err.message)) {
      console.warn("[consent-gate] players.birth_date no existe (¿036 sin aplicar?) → fecha desconocida, basta la declaración");
      return { found: true, birthDate: null };
    }
    throw err;
  }
}

/**
 * ¿Consentimiento parental CONCEDIDO? Fuente canónica única: parental_consents con
 * email_verified = true AND withdrawn_at IS NULL (predicado de idx_consents_active, 003).
 * La fila solo la crea api/auth/sign-consent.ts y solo se verifica cuando el TUTOR pulsa
 * el enlace de api/auth/verify-consent.ts.
 */
export async function hasActiveParentalConsent(playerId: string): Promise<boolean> {
  const rows = await getRows<{ id: unknown }>(
    `parental_consents?player_id=eq.${encodeURIComponent(playerId)}` +
      `&email_verified=is.true&withdrawn_at=is.null&select=id&limit=1`,
  );
  return rows.length > 0;
}

// ─── Gate ────────────────────────────────────────────────────────────────────

type BlockedGateResult = Extract<ClipConsentGateResult, { allowed: false }>;

function blockedResult(code: ClipConsentCode, locale: unknown, minor: MinorStatus | null): BlockedGateResult {
  return {
    allowed: false,
    code,
    status: CLIP_CONSENT_HTTP_STATUS[code],
    gate_reason: clipConsentGateReason(locale, code),
    minor,
  };
}

/**
 * Decide (y, si procede, guarda la declaración) antes de analizar un clip.
 * Orden: declaración (body o guardada) → jugador (fecha de nacimiento → si es menor de
 * 14 conocido, consentimiento parental) → regla pura → guardar la declaración del body.
 */
export async function enforceClipConsent(input: EnforceClipConsentInput): Promise<ClipConsentGateResult> {
  const { locale, resource, playerId, actor } = input;
  try {
    if (!sbEnv()) {
      console.error("[consent-gate] Supabase no configurado → no se puede comprobar ni guardar la declaración (falla cerrado)");
      return blockedResult("consent_check_failed", locale, null);
    }

    // 1 · Declaración: la del body (solo si hay un usuario que la haga) o una guardada.
    const bodyAttestation =
      input.storedOnly || !actor.userId ? null : parseClipAttestation(input.attestation);
    let attestationSource: "body" | "stored" | null = bodyAttestation ? "body" : null;
    const canLookup = resource.type === "videos" && input.lookupStored !== false;
    if (!attestationSource && canLookup && (await hasStoredClipAttestation(resource.id))) {
      attestationSource = "stored";
    }

    // 2 · Jugador (null = equipo). Solo se consulta el consentimiento si es menor conocido.
    let player: { birthDate: string | null; parentalConsentGranted: boolean | null } | null = null;
    if (attestationSource && playerId) {
      const bd = await readPlayerBirthDate(playerId);
      if (!bd.found) {
        console.error(`[consent-gate] jugador ${playerId} no encontrado → falla cerrado`);
        return blockedResult("consent_check_failed", locale, null);
      }
      const minor = minorStatusFromBirthDate(bd.birthDate, input.now ?? new Date());
      player = {
        birthDate: bd.birthDate,
        parentalConsentGranted: minor === "minor" ? await hasActiveParentalConsent(playerId) : null,
      };
    }

    // 3 · Regla pura (la misma que usa la UI).
    const decision = evaluateClipConsent({
      attestation: attestationSource ? { accepted: true, version: CLIP_ATTESTATION_VERSION } : null,
      player,
      locale,
      now: input.now,
    });
    if (!decision.allowed) {
      return { allowed: false, code: decision.code, status: CLIP_CONSENT_HTTP_STATUS[decision.code], gate_reason: decision.gate_reason, minor: decision.minor };
    }

    // 4 · Guardar la declaración del body (quién/cuándo/versión) — si no se puede, NO se analiza.
    if (attestationSource === "body" && bodyAttestation) {
      if (input.record === false) {
        return { allowed: true, attestation: "pending", pendingAttestation: bodyAttestation, minor: decision.minor };
      }
      await recordClipAttestation({
        attestation: bodyAttestation,
        resource,
        actor,
        playerId,
        endpoint: input.endpoint,
        scope: input.scope,
      });
      return { allowed: true, attestation: "recorded", pendingAttestation: null, minor: decision.minor };
    }
    return { allowed: true, attestation: "stored", pendingAttestation: null, minor: decision.minor };
  } catch (err) {
    console.error("[consent-gate] error comprobando el consentimiento (falla cerrado):", err instanceof Error ? err.message : err);
    return blockedResult("consent_check_failed", locale, null);
  }
}

/** Respuesta HTTP estándar de un bloqueo (código + motivo en el idioma pedido + versión vigente). */
export function clipConsentErrorResponse(result: BlockedGateResult): Response {
  return errorResponse({
    message: result.gate_reason,
    status: result.status,
    code: result.code,
    details: { gate_reason: result.gate_reason, attestationVersion: CLIP_ATTESTATION_VERSION },
  });
}

// ─── Llamadas de USUARIO a video-observation ─────────────────────────────────

interface VideoRowLite {
  id: string;
  user_id: string | null;
  tenant_id: string | null;
  player_id: string | null;
  bunny_video_id: string | null;
}

/** ¿La URL apunta a ESE vídeo de Bunny? (el GUID aparece como segmento de la ruta). */
export function videoUrlReferencesBunnyGuid(videoUrl: string, guid: string | null | undefined): boolean {
  if (!guid) return false;
  try {
    return new URL(videoUrl).pathname.split("/").includes(guid);
  } catch {
    return false;
  }
}

/** Fila `videos` por id o por bunny_video_id (service role). null = no existe. */
export async function loadVideoRow(by: { id: string } | { bunnyVideoId: string }): Promise<VideoRowLite | null> {
  const filter = "id" in by ? `id=eq.${encodeURIComponent(by.id)}` : `bunny_video_id=eq.${encodeURIComponent(by.bunnyVideoId)}`;
  const rows = await getRows<VideoRowLite>(`videos?${filter}&select=id,user_id,tenant_id,player_id,bunny_video_id&limit=1`);
  return rows[0] ?? null;
}

/**
 * GUID de Bunny de una URL de vídeo de Bunny: el segmento tras `/videos/` en
 * video.bunnycdn.com, o el PRIMER segmento de la ruta en una pull zone (`/<guid>/play_720p.mp4`).
 */
export function bunnyGuidFromVideoUrl(videoUrl: string): string | null {
  try {
    const u = new URL(videoUrl);
    const segs = u.pathname.split("/").filter(Boolean);
    if (u.hostname.toLowerCase() === "video.bunnycdn.com") {
      const i = segs.indexOf("videos");
      return i >= 0 && segs[i + 1] ? segs[i + 1] : null;
    }
    return segs[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Ruta SIN declaración en el body (p. ej. live/aggregate, que analiza la `video_url`
 * guardada de un partido): el vídeo tiene que ser una fila `videos` QUE GESTIONE quien
 * pide el análisis y con una declaración YA guardada (la de VideoUpload al subirlo). Sin
 * fila, de otro usuario o sin declaración → bloqueado (attestation_required: no consta una
 * declaración de quien analiza para ese vídeo).
 */
export async function enforceStoredConsentForVideoUrl(input: {
  videoUrl: string;
  actor: ConsentActor;
  endpoint: string;
  locale?: unknown;
  ownsVideo: (video: VideoRowLite, userId: string | null, tenantId: string | null) => Promise<boolean>;
}): Promise<ClipConsentGateResult> {
  const guid = bunnyGuidFromVideoUrl(input.videoUrl);
  if (!guid) return blockedResult("attestation_required", input.locale, null);
  let video: VideoRowLite | null;
  try {
    video = await loadVideoRow({ bunnyVideoId: guid });
  } catch (err) {
    console.error("[consent-gate] no se pudo leer el vídeo (falla cerrado):", err instanceof Error ? err.message : err);
    return blockedResult("consent_check_failed", input.locale, null);
  }
  if (!video) return blockedResult("attestation_required", input.locale, null);
  // La declaración guardada vale para quien gestiona ESE vídeo, no para cualquiera que
  // apunte su partido a la URL de un vídeo ajeno.
  if (!(await input.ownsVideo(video, input.actor.userId, input.actor.tenantId))) {
    console.warn(`[consent-gate] ${input.endpoint}: el vídeo ${video.id} no es de quien pide el análisis`);
    return blockedResult("attestation_required", input.locale, null);
  }
  return enforceClipConsent({
    storedOnly: true,
    resource: { type: "videos", id: video.id, bunnyVideoId: video.bunny_video_id },
    playerId: video.player_id,
    actor: input.actor,
    endpoint: input.endpoint,
    scope: video.player_id ? "player" : "team",
    locale: input.locale,
  });
}

/**
 * Recurso de consentimiento para un `videoId` que manda el CLIENTE (generate-reports,
 * pipeline/start). Si es una fila `videos`, tiene que gestionarla el usuario (si no → 403)
 * y cuenta la declaración YA guardada con ella (la de la subida); si no es una fila
 * (vídeo solo del navegador), es `video_ref` y la declaración tiene que venir en la
 * petición. Error de la base → consent_check_failed (falla cerrado).
 */
export async function consentResourceForClientVideoId(input: {
  videoId: string;
  actor: ConsentActor;
  locale?: unknown;
  ownsVideo: (video: VideoRowLite, userId: string | null, tenantId: string | null) => Promise<boolean>;
}): Promise<{ ok: true; resource: ConsentResource; video: VideoRowLite | null } | { ok: false; response: Response }> {
  let video: VideoRowLite | null;
  try {
    video = await loadVideoRow({ id: input.videoId });
  } catch (err) {
    console.error("[consent-gate] no se pudo leer el vídeo (falla cerrado):", err instanceof Error ? err.message : err);
    return { ok: false, response: clipConsentErrorResponse(blockedResult("consent_check_failed", input.locale, null)) };
  }
  if (!video) return { ok: true, resource: { type: "video_ref", id: input.videoId }, video: null };
  if (!(await input.ownsVideo(video, input.actor.userId, input.actor.tenantId))) {
    return { ok: false, response: errorResponse({ code: "forbidden", message: "No gestionas este vídeo", status: 403 }) };
  }
  return { ok: true, resource: { type: "videos", id: video.id, bunnyVideoId: video.bunny_video_id }, video };
}

export type UserVideoGateResult =
  | { allowed: true; video: VideoRowLite }
  | { allowed: false; response: Response };

/**
 * Llamada con JWT de USUARIO a /api/agents/video-observation. Para que la declaración
 * quede guardada CON el vídeo y el menor se pueda comprobar, la petición tiene que
 * identificar una fila `videos` que gestione el usuario y la URL tiene que ser la de ESE
 * vídeo. Sin fichero en base64 (no se podría ligar a ningún vídeo). Las llamadas de
 * servicio (cola, gemini-analyze, live/aggregate) NO pasan por aquí: su gate va antes.
 */
export async function enforceUserVideoObservationConsent(input: {
  videoId: unknown;
  videoUrl: unknown;
  hasBase64: boolean;
  attestation: unknown;
  scope: "player" | "team";
  actor: ConsentActor;
  locale?: unknown;
  ownsVideo: (video: VideoRowLite, userId: string | null, tenantId: string | null) => Promise<boolean>;
}): Promise<UserVideoGateResult> {
  const reject = (status: number, code: string, message: string): UserVideoGateResult => ({
    allowed: false,
    response: errorResponse({ status, code, message }),
  });
  if (input.hasBase64) {
    return reject(400, "video_reference_required", "Las llamadas de usuario deben analizar un vídeo guardado (videoId + videoUrl), no un fichero en el cuerpo.");
  }
  if (typeof input.videoId !== "string" || input.videoId.trim() === "" || typeof input.videoUrl !== "string") {
    return reject(400, "video_reference_required", "Falta videoId: el análisis debe referirse a un vídeo guardado.");
  }
  let video: VideoRowLite | null;
  try {
    video = await loadVideoRow({ id: input.videoId });
  } catch (err) {
    console.error("[consent-gate] no se pudo leer el vídeo (falla cerrado):", err instanceof Error ? err.message : err);
    return { allowed: false, response: clipConsentErrorResponse(blockedResult("consent_check_failed", input.locale, null)) };
  }
  if (!video) return reject(404, "video_not_found", "Vídeo no encontrado");
  if (!(await input.ownsVideo(video, input.actor.userId, input.actor.tenantId))) {
    return reject(403, "forbidden", "No gestionas este vídeo");
  }
  if (!videoUrlReferencesBunnyGuid(input.videoUrl, video.bunny_video_id)) {
    return reject(400, "video_url_mismatch", "La URL no corresponde a ese vídeo.");
  }
  // Ámbito jugador sin jugador en la fila: no se puede comprobar al menor → no se analiza.
  if (input.scope === "player" && !video.player_id) {
    return reject(400, "player_scope_requires_player_video", "El análisis por jugador solo se hace sobre un vídeo con jugador asignado.");
  }
  const gate = await enforceClipConsent({
    attestation: input.attestation,
    resource: { type: "videos", id: video.id, bunnyVideoId: video.bunny_video_id },
    playerId: video.player_id,
    actor: input.actor,
    endpoint: "agents/video-observation",
    scope: input.scope,
    locale: input.locale,
  });
  if (!gate.allowed) return { allowed: false, response: clipConsentErrorResponse(gate) };
  return { allowed: true, video };
}
