/**
 * /api/rag/{embed,ingest} · autenticación de servicio (CS-01)
 *
 * Antes comparaban el Bearer con `===` contra CRON_SECRET / ADMIN_SECRET /
 * SUPABASE_SERVICE_ROLE_KEY por su cuenta. Ahora delegan en withHandler
 * (hasValidServiceToken, tiempo constante): ADMIN_SECRET se rechaza y la cadena
 * seed → ingest → embed acepta los mismos tokens que el resto de endpoints de
 * servicio (CRON_SECRET / INTERNAL_API_TOKEN / SUPABASE_SERVICE_ROLE_KEY).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 19, limit: 20, resetAt: Date.now() + 60000 }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Solo "user-jwt" es un JWT de usuario válido; cualquier secreto compartido no lo es.
vi.mock("../../_lib/auth", () => ({
  verifyAuth: vi.fn(async (req: Request) =>
    req.headers.get("Authorization") === "Bearer user-jwt"
      ? { userId: "user-rag-1", email: "u@test", tenantId: null, error: null }
      : { userId: null, email: null, tenantId: null, error: "Token inválido" },
  ),
}));

vi.mock("../../_lib/ragSanitizer", () => ({
  sanitizeForIngestion: vi.fn().mockImplementation((content: string) => ({ content, blocked: false, riskScore: 0, detections: [] })),
}));

import embedHandler from "../_embed";
import ingestHandler from "../_ingest";

const LEAKED_ADMIN = "admin-secret-leaked-in-old-bundle";
const CRON = "cron-secret-value";
const INTERNAL = "internal-api-token-value";
const SERVICE_ROLE = "supabase-service-role-value";

const post = (path: string, body: unknown, token: string) =>
  new Request(`https://example.com/api/rag/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

describe("RAG embed/ingest · tokens de servicio", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
    process.env.CRON_SECRET = CRON;
    process.env.INTERNAL_API_TOKEN = INTERNAL;
    process.env.ADMIN_SECRET = LEAKED_ADMIN;
    delete process.env.VOYAGE_API_KEY; // embed degrada a embeddings null sin llamar a Voyage
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("embed: ADMIN_SECRET → 401 (control positivo: CRON_SECRET → 200 en el mismo entorno)", async () => {
    const denied = await embedHandler(post("embed", { texts: ["hola"] }, LEAKED_ADMIN));
    expect(denied.status).toBe(401);
    const allowed = await embedHandler(post("embed", { texts: ["hola"] }, CRON));
    expect(allowed.status).toBe(200);
  });

  it.each([
    ["CRON_SECRET", CRON],
    ["INTERNAL_API_TOKEN", INTERNAL],
    ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE],
    ["JWT de usuario", "user-jwt"],
  ])("embed: acepta %s", async (_label, token) => {
    const res = await embedHandler(post("embed", { texts: ["hola"] }, token));
    expect(res.status).toBe(200);
  });

  it("ingest: ADMIN_SECRET → 401 y ninguna llamada a Supabase ni a embed", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const res = await ingestHandler(post("ingest", { content: "doc", category: "drill" }, LEAKED_ADMIN));
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["CRON_SECRET", CRON],
    ["INTERNAL_API_TOKEN", INTERNAL],
    ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE],
    ["JWT de usuario", "user-jwt"],
  ])("ingest: acepta %s y reenvía el MISMO Authorization a embed", async (_label, token) => {
    const embedAuth: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/api/rag/embed")) {
        embedAuth.push((init?.headers as Record<string, string>).Authorization);
        return new Response(JSON.stringify({ data: { embeddings: [Array(4).fill(0.1)] } }));
      }
      if (u.includes("/rest/v1/knowledge_base")) return new Response(null, { status: 201 });
      return new Response("{}", { status: 404 });
    });
    const res = await ingestHandler(post("ingest", { content: "doc", category: "drill" }, token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { indexed: number } };
    expect(body.data.indexed).toBe(1);
    expect(embedAuth.length).toBeGreaterThan(0);
    expect(new Set(embedAuth)).toEqual(new Set([`Bearer ${token}`]));
  });
});
