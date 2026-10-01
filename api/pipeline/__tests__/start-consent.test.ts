/**
 * Tests · POST /api/pipeline/start (SoloDrill, /drill) con el gate de consentimiento REAL
 * (decisión del owner, 30 sep): jugador propio, declaración (guardada con la fila `videos`
 * de la subida, o en el body) y consentimiento parental de un menor de 14 conocido, todo
 * ANTES de leer Bunny/jugador y de llamar a Claude.
 *
 * Run: npx vitest run --config vitest.api.config.ts api/pipeline/__tests__/start-consent.test.ts
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { ATTESTATION, MINOR_BIRTH_DATE, consentFetch, emptyConsentDb, type ConsentDbState } from "../../_lib/__tests__/consentFetchMock";

const USER = "11111111-1111-4111-8111-111111111111";

vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 19, limit: 20, resetAt: Date.now() + 60000 }),
  getClientIP: vi.fn().mockReturnValue("203.0.113.7"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));
vi.mock("../../_lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ userId: "11111111-1111-4111-8111-111111111111", email: null, tenantId: null, error: null }),
}));
const ownsPlayer = vi.fn(async () => true);
vi.mock("../../_lib/ownership", async (orig) => ({
  ...(await orig<typeof import("../../_lib/ownership")>()),
  ownsPlayerOrTenant: (...a: unknown[]) => ownsPlayer(...(a as [])),
}));

let handler: (req: Request) => Promise<Response>;
let db: ConsentDbState;
let mock: ReturnType<typeof consentFetch>;
const claudeCalls = () => mock.calls.filter((c) => c.url.includes("api.anthropic.com"));

beforeAll(async () => {
  handler = (await import("../_start")).default;
});

beforeEach(() => {
  process.env.SUPABASE_URL = "https://sb.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-key";
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.BUNNY_STREAM_LIBRARY_ID;
  delete process.env.BUNNY_STREAM_API_KEY;
  ownsPlayer.mockReset();
  ownsPlayer.mockImplementation(async () => true);
  db = emptyConsentDb();
  db.birthDates.p1 = null;
  mock = consentFetch(db, {
    fallback: async (url) => {
      if (url.includes("api.anthropic.com")) {
        return new Response(JSON.stringify({ content: [{ type: "text", text: "{}" }] }), { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  vi.stubGlobal("fetch", mock.fn);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
});

const post = (body: Record<string, unknown>) =>
  handler(
    new Request("https://x.test/api/pipeline/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer user-jwt" },
      body: JSON.stringify({ videoId: "guid-1", playerId: "p1", ...body }),
    }),
  );

describe("pipeline/start · consentimiento", () => {
  it("jugador AJENO → 403 antes de leer su fecha de nacimiento", async () => {
    ownsPlayer.mockImplementation(async () => false);
    const res = await post({ attestation: ATTESTATION });
    expect(res.status).toBe(403);
    expect(mock.calls.some((c) => c.url.includes("/rest/v1/players"))).toBe(false);
    expect(claudeCalls()).toHaveLength(0);
  });

  it("sin declaración (vídeo sin fila) → 400 attestation_required; Claude no se llama", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect((await res.json()).errorDetail.code).toBe("attestation_required");
    expect(claudeCalls()).toHaveLength(0);
  });

  it("menor de 14 conocido sin consentimiento parental → 403", async () => {
    db.birthDates.p1 = MINOR_BIRTH_DATE;
    const res = await post({ attestation: ATTESTATION });
    expect(res.status).toBe(403);
    expect((await res.json()).errorDetail.code).toBe("parental_consent_required");
    expect(claudeCalls()).toHaveLength(0);
  });

  it("vídeo subido por VideoUpload (fila videos propia + declaración guardada) → se analiza", async () => {
    db.videos.push({ id: "guid-1", user_id: USER, tenant_id: null, player_id: null, bunny_video_id: "guid-1" });
    db.storedAttestations.push({ resource_type: "videos", resource_id: "guid-1" });
    const res = await post({});
    expect(res.status).toBe(200);
    expect(mock.inserts).toHaveLength(0);
    expect(claudeCalls()).toHaveLength(1);
  });
});
