/**
 * VITAS · Match job — costes (estimación para la reserva + gasto REAL desde tokens)
 *
 * Dinero OPERATIVO (facturación), no métrica de producto: nunca describe a un equipo
 * ni a un jugador y no va a config/metrics.json (contrato, usdAmountSchema).
 *   - estimateMatchCost: COTA ALTA desde el `length` real de Bunny (o el tope
 *     MAX_MATCH_DURATION_MIN si Bunny aún no lo sabe). Se reserva contra
 *     GLOBAL_MONTHLY_BUDGET_USD mientras el job no es terminal.
 *   - geminiUsageCostUsd / anthropicUsageCostUsd: gasto REAL = tokens de la respuesta ×
 *     precios de config/aiPricing.json. Un modelo sin precio en config se valora con el
 *     precio MÁS ALTO conocido del proveedor (sobre-contar = más seguro para el tope).
 */
import { MAX_MATCH_DURATION_SEC } from "../../../src/lib/shared/videoLimits";
import { MATCH_MAX_DISPATCH_ATTEMPTS, type MatchPurpose, type UsdAmount } from "../../../src/lib/shared/matchJob/contract";
import { MODELS, REASONING_FALLBACK_MODEL, REASONING_THINKING_HEADROOM } from "../models";
import { AI_PRICING, MATCH_VIDEO_CONFIG as CFG, PRICING_REF, type AnthropicPrice, type GeminiPrice } from "./config";
import { planSegments } from "./plan";

const PER_MTOK = 1_000_000;
const USD_DECIMALS = 10_000;

/** Redondeo HACIA ARRIBA a 1/10000 de dólar (cota alta de reserva). */
function ceilUsd(x: number): number {
  return Math.ceil(x * USD_DECIMALS) / USD_DECIMALS;
}
function roundUsd(x: number): number {
  return Math.round(x * USD_DECIMALS) / USD_DECIMALS;
}

function maxBy<T>(values: readonly T[], score: (v: T) => number): T {
  return values.reduce((best, v) => (score(v) > score(best) ? v : best));
}

export function geminiPrice(model: string): { price: GeminiPrice; fallback: boolean } {
  const known = AI_PRICING.gemini[model];
  if (known) return { price: known, fallback: false };
  return {
    price: maxBy(Object.values(AI_PRICING.gemini), (p) => p.output_usd_per_mtok + p.input_text_image_video_usd_per_mtok),
    fallback: true,
  };
}

export function anthropicPrice(model: string): { price: AnthropicPrice; fallback: boolean } {
  const known = AI_PRICING.anthropic[model];
  if (known) return { price: known, fallback: false };
  return { price: maxBy(Object.values(AI_PRICING.anthropic), (p) => p.output_usd_per_mtok + p.input_usd_per_mtok), fallback: true };
}

export interface MatchCostEstimate {
  amount: UsdAmount;
  breakdown: { gemini: number; claude: number; modal: number };
  segments: number;
  durationSecUsed: number;
}

/**
 * Frames × tokens/frame que Gemini factura por segundo de vídeo: los fps PEDIDOS en
 * videoMetadata (nunca más que los del proxy) × el coste por frame de la resolución de
 * config (LOW = 66, resto = 258; docs de Gemini, ver config/matchVideo.json).
 */
export function videoTokensPerSecond(cfg: Pick<typeof CFG, "geminiVideoFps" | "proxyFps" | "mediaResolution" | "tokensPerFrameLow" | "tokensPerFrameDefault"> = CFG): number {
  const fps = Math.min(cfg.geminiVideoFps, cfg.proxyFps);
  const perFrame = cfg.mediaResolution === "MEDIA_RESOLUTION_LOW" ? cfg.tokensPerFrameLow : cfg.tokensPerFrameDefault;
  return fps * perFrame;
}

/** Cota alta del coste de UN tramo de `segmentSec` segundos (pre-check de presupuesto). */
export function segmentUpperBoundUsd(segmentSec: number, geminiModel: string): number {
  const { price } = geminiPrice(geminiModel);
  const inputTokens = segmentSec * videoTokensPerSecond() + CFG.segmentPromptTokensEstimate;
  return ceilUsd(
    (inputTokens * price.input_text_image_video_usd_per_mtok) / PER_MTOK + (CFG.maxOutputTokens * price.output_usd_per_mtok) / PER_MTOK,
  );
}

