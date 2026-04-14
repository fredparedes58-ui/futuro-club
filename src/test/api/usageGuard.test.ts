/**
 * usageGuard — Tests
 * Verifica lógica de quota enforcement, plan limits, response format.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock fetch globally ──────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Mock env ─────────────────────────────────────────────────────────────────

vi.stubGlobal("process", {
  env: {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  },
});

import { checkUsageQuota, incrementUsage, usageExceededResponse } from "../../../api/_lib/usageGuard";

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockFetchResponses(responses: Array<{ ok: boolean; data: unknown; rawText?: string }>) {
  let callIndex = 0;
  mockFetch.mockImplementation(async () => {
    const resp = responses[callIndex] ?? { ok: false, data: null };
    callIndex++;
    return {
      ok: resp.ok,
      status: resp.ok ? 200 : 500,
      json: async () => resp.data,
      text: async () => resp.rawText ?? JSON.stringify(resp.data),
    };
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("usageGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkUsageQuota", () => {
    it("allows user under limit (free plan, 1/3 used)", async () => {
      mockFetchResponses([
        { ok: true, data: [{ plan: "free", status: "active" }] },  // subscription
        { ok: true, data: '"user@test.com"' },                      // admin check
        { ok: true, data: [{ count: 1 }] },                         // usage count
      ]);

      const result = await checkUsageQuota("user-1");
      expect(result.allowed).toBe(true);
      expect(result.plan).toBe("free");
      expect(result.used).toBe(1);
      expect(result.limit).toBe(3);
      expect(result.remaining).toBe(2);
    });

    it("denies user at limit (free plan, 3/3 used)", async () => {
      mockFetchResponses([
        { ok: true, data: [{ plan: "free", status: "active" }] },
        { ok: true, data: '"user@test.com"' },
        { ok: true, data: [{ count: 3 }] },
      ]);

      const result = await checkUsageQuota("user-2");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.reason).toContain("3/3");
    });

    it("allows pro plan with higher limit", async () => {
      mockFetchResponses([
        { ok: true, data: [{ plan: "pro", status: "active" }] },
        { ok: true, data: '"pro@test.com"' },
        { ok: true, data: [{ count: 15 }] },
      ]);

      const result = await checkUsageQuota("user-3");
      expect(result.allowed).toBe(true);
      expect(result.plan).toBe("pro");
      expect(result.limit).toBe(20);
      expect(result.remaining).toBe(5);
    });

    it("allows admin bypass", async () => {
      mockFetchResponses([
        { ok: true, data: [{ plan: "free", status: "active" }] },
        { ok: true, data: null, rawText: '"fredparedes58@gmail.com"' },
      ]);

      const result = await checkUsageQuota("admin-user");
      expect(result.allowed).toBe(true);
      expect(result.plan).toBe("admin");
      expect(result.limit).toBe(9999);
    });

    it("defaults to free plan when no subscription", async () => {
      mockFetchResponses([
        { ok: true, data: [] },                    // no subscription
        { ok: true, data: '"user@test.com"' },      // not admin
        { ok: true, data: [{ count: 0 }] },         // no usage
      ]);

      const result = await checkUsageQuota("new-user");
      expect(result.allowed).toBe(true);
      expect(result.plan).toBe("free");
      expect(result.limit).toBe(3);
    });
  });

  describe("usageExceededResponse", () => {
    it("returns 429 with correct structure", async () => {
      const response = usageExceededResponse({
        allowed: false,
        used: 3,
        limit: 3,
        plan: "free",
        remaining: 0,
        reason: "Lmite mensual alcanzado (3/3)",
      });

      expect(response.status).toBe(429);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("X-Usage-Used")).toBe("3");
      expect(response.headers.get("X-Usage-Limit")).toBe("3");
      expect(response.headers.get("X-Usage-Remaining")).toBe("0");

      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.code).toBe("USAGE_LIMIT");
      expect(body.usage.plan).toBe("free");
    });
  });

  describe("incrementUsage", () => {
    it("calls Supabase to increment usage and log", async () => {
      mockFetchResponses([
        { ok: true, data: [{ count: 2 }] },  // get current count
        { ok: true, data: null },              // upsert analyses_used
        { ok: true, data: null },              // insert usage_log
      ]);

      await incrementUsage("user-1", "scout-insight");
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("does not throw on fetch failure", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));
      await expect(incrementUsage("user-1", "scout-insight")).resolves.not.toThrow();
    });
  });
});
