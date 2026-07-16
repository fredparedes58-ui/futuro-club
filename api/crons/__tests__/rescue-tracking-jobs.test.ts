/**
 * Tests · V4.5 cron de rescate de tracking_jobs.
 * El handler es una función plana (auth = Bearer CRON_SECRET), sin withHandler.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

process.env.VITE_SUPABASE_URL = "https://sb.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-key";
process.env.CRON_SECRET = "cron-secret";

let handler: (req: Request) => Promise<Response>;
beforeAll(async () => {
  handler = (await import("../rescue-tracking-jobs")).default;
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function cronReq(auth = "Bearer cron-secret"): Request {
  return new Request("https://example.com/api/crons/rescue-tracking-jobs", {
    method: "GET",
    headers: { Authorization: auth },
  });
}

function jsonRes(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

describe("cron rescue-tracking-jobs", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.MODAL_TRACK_ASYNC_URL = "https://modal.test/track_async";
    process.env.MODAL_API_KEY = "modal-key";
    process.env.MODAL_CALLBACK_SECRET = "cb-secret";
    process.env.VITAS_PUBLIC_URL = "https://vitas.test";
  });

  it("401 sin CRON_SECRET correcto", async () => {
    const res = await handler(cronReq("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reaper: marca failed los processing colgados (PATCH condicional por started_at)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes([{ id: "stale-1" }, { id: "stale-2" }])) // reap
      .mockResolvedValueOnce(jsonRes([]));                                      // claim vacío
    const res = await handler(cronReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reaped).toBe(2);

    const reapCall = fetchMock.mock.calls[0];
    expect(String(reapCall[0])).toContain("status=eq.processing");
    expect(String(reapCall[0])).toContain("started_at=lt.");
    expect(JSON.parse(reapCall[1].body).status).toBe("failed");
  });

  it("sin Modal env → reaper corre pero el rescate se salta", async () => {
    delete process.env.MODAL_TRACK_ASYNC_URL;
    fetchMock.mockResolvedValueOnce(jsonRes([])); // reap
    const res = await handler(cronReq());
    const body = await res.json();
    expect(body.data.skippedRescue).toBe("modal_env_missing");
    expect(fetchMock).toHaveBeenCalledTimes(1); // solo el reap, sin claim
  });

  it("rescate: re-spawnea job reclamado y guarda modal_call_id", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes([]))                                                 // reap
      .mockResolvedValueOnce(jsonRes([{ id: "j1", video_url: "https://v/x.mp4", sample_fps: 5, attempts: 1 }])) // claim
      .mockResolvedValueOnce(jsonRes({ call_id: "call-7" }))                               // spawn ok
      .mockResolvedValueOnce(jsonRes([{ id: "j1" }]));                                     // patch call_id
    const res = await handler(cronReq());
    const body = await res.json();
    expect(body.data.rescued).toBe(1);

    const claimCall = fetchMock.mock.calls[1];
    expect(String(claimCall[0])).toContain("/rpc/claim_queued_tracking_jobs");

    const spawnCall = fetchMock.mock.calls[2];
    const spawnBody = JSON.parse(spawnCall[1].body);
    expect(spawnBody.job_id).toBe("j1");
    expect(spawnBody.callback_url).toBe("https://vitas.test/api/webhooks/modal-tracking");
  });

  it("spawn falla → devuelve el job a queued (reintenta el próximo cron)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes([]))                                                 // reap
      .mockResolvedValueOnce(jsonRes([{ id: "j2", video_url: "https://v/x.mp4", sample_fps: 5, attempts: 2 }])) // claim
      .mockResolvedValueOnce(new Response("boom", { status: 502 }))                        // spawn KO
      .mockResolvedValueOnce(jsonRes([{ id: "j2" }]));                                     // patch requeue
    const res = await handler(cronReq());
    const body = await res.json();
    expect(body.data.rescued).toBe(0);
    const requeue = JSON.parse(fetchMock.mock.calls[3][1].body);
    expect(requeue.status).toBe("queued");
  });

  it("attempts > máximo → entierra el job como failed sin re-spawnear", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes([]))                                                 // reap
      .mockResolvedValueOnce(jsonRes([{ id: "j3", video_url: "https://v/x.mp4", sample_fps: 5, attempts: 4 }])) // claim
      .mockResolvedValueOnce(jsonRes([{ id: "j3" }]));                                     // patch failed
    const res = await handler(cronReq());
    const body = await res.json();
    expect(body.data.buried).toBe(1);
    const bury = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(bury.status).toBe("failed");
    // nunca llamó a Modal
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes("modal.test"))).toBe(true);
  });
});
