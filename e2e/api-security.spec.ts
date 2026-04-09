import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "https://futuro-club.vercel.app";

test.describe("API Security", () => {
  test("POST without auth returns 401", async ({ request }) => {
    const res = await request.post(`${BASE}/api/agents/phv-calculator`, {
      headers: { "Content-Type": "application/json" },
      data: {},
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("GET on POST-only endpoint returns 405", async ({ request }) => {
    const res = await request.get(`${BASE}/api/agents/phv-calculator`);
    expect(res.status()).toBe(405);
  });

  test("CORS headers are restricted (not wildcard)", async ({ request }) => {
    const res = await request.post(`${BASE}/api/agents/phv-calculator`, {
      headers: { "Content-Type": "application/json" },
      data: {},
    });
    const origin = res.headers()["access-control-allow-origin"];
    expect(origin).not.toBe("*");
    expect(origin).toContain("futuro-club.vercel.app");
  });

  test("OPTIONS preflight returns 204", async ({ request }) => {
    const res = await request.fetch(`${BASE}/api/agents/phv-calculator`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://futuro-club.vercel.app",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(res.status()).toBe(204);
  });

  test("service-only endpoint rejects without CRON_SECRET", async ({ request }) => {
    const res = await request.post(`${BASE}/api/rag/seed`, {
      headers: { "Content-Type": "application/json" },
      data: {},
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("rate limit headers are present", async ({ request }) => {
    const res = await request.post(`${BASE}/api/agents/phv-calculator`, {
      headers: { "Content-Type": "application/json" },
      data: {},
    });
    const headers = res.headers();
    expect(headers["x-ratelimit-limit"]).toBeDefined();
    expect(headers["x-ratelimit-remaining"]).toBeDefined();
  });
});
