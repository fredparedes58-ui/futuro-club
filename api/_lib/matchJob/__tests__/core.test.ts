/**
 * Núcleo puro del job de partido: máquina de estados, planificador, HMAC (vectores del
 * contrato), costes, despacho (Modal) y config.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MATCH_JOB_STATUSES,
  MATCH_JOB_TRANSITIONS,
  STEP_HMAC_TEST_VECTORS,
  type MatchJobStatus,
} from "../../../../src/lib/shared/matchJob/contract";
import { ACTIVE_MATCH_JOB_STATUSES, IllegalTransitionError, assertTransition, canTransition, isStaleEpoch, isTerminal, redispatchTarget } from "../stateMachine";
import { PlanError, planSegments } from "../plan";
import { signStepBody, verifyStepSignature } from "../hmac";
import {
  anthropicUsageCostUsd,
  estimateMatchCost,
  geminiUsageCostUsd,
  ledgerAmount,
  segmentUpperBoundUsd,
  videoTokensPerSecond,
} from "../costing";
import { AGGREGATE_CONFIDENCE, MATCH_VIDEO_CONFIG, checkMatchVideoParams, matchVideoConfigSource } from "../config";
import { spawnMatchWorker } from "../dispatch";
import { MAX_MATCH_DURATION_SEC } from "../../../../src/lib/shared/videoLimits";

describe("stateMachine", () => {
  it("allows exactly the contract table and throws on anything else", () => {
    for (const from of MATCH_JOB_STATUSES) {
      for (const to of MATCH_JOB_STATUSES) {
        const legal = MATCH_JOB_TRANSITIONS[from].includes(to);
        expect(canTransition(from, to)).toBe(legal);
        if (legal) expect(() => assertTransition(from, to)).not.toThrow();
        else expect(() => assertTransition(from, to)).toThrow(IllegalTransitionError);
      }
    }
  });
  it("terminal states have no exits and are not active", () => {
    for (const s of ["completed", "failed", "cancelled"] as MatchJobStatus[]) {
      expect(isTerminal(s)).toBe(true);
      expect(ACTIVE_MATCH_JOB_STATUSES).not.toContain(s);
    }
    expect(ACTIVE_MATCH_JOB_STATUSES).toContain("awaiting_encode");
  });
  it("redispatch: transcode restarts; file-backed states only restart when the file is lost", () => {
    expect(redispatchTarget("preparing", true)).toBe("dispatched");
    expect(redispatchTarget("uploading", true)).toBe("dispatched");
    expect(redispatchTarget("observing", true)).toBe("observing");
    expect(redispatchTarget("observing", false)).toBe("dispatched");
    expect(redispatchTarget("gemini_processing", false)).toBe("dispatched");
    expect(redispatchTarget("reporting", false)).toBe("reporting");
    expect(redispatchTarget("awaiting_encode", true)).toBeNull();
    expect(redispatchTarget("completed", true)).toBeNull();
  });
  it("epoch fencing: any epoch other than the current one is stale", () => {
    expect(isStaleEpoch(1, 1)).toBe(false);
    expect(isStaleEpoch(1, 2)).toBe(true);
    expect(isStaleEpoch(3, 2)).toBe(true);
  });
});

describe("planSegments", () => {
  it("cuts 900 s segments with a partial last one", () => {
    expect(planSegments(2000, 900, 60)).toEqual([
      { idx: 0, start_sec: 0, end_sec: 900 },
      { idx: 1, start_sec: 900, end_sec: 1800 },
      { idx: 2, start_sec: 1800, end_sec: 2000 },
    ]);
  });
  it("merges a trailing stub shorter than minTrailing into the previous segment", () => {
    expect(planSegments(1830, 900, 60)).toEqual([
      { idx: 0, start_sec: 0, end_sec: 900 },
      { idx: 1, start_sec: 900, end_sec: 1830 },
    ]);
  });
  it("exact multiple and short videos", () => {
    expect(planSegments(1800, 900, 60)).toHaveLength(2);
    expect(planSegments(30, 900, 60)).toEqual([{ idx: 0, start_sec: 0, end_sec: 30 }]);
  });
  it("blocks on unknown duration instead of inventing one", () => {
    expect(() => planSegments(0, 900)).toThrow(PlanError);
    expect(() => planSegments(Number.NaN, 900)).toThrow(PlanError);
    expect(() => planSegments(100, 0)).toThrow(PlanError);
  });
});

describe("step HMAC (contract vectors)", () => {
  const { secret, vectors } = STEP_HMAC_TEST_VECTORS;
  it("reproduces the published signatures", async () => {
    for (const v of vectors) expect(await signStepBody(secret, v.ts, v.body)).toBe(v.signature);
  });
  it("verifies inside the window and fails closed otherwise", async () => {
    const v = vectors[0];
    const now = Number(v.ts) + 10;
    expect(await verifyStepSignature({ secret, timestamp: v.ts, signature: v.signature, rawBody: v.body, nowSec: now })).toEqual({ ok: true });
    expect(await verifyStepSignature({ secret: undefined, timestamp: v.ts, signature: v.signature, rawBody: v.body, nowSec: now })).toEqual({ ok: false, reason: "missing_secret" });
    expect(await verifyStepSignature({ secret, timestamp: undefined, signature: v.signature, rawBody: v.body, nowSec: now })).toEqual({ ok: false, reason: "missing_headers" });
    expect(await verifyStepSignature({ secret, timestamp: v.ts, signature: v.signature, rawBody: v.body, nowSec: now + 301 })).toEqual({ ok: false, reason: "stale_timestamp" });
    expect(await verifyStepSignature({ secret, timestamp: v.ts, signature: v.signature, rawBody: `${v.body} `, nowSec: now })).toEqual({ ok: false, reason: "bad_signature" });
    expect(await verifyStepSignature({ secret, timestamp: "17900", signature: v.signature, rawBody: v.body, nowSec: now })).toEqual({ ok: false, reason: "bad_timestamp" });
    expect(await verifyStepSignature({ secret: "other", timestamp: v.ts, signature: v.signature, rawBody: v.body, nowSec: now })).toEqual({ ok: false, reason: "bad_signature" });
  });
  it("UTF-8 vector (non-ASCII reason) verifies", async () => {
    const v = vectors[1];
    expect(await verifyStepSignature({ secret, timestamp: v.ts, signature: v.signature, rawBody: v.body, nowSec: Number(v.ts) })).toEqual({ ok: true });
  });
});

describe("costing", () => {
  it("video tokens follow the configured Gemini fps and resolution (never hard-coded 1 fps)", () => {
    expect(videoTokensPerSecond()).toBe(MATCH_VIDEO_CONFIG.geminiVideoFps * MATCH_VIDEO_CONFIG.tokensPerFrameLow);
    const base = { geminiVideoFps: 2, proxyFps: 2, mediaResolution: "MEDIA_RESOLUTION_LOW" as const, tokensPerFrameLow: 66, tokensPerFrameDefault: 258 };
    expect(videoTokensPerSecond(base)).toBe(132);
    expect(videoTokensPerSecond({ ...base, mediaResolution: "MEDIA_RESOLUTION_MEDIUM" as const })).toBe(516);
    // Gemini nunca muestrea más fps de los que tiene el proxy.
    expect(videoTokensPerSecond({ ...base, geminiVideoFps: 4 })).toBe(132);
  });
  it("estimates from the real Bunny length, or the duration cap when unknown", () => {
    const known = estimateMatchCost({ durationSec: 5400, purpose: "match_ab", geminiModel: "gemini-2.5-flash" });
    expect(known.amount.basis).toBe("bunny_length");
    expect(known.amount.kind).toBe("estimate");
    expect(known.segments).toBe(6);
    expect(known.breakdown.claude).toBeGreaterThan(0);
    const unknown = estimateMatchCost({ durationSec: null, purpose: "match_ab", geminiModel: "gemini-2.5-flash" });
    expect(unknown.amount.basis).toBe("max_duration_cap");
    expect(unknown.durationSecUsed).toBe(MAX_MATCH_DURATION_SEC);
    expect(unknown.amount.usd).toBeGreaterThanOrEqual(known.amount.usd);
    const baseline = estimateMatchCost({ durationSec: 5400, purpose: "team_baseline", geminiModel: "gemini-2.5-flash" });
    expect(baseline.breakdown.claude).toBe(0);
    // Orden de magnitud del diseño (§15: ≈ $0,35–0,65 por partido).
    expect(known.amount.usd).toBeGreaterThan(0.2);
    expect(known.amount.usd).toBeLessThan(2);
  });
  it("segment upper bound grows with segment length", () => {
    expect(segmentUpperBoundUsd(900, "gemini-2.5-flash")).toBeGreaterThan(segmentUpperBoundUsd(300, "gemini-2.5-flash"));
  });
  it("real Gemini spend = tokens × published price; thinking billed as output; audio at audio price", () => {
    const c = geminiUsageCostUsd(
      { promptTokenCount: 1_000_000, candidatesTokenCount: 100_000, thoughtsTokenCount: 100_000, promptTokensDetails: [{ modality: "AUDIO", tokenCount: 200_000 }] },
      "gemini-2.5-flash",
    );
    // 800k × 0.30 + 200k × 1.00 + 200k × 2.50 per MTok
    expect(c.usd).toBeCloseTo(0.24 + 0.2 + 0.5, 4);
    expect(c.pricingFallback).toBe(false);
    expect(geminiUsageCostUsd(null, "gemini-2.5-flash").usd).toBe(0);
  });
  it("Claude spend uses the model that actually answered (fallback to Opus 4.8 is priced as 4.8)", () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 100_000 };
    expect(anthropicUsageCostUsd(usage, "claude-opus-5-5").usd).toBeCloseTo(4 + 2, 4);
    expect(anthropicUsageCostUsd(usage, "claude-opus-4-8").usd).toBeCloseTo(5 + 2.5, 4);
    const unknown = anthropicUsageCostUsd(usage, "claude-unknown-model");
    expect(unknown.pricingFallback).toBe(true);
    expect(unknown.usd).toBeGreaterThanOrEqual(7.5); // el precio más alto conocido: sobre-contar es lo seguro
  });
  it("ledger amounts are never negative", () => {
    expect(ledgerAmount(-1).usd).toBe(0);
    expect(ledgerAmount(0.12345).kind).toBe("ledger");
  });
});

describe("config/matchVideo.json", () => {
  it("fps sent to Gemini is a config value marked 'pendiente de validar'", () => {
    expect(MATCH_VIDEO_CONFIG.geminiVideoFps).toBe(1);
    expect(matchVideoConfigSource("geminiVideoFps")).toMatch(/pendiente de validar/);
    for (const k of ["possessionLowConfidence", "validationTimeToleranceSec", "validationMinPrecision", "validationMinRecall"] as const) {
      expect(matchVideoConfigSource(k)).toMatch(/pendiente de validar/);
    }
  });
  it("aggregate confidences come from config and low ≤ normal", () => {
    expect(AGGREGATE_CONFIDENCE.possessionLow).toBeLessThanOrEqual(AGGREGATE_CONFIDENCE.possession);
    expect(AGGREGATE_CONFIDENCE.llm).toBe(MATCH_VIDEO_CONFIG.llmConfidence);
  });
  it("rejects incoherent parameters (Gemini fps above the proxy fps)", () => {
    const p = (value: number) => ({ value, _source: "x" });
    const params = {
      geminiVideoFps: p(2),
      proxyFps: p(1),
      possessionLowConfidence: p(0.05),
      possessionConfidence: p(0.2),
      validationTimeToleranceSec: p(5),
    } as unknown as Parameters<typeof checkMatchVideoParams>[0];
    expect(checkMatchVideoParams(params)).toHaveLength(1);
  });
});

describe("dispatch to Modal (parse the reply; no call_id = failure)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MODAL_MATCH_START_URL;
    delete process.env.MODAL_API_KEY;
  });
  const setup = (reply: unknown, status = 200) => {
    process.env.MODAL_MATCH_START_URL = "https://vitas--match-start.modal.run";
    process.env.MODAL_API_KEY = "modal-key";
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(typeof reply === "string" ? reply : JSON.stringify(reply), { status }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };
  it("spawned + call_id = success, bearer sent, body only {jobId, epoch}", async () => {
    const f = setup({ status: "spawned", call_id: "fc-123" });
    const r = await spawnMatchWorker({ jobId: "8f6d2c1e-3b4a-4c5d-9e8f-0a1b2c3d4e5f", epoch: 2 });
    expect(r).toEqual({ ok: true, callId: "fc-123" });
    const init = f.mock.calls[0][1] ?? {};
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer modal-key");
    expect(JSON.parse(init.body as string)).toEqual({ jobId: "8f6d2c1e-3b4a-4c5d-9e8f-0a1b2c3d4e5f", epoch: 2 });
  });
  it("status error, 2xx without call_id, HTML and HTTP errors are failures", async () => {
    setup({ status: "error", reason: "boom" });
    expect((await spawnMatchWorker({ jobId: "j", epoch: 1 })).ok).toBe(false);
    setup({ status: "spawned" });
    expect(await spawnMatchWorker({ jobId: "j", epoch: 1 })).toEqual({ ok: false, reason: "reply_without_call_id" });
    setup("<html>ok</html>");
    expect(await spawnMatchWorker({ jobId: "j", epoch: 1 })).toEqual({ ok: false, reason: "reply_not_json" });
    setup({}, 500);
    expect(await spawnMatchWorker({ jobId: "j", epoch: 1 })).toEqual({ ok: false, reason: "http_500" });
  });
  it("refuses a non-https endpoint and a missing configuration", async () => {
    setup({ status: "spawned", call_id: "x" });
    process.env.MODAL_MATCH_START_URL = "http://insecure.example";
    expect(await spawnMatchWorker({ jobId: "j", epoch: 1 })).toEqual({ ok: false, reason: "modal_url_not_https" });
    delete process.env.MODAL_API_KEY;
    expect(await spawnMatchWorker({ jobId: "j", epoch: 1 })).toEqual({ ok: false, reason: "modal_not_configured" });
  });
});
