/**
 * Match job step protocol · HMAC test vectors, checked with node:crypto (the
 * implementation that computed them) and with the Vercel-side Web Crypto helper
 * the /api/match/step handler will use. Runs in the api vitest config (node env).
 *
 * Scheme (src/lib/shared/matchJob/contract.ts):
 *   X-Vitas-Signature = hex(HMAC_SHA256(MODAL_CALLBACK_SECRET, ts + "." + rawBody))
 *   X-Vitas-Timestamp = ts (unix seconds), accepted when |now − ts| ≤ 300 s.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hmacSha256Hex, timingSafeEqual } from "../edgeCrypto";
import {
  STEP_HMAC_TEST_VECTORS,
  STEP_SIGNATURE_WINDOW_SEC,
  stepSignatureBase,
} from "../../../src/lib/shared/matchJob/contract";

const { secret, vectors } = STEP_HMAC_TEST_VECTORS;

describe("match step HMAC · node:crypto test vectors", () => {
  it.each(vectors)("ts=$ts: node:crypto reproduces the published signature", (v) => {
    expect(Buffer.byteLength(v.body, "utf8")).toBe(v.bodyBytes);
    const sig = createHmac("sha256", secret).update(stepSignatureBase(v.ts, v.body), "utf8").digest("hex");
    expect(sig).toBe(v.signature);
  });

  it.each(vectors)("ts=$ts: Web Crypto (edgeCrypto) agrees with node:crypto", async (v) => {
    const base = stepSignatureBase(v.ts, v.body);
    const nodeSig = createHmac("sha256", secret).update(base, "utf8").digest("hex");
    const webSig = await hmacSha256Hex(secret, base);
    expect(timingSafeEqual(webSig, nodeSig)).toBe(true);
  });

  it("signs raw UTF-8 bytes: a latin-1 re-encoding of vector 2 does not verify", () => {
    const v = vectors[1];
    const latin1 = createHmac("sha256", secret)
      .update(Buffer.concat([Buffer.from(`${v.ts}.`, "ascii"), Buffer.from(v.body, "latin1")]))
      .digest("hex");
    expect(latin1).not.toBe(v.signature);
  });

  it("a body-only HMAC (modal-tracking scheme) never verifies as a step signature", () => {
    for (const v of vectors) {
      expect(createHmac("sha256", secret).update(v.body, "utf8").digest("hex")).not.toBe(v.signature);
    }
    expect(STEP_SIGNATURE_WINDOW_SEC).toBe(300);
  });
});
