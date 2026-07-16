/**
 * Tests · V4 async tracking — webhook de callback de Modal.
 * La firma se computa con el edgeCrypto REAL (HMAC del job_id) para que el
 * test guarde el contrato exacto que emite track-async.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { hmacSha256Hex } from "../../_lib/edgeCrypto";

vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true, remaining: 199, limit: 200, resetAt: Date.now() + 60000,
  }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("../../_lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ userId: null, error: null }),
}));

process.env.VITE_SUPABASE_URL = "https://sb.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-key";
process.env.MODAL_CALLBACK_SECRET = "cb-secret";

let handler: (req: Request) => Promise<Response>;
beforeAll(async () => {
  handler = (await import("../modal-tracking")).default;
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonRes(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

async function signedPost(payload: unknown, jobIdForSig?: string): Promise<Request> {
  const raw = JSON.stringify(payload);
  const jobId = jobIdForSig ?? (payload as { job_id?: string }).job_id ?? "";
  const sig = await hmacSha256Hex("cb-secret", jobId);
  return new Request("https://example.com/api/webhooks/modal-tracking", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Vitas-Signature": sig },
    body: raw,
  });
}

describe("webhook modal-tracking", () => {
  beforeEach(() => fetchMock.mockReset());

  it("400 con JSON inválido", async () => {
    const res = await handler(new Request("https://example.com/api/webhooks/modal-tracking", {
      method: "POST", body: "not-json",
    }));
    expect(res.status).toBe(400);
  });

  it("400 sin job_id", async () => {
    const res = await handler(await signedPost({ status: "done" }, "whatever"));
    expect(res.status).toBe(400);
  });

  it("401 con firma inválida", async () => {
    const req = new Request("https://example.com/api/webhooks/modal-tracking", {
      method: "POST",
      headers: { "X-Vitas-Signature": "deadbeef" },
      body: JSON.stringify({ job_id: "job-1", status: "done", result: {} }),
    });
    const res = await handler(req);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled(); // nunca tocó la DB
  });

  it("404 si el job no existe", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes([]));
    const res = await handler(await signedPost({ job_id: "ghost", status: "done", result: {} }));
    expect(res.status).toBe(404);
  });

  it("happy path done: escribe result y finished_at", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes([{ id: "job-1", status: "processing" }])) // lookup
      .mockResolvedValueOnce(new Response(null, { status: 204 }));             // patch

    const res = await handler(
      await signedPost({ job_id: "job-1", status: "done", result: { totalPlayerTracks: 20 } }),
    );
    expect(res.status).toBe(200);

    const patch = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(patch.status).toBe("done");
    expect(patch.result.totalPlayerTracks).toBe(20);
    expect(patch.finished_at).toBeTruthy();
  });

  it("failed: escribe error", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes([{ id: "job-1", status: "processing" }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const res = await handler(
      await signedPost({ job_id: "job-1", status: "failed", error: "gpu oom" }),
    );
    expect(res.status).toBe(200);
    const patch = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(patch.status).toBe("failed");
    expect(patch.error).toBe("gpu oom");
  });

  it("idempotente: job ya done → no re-escribe", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes([{ id: "job-1", status: "done" }]));
    const res = await handler(
      await signedPost({ job_id: "job-1", status: "done", result: {} }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.idempotent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // solo el lookup, sin PATCH
  });
});
