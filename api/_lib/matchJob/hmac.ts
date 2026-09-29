/**
 * VITAS · Match job — firma HMAC del protocolo step (worker Modal → Vercel)
 *
 *   X-Vitas-Signature = hex(HMAC_SHA256(MODAL_CALLBACK_SECRET, ts + "." + rawBody))
 *   X-Vitas-Timestamp = ts (segundos unix, 10 dígitos); |now − ts| ≤ 300 s.
 *
 * Se firma el cuerpo CRUDO tal cual llegó (bytes UTF-8), nunca una re-serialización.
 * Fail-closed: cabeceras ausentes/mal formadas, ventana superada o firma distinta → no.
 * Comparación en tiempo constante (edgeCrypto.timingSafeEqual). Web Crypto → Edge y Node.
 */
import { hmacSha256Hex, timingSafeEqual } from "../edgeCrypto";
import {
  STEP_SIGNATURE_RE,
  STEP_SIGNATURE_WINDOW_SEC,
  STEP_TIMESTAMP_RE,
  stepSignatureBase,
} from "../../../src/lib/shared/matchJob/contract";

export type StepSignatureCheck =
  | { ok: true }
  | { ok: false; reason: "missing_secret" | "missing_headers" | "bad_timestamp" | "stale_timestamp" | "bad_signature" };

export async function signStepBody(secret: string, ts: string, rawBody: string): Promise<string> {
  return hmacSha256Hex(secret, stepSignatureBase(ts, rawBody));
}

export async function verifyStepSignature(opts: {
  secret: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: string;
  nowSec?: number;
}): Promise<StepSignatureCheck> {
  if (!opts.secret) return { ok: false, reason: "missing_secret" };
  const ts = (opts.timestamp ?? "").trim();
  const sig = (opts.signature ?? "").trim().toLowerCase();
  if (!ts || !sig) return { ok: false, reason: "missing_headers" };
  if (!STEP_TIMESTAMP_RE.test(ts)) return { ok: false, reason: "bad_timestamp" };
  if (!STEP_SIGNATURE_RE.test(sig)) return { ok: false, reason: "bad_signature" };
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(ts)) > STEP_SIGNATURE_WINDOW_SEC) return { ok: false, reason: "stale_timestamp" };
  const expected = await signStepBody(opts.secret, ts, opts.rawBody);
  return timingSafeEqual(sig, expected) ? { ok: true } : { ok: false, reason: "bad_signature" };
}
