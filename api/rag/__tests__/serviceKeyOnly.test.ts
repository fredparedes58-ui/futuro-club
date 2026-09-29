/**
 * /api/rag/{query,ingest,feedback} — solo service_role, sin fallback a la clave anon.
 *
 * La migración 072 revoca a anon/authenticated las RPC SECURITY DEFINER del RAG
 * (match_knowledge, search_knowledge_text) y quita la política INSERT abierta de
 * rag_feedback. Estos endpoints NO deben volver a usar VITE_SUPABASE_ANON_KEY:
 * sin SUPABASE_SERVICE_ROLE_KEY responden 503 (fail-closed) sin llamar a Supabase.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 19, limit: 20, resetAt: Date.now() + 60000 }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("../../_lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ userId: "user-rag-1", email: "u@test", tenantId: null, error: null }),
}));

vi.mock("../../_lib/ragSanitizer", () => ({
  sanitizeForIngestion: vi.fn().mockImplementation((content: string) => ({ content, blocked: false, riskScore: 0, detections: [] })),
  buildSecureContext: vi.fn().mockReturnValue(""),
}));

import queryHandler from "../_query";
import ingestHandler from "../_ingest";
import feedbackHandler from "../_feedback";

const post = (path: string, body: unknown) =>
  new Request(`https://example.com/api/rag/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer user-jwt" },
    body: JSON.stringify(body),
  });

describe("RAG endpoints · solo service_role", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.VITE_SUPABASE_ANON_KEY = "public-anon-key";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.CRON_SECRET;
    delete process.env.ADMIN_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it.each([
    ["query", queryHandler, { query: "drills de velocidad" }],
    ["ingest", ingestHandler, { content: "doc", category: "drill" }],
    ["feedback", feedbackHandler, { traceId: "t1", score: 4 }],
  ] as const)("%s: con solo la clave anon → 503 RAG_NOT_CONFIGURED y ninguna llamada a Supabase", async (path, handler, body) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const res = await handler(post(path, body));
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(JSON.stringify(json)).toContain("RAG_NOT_CONFIGURED");
    const supabaseCalls = fetchSpy.mock.calls.filter(([u]) => String(u).includes("supabase.co"));
    expect(supabaseCalls).toHaveLength(0);
    for (const [, init] of fetchSpy.mock.calls) {
      expect(JSON.stringify(init?.headers ?? {})).not.toContain("public-anon-key");
    }
  });

  it("query: con service key, la RPC de texto se llama con la service key (nunca la anon)", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    const seen: Array<Record<string, string>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/api/rag/embed")) return new Response(JSON.stringify({ data: { embeddings: [null] } }));
      if (u.includes("/rest/v1/rpc/search_knowledge_text")) {
        seen.push(init?.headers as Record<string, string>);
        return new Response("[]", { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    const res = await queryHandler(post("query", { query: "drills" }));
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].apikey).toBe("service-key");
    expect(seen[0].Authorization).toBe("Bearer service-key");
  });
});
