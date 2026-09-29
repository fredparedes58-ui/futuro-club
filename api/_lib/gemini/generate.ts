/**
 * VITAS · Gemini generateContent → JSON estricto sobre un tramo de un fichero
 *
 * Una llamada = un tramo del MISMO fichero subido (`videoMetadata` start/end offsets +
 * fps en la misma `part` que `fileData`, https://ai.google.dev/gemini-api/docs/generate-content/video-understanding),
 * `mediaResolution` LOW, `responseSchema` del contrato, thinking acotado.
 * Nunca un parseo parcial: finishReason ≠ STOP o JSON inválido ⇒ error tipado (el
 * caller decide reintento). Key en cabecera `x-goog-api-key`, nunca en la URL.
 * Si la aceptación de videoMetadata/mediaResolution/responseSchema con fileData en
 * GEMINI_MODEL falla, se verá como error `http` 400 (pendiente del spike (b)).
 */
import { GEMINI_API_BASE, geminiApiKey } from "./files";
import type { GeminiUsage } from "../matchJob/costing";

export interface GenerateJsonRequest {
  model: string;
  fileUri: string;
  mimeType: string;
  startSec: number;
  endSec: number;
  fps: number;
  mediaResolution: string;
  prompt: string;
  responseSchema: unknown;
  maxOutputTokens: number;
  thinkingBudget: number;
  timeoutMs: number;
}

export type GenerateFailureKind =
  | "max_tokens" //       finishReason MAX_TOKENS (salida truncada)
  | "invalid_json" //     texto no parseable como JSON
  | "blocked" //          SAFETY / RECITATION / PROHIBITED_CONTENT / promptFeedback.blockReason
  | "timeout" //          AbortController
  | "file_unavailable" // el fichero ya no existe / no es accesible (403/404 sobre fileUri)
  | "http"; //            otro HTTP no-ok

export type GenerateJsonResult =
  | { ok: true; json: unknown; usage: GeminiUsage | null; finishReason: string; modelVersion: string | null }
  | { ok: false; kind: GenerateFailureKind; status: number | null; usage: GeminiUsage | null; message: string };

interface GenerateResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }>;
  usageMetadata?: GeminiUsage;
  modelVersion?: string;
  promptFeedback?: { blockReason?: string };
}

const BLOCKED_REASONS = new Set(["SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY"]);

/** Cuerpo exacto del request (exportado para tests: la key no está en él). */
export function buildGenerateBody(req: GenerateJsonRequest): Record<string, unknown> {
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            fileData: { fileUri: req.fileUri, mimeType: req.mimeType },
            videoMetadata: { startOffset: `${req.startSec}s`, endOffset: `${req.endSec}s`, fps: req.fps },
          },
          { text: req.prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: req.responseSchema,
      mediaResolution: req.mediaResolution,
      maxOutputTokens: req.maxOutputTokens,
      thinkingConfig: { thinkingBudget: req.thinkingBudget },
    },
  };
}

export function generateUrl(model: string): string {
  if (!/^[a-z0-9.-]+$/i.test(model)) throw new Error(`modelo Gemini no válido: ${model}`);
  return `${GEMINI_API_BASE}/v1beta/models/${model}:generateContent`;
}

export async function generateJson(req: GenerateJsonRequest): Promise<GenerateJsonResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs);
  let res: Response;
  try {
    res = await fetch(generateUrl(req.model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiApiKey() },
      body: JSON.stringify(buildGenerateBody(req)),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = ctrl.signal.aborted || (err instanceof Error && err.name === "AbortError");
    return { ok: false, kind: aborted ? "timeout" : "http", status: null, usage: null, message: aborted ? "timeout" : "network error" };
  }
  clearTimeout(timer);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Solo se trata como "fichero perdido" si el error habla del fichero: un 403 por key
    // inválida o un 404 de modelo retirado NO deben disparar un re-despacho (sería un
    // bucle de transcodes que no arregla nada).
    const aboutFile = /\bfile/i.test(text) && /not.?found|not exist|expired|permission|denied/i.test(text);
    const fileGone = (res.status === 404 || res.status === 403 || res.status === 400) && aboutFile;
    return { ok: false, kind: fileGone ? "file_unavailable" : "http", status: res.status, usage: null, message: `HTTP ${res.status}` };
  }

  let data: GenerateResponse;
  try {
    data = (await res.json()) as GenerateResponse;
  } catch {
    return { ok: false, kind: "invalid_json", status: res.status, usage: null, message: "respuesta HTTP no JSON" };
  }
  const usage = data.usageMetadata ?? null;
  if (data.promptFeedback?.blockReason) {
    return { ok: false, kind: "blocked", status: res.status, usage, message: `blocked: ${data.promptFeedback.blockReason}` };
  }
  const cand = data.candidates?.[0];
  const finishReason = cand?.finishReason ?? "UNKNOWN";
  if (finishReason === "MAX_TOKENS") return { ok: false, kind: "max_tokens", status: res.status, usage, message: "MAX_TOKENS" };
  if (BLOCKED_REASONS.has(finishReason)) return { ok: false, kind: "blocked", status: res.status, usage, message: finishReason };
  if (finishReason !== "STOP") return { ok: false, kind: "invalid_json", status: res.status, usage, message: `finishReason ${finishReason}` };

  const text = (cand?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  try {
    return { ok: true, json: JSON.parse(text), usage, finishReason, modelVersion: data.modelVersion ?? null };
  } catch {
    return { ok: false, kind: "invalid_json", status: res.status, usage, message: "JSON inválido" };
  }
}
