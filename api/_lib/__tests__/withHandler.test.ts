/**
 * Tests for withHandler — centralized API handler wrapper
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Mock rateLimit before importing withHandler
vi.mock("../rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 29,
    limit: 30,
    resetAt: Date.now() + 60000,
  }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimitHeaders: vi.fn().mockReturnValue({
    "X-RateLimit-Limit": "30",
    "X-RateLimit-Remaining": "29",
    "X-RateLimit-Reset": "9999999999",
  }),
}));

// Mock auth
vi.mock("../auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ userId: "user-123", error: null }),
}));

import { withHandler } from "../withHandler";
import { checkRateLimit } from "../rateLimit";
import { verifyAuth } from "../auth";

function makeRequest(method = "POST", body?: unknown, headers?: Record<string, string>): Request {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body && method === "POST") {
    init.body = JSON.stringify(body);
  }
  return new Request("https://example.com/api/test", init);
}

describe("withHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default allowed
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true, remaining: 29, limit: 30, resetAt: Date.now() + 60000,
    });
    vi.mocked(verifyAuth).mockResolvedValue({ userId: "user-123", error: null });
  });

  // ─── CORS ───────────────────────────────────────────
  it("returns 204 for OPTIONS preflight", async () => {
    const handler = withHandler({}, async () => {
      return new Response("should not reach");
    });
    const res = await handler(makeRequest("OPTIONS"));
    expect(res.status).toBe(204);
  });

  // ─── Method enforcement ─────────────────────────────
  it("returns 405 for wrong method", async () => {
    const handler = withHandler({ method: "POST" }, async () => {
      return new Response("ok");
    });
    const res = await handler(makeRequest("GET"));
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("accepts multiple methods", async () => {
    const handler = withHandler({ method: ["POST", "DELETE"] }, async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    // POST should work
    const res1 = await handler(makeRequest("POST", {}));
    expect(res1.status).toBe(200);
    // DELETE should work
    const res2 = await handler(makeRequest("DELETE"));
    expect(res2.status).toBe(200);
    // GET should fail
    const res3 = await handler(makeRequest("GET"));
    expect(res3.status).toBe(405);
  });

  // ─── Rate limiting ──────────────────────────────────
  it("returns 429 when rate limited", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false, remaining: 0, limit: 30, resetAt: Date.now() + 60000,
    });
    const handler = withHandler({}, async () => {
      return new Response("should not reach");
    });
    const res = await handler(makeRequest("POST", {}));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  // ─── Zod validation ─────────────────────────────────
  it("returns 400 for invalid body", async () => {
    const schema = z.object({ name: z.string().min(1) });
    const handler = withHandler({ schema }, async () => {
      return new Response("should not reach");
    });
    const res = await handler(makeRequest("POST", { name: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("passes validated body to handler", async () => {
    const schema = z.object({ name: z.string().min(1) });
    const handler = withHandler({ schema }, async ({ body }) => {
      return new Response(JSON.stringify({ ok: true, data: body }));
    });
    const res = await handler(makeRequest("POST", { name: "test" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.name).toBe("test");
  });

  // ─── Auth: requireAuth ──────────────────────────────
  it("returns 401 when requireAuth and no token", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({ userId: null, error: "No autenticado" });
    const handler = withHandler({ requireAuth: true }, async () => {
      return new Response("should not reach");
    });
    const res = await handler(makeRequest("POST", {}));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("passes userId when requireAuth succeeds", async () => {
    const handler = withHandler({ requireAuth: true }, async ({ userId }) => {
      return new Response(JSON.stringify({ ok: true, data: { userId } }));
    });
    const res = await handler(makeRequest("POST", {}, { Authorization: "Bearer test-token" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.userId).toBe("user-123");
  });

  // ─── Auth: optionalAuth ─────────────────────────────
  it("passes null userId when optionalAuth and no token", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({ userId: null, error: "No autenticado" });
    const handler = withHandler({ optionalAuth: true }, async ({ userId }) => {
      return new Response(JSON.stringify({ ok: true, data: { userId } }));
    });
    const res = await handler(makeRequest("POST", {}));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.userId).toBeNull();
  });

  // ─── Auth: serviceOnly ──────────────────────────────
  it("returns 403 when serviceOnly and no secret", async () => {
    const handler = withHandler({ serviceOnly: true, method: "GET" }, async () => {
      return new Response("should not reach");
    });
    const res = await handler(makeRequest("GET"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("allows serviceOnly with correct CRON_SECRET", async () => {
    process.env.CRON_SECRET = "my-secret";
    const handler = withHandler({ serviceOnly: true, method: "GET" }, async () => {
      return new Response(JSON.stringify({ ok: true }));
    });
    const res = await handler(makeRequest("GET", undefined, { Authorization: "Bearer my-secret" }));
    expect(res.status).toBe(200);
    delete process.env.CRON_SECRET;
  });

  // ─── Error handling ─────────────────────────────────
  it("catches handler errors and returns 500", async () => {
    const handler = withHandler({}, async () => {
      throw new Error("something broke");
    });
    const res = await handler(makeRequest("POST", {}));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("something broke");
  });

  // ─── rawBody ────────────────────────────────────────
  it("skips body parsing when rawBody is true", async () => {
    const handler = withHandler({ rawBody: true }, async ({ req }) => {
      const text = await req.text();
      return new Response(JSON.stringify({ ok: true, data: { raw: text } }));
    });
    const req = new Request("https://example.com/api/test", {
      method: "POST",
      body: "raw-text-body",
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.raw).toBe("raw-text-body");
  });

  // ─── Request logging ─────────────────────────────────
  it("logs structured JSON for successful requests", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const handler = withHandler({}, async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    await handler(makeRequest("POST", {}));
    expect(logSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(logSpy.mock.calls[0][0]);
    expect(logged.level).toBe("info");
    expect(logged.method).toBe("POST");
    expect(logged.status).toBe(200);
    expect(typeof logged.ms).toBe("number");
    expect(logged.path).toBe("/api/test");
    logSpy.mockRestore();
  });

  it("logs structured JSON for errors with stack trace", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withHandler({}, async () => {
      throw new Error("boom");
    });
    await handler(makeRequest("POST", {}));
    expect(errorSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(logged.level).toBe("error");
    expect(logged.status).toBe(500);
    expect(logged.error).toBe("boom");
    expect(logged.stack).toBeDefined();
    errorSpy.mockRestore();
  });

  // ─── Invalid JSON ───────────────────────────────────
  it("returns 400 for invalid JSON body", async () => {
    const handler = withHandler({}, async () => {
      return new Response("should not reach");
    });
    const req = new Request("https://example.com/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("PARSE_ERROR");
  });
});
