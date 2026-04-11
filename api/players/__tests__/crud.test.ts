/**
 * Tests for /api/players/crud — Player CRUD Endpoint
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true, remaining: 59, limit: 60, resetAt: Date.now() + 60000,
  }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("../../_lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ userId: "user-crud-123", error: null }),
}));

import crudHandler from "../_crud";

function makeRequest(
  method: string,
  body?: unknown,
  searchParams?: Record<string, string>,
): Request {
  const url = new URL("https://example.com/api/players/crud");
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, v);
  }
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
  };
  if (body && method !== "GET") {
    init.body = JSON.stringify(body);
  }
  return new Request(url.toString(), init);
}

const VALID_PLAYER = {
  name: "Lucas Moreno",
  age: 15,
  position: "RW",
  foot: "right" as const,
  height: 172,
  weight: 62,
  competitiveLevel: "Regional",
  minutesPlayed: 840,
  metrics: { speed: 80, technique: 74, vision: 71, stamina: 76, shooting: 78, defending: 45 },
};

describe("/api/players/crud", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 503 when Supabase not configured", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await crudHandler(makeRequest("GET"));
    expect(res.status).toBe(503);
  });

  describe("GET — list players", () => {
    it("fetches all players for user", async () => {
      const mockRows = [
        { id: "p1", data: { name: "Lucas", age: 15, vsi: 70 }, updated_at: "2026-01-01" },
        { id: "p2", data: { name: "Pablo", age: 14, vsi: 65 }, updated_at: "2026-01-02" },
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(mockRows), {
          headers: { "content-range": "0-1/2" },
        }),
      );

      const res = await crudHandler(makeRequest("GET"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.players).toHaveLength(2);
      expect(body.data.total).toBe(2);
      expect(body.data.players[0].name).toBe("Lucas");
    });

    it("fetches single player by id", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify([
          { id: "p1", data: { name: "Lucas", age: 15, vsi: 70 }, updated_at: "2026-01-01" },
        ]), { headers: { "content-range": "0-0/1" } }),
      );

      const res = await crudHandler(makeRequest("GET", undefined, { id: "p1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe("Lucas");
      expect(body.data.id).toBe("p1");
    });
  });

  describe("POST — create player", () => {
    it("creates player and calculates VSI", async () => {
      let insertedBody: Record<string, unknown> = {};
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
        insertedBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify([{
          id: insertedBody.id,
          data: insertedBody.data,
        }]), { status: 201 });
      });

      const res = await crudHandler(makeRequest("POST", VALID_PLAYER));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.name).toBe("Lucas Moreno");
      expect(body.data.vsi).toBeGreaterThan(0);
      expect(body.data.vsiHistory).toHaveLength(1);
      expect(insertedBody.user_id).toBe("user-crud-123");
    });

    it("rejects invalid player data", async () => {
      const res = await crudHandler(makeRequest("POST", { name: "A" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.errorDetail.code).toBe("VALIDATION_ERROR");
    });

    it("accepts client-provided id", async () => {
      let savedId = "";
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
        const parsed = JSON.parse(init?.body as string);
        savedId = parsed.id;
        return new Response(JSON.stringify([{ id: savedId, data: parsed.data }]), { status: 201 });
      });

      const res = await crudHandler(makeRequest("POST", { ...VALID_PLAYER, id: "custom-id-123" }));
      expect(res.status).toBe(201);
      expect(savedId).toBe("custom-id-123");
    });
  });

  describe("PATCH — update player", () => {
    it("updates metrics and recalculates VSI", async () => {
      const currentData = { name: "Lucas", metrics: VALID_PLAYER.metrics, vsi: 70, vsiHistory: [70] };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (urlStr.includes("select=data")) {
          return new Response(JSON.stringify([{ data: currentData }]));
        }
        if (init?.method === "PATCH") {
          const body = JSON.parse(init.body as string);
          return new Response(JSON.stringify([{ id: "p1", data: body.data }]));
        }
        return new Response("{}", { status: 404 });
      });

      const res = await crudHandler(makeRequest("PATCH", {
        id: "p1",
        metrics: { speed: 90, technique: 85, vision: 80, stamina: 75, shooting: 70, defending: 60 },
      }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.vsi).toBeGreaterThan(70);
      expect(body.data.vsiHistory).toHaveLength(2);
    });

    it("returns 404 for non-existent player", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify([])),
      );

      const res = await crudHandler(makeRequest("PATCH", { id: "nonexistent" }));
      expect(res.status).toBe(404);
    });

    it("updates name without affecting metrics", async () => {
      const currentData = { name: "Old Name", metrics: VALID_PLAYER.metrics, vsi: 70, vsiHistory: [70] };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (urlStr.includes("select=data")) {
          return new Response(JSON.stringify([{ data: currentData }]));
        }
        if (init?.method === "PATCH") {
          const body = JSON.parse(init.body as string);
          return new Response(JSON.stringify([{ id: "p1", data: body.data }]));
        }
        return new Response("{}", { status: 404 });
      });

      const res = await crudHandler(makeRequest("PATCH", { id: "p1", name: "New Name" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe("New Name");
      expect(body.data.vsi).toBe(70); // unchanged
    });
  });

  describe("DELETE — remove player", () => {
    it("deletes player by id", async () => {
      let deletedUrl = "";
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        if (init?.method === "DELETE") {
          deletedUrl = typeof url === "string" ? url : url.toString();
          return new Response(null, { status: 204 });
        }
        return new Response("{}", { status: 404 });
      });

      const res = await crudHandler(makeRequest("DELETE", { id: "p1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.deleted).toBe(true);
      expect(deletedUrl).toContain("id=eq.p1");
      expect(deletedUrl).toContain("user_id=eq.user-crud-123");
    });

    it("rejects DELETE without id", async () => {
      const res = await crudHandler(makeRequest("DELETE", {}));
      expect(res.status).toBe(400);
    });
  });
});
