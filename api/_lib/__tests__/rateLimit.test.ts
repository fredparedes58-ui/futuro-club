/**
 * Tests for rateLimit — in-memory fallback (no Upstash in test env)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Upstash modules to force in-memory fallback
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: vi.fn(),
}));
vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(),
}));

// Ensure no Upstash env vars
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

import { checkRateLimit, getClientIP, rateLimitHeaders } from "../rateLimit";

describe("checkRateLimit (in-memory fallback)", () => {
  it("allows requests under the limit", async () => {
    const result = await checkRateLimit("test-ip-1", { max: 5, windowMs: 60000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.limit).toBe(5);
  });

  it("blocks requests over the limit", async () => {
    const ip = "test-ip-block-" + Date.now();
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(ip, { max: 3, windowMs: 60000 });
    }
    const result = await checkRateLimit(ip, { max: 3, windowMs: 60000 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after window expires", async () => {
    const ip = "test-ip-reset-" + Date.now();
    // Use a very short window
    for (let i = 0; i < 2; i++) {
      await checkRateLimit(ip, { max: 2, windowMs: 1 });
    }
    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 5));
    const result = await checkRateLimit(ip, { max: 2, windowMs: 1 });
    expect(result.allowed).toBe(true);
  });

  it("uses default config when none provided", async () => {
    const ip = "test-ip-default-" + Date.now();
    const result = await checkRateLimit(ip);
    expect(result.limit).toBe(30);
    expect(result.allowed).toBe(true);
  });
});

describe("getClientIP", () => {
  it("extracts IP from x-forwarded-for", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIP(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("https://example.com", {
      headers: { "x-real-ip": "9.8.7.6" },
    });
    expect(getClientIP(req)).toBe("9.8.7.6");
  });

  it("returns unknown when no IP headers", () => {
    const req = new Request("https://example.com");
    expect(getClientIP(req)).toBe("unknown");
  });
});

describe("rateLimitHeaders", () => {
  it("formats headers correctly", () => {
    const headers = rateLimitHeaders({
      allowed: true,
      remaining: 25,
      limit: 30,
      resetAt: 1700000000000,
    });
    expect(headers["X-RateLimit-Limit"]).toBe("30");
    expect(headers["X-RateLimit-Remaining"]).toBe("25");
    expect(headers["X-RateLimit-Reset"]).toBe("1700000000");
  });
});
