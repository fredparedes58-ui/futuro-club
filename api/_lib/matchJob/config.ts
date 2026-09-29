/**
 * VITAS · Match job — configuración (fuente única: config/matchVideo.json + config/aiPricing.json)
 *
 * Los JSON de config/ son la fuente de verdad (cada valor con `_source` o
 * "pendiente de validar", contrato de .claude/rules/metricas.md). Este módulo solo
 * los importa, los VALIDA con zod al cargar (un config roto falla en el arranque,
 * nunca en mitad de un job) y expone valores tipados.
 *
 * `with { type: "json" }`: el proyecto es "type": "module" → Node ESM exige el
 * atributo para importar JSON si la función no se empaqueta; esbuild/Vite lo
 * aceptan igual. Así funciona en ambos modos de build de Vercel.
 */
import { z } from "zod";
import rawMatchVideo from "../../../config/matchVideo.json" with { type: "json" };
import rawAiPricing from "../../../config/aiPricing.json" with { type: "json" };
import type { AggregateConfidence } from "./aggregate";

const source = z.string().trim().min(1);
const num = z.object({ value: z.number().finite(), _source: source }).strict();
const posNum = z.object({ value: z.number().finite().positive(), _source: source }).strict();
const int = z.object({ value: z.number().int().nonnegative(), _source: source }).strict();
const pos = z.object({ value: z.number().int().positive(), _source: source }).strict();
const frac = z.object({ value: z.number().min(0).max(1), _source: source }).strict();
const str = z.object({ value: z.string().min(1), _source: source }).strict();

const matchVideoFileSchema = z
  .object({
    $comment: z.string(),
    schema_version: z.literal(1),
    params: z
      .object({
        segmentSec: pos,
        minTrailingSegmentSec: int,
        proxyFps: posNum,
        geminiVideoFps: posNum,
        proxyHeight: pos,
        proxyCrf: int,
        durationToleranceSec: num,
        mediaResolution: z
          .object({
            value: z.enum(["MEDIA_RESOLUTION_LOW", "MEDIA_RESOLUTION_MEDIUM", "MEDIA_RESOLUTION_HIGH"]),
            _source: source,
          })
          .strict(),
        tokensPerFrameLow: pos,
        tokensPerFrameDefault: pos,
        segmentPromptTokensEstimate: pos,
        maxOutputTokens: pos,
        thinkingBudget: int,
        geminiRequestTimeoutMs: pos,
        segmentLeaseSec: pos,
        maxSegmentAttempts: pos,
        maxInvalidOutputAttempts: pos,
        geminiProcessingRetrySec: pos,
        geminiFileMaxBytes: pos,
        geminiFileExpiryMarginSec: int,
        orphanFileMaxAgeHours: pos,
        llmConfidence: frac,
        llmConfidencePartialFactor: frac,
        possessionConfidence: frac,
        possessionLowConfidence: frac,
        kitDeltaEWarn: num,
        staleHeartbeatSec: pos,
        maxEncodeWaitHours: pos,
        maxActiveJobsPerUser: pos,
        maxActiveJobsGlobal: pos,
        tickBatchSize: pos,
        sweepMaxPages: pos,
        reportReplyTokens: pos,
        reportInputTokensEstimate: pos,
        reportTimeoutMs: pos,
        reportLeaseSec: pos,
        modalCpuMatchEstimateUsd: num,
        hlsVariantPathTemplate: str,
        embedBaseUrl: str,
        playbackTokenTtlSec: pos,
        listLimit: pos,
        validationTimeToleranceSec: num,
        validationMinPrecision: frac,
        validationMinRecall: frac,
      })
      .strict(),
  })
  .strict();

const geminiPriceSchema = z
  .object({
    input_text_image_video_usd_per_mtok: z.number().nonnegative(),
    input_audio_usd_per_mtok: z.number().nonnegative(),
    output_usd_per_mtok: z.number().nonnegative(),
    _source: source,
  })
  .strict();

