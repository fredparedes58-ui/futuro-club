/**
 * VITAS · Match job — la petición EXACTA a Gemini de un tramo (una sola implementación)
 *
 * La usan el job (advance.ts) y el arnés de validación del operador
 * (scripts/validate-match-observation.mjs): lo que se valida contra anotaciones humanas
 * es byte a byte lo que corre en producción (prompt segment.v1, responseSchema del
 * contrato, fps de videoMetadata, mediaResolution, tope de thinking y de salida, todo de
 * config/matchVideo.json). Cambiar cualquiera de esos valores exige volver a validar.
 */
import { SEGMENT_GEMINI_RESPONSE_SCHEMA } from "../../../src/lib/shared/matchJob/contract";
import type { GenerateJsonRequest } from "../gemini/generate";
import { MATCH_VIDEO_CONFIG as CFG } from "./config";
import { buildSegmentPrompt, type SegmentPromptInput } from "./prompts/segment.v1";

export interface SegmentRequestInput extends SegmentPromptInput {
  model: string;
  fileUri: string;
}

export function buildSegmentGenerateRequest(input: SegmentRequestInput): GenerateJsonRequest {
  return {
    model: input.model,
    fileUri: input.fileUri,
    mimeType: "video/mp4",
    startSec: input.segment.start_sec,
    endSec: input.segment.end_sec,
    fps: CFG.geminiVideoFps,
    mediaResolution: CFG.mediaResolution,
    prompt: buildSegmentPrompt(input),
    responseSchema: SEGMENT_GEMINI_RESPONSE_SCHEMA,
    maxOutputTokens: CFG.maxOutputTokens,
    thinkingBudget: CFG.thinkingBudget,
    timeoutMs: CFG.geminiRequestTimeoutMs,
  };
}
