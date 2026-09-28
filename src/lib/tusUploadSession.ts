/**
 * VITAS · Sesiones de subida TUS reanudables (cliente)
 *
 * Problema: un partido completo son GB; si el usuario recarga la página a mitad de
 * subida, volver a llamar a /api/upload/video-init crea OTRO vídeo en Bunny (y otra
 * fila `videos`) y la subida vuelve a empezar desde 0.
 *
 * Solución: al hacer init guardamos {videoId, uploadUrl, authSignature, authExpire,
 * libraryId} en localStorage, indexado por la MISMA huella (fingerprint) que usa
 * tus-js-client para guardar la URL de subida. Al volver a elegir el mismo fichero:
 *   - si hay sesión vigente → NO se llama a video-init; se reanuda con
 *     findPreviousUploads() / resumeFromPreviousUpload() desde el offset que tiene Bunny.
 *   - si caducó → se descarta y se empieza de cero (Bunny valida AuthorizationExpire en
 *     cada PATCH y re-firmar NO extiende la caducidad del recurso de subida:
 *     https://bunny.net/docs/stream/tus-resumable-uploads).
 *   - si Bunny la RECHAZA (4xx definitivo: vídeo borrado, clave rotada…) → se descarta
 *     (isTusSessionRejection) y el hook reintenta UNA vez con un video-init nuevo; y al
 *     borrar el vídeo se descartan sus sesiones (clearTusSessionsForVideo). Si no, el
 *     mismo fichero quedaría atascado contra una sesión muerta hasta que caducara (~24 h).
 *
 * localStorage puede no existir o lanzar (modo privado, cuota) → todo va en try/catch
 * y la ausencia de sesión es simplemente "no hay nada que reanudar".
 */

export const TUS_SESSIONS_STORAGE_KEY = "vitas_tus_upload_sessions";

/**
 * Margen mínimo de validez para reanudar. Por debajo, la subida restante casi seguro
 * no termina antes de que Bunny rechace los PATCH → mejor empezar una sesión nueva.
 * Heurística de UX, no una cifra de producto (pendiente de validar con subidas reales).
 */
export const RESUME_MIN_REMAINING_SEC = 15 * 60;

export interface TusUploadSession {
  videoId: string;
  uploadUrl: string;
  authSignature: string;
  /** UNIX segundos (Bunny AuthorizationExpire). */
  authExpire: number;
  libraryId: number;
  /** Jugador al que se ató la subida: solo se reanuda para el MISMO jugador. */
  playerId: string | null;
  /** URL TUS concreta de esta subida (cuando tus-js-client la conoce). */
  tusUploadUrl?: string | null;
  savedAt: number;
}

/**
 * Huella del fichero. Mismos campos que el fingerprint por defecto de tus-js-client en
 * navegador (nombre, tipo, tamaño, lastModified, endpoint) → se pasa también como
 * `fingerprint` a tus.Upload, así nuestra sesión y la URL que guarda tus comparten clave.
 */
export function uploadFingerprint(
  file: Pick<File, "name" | "type" | "size" | "lastModified">,
  endpoint: string,
): string {
  return ["vitas-tus", file.name, file.type, file.size, file.lastModified, endpoint].join("-");
}

function readAll(): Record<string, TusUploadSession> {
  try {
    const raw = localStorage.getItem(TUS_SESSIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, TusUploadSession>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, TusUploadSession>): void {
  try {
    if (Object.keys(all).length === 0) localStorage.removeItem(TUS_SESSIONS_STORAGE_KEY);
    else localStorage.setItem(TUS_SESSIONS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* sin almacenamiento → no hay reanudación, la subida sigue funcionando */
  }
}

function isValidSession(s: unknown): s is TusUploadSession {
  if (!s || typeof s !== "object") return false;
  const r = s as Record<string, unknown>;
  return (
    typeof r.videoId === "string" && r.videoId.length > 0 &&
    typeof r.uploadUrl === "string" &&
    typeof r.authSignature === "string" && r.authSignature.length > 0 &&
    typeof r.authExpire === "number" && Number.isFinite(r.authExpire) &&
    typeof r.libraryId === "number" && Number.isFinite(r.libraryId)
  );
}

/**
 * Sesión reanudable para esta huella + jugador, o null. Purga de paso las sesiones
 * caducadas (o casi) para no acumular basura en localStorage.
 */
export function loadTusSession(
  fingerprint: string,
  opts: { playerId: string | null; nowSec: number },
): TusUploadSession | null {
  const all = readAll();
  let changed = false;
  for (const [fp, s] of Object.entries(all)) {
    if (!isValidSession(s) || s.authExpire - opts.nowSec < RESUME_MIN_REMAINING_SEC) {
      delete all[fp];
      changed = true;
    }
  }
  if (changed) writeAll(all);

  const session = all[fingerprint];
  if (!session) return null;
  if ((session.playerId ?? null) !== (opts.playerId ?? null)) return null;
  return session;
}

export function saveTusSession(fingerprint: string, session: TusUploadSession): void {
  const all = readAll();
  all[fingerprint] = session;
  writeAll(all);
}

export function updateTusSession(fingerprint: string, patch: Partial<TusUploadSession>): void {
  const all = readAll();
  const current = all[fingerprint];
  if (!current) return;
  all[fingerprint] = { ...current, ...patch };
  writeAll(all);
}

export function clearTusSession(fingerprint: string): void {
  const all = readAll();
  if (!(fingerprint in all)) return;
  delete all[fingerprint];
  writeAll(all);
}

/**
 * Borra toda sesión que apunte a este vídeo de Bunny. Se llama al BORRAR el vídeo: si
 * no, volver a subir el mismo fichero reanudaría contra un VideoId que ya no existe.
 */
export function clearTusSessionsForVideo(videoId: string): void {
  if (!videoId) return;
  const all = readAll();
  let changed = false;
  for (const [fp, s] of Object.entries(all)) {
    if (s && typeof s === "object" && (s as Partial<TusUploadSession>).videoId === videoId) {
      delete all[fp];
      changed = true;
    }
  }
  if (changed) writeAll(all);
}

/**
 * Código HTTP de un error de tus-js-client (DetailedError.originalResponse), o null si
 * el error no trae respuesta (red caída, offline, abortado).
 */
export function tusErrorStatus(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const res = (err as { originalResponse?: { getStatus?: () => unknown } | null }).originalResponse;
  if (!res || typeof res.getStatus !== "function") return null;
  const status = res.getStatus();
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

/**
 * ¿Bunny RECHAZÓ la sesión de forma definitiva? = 4xx que tus-js-client no reintenta
 * (todos menos 409 Conflict y 423 Locked, que son transitorios). Ocurre si el vídeo se
 * borró en Bunny, si se rotó la clave de la librería (firma inválida) o si la firma
 * caducó. Reintentar con la MISMA sesión nunca va a funcionar → hay que descartarla.
 * Sin respuesta (red) o 5xx = transitorio → la sesión se conserva para reanudar.
 */
export function isTusSessionRejection(status: number | null): boolean {
  return status !== null && status >= 400 && status < 500 && status !== 409 && status !== 423;
}
