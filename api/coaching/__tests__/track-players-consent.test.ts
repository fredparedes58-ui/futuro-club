/**
 * Tests · POST /api/coaching/track-players (proxy síncrono a Modal) con el gate de
 * consentimiento REAL (decisión del owner, 30 sep). Las llamadas de USUARIO traen la
 * declaración; un bloqueo es 400/500, NUNCA 503 (el cliente trata 503 como «inferencia
 * apagada → mock»). El contrato con Modal no cambia y las llamadas de servicio tampoco.
 *
 * Run: npx vitest run --config vitest.api.config.ts api/coaching/__tests__/track-players-consent.test.ts
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { ATTESTATION, consentFetch, emptyConsentDb, type ConsentDbState } from "../../_lib/__tests__/consentFetchMock";

vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, limit: 30, resetAt: Date.now() + 60000 }),
  getClientIP: vi.fn().mockReturnValue("203.0.113.7"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));
vi.mock("../../_lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ userId: "11111111-1111-4111-8111-111111111111", email: null, tenantId: null, error: null }),
}));
vi.mock("../../_lib/budgetGuard", () => ({
  isOverBudget: vi.fn().mockResolvedValue(false),
  recordSpendUsd: vi.fn().mockResolvedValue(undefined),
  budgetExceededResponse: vi.fn(),
}));

import { recordSpendUsd } from "../../_lib/budgetGuard";

const MODAL_URL = "https://modal.test/track";
const VIDEO_URL = "https://cdn.test/g-1/play_720p.mp4";
const MODAL_OK = {
  status: "ok", duration_sec: 10, frames_processed: 50, fps_source: 25, sample_fps: 5,
  players: [], ball: [], ball_stops: [], total_player_tracks: 0, total_ball_detections: 0,
};

let handler: (req: Request) => Promise<Response>;
let db: ConsentDbState;
let mock: ReturnType<typeof consentFetch>;
let modalCalls: Array<{ url: string; init: RequestInit }>;

beforeAll(async () => {
  handler = (await import("../_track-players")).default;
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MODAL_TRACK_URL = MODAL_URL;
  process.env.MODAL_API_KEY = "modal-key";
  process.env.SUPABASE_URL = "https://sb.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-key";
  process.env.INTERNAL_API_TOKEN = "svc-token";
  db = emptyConsentDb();
  modalCalls = [];
  mock = consentFetch(db, {
    fallback: async (url, init) => {
      if (url === MODAL_URL) {
        modalCalls.push({ url, init });
        return new Response(JSON.stringify(MODAL_OK), { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  vi.stubGlobal("fetch", mock.fn);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
});

const post = (body: Record<string, unknown>, auth = "Bearer user-jwt") =>
  handler(
    new Request("https://x.test/api/coaching/track-players", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify(body),
    }),
  );

describe("track-players · consentimiento", () => {
  it("sin declaración → 400 attestation_required (no 503); ni gasto ni Modal", async () => {
    const res = await post({ videoUrl: VIDEO_URL });
    expect(res.status).toBe(400);
    expect((await res.json()).errorDetail.code).toBe("attestation_required");
    expect(recordSpendUsd).not.toHaveBeenCalled();
    expect(modalCalls).toHaveLength(0);
  });

  it("base caída → 500 consent_check_failed (nunca 503 → el cliente no cae a mock en silencio)", async () => {
    db.failures.gdpr_audit_log = { status: 500, body: "boom" };
    const res = await post({ videoUrl: VIDEO_URL, attestation: ATTESTATION });
    expect(res.status).toBe(500);
    expect(modalCalls).toHaveLength(0);
  });

  it("los 503/400 de siempre van ANTES del gate (pingTrackingPipeline manda videoUrl vacío)", async () => {
    const res = await post({ videoUrl: "" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("missing_fields");
    expect(mock.calls).toHaveLength(0);
  });

  it("declarada → se guarda y Modal recibe el MISMO body y Bearer que antes", async () => {
    const res = await post({ videoUrl: VIDEO_URL, attestation: ATTESTATION });
    expect(res.status).toBe(200);
    expect(mock.inserts[0]).toMatchObject({ resource_type: "video_ref", resource_id: VIDEO_URL, metadata: { endpoint: "coaching/track-players" } });
    expect(modalCalls).toHaveLength(1);
    expect((modalCalls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer modal-key");
    const sent = JSON.parse(String(modalCalls[0].init.body));
    expect(sent).not.toHaveProperty("attestation");
    expect(sent.video_url).toBe(VIDEO_URL);
  });

  it("llamada de SERVICIO → el gate no se consulta", async () => {
    const res = await post({ videoUrl: VIDEO_URL }, "Bearer svc-token");
    expect(res.status).toBe(200);
    expect(mock.calls.some((c) => c.url.includes("/rest/v1/"))).toBe(false);
    expect(modalCalls).toHaveLength(1);
  });
});
