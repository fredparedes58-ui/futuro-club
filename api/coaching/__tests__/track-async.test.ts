/**
 * Tests · V4 async tracking — enqueue (track-async) + polling (track-status)
 * Patrón de mocks idéntico a api/_lib/__tests__/withHandler.test.ts.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true, remaining: 29, limit: 30, resetAt: Date.now() + 60000,
  }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("../../_lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ userId: "user-123", error: null }),
}));

// Env de módulo (SUPABASE_*) se lee en import → fijar ANTES del dynamic import.
process.env.VITE_SUPABASE_URL = "https://sb.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-key";

let trackAsync: (req: Request) => Promise<Response>;
let trackStatus: (req: Request) => Promise<Response>;

beforeAll(async () => {
  trackAsync = (await import("../_track-async")).default;
  trackStatus = (await import("../_track-status")).default;
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function post(body: unknown): Request {
  return new Request("https://example.com/api/coaching/track-async", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer jwt" },
    body: JSON.stringify(body),
  });
}

function get(url: string): Request {
  return new Request(url, { method: "GET", headers: { Authorization: "Bearer jwt" } });
}

function jsonRes(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

describe("track-async (enqueue + spawn)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.MODAL_TRACK_ASYNC_URL = "https://modal.test/track_async";
    process.env.MODAL_API_KEY = "modal-key";
    process.env.MODAL_CALLBACK_SECRET = "cb-secret";
    process.env.PUBLIC_URL = "https://vitas.test";
  });

  it("503 real_inference_disabled sin MODAL_TRACK_ASYNC_URL", async () => {
    delete process.env.MODAL_TRACK_ASYNC_URL;
    const res = await trackAsync(post({ videoUrl: "https://cdn.test/match.mp4" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.errorDetail.code).toBe("real_inference_disabled");
  });

  it("400 si videoUrl falta o no es URL", async () => {
    const res = await trackAsync(post({ videoUrl: "not-a-url" }));
    expect(res.status).toBe(400);
  });

  it("happy path: inserta job, spawnea en Modal con callback firmado y responde 202", async () => {
    fetchMock
      // 1 · INSERT tracking_jobs
      .mockResolvedValueOnce(jsonRes([{ id: "job-1", status: "queued" }], 201))
      // 2 · Modal spawn
      .mockResolvedValueOnce(jsonRes({ call_id: "call-9" }))
      // 3 · PATCH modal_call_id
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const res = await trackAsync(
      post({ videoUrl: "https://cdn.test/match.mp4", durationSec: 5400, sampleFps: 5 }),
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.data.jobId).toBe("job-1");

    // Insert lleva user_id del JWT y estado inicial queued (default en DB)
    const insertCall = fetchMock.mock.calls[0];
    expect(String(insertCall[0])).toContain("/rest/v1/tracking_jobs");
    expect(JSON.parse(insertCall[1].body).user_id).toBe("user-123");

    // Spawn lleva job_id + callback firmado
    const spawnCall = fetchMock.mock.calls[1];
    expect(String(spawnCall[0])).toBe("https://modal.test/track_async");
    const spawnBody = JSON.parse(spawnCall[1].body);
    expect(spawnBody.job_id).toBe("job-1");
    expect(spawnBody.callback_url).toBe("https://vitas.test/api/webhooks/modal-tracking");
    expect(spawnBody.callback_token).toMatch(/^[0-9a-f]{64}$/); // HMAC-SHA256 hex
  });

  it("spawn fallido → job marcado failed y 502", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes([{ id: "job-2", status: "queued" }], 201)) // insert
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))             // modal 500
      .mockResolvedValueOnce(new Response(null, { status: 204 }));              // PATCH failed

    const res = await trackAsync(post({ videoUrl: "https://cdn.test/match.mp4" }));
    expect(res.status).toBe(502);

    const patchCall = fetchMock.mock.calls[2];
    expect(String(patchCall[0])).toContain("tracking_jobs?id=eq.job-2");
    expect(JSON.parse(patchCall[1].body).status).toBe("failed");
  });

  it("insert fallido → 500 enqueue_failed sin tocar Modal", async () => {
    fetchMock.mockResolvedValueOnce(new Response("rls", { status: 403 }));
    const res = await trackAsync(post({ videoUrl: "https://cdn.test/match.mp4" }));
    expect(res.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1); // nunca llegó al spawn
  });
});

describe("track-status (polling)", () => {
  beforeEach(() => fetchMock.mockReset());

  const row = (over: Record<string, unknown> = {}) => [{
    id: "job-1", user_id: "user-123", status: "processing", result: null,
    error: null, attempts: 1, created_at: "2026-07-16T00:00:00Z",
    started_at: null, finished_at: null, ...over,
  }];

  it("400 sin jobId", async () => {
    const res = await trackStatus(get("https://example.com/api/coaching/track-status"));
    expect(res.status).toBe(400);
  });

  it("404 si el job no existe", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes([]));
    const res = await trackStatus(get("https://example.com/api/coaching/track-status?jobId=nope"));
    expect(res.status).toBe(404);
  });

  it("403 si el job es de otro usuario", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(row({ user_id: "otro" })));
    const res = await trackStatus(get("https://example.com/api/coaching/track-status?jobId=job-1"));
    expect(res.status).toBe(403);
  });

  it("200 processing: sin result durante el polling", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(row()));
    const res = await trackStatus(get("https://example.com/api/coaching/track-status?jobId=job-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("processing");
    expect(body.data.result).toBeUndefined();
  });

  it("200 done: incluye result", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonRes(row({ status: "done", result: { totalPlayerTracks: 22 } })),
    );
    const res = await trackStatus(get("https://example.com/api/coaching/track-status?jobId=job-1"));
    const body = await res.json();
    expect(body.data.status).toBe("done");
    expect(body.data.result.totalPlayerTracks).toBe(22);
  });
});