const anthropicPriceSchema = z
  .object({
    input_usd_per_mtok: z.number().nonnegative(),
    output_usd_per_mtok: z.number().nonnegative(),
    cache_write_5m_usd_per_mtok: z.number().nonnegative(),
    cache_read_usd_per_mtok: z.number().nonnegative(),
    _source: source,
  })
  .strict();

const aiPricingFileSchema = z
  .object({
    $comment: z.string(),
    schema_version: z.literal(1),
    fetched_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    gemini: z.record(geminiPriceSchema),
    anthropic: z.record(anthropicPriceSchema),
  })
  .strict();

/**
 * Coherencia entre parámetros (un config incoherente falla al cargar, nunca en mitad
 * de un job): Gemini no puede muestrear más fps de los que tiene el proxy, y la
 * confianza "baja" de posesión no puede superar a la normal.
 */
export function checkMatchVideoParams(params: z.infer<typeof matchVideoFileSchema>["params"]): string[] {
  const issues: string[] = [];
  if (params.geminiVideoFps.value > params.proxyFps.value) {
    issues.push("geminiVideoFps > proxyFps: Gemini no puede muestrear más fps de los que tiene el proxy");
  }
  if (params.possessionLowConfidence.value > params.possessionConfidence.value) {
    issues.push("possessionLowConfidence > possessionConfidence");
  }
  if (params.validationTimeToleranceSec.value < 0) issues.push("validationTimeToleranceSec < 0");
  return issues;
}

const matchVideoFile = matchVideoFileSchema.parse(rawMatchVideo);
{
  const issues = checkMatchVideoParams(matchVideoFile.params);
  if (issues.length > 0) throw new Error(`config/matchVideo.json incoherente: ${issues.join("; ")}`);
}
const aiPricingFile = aiPricingFileSchema.parse(rawAiPricing);

type Params = (typeof matchVideoFile)["params"];
export type MatchVideoConfig = { [K in keyof Params]: Params[K]["value"] };

/** Valores planos (sin `_source`) para el código. La procedencia sigue en el JSON. */
export const MATCH_VIDEO_CONFIG: Readonly<MatchVideoConfig> = Object.freeze(
  Object.fromEntries(
    Object.entries(matchVideoFile.params).map(([k, v]) => [k, (v as { value: unknown }).value]),
  ) as MatchVideoConfig,
);

/**
 * Confianzas de la agregación: SIEMPRE de config ("pendiente de validar"), nunca del
 * autoinforme del modelo (contrato de .claude/rules/metricas.md).
 */
export const AGGREGATE_CONFIDENCE: Readonly<AggregateConfidence> = Object.freeze({
  llm: MATCH_VIDEO_CONFIG.llmConfidence,
  partialFactor: MATCH_VIDEO_CONFIG.llmConfidencePartialFactor,
  possession: MATCH_VIDEO_CONFIG.possessionConfidence,
  possessionLow: MATCH_VIDEO_CONFIG.possessionLowConfidence,
});

/** `_source` de cada parámetro (para trazabilidad en tests/diagnóstico). */
export function matchVideoConfigSource(key: keyof MatchVideoConfig): string {
  return matchVideoFile.params[key]._source;
}

export type GeminiPrice = z.infer<typeof geminiPriceSchema>;
export type AnthropicPrice = z.infer<typeof anthropicPriceSchema>;

export const AI_PRICING = Object.freeze({
  fetchedAt: aiPricingFile.fetched_at,
  gemini: aiPricingFile.gemini as Readonly<Record<string, GeminiPrice>>,
  anthropic: aiPricingFile.anthropic as Readonly<Record<string, AnthropicPrice>>,
});

/** pricing_ref del contrato (usdAmountSchema). */
export const PRICING_REF = `config/aiPricing.json@${aiPricingFile.fetched_at}`;
