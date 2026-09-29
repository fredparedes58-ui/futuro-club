/**
 * POST /api/match/step — protocolo del worker Modal. HMAC fail-closed (sin secreto 503,
 * firma/ventana/cuerpo inválidos 401), fencing por epoch ({superseded:true} y borrado del
 * fichero obsoleto), heartbeat fenced, kill switch (análisis apagado ⇒ ninguna op gasta)
 * y toda respuesta validada con STEP_REPLY_SCHEMAS del contrato.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { STEP_SIGNATURE_HEADER, STEP_TIMESTAMP_HEADER } from "../../../src/lib/shared/matchJob/contract";
import { signStepBody } from "../../_lib/matchJob/hmac";

vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 599, limit: 600, resetAt: Date.now() + 60000 }),
  getClientIP: vi.fn().mockReturnValue("10.0.0.1"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

const repo = { getJob: vi.fn(), patchJob: vi.fn() };
vi.mock("../../_lib/matchJob/repo", () => ({
  getJob: (...a: unknown[]) => repo.getJob(...a),
  patchJob: (...a: unknown[]) => repo.patchJob(...a),
}));
const steps = {
  stepBegin: vi.fn(),
  stepHeartbeat: vi.fn(),
  stepUploadSession: vi.fn(),
  stepProxyReady: vi.fn(),
  stepFail: vi.fn(),
  stepWhenDisabled: vi.fn(),
};
vi.mock("../../_lib/matchJob/steps", () => ({
  stepBegin: (...a: unknown[]) => steps.stepBegin(...a),
  stepHeartbeat: (...a: unknown[]) => steps.stepHeartbeat(...a),
  stepUploadSession: (...a: unknown[]) => steps.stepUploadSession(...a),
  stepProxyReady: (...a: unknown[]) => steps.stepProxyReady(...a),
  stepFail: (...a: unknown[]) => steps.stepFail(...a),
  stepWhenDisabled: (...a: unknown[]) => steps.stepWhenDisabled(...a),
}));
const advanceJob = vi.fn();
vi.mock("../../_lib/matchJob/advance", () => ({ advanceJob: (...a: unknown[]) => advanceJob(...a) }));
const runTick = vi.fn();
vi.mock("../../_lib/matchJob/driver", () => ({ runTick: (...a: unknown[]) => runTick(...a) }));
const deleteFile = vi.fn();
vi.mock("../../_lib/gemini/files", () => ({ deleteFile: (...a: unknown[]) => deleteFile(...a) }));

const SECRET = "callback-secret-for-tests";
const JOB_ID = "8f6d2c1e-3b4a-4c5d-9e8f-0a1b2c3d4e5f";
const SHA = "a".repeat(64);

let handler: (req: Request) => Promise<Response>;
beforeAll(async () => {
  handler = (await import("../[action]")).default;
});

beforeEach(() => {
  process.env.MODAL_CALLBACK_SECRET = SECRET;
  process.env.MATCH_VIDEO_ENABLED = "true";
  process.env.SUPABASE_URL = "https://sb.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
  process.env.GEMINI_API_KEY = "gk";
  repo.getJob.mockReset().mockResolvedValue({ id: JOB_ID, status: "observing", dispatch_epoch: 2, gemini_file_name: "files/current" });
  repo.patchJob.mockReset().mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
    id: JOB_ID,
    status: "observing",
    dispatch_epoch: 2,
    gemini_file_name: "files/current",
    ...patch,
  }));
  for (const f of Object.values(steps)) f.mockReset();
  advanceJob.mockReset().mockResolvedValue({ kind: "state", state: "observing", retryAfterSec: 0 });
  runTick.mockReset().mockResolvedValue({ dispatched: 1, redispatched: 0, failedJobs: 0, geminiFilesDeleted: 2, geminiDeleteErrors: 0, more: false });
  deleteFile.mockReset().mockResolvedValue(true);
});
afterEach(() => {
  for (const k of ["MODAL_CALLBACK_SECRET", "MATCH_VIDEO_ENABLED", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY"]) delete process.env[k];
});

async function signed(obj: unknown, opts: { ts?: string; secret?: string; tamper?: boolean } = {}) {
  const raw = JSON.stringify(obj);
  const ts = opts.ts ?? String(Math.floor(Date.now() / 1000));
  const sig = await signStepBody(opts.secret ?? SECRET, ts, raw);
  return new Request("https://x.test/api/match/step", {
    method: "POST",
    headers: { "Content-Type": "application/json", [STEP_SIGNATURE_HEADER]: sig, [STEP_TIMESTAMP_HEADER]: ts },
    body: opts.tamper ? `${raw} ` : raw,
  });
}
async function send(obj: unknown, opts?: Parameters<typeof signed>[1]) {
  const res = await handler(await signed(obj, opts));
  return { status: res.status, json: (await res.json()) as { ok: boolean; data?: Record<string, unknown>; errorDetail?: { code?: string } } };
}

describe("HMAC (fail-closed)", () => {
  it("without MODAL_CALLBACK_SECRET → 503, nothing read", async () => {
    delete process.env.MODAL_CALLBACK_SECRET;
    const r = await send({ op: "advance", jobId: JOB_ID, epoch: 2 }, { secret: "whatever" });
    expect(r.status).toBe(503);
    expect(repo.getJob).not.toHaveBeenCalled();
  });
  it("wrong secret, tampered body, stale or missing timestamp → 401", async () => {
    const op = { op: "advance", jobId: JOB_ID, epoch: 2 };
    expect((await send(op, { secret: "other" })).status).toBe(401);
    expect((await send(op, { tamper: true })).status).toBe(401);
    expect((await send(op, { ts: String(Math.floor(Date.now() / 1000) - 301) })).status).toBe(401);
    const res = await handler(new Request("https://x.test/api/match/step", { method: "POST", body: JSON.stringify(op) }));
    expect(res.status).toBe(401);
    expect(repo.getJob).not.toHaveBeenCalled();
    expect(advanceJob).not.toHaveBeenCalled();
  });
  it("a signed but malformed op → 400 (contract)", async () => {
    expect((await send({ op: "advance", jobId: "not-a-uuid", epoch: 2 })).status).toBe(400);
    expect((await send({ op: "explode", jobId: JOB_ID, epoch: 2 })).status).toBe(400);
  });
  it("GET is not allowed", async () => {
    expect((await handler(new Request("https://x.test/api/match/step", { method: "GET" }))).status).toBe(405);
  });
});

describe("epoch fencing", () => {
  it("an op from an old epoch gets {superseded:true} and changes nothing", async () => {
    const r = await send({ op: "advance", jobId: JOB_ID, epoch: 1 });
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({ superseded: true });
    expect(repo.patchJob).not.toHaveBeenCalled();
    expect(advanceJob).not.toHaveBeenCalled();
  });
  it("a stale proxy_ready deletes THAT uploaded file (not the job's current one)", async () => {
    const r = await send({
      op: "proxy_ready",
      jobId: JOB_ID,
      epoch: 1,
      file: { name: "files/stale", uri: "https://generativelanguage.googleapis.com/v1beta/files/stale" },
      bytes: 10,
      sha256: SHA,
      durationSec: 5400,
    });
    expect(r.json.data).toEqual({ superseded: true });
    expect(deleteFile).toHaveBeenCalledWith("files/stale");
  });
  it("if another dispatch wins between read and heartbeat (fenced PATCH affects 0 rows) → superseded", async () => {
    repo.patchJob.mockResolvedValueOnce(null);
    const r = await send({ op: "advance", jobId: JOB_ID, epoch: 2 });
    expect(r.json.data).toEqual({ superseded: true });
    expect(advanceJob).not.toHaveBeenCalled();
    expect(repo.patchJob.mock.calls[0][2]).toEqual({ epoch: 2 });
  });
  it("advance: the heartbeat is refreshed with the epoch guard and the reply follows the contract", async () => {
    const r = await send({ op: "advance", jobId: JOB_ID, epoch: 2 });
    expect(r.json.data).toEqual({ state: "observing", retryAfterSec: 0 });
    expect(Object.keys(repo.patchJob.mock.calls[0][1])).toEqual(["heartbeat_at"]);
    advanceJob.mockResolvedValueOnce({ kind: "superseded" });
    expect((await send({ op: "advance", jobId: JOB_ID, epoch: 2 })).json.data).toEqual({ superseded: true });
  });
  it("unknown job → 404", async () => {
    repo.getJob.mockResolvedValueOnce(null);
    expect((await send({ op: "advance", jobId: JOB_ID, epoch: 2 })).status).toBe(404);
  });
  it("a reply outside the contract is never sent (500 instead)", async () => {
    steps.stepBegin.mockResolvedValueOnce({ ok: true, data: { action: "transcode", epoch: 2, sourceUrl: "http://insecure" } });
    expect((await send({ op: "begin", jobId: JOB_ID, epoch: 2 })).status).toBe(500);
  });
});

describe("kill switch (MATCH_VIDEO_ENABLED !== 'true')", () => {
  it("per-job ops go to stepWhenDisabled (no Gemini/Claude), fail is still processed normally", async () => {
    delete process.env.MATCH_VIDEO_ENABLED;
    steps.stepWhenDisabled.mockResolvedValue({ ok: true, data: { action: "stop", epoch: 2, state: "failed" } });
    const r = await send({ op: "begin", jobId: JOB_ID, epoch: 2 });
    expect(r.json.data).toEqual({ action: "stop", epoch: 2, state: "failed" });
    expect(steps.stepBegin).not.toHaveBeenCalled();
    steps.stepWhenDisabled.mockResolvedValue({ ok: true, data: { state: "failed", retryAfterSec: 0 } });
    await send({ op: "advance", jobId: JOB_ID, epoch: 2 });
    expect(advanceJob).not.toHaveBeenCalled();
    steps.stepFail.mockResolvedValueOnce({ ok: true, data: { state: "failed" } });
    await send({ op: "fail", jobId: JOB_ID, epoch: 2, code: "transcode_failed", reason: "ffmpeg salió con código 1" });
    expect(steps.stepFail).toHaveBeenCalledTimes(1);
  });
});

describe("tick (global op)", () => {
  it("runs the durable driver and replies with the contract counters", async () => {
    const r = await send({ op: "tick", jobId: null, epoch: null, scheduledAt: new Date().toISOString() });
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({ dispatched: 1, redispatched: 0, failedJobs: 0, geminiFilesDeleted: 2, geminiDeleteErrors: 0, more: false });
    expect(repo.getJob).not.toHaveBeenCalled();
  });
});
