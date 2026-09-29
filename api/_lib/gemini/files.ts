/**
 * VITAS · Gemini File API — librería compartida (fetch crudo, Edge + Node)
 *
 * Reglas:
 *   - La API key va SIEMPRE en la cabecera `x-goog-api-key`, NUNCA en la URL (`?key=`
 *     acaba en logs de proxies y en errores). La key vive solo en Vercel (CLAUDE.md regla 3).
 *   - La URL de subida reanudable es una URL de CAPACIDAD (sin key): la acuña Vercel y se
 *     entrega al worker; se trata como secreto (no se registra).
 * REST: https://ai.google.dev/api/files (consultado 2026-09-28).
 *
 * DEUDA CONOCIDA (inv #7, docs/pendientes-metricas.md): api/agents/video-observation.ts
 * conserva su propia subida/poll File API (con `?key=`) hasta la Fase 2; no se toca en la
 * Fase 1 para no chocar con ramas en vuelo.
 */
import { GEMINI_UPLOAD_HOST } from "../../../src/lib/shared/matchJob/contract";

export const GEMINI_API_BASE = `https://${GEMINI_UPLOAD_HOST}`;
const UPLOAD_URL = `${GEMINI_API_BASE}/upload/v1beta/files`;
/** files.list pageSize máximo documentado. */
export const GEMINI_LIST_PAGE_SIZE_MAX = 100;

export class GeminiConfigError extends Error {
  constructor() {
    super("GEMINI_API_KEY no configurada");
    this.name = "GeminiConfigError";
  }
}

export function geminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiConfigError();
  return key;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "x-goog-api-key": geminiApiKey(), ...extra };
}

export type GeminiFileState = "STATE_UNSPECIFIED" | "PROCESSING" | "ACTIVE" | "FAILED";

export interface GeminiFile {
  name: string;
  displayName?: string;
  mimeType?: string;
  sizeBytes?: string;
  createTime?: string;
  updateTime?: string;
  expirationTime?: string;
  /** base64 del SHA-256 (la API lo devuelve en base64, no en hex). */
  sha256Hash?: string;
  uri?: string;
  state?: GeminiFileState;
  error?: { code?: number; message?: string };
}

const FILE_NAME_RE = /^files\/[A-Za-z0-9_-]+$/;

function fileUrl(name: string): string {
  if (!FILE_NAME_RE.test(name)) throw new Error(`nombre de fichero Gemini no válido: ${name}`);
  return `${GEMINI_API_BASE}/v1beta/${name}`;
}

export interface ResumableSession {
  uploadUrl: string;
  chunkGranularityBytes: number | null;
}

/**
 * `start` de la subida reanudable. Exige el tamaño EXACTO (X-Goog-Upload-Header-Content-Length):
 * por eso se acuña después del transcode, con los bytes reales del proxy.
 */
export async function startResumableSession(opts: {
  bytes: number;
  mime: string;
  displayName: string;
  signal?: AbortSignal;
}): Promise<ResumableSession> {
  if (!Number.isInteger(opts.bytes) || opts.bytes <= 0) throw new Error("startResumableSession: bytes debe ser un entero > 0");
  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: authHeaders({
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(opts.bytes),
      "X-Goog-Upload-Header-Content-Type": opts.mime,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ file: { display_name: opts.displayName } }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`Gemini upload start ${res.status}`);
  const uploadUrl = res.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini upload start sin x-goog-upload-url");
  const u = new URL(uploadUrl);
  if (u.protocol !== "https:" || u.hostname !== GEMINI_UPLOAD_HOST) throw new Error("Gemini upload URL con host inesperado");
  const gran = Number(res.headers.get("x-goog-upload-chunk-granularity"));
  return { uploadUrl: u.href, chunkGranularityBytes: Number.isInteger(gran) && gran > 0 ? gran : null };
}

/**
 * `upload, finalize` de una sesión reanudable en UNA petición (bytes en memoria). En
 * producción sube el worker de Modal en streaming; esto lo usa el arnés de validación
 * del operador (scripts/validate-match-observation.mjs). La URL es de capacidad: sin key.
 */
export async function uploadBytesToSession(uploadUrl: string, data: Uint8Array<ArrayBuffer>, signal?: AbortSignal): Promise<GeminiFile> {
  const u = new URL(uploadUrl);
  if (u.protocol !== "https:" || u.hostname !== GEMINI_UPLOAD_HOST) throw new Error("Gemini upload URL con host inesperado");
  const res = await fetch(u.href, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: data,
    signal,
  });
  if (!res.ok) throw new Error(`Gemini upload ${res.status}`);
  const json = (await res.json()) as { file?: GeminiFile };
  if (!json.file?.name) throw new Error("Gemini upload sin fichero en la respuesta");
  return json.file;
}

export type GetFileResult = { ok: true; file: GeminiFile } | { ok: false; status: number };

/** files.get. 404 ⇒ { ok:false, status:404 } (fichero borrado o caducado). */
export async function getFile(name: string, signal?: AbortSignal): Promise<GetFileResult> {
  const res = await fetch(fileUrl(name), { headers: authHeaders(), signal });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, file: (await res.json()) as GeminiFile };
}

/** files.delete. Idempotente: 200 o 404 = borrado. */
export async function deleteFile(name: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(fileUrl(name), { method: "DELETE", headers: authHeaders(), signal });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

export async function listFiles(opts: { pageSize?: number; pageToken?: string; signal?: AbortSignal } = {}): Promise<{
  files: GeminiFile[];
  nextPageToken: string | null;
}> {
  const u = new URL(`${GEMINI_API_BASE}/v1beta/files`);
  u.searchParams.set("pageSize", String(Math.min(opts.pageSize ?? GEMINI_LIST_PAGE_SIZE_MAX, GEMINI_LIST_PAGE_SIZE_MAX)));
  if (opts.pageToken) u.searchParams.set("pageToken", opts.pageToken);
  const res = await fetch(u.href, { headers: authHeaders(), signal: opts.signal });
  if (!res.ok) throw new Error(`Gemini files.list ${res.status}`);
  const data = (await res.json()) as { files?: GeminiFile[]; nextPageToken?: string };
  return { files: data.files ?? [], nextPageToken: data.nextPageToken ?? null };
}

/** Lista (acotada a `maxPages`) los ficheros cuyo displayName empieza por `prefix`. */
export async function listFilesByDisplayNamePrefix(prefix: string, maxPages: number): Promise<{ files: GeminiFile[]; more: boolean }> {
  const out: GeminiFile[] = [];
  let token: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const r = await listFiles({ pageToken: token });
    out.push(...r.files.filter((f) => (f.displayName ?? "").startsWith(prefix)));
    if (!r.nextPageToken) return { files: out, more: false };
    token = r.nextPageToken;
  }
  return { files: out, more: true };
}

/** sha256Hash (base64) → hex minúsculas, para comparar con el hex del worker. */
export function sha256Base64ToHex(b64: string): string | null {
  try {
    const bin = atob(b64);
    let hex = "";
    for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
    return hex;
  } catch {
    return null;
  }
}
