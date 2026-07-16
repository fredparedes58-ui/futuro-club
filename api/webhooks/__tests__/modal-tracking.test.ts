/**
 * Tests · V4 async tracking — webhook de callback de Modal.
 * La firma se computa con el edgeCrypto REAL sobre el rawBody EXACTO (mismo
 * contrato que emitirá Modal en V4.3): X-Vitas-Signature = HMAC(secret, body).
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

let handler: (req: Request) => Promise<Response>;
beforeAll(async () => {
  handler = (await import("../modal-tracking")).default;
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonRes(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

/** Firma el rawBody EXACTO que se envía (HMAC del contenido, no del job_id). */
async function signedPost(payload: unknown): Promise<Request> {
  const raw = JSON.stringify(payload);
  const sig = await hmacSha256Hex("cb-secret", raw);
  return new Request("https://example.com/api/webhooks/modal-tracking", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Vitas-Signature": sig },
    body: raw,
  });
}

describe("webhook modal-tracking", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.MODAL_CALLBACK_SECRET = "cb-secret";
  });

  it("503 fail-closed sin MODAL_CALLBACK_SECRET (nunca fail-open)", async () => {
    delete process.env.MODAL_CALLBACK_SECRET;
    const res = await handler(await signedPost({ job_id: "job-1", status: "done", result: {} }));
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401 con firma inválida (sin tocar la DB)", async () => {
    const req = new Request("https://example.com/api/webhooks/modal-tracking", {
      method: "POST",
      headers: { "X-Vitas-Signature": "deadbeef" },
      body: JSON.stringify({ job_id: "job-1", status: "done", result: {} }),
    });
    const res = await handler(req);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401 si el body cambia tras firmar (firma es del contenido)", async () => {
    const raw = JSON.stringify({ job_id: "job-1", status: "done", result: { ok: 1 } });
    const sig = await hmacSha256Hex("cb-secret", raw);
    // Reusar la firma con un body forjado distinto
    const forged = new Request("https://example.com/api/webhooks/modal-tracking", {
      method: "POST",
      headers: { "X-Vitas-Signature": sig },
      body: JSON.stringify({ job_id: "job-1", status: "done", result: { hacked: true } }),
    });
    const res = await handler(forged);
    expect(res.status).toBe(401);
  });

  it("400 sin job_id (firma válida)", async () => {
    const res = await handler(await signedPost({ status: "done", result: {} }));
    expect(res.status).toBe(400);
  });

  it("estado no terminal (heartbeat) → 200 ignored, no escribe", async () => {
    const res = await handler(await signedPost({ job_id: "job-1", status: "processing" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.ignored).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("happy path done: PATCH atómico condicional con representación", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes([{ id: "job-1" }])); // PATCH devuelve 1 fila
    const res = await handler(
      await signedPost({ job_id: "job-1", status: "done", result: { totalPlayerTracks: 20 } }),
    );
    expect(res.status).toBe(200);
    const patchCall = fetchMock.mock.calls[0];
    expect(String(patchCall[0])).toContain("status=in.(queued,processing)"); // condición atómica
    const patch = JSON.parse(patchCall[1].body);
    expect(patch.status).toBe("done");
    expect(patch.result.totalPlayerTracks).toBe(20);
  });

  it("done sin result → failed", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes([{ id: "job-1" }]));
    const res = await handler(await signedPost({ job_id: "job-1", status: "done" }));
    expect(res.status).toBe(200);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).status).toBe("failed");
  });

  it("idempotente: PATCH condicional no afecta filas (ya finalizado) → 200 idempotent", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes([]))                          // PATCH: 0 filas (ya done/failed)
      .mockResolvedValueOnce(jsonRes([{ id: "job-1", status: "done" }])); // SELECT: existe, done
    const res = await handler(await signedPost({ job_id: "job-1", status: "done", result: {} }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.idempotent).toBe(true);
  });

  it("404: PATCH 0 filas y el job no existe", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes([]))  // PATCH 0 filas
      .mockResolvedValueOnce(jsonRes([])); // SELECT vacío
    const res = await handler(await signedPost({ job_id: "ghost", status: "done", result: {} }));
    expect(res.status).toBe(404);
  });
});
