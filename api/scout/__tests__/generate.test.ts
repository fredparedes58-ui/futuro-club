/**
 * Tests for /api/scout/generate — Insight Generation
 * Tests context detection logic and handler flow with mocked external calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true, remaining: 9, limit: 10, resetAt: Date.now() + 120000,
  }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("../../_lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ userId: "user-gen-123", error: null }),
}));

import generateHandler from "../generate";

function makeRequest(body?: unknown): Request {
  return new Request("https://example.com/api/scout/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    },
    body: JSON.stringify(body ?? {}),
  });
}

describe("/api/scout/generate", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 503 when Supabase not configured", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await generateHandler(makeRequest());
    expect(res.status).toBe(503);
  });

  it("returns 503 when Anthropic not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const res = await generateHandler(makeRequest());
    expect(res.status).toBe(503);
  });

  it("returns empty insights when no players found", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/rest/v1/players")) {
        return new Response(JSON.stringify([]));
      }
      return new Response("{}");
    });

    const res = await generateHandler(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.insights).toEqual([]);
  });

  it("generates insight for a single player end-to-end", async () => {
    const mockPlayer = {
      id: "p1",
      name: "Lucas Test",
      age: 15,
      position: "RW",
      vsi: 72,
      phv_category: "ontme",
      phv_offset: 0.5,
      metrics: { speed: 80, technique: 75, vision: 70, stamina: 76, shooting: 78, defending: 45 },
      vsi_history: [65, 72],
      minutes_played: 840,
      updated_at: "2026-01-01",
    };

    const mockClaudeResponse = {
      content: [{
        type: "text",
        text: JSON.stringify({
          type: "breakout",
          headline: "Lucas muestra crecimiento explosivo",
          body: "VSI subió 7 puntos en el último periodo.",
          metric: "VSI",
          metricValue: "72 (+7)",
          urgency: "high",
          tags: ["breakout", "velocidad"],
          recommendedDrills: [{ name: "Sprint drill", reason: "Potenciar velocidad" }],
          actionItems: ["Aumentar minutos en partido"],
          benchmark: "Percentil 78 en velocidad Sub-15",
        }),
      }],
    };

    const savedInsight = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      player_name: "Lucas Test",
      insight_type: "breakout",
      title: "Lucas muestra crecimiento explosivo",
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const urlStr = typeof url === "string" ? url : url.toString();

      // Players query
      if (urlStr.includes("/rest/v1/players")) {
        return new Response(JSON.stringify([mockPlayer]));
      }

      // Analyses query
      if (urlStr.includes("/rest/v1/player_analyses")) {
        return new Response(JSON.stringify([]));
      }

      // RAG query
      if (urlStr.includes("/api/rag/query")) {
        return new Response(JSON.stringify({ data: { context: "", results: [] } }));
      }

      // Claude API
      if (urlStr.includes("anthropic.com")) {
        return new Response(JSON.stringify(mockClaudeResponse));
      }

      // Insert scout_insights
      if (urlStr.includes("/rest/v1/scout_insights") && init?.method === "POST") {
        return new Response(JSON.stringify([savedInsight]));
      }

      return new Response("{}", { status: 404 });
    });

    const res = await generateHandler(makeRequest({ playerId: "p1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.generated).toBe(1);
    expect(body.data.insights).toHaveLength(1);
    expect(body.data.insights[0].insight_type).toBe("breakout");
  });

  it("handles Claude API failure gracefully", async () => {
    const mockPlayer = {
      id: "p2", name: "Player Fail", age: 14, position: "CM",
      vsi: 60, phv_category: "ontme", phv_offset: 0,
      metrics: { speed: 65, technique: 70, vision: 78, stamina: 80, shooting: 50, defending: 82 },
      vsi_history: [60], minutes_played: 620, updated_at: "2026-01-01",
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/rest/v1/players")) return new Response(JSON.stringify([mockPlayer]));
      if (urlStr.includes("/rest/v1/player_analyses")) return new Response(JSON.stringify([]));
      if (urlStr.includes("/api/rag/query")) return new Response(JSON.stringify({ data: {} }));
      if (urlStr.includes("anthropic.com")) return new Response("Error", { status: 500 });
      return new Response("{}", { status: 404 });
    });

    const res = await generateHandler(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.generated).toBe(0);
    expect(body.data.errors).toBeDefined();
    expect(body.data.errors.length).toBeGreaterThan(0);
  });
});