/** Cota alta del informe Claude (el precio mayor entre el modelo reasoning y su fallback). */
export function reportUpperBoundUsd(): number {
  const prices = [anthropicPrice(MODELS.reasoning).price, anthropicPrice(REASONING_FALLBACK_MODEL).price];
  const p = maxBy(prices, (x) => x.output_usd_per_mtok + x.input_usd_per_mtok);
  const outTokens = CFG.reportReplyTokens + REASONING_THINKING_HEADROOM;
  return ceilUsd((CFG.reportInputTokensEstimate * p.input_usd_per_mtok) / PER_MTOK + (outTokens * p.output_usd_per_mtok) / PER_MTOK);
}

export function estimateMatchCost(opts: { durationSec: number | null; purpose: MatchPurpose; geminiModel: string }): MatchCostEstimate {
  const known = opts.durationSec !== null && Number.isFinite(opts.durationSec) && opts.durationSec > 0;
  const duration = known ? (opts.durationSec as number) : MAX_MATCH_DURATION_SEC;
  const segs = planSegments(duration, CFG.segmentSec, CFG.minTrailingSegmentSec);
  const gemini = segs.reduce((acc, s) => acc + segmentUpperBoundUsd(s.end_sec - s.start_sec, opts.geminiModel), 0);
  // team_baseline no redacta informe en el job (lo hace /api/team/baseline-analysis, con su propio tripwire).
  const claude = opts.purpose === "match_ab" ? reportUpperBoundUsd() : 0;
  const modal = CFG.modalCpuMatchEstimateUsd;
  const usd = ceilUsd(gemini + claude + modal);
  return {
    amount: { usd, kind: "estimate", basis: known ? "bunny_length" : "max_duration_cap", pricing_ref: PRICING_REF },
    breakdown: { gemini: ceilUsd(gemini), claude, modal },
    segments: segs.length,
    durationSecUsed: duration,
  };
}

/** Coste Modal por despacho (estimación; Modal no devuelve factura por llamada). */
export function modalDispatchCostUsd(): number {
  return CFG.modalCpuMatchEstimateUsd;
}

/** Máximo de despachos cubiertos por el contrato (documentación del peor caso). */
export const MAX_MODAL_DISPATCH_COST_USD = CFG.modalCpuMatchEstimateUsd * MATCH_MAX_DISPATCH_ATTEMPTS;

// ── Gasto real ───────────────────────────────────────────────────────────────

export interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
  promptTokensDetails?: Array<{ modality?: string; tokenCount?: number }>;
}

export interface UsageCost {
  usd: number;
  pricedModel: string;
  pricingFallback: boolean;
}

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** Tokens × precio. Audio al precio de audio; resto del prompt (vídeo/texto) al de vídeo; salida incluye thinking. */
export function geminiUsageCostUsd(usage: GeminiUsage | null | undefined, model: string): UsageCost {
  const { price, fallback } = geminiPrice(model);
  const prompt = n(usage?.promptTokenCount);
  const audio = (usage?.promptTokensDetails ?? [])
    .filter((d) => String(d.modality ?? "").toUpperCase() === "AUDIO")
    .reduce((acc, d) => acc + n(d.tokenCount), 0);
  const rest = Math.max(0, prompt - audio);
  const output = n(usage?.candidatesTokenCount) + n(usage?.thoughtsTokenCount);
  const usd =
    (rest * price.input_text_image_video_usd_per_mtok) / PER_MTOK +
    (audio * price.input_audio_usd_per_mtok) / PER_MTOK +
    (output * price.output_usd_per_mtok) / PER_MTOK;
  return { usd: roundUsd(usd), pricedModel: fallback ? "fallback_max" : model, pricingFallback: fallback };
}

export interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/** Con el `model` REAL de la respuesta (fetchMessages puede caer a otro modelo). Thinking = output. */
export function anthropicUsageCostUsd(usage: AnthropicUsage | null | undefined, model: string): UsageCost {
  const { price, fallback } = anthropicPrice(model);
  const usd =
    (n(usage?.input_tokens) * price.input_usd_per_mtok) / PER_MTOK +
    (n(usage?.cache_creation_input_tokens) * price.cache_write_5m_usd_per_mtok) / PER_MTOK +
    (n(usage?.cache_read_input_tokens) * price.cache_read_usd_per_mtok) / PER_MTOK +
    (n(usage?.output_tokens) * price.output_usd_per_mtok) / PER_MTOK;
  return { usd: roundUsd(usd), pricedModel: fallback ? "fallback_max" : model, pricingFallback: fallback };
}

export function ledgerAmount(usd: number): UsdAmount {
  return { usd: roundUsd(Math.max(0, usd)), kind: "ledger", basis: "usage_tokens", pricing_ref: PRICING_REF };
}
