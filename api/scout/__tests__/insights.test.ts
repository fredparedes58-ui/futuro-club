/**
 * Tests for /api/scout/insights — CRUD endpoint
 * Tests the handler logic with mocked Supabase calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true, remaining: 59, limit: 60, resetAt: Date.now() + 60000,
  }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("../../_lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ userId: "user-test-123", error: null }),
}));

import insightsHandler from "../insights";

function makeRequest(
  method: string,
  body?: unknown,
  searchParams?: Record<string, string>,
): Request {
  const url = new URL("https://example.com/api/scout/insights");
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      url.searchParams.set(k, v);
    }
  }
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    },
  };
  if (body && (method === "POST" || method === "PATCH" || method === "DELETE")) {
    init.body = JSON.stringify(body);
  }
  return new Request(url.toString(), init);
}

describe("/api/scout/insights", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    // Reset global fetch mock
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 503 when Supabase not configured", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await insightsHandler(makeRequest("GET"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  describe("GET — list insights", () => {
    it("fetches insights with default pagination", async () => {
      const mockInsights = [
        { id: "i1", title: "Test insight", insight_type: "breakout" },
      ];

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (urlStr.includes("is_read=eq.false")) {
          // Unread count query
          return new Response(JSON.stringify([]), {
            headers: { "content-range": "0-0/3" },
          });
        }
        // Main query
        return new Response(JSON.stringify(mockInsights), {
          headers: { "content-range": "0-0/1" },
        });
      });

      const res = await insightsHandler(makeRequest("GET"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.insights).toHaveLength(1);
      expect(body.data.total).toBe(1);
      expect(body.data.unread).toBe(3);
    });

    it("applies type and urgency filters", async () => {
      let capturedUrl = "";
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (!urlStr.includes("is_read=eq.false")) {
          capturedUrl = urlStr;
        }
        return new Response(JSON.stringify([]), {
          headers: { "content-range": "0-0/0" },
        });
      });

      await insightsHandler(
        makeRequest("GET", undefined, { type: "breakout", urgency: "high" }),
      );

      expect(capturedUrl).toContain("insight_type=eq.breakout");
      expect(capturedUrl).toContain("urgency=eq.high");
    });

    it("limits to max 50 items", async () => {
      let capturedUrl = "";
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (!urlStr.includes("is_read=eq.false")) {
          capturedUrl = urlStr;
        }
        return new Response(JSON.stringify([]), {
          headers: { "content-range": "0-0/0" },
        });
      });

      await insightsHandler(makeRequest("GET", undefined, { limit: "999" }));
      expect(capturedUrl).toContain("limit=50");
    });
  });

  describe("PATCH — update insight", () => {
    it("marks insight as read", async () => {
      let patchBody: string | undefined;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
        if (init?.method === "PATCH") {
          patchBody = init.body as string;
          return new Response(JSON.stringify([{ id: "i1", is_read: true }]));
        }
        return new Response("{}");
      });

      const res = await insightsHandler(
        makeRequest("PATCH", {
          id: "550e8400-e29b-41d4-a716-446655440000",
          is_read: true,
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(JSON.parse(patchBody!)).toEqual({ is_read: true });
    });

    it("rejects invalid PATCH body", async () => {
      const res = await insightsHandler(
        makeRequest("PATCH", { id: "not-a-uuid" }),
      );
      expect(res.status).toBe(400);
    });

    it("marks insight as archived", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        return new Response(JSON.stringify([{ id: "i1", is_archived: true }]));
      });

      const res = await insightsHandler(
        makeRequest("PATCH", {
          id: "550e8400-e29b-41d4-a716-446655440000",
          is_archived: true,
        }),
      );
      expect(res.status).toBe(200);
    });
  });

  describe("DELETE — remove insight", () => {
    it("deletes insight by id", async () => {
      let deletedUrl = "";
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        if (init?.method === "DELETE") {
          deletedUrl = typeof url === "string" ? url : url.toString();
          return new Response(null, { status: 204 });
        }
        return new Response("{}");
      });

      const res = await insightsHandler(
        makeRequest("DELETE", {
          id: "550e8400-e29b-41d4-a716-446655440000",
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.deleted).toBe(true);
      expect(deletedUrl).toContain("id=eq.550e8400");
    });

    it("rejects DELETE without valid uuid", async () => {
      const res = await insightsHandler(
        makeRequest("DELETE", { id: "bad-id" }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST — redirect to generate", () => {
    it("returns 400 telling to use /api/scout/generate", async () => {
      const res = await insightsHandler(makeRequest("POST", {}));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("generate");
    });
  });
});
