/**
 * POST /api/match/start — puertas en orden (docs/diseno-partido-completo.md §5.1):
 * contrato estricto + declaración (400), kill switch APAGADO por defecto (503 «en
 * validación»), variables ausentes (503 con NOMBRES, nunca valores), vídeo 404 / 403,
 * duración 422, dedup, concurrencia (429, contrato), presupuesto con reserva (429) e
 * insert con la declaración sellada por el SERVIDOR.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MATCH_ATTESTATION_VERSION } from "../../../src/lib/shared/matchJob/contract";

vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, limit: 10, resetAt: Date.now() + 60000 }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));
vi.mock("../../_lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ userId: "11111111-1111-4111-8111-111111111111", email: "coach@club.test", tenantId: "22222222-2222-4222-8222-222222222222", error: null }),
}));

const ownsVideo = vi.fn();
vi.mock("../../_lib/ownership", async (orig) => ({ ...(await orig<typeof import("../../_lib/ownership")>()), ownsVideo: (...a: unknown[]) => ownsVideo(...a) }));

const wouldExceedBudget = vi.fn();
vi.mock("../../_lib/budgetGuard", async (orig) => ({
  ...(await orig<typeof import("../../_lib/budgetGuard")>()),
  wouldExceedBudget: (...a: unknown[]) => wouldExceedBudget(...a),
}));

const repo = {
  getVideoRow: vi.fn(),
  findActiveDedup: vi.fn(),
  countActiveJobs: vi.fn(),
  insertJob: vi.fn(),
  getJob: vi.fn(),
};
vi.mock("../../_lib/matchJob/repo", () => ({
  getVideoRow: (...a: unknown[]) => repo.getVideoRow(...a),
  findActiveDedup: (...a: unknown[]) => repo.findActiveDedup(...a),
  countActiveJobs: (...a: unknown[]) => repo.countActiveJobs(...a),
  insertJob: (...a: unknown[]) => repo.insertJob(...a),
  getJob: (...a: unknown[]) => repo.getJob(...a),
}));

const driver = { readBunnyVideo: vi.fn(), processAwaitingJob: vi.fn() };
vi.mock("../../_lib/matchJob/driver", () => ({
  readBunnyVideo: (...a: unknown[]) => driver.readBunnyVideo(...a),
  processAwaitingJob: (...a: unknown[]) => driver.processAwaitingJob(...a),
}));

const ENV: Record<string, string> = {
  GEMINI_API_KEY: "gemini-secret-value",
  BUNNY_STREAM_API_KEY: "bunny-secret-value",
  BUNNY_STREAM_LIBRARY_ID: "42",
  BUNNY_CDN_HOSTNAME: "vz-test.b-cdn.net",
  MODAL_MATCH_START_URL: "https://vitas--match-start.modal.run",
  MODAL_API_KEY: "modal-secret-value",
  MODAL_CALLBACK_SECRET: "callback-secret-value",
  SUPABASE_URL: "https://sb.test",
  SUPABASE_SERVICE_ROLE_KEY: "svc-secret-value",
};

const USER = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "8f6d2c1e-3b4a-4c5d-9e8f-0a1b2c3d4e5f";
const VIDEO = { id: "0d2f4c1a-1b2c-4d3e-8f9a-0b1c2d3e4f5a", user_id: USER, tenant_id: null, org_id: null, player_id: null, bunny_video_id: "0d2f4c1a-1b2c-4d3e-8f9a-0b1c2d3e4f5a" };

function body(over: Record<string, unknown> = {}) {
  return {
    videoId: VIDEO.id,
    purpose: "match_ab",
    home: { name: "Local FC", kit: { shirt: { hex: "#ffffff", label: "blanco" } } },
    away: { name: "Visitante CF", kit: { shirt: { hex: "#7b1e2b", label: "granate" } } },
    locale: "es",
    attestation: { accepted: true, version: MATCH_ATTESTATION_VERSION },
    ...over,
  };
}

function post(b: unknown) {
  return new Request("https://x.test/api/match/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer user-jwt" },
    body: JSON.stringify(b),
  });
}

function jobRow(over: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    status: "awaiting_encode",
    estimate: { usd: 0.5, kind: "estimate", basis: "bunny_length", pricing_ref: "config/aiPricing.json@2026-09-28" },
    ...over,
  };
}

let handler: (req: Request) => Promise<Response>;
let plan: Array<{ plan: string; status: string }>;

beforeAll(async () => {
  handler = (await import("../[action]")).default;
});

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
  process.env.MATCH_VIDEO_ENABLED = "true";
  plan = [{ plan: "pro", status: "active" }];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/rest/v1/subscriptions")) return new Response(JSON.stringify(plan));
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
  ownsVideo.mockReset().mockResolvedValue(true);
  wouldExceedBudget.mockReset().mockResolvedValue({ exceeded: false, spentUsd: 1, reservedUsd: 0, extraUsd: 0.5, budgetUsd: 20 });
  repo.getVideoRow.mockReset().mockResolvedValue(VIDEO);
  repo.findActiveDedup.mockReset().mockResolvedValue(null);
  repo.countActiveJobs.mockReset().mockResolvedValue(0);
  repo.insertJob.mockReset().mockImplementation(async (row: Record<string, unknown>) => ({ ok: true, job: jobRow({ estimate: row.estimate }) }));
  repo.getJob.mockReset().mockResolvedValue(jobRow({ status: "dispatched" }));
  driver.readBunnyVideo.mockReset().mockResolvedValue({ guid: VIDEO.id, status: 3, length: 0, width: 0, height: 0, availableResolutions: [], encodeProgress: 40 });
  driver.processAwaitingJob.mockReset().mockResolvedValue("dispatched");
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of [...Object.keys(ENV), "MATCH_VIDEO_ENABLED"]) delete process.env[k];
});

async function call(b: unknown) {
  const res = await handler(post(b));
  return { status: res.status, json: (await res.json()) as { ok: boolean; data?: Record<string, unknown>; errorDetail?: Record<string, unknown> } };
}

describe("POST /api/match/start · kill switch (OFF by default)", () => {
  it("unset flag → 503 match_video_disabled with the 'en validación' reason, nothing loaded or written", async () => {
    delete process.env.MATCH_VIDEO_ENABLED;
    const r = await call(body());
    expect(r.status).toBe(503);
    expect(r.json.errorDetail?.code).toBe("match_video_disabled");
    expect(String(r.json.errorDetail?.gate_reason)).toMatch(/en validación/);
    expect(repo.getVideoRow).not.toHaveBeenCalled();
    expect(repo.insertJob).not.toHaveBeenCalled();
  });
  it("only the exact string 'true' enables it", async () => {
    for (const v of ["1", "TRUE", "yes", "True", ""]) {
      process.env.MATCH_VIDEO_ENABLED = v;
      expect((await call(body())).json.errorDetail?.code, v).toBe("match_video_disabled");
    }
  });
  it("missing server configuration → 503 real_inference_disabled listing NAMES only (never values)", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.MODAL_MATCH_START_URL;
    const r = await call(body());
    expect(r.status).toBe(503);
    expect(r.json.errorDetail?.code).toBe("real_inference_disabled");
    expect(r.json.errorDetail?.missing).toEqual(["GEMINI_API_KEY", "MODAL_MATCH_START_URL"]);
    const raw = JSON.stringify(r.json);
    for (const v of Object.values(ENV)) if (v.includes("secret")) expect(raw).not.toContain(v);
    expect(repo.insertJob).not.toHaveBeenCalled();
  });
  it("ANTHROPIC_API_KEY does not block (the report abstains instead)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect((await call(body())).status).toBe(200);
  });
});

describe("POST /api/match/start · input and attestation", () => {
  it("missing / false / outdated attestation → 400 attestation_required", async () => {
    for (const attestation of [undefined, { accepted: false, version: MATCH_ATTESTATION_VERSION }, { accepted: true, version: "2020-01-01.v0" }]) {
      const r = await call(body({ attestation }));
      expect(r.status).toBe(400);
      expect(r.json.errorDetail?.code).toBe("attestation_required");
      expect(r.json.errorDetail?.attestationVersion).toBe(MATCH_ATTESTATION_VERSION);
    }
    expect(repo.insertJob).not.toHaveBeenCalled();
  });
  it("per-player keys (playerContext) or a missing rival kit → 400 invalid_input", async () => {
    expect((await call(body({ playerContext: { age: 13 } }))).json.errorDetail?.code).toBe("invalid_input");
    expect((await call(body({ away: { name: "X" } }))).json.errorDetail?.code).toBe("invalid_input");
  });
  it("requires an active pro/club plan (fail-closed)", async () => {
    plan = [];
    const r = await call(body());
    expect(r.status).toBe(403);
    expect(r.json.errorDetail?.code).toBe("PLAN_REQUIRED");
  });
});

describe("POST /api/match/start · ownership, duration, concurrency, budget", () => {
  it("unknown video → 404; someone else's video → 403 not_owner", async () => {
    repo.getVideoRow.mockResolvedValueOnce(null);
    expect((await call(body())).status).toBe(404);
    ownsVideo.mockResolvedValueOnce(false);
    const r = await call(body());
    expect(r.status).toBe(403);
    expect(r.json.errorDetail?.code).toBe("not_owner");
    expect(repo.insertJob).not.toHaveBeenCalled();
  });
  it("Bunny length above the match cap → 422 video_too_long", async () => {
    driver.readBunnyVideo.mockResolvedValueOnce({ guid: VIDEO.id, status: 4, length: 4 * 3600, width: 1, height: 1, availableResolutions: ["360p"], encodeProgress: 100 });
    const r = await call(body());
    expect(r.status).toBe(422);
    expect(r.json.errorDetail?.code).toBe("video_too_long");
  });
  it("an active job of this user → 429 concurrency_limit (contract), scope user; global cap → scope global", async () => {
    repo.countActiveJobs.mockResolvedValueOnce(1);
    const a = await call(body());
    expect(a.status).toBe(429);
    expect(a.json.errorDetail).toMatchObject({ code: "concurrency_limit", scope: "user" });
    repo.countActiveJobs.mockResolvedValueOnce(0).mockResolvedValueOnce(99);
    const b = await call(body());
    expect(b.status).toBe(429);
    expect(b.json.errorDetail).toMatchObject({ code: "concurrency_limit", scope: "global" });
    expect(repo.insertJob).not.toHaveBeenCalled();
  });
  it("the DB unique index losing a race (409) is also a 429 concurrency_limit", async () => {
    repo.insertJob.mockResolvedValueOnce({ ok: false, conflict: true, status: 409 });
    expect((await call(body())).json.errorDetail?.code).toBe("concurrency_limit");
  });
  it("budget: spent + active reservations + this estimate ≥ budget → 429 budget_exceeded with the estimate", async () => {
    wouldExceedBudget.mockResolvedValueOnce({ exceeded: true, spentUsd: 19.9, reservedUsd: 0.4, extraUsd: 0.6, budgetUsd: 20 });
    const r = await call(body());
    expect(r.status).toBe(429);
    expect(r.json.errorDetail?.code).toBe("budget_exceeded");
    expect(r.json.errorDetail?.estimate).toMatchObject({ kind: "estimate", basis: "max_duration_cap" });
    expect(repo.insertJob).not.toHaveBeenCalled();
  });
  it("dedup: an active job for the same video + purpose + kits is returned instead of a new one", async () => {
    repo.findActiveDedup.mockResolvedValueOnce(jobRow({ status: "observing" }));
    const r = await call(body());
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ jobId: JOB_ID, status: "observing", deduplicated: true });
    expect(repo.insertJob).not.toHaveBeenCalled();
  });
});

describe("POST /api/match/start · insert", () => {
  it("stores the attestation from the VERIFIED user and server clock, reserves the estimate, waits for the encode", async () => {
    const before = Date.now();
    const r = await call(body({ attestedBy: "someone-else" }));
    // attestedBy no es parte del contrato estricto → 400: el cliente no puede fijar quién declara.
    expect(r.status).toBe(400);

    const ok = await call(body({ notes: "Ojo con las transiciones", category: "youth" }));
    expect(ok.status).toBe(200);
    expect(ok.json.data).toMatchObject({ jobId: JOB_ID, status: "awaiting_encode", deduplicated: false });
    const row = repo.insertJob.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({
      user_id: USER,
      attested_by: USER,
      attestation_version: MATCH_ATTESTATION_VERSION,
      status: "awaiting_encode",
      video_id: VIDEO.id,
      bunny_video_id: VIDEO.bunny_video_id,
      category: "youth",
      locale: "es",
      duration_sec: null, // Bunny aún no sabe la duración: nunca videos.duration
    });
    expect(Date.parse(String(row.attested_at))).toBeGreaterThanOrEqual(before - 1000);
    expect(row.reservation_usd).toBe((row.estimate as { usd: number }).usd);
    expect((row.estimate as { basis: string }).basis).toBe("max_duration_cap");
    expect(driver.processAwaitingJob).not.toHaveBeenCalled();
  });
  it("category is never defaulted; an already-encoded video is dispatched at once", async () => {
    driver.readBunnyVideo.mockResolvedValueOnce({ guid: VIDEO.id, status: 4, length: 5400, width: 1, height: 1, availableResolutions: ["360p", "720p"], encodeProgress: 100 });
    const r = await call(body());
    expect(r.status).toBe(200);
    const row = repo.insertJob.mock.calls[0][0] as Record<string, unknown>;
    expect(row.category).toBeNull();
    expect(row.duration_sec).toBe(5400);
    expect((row.estimate as { basis: string }).basis).toBe("bunny_length");
    expect(driver.processAwaitingJob).toHaveBeenCalledTimes(1);
    expect(r.json.data?.status).toBe("dispatched");
  });
});
