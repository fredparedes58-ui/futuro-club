/**
 * Tests · track-async con el gate de consentimiento REAL (decisión del owner, 30 sep) y
 * prueba de que el contrato con Modal NO cambia para un vídeo declarado.
 *
 *   - llamada de usuario sin declaración / menor de 14 conocido sin consentimiento →
 *     400 / 403 con el código, sin dedup, sin insert y SIN tocar Modal (nunca 503: el
 *     cliente trata 503 como «inferencia apagada → datos de ejemplo»);
 *   - llamada de usuario declarada → el spawn a Modal es BYTE A BYTE el de antes
 *     (mismo body serializado, mismo Authorization Bearer MODAL_API_KEY) y el callback
 *     firmado de Modal (api/webhooks/modal-tracking, HMAC MODAL_CALLBACK_SECRET) sigue
 *     cerrando el job igual;
 *   - llamada de SERVICIO → el gate no se consulta (camino sin cambios).
 *
 * Run: npx vitest run --config vitest.api.config.ts api/coaching/__tests__/track-async-consent.test.ts
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { hmacSha256Hex } from "../../_lib/edgeCrypto";
import { ATTESTATION, MINOR_BIRTH_DATE, consentFetch, emptyConsentDb, type ConsentDbState } from "../../_lib/__tests__/consentFetchMock";

const USER = "11111111-1111-4111-8111-111111111111";

vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, limit: 30, resetAt: Date.now() + 60000 }),
  getClientIP: vi.fn().mockReturnValue("203.0.113.7"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("../../_lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ userId: "11111111-1111-4111-8111-111111111111", tenantId: null, error: null }),
}));

vi.mock("../../_lib/budgetGuard", () => ({
  isOverBudget: vi.fn().mockResolvedValue(false),
  recordSpendUsd: vi.fn().mockResolvedValue(undefined),
  budgetExceededResponse: vi.fn(),
}));

// Propiedad del jugador: aquí se prueba el gate de consentimiento, no ownership.ts.
vi.mock("../../_lib/ownership", async (orig) => ({
  ...(await orig<typeof import("../../_lib/ownership")>()),
  ownsPlayerOrTenant: vi.fn(async () => true),
}));

process.env.VITE_SUPABASE_URL = "https://sb.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-key";

let trackAsync: (req: Request) => Promise<Response>;
let modalTracking: (req: Request) => Promise<Response>;
beforeAll(async () => {
  trackAsync = (await import("../_track-async")).default;
  modalTracking = (await import("../../webhooks/modal-tracking")).default;
});

const VIDEO_URL = "https://cdn.test/guid-1/play_720p.mp4";
const MODAL_URL = "https://modal.test/track_async";

let db: ConsentDbState;
let mock: ReturnType<typeof consentFetch>;
let modalCalls: Array<{ url: string; init: RequestInit }>;
let jobPatches: Array<Record<string, unknown>>;

beforeEach(() => {
  process.env.MODAL_TRACK_ASYNC_URL = MODAL_URL;
  process.env.MODAL_API_KEY = "modal-key";
  process.env.MODAL_CALLBACK_SECRET = "cb-secret";
  process.env.VITAS_PUBLIC_URL = "https://vitas.test";
  process.env.BUNNY_CDN_HOSTNAME = "cdn.test";
  process.env.INTERNAL_API_TOKEN = "svc-token";
  delete process.env.PUBLIC_URL;
  delete process.env.VITE_BUNNY_CDN_HOSTNAME;
  db = emptyConsentDb();
  modalCalls = [];
  jobPatches = [];
  mock = consentFetch(db, {
    fallback: async (url, init) => {
      if (url === MODAL_URL) {
        modalCalls.push({ url, init });
        return new Response(JSON.stringify({ call_id: "call-9" }), { status: 200 });
      }
      if (url.startsWith("https://sb.test/rest/v1/tracking_jobs")) {
        const method = (init.method ?? "GET").toUpperCase();
        if (method === "GET") return new Response("[]", { status: 200 }); // dedup vacío
        if (method === "POST") return new Response(JSON.stringify([{ id: "job-1" }]), { status: 201 });
        if (method === "PATCH") {
          jobPatches.push(JSON.parse(String(init.body)) as Record<string, unknown>);
          return new Response(JSON.stringify([{ id: "job-1" }]), { status: 200 });
        }
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  vi.stubGlobal("fetch", mock.fn);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function post(body: Record<string, unknown>, auth = "Bearer user-jwt"): Request {
  return new Request("https://example.com/api/coaching/track-async", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify(body),
  });
}

const touchedTrackingJobs = () => mock.calls.some((c) => c.url.includes("/rest/v1/tracking_jobs"));

describe("track-async · gate de consentimiento (llamadas de usuario)", () => {
  it("sin declaración → 400 attestation_required; ni dedup, ni insert, ni Modal", async () => {
    const res = await trackAsync(post({ videoUrl: VIDEO_URL }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.errorDetail).toMatchObject({ code: "attestation_required", attestationVersion: "2026-09-28.v1" });
    expect(touchedTrackingJobs()).toBe(false);
    expect(modalCalls).toHaveLength(0);
  });

  it("jugador menor de 14 conocido sin consentimiento parental → 403; sin tocar Modal", async () => {
    db.birthDates.p1 = MINOR_BIRTH_DATE;
    const res = await trackAsync(post({ videoUrl: VIDEO_URL, playerId: "p1", attestation: ATTESTATION }));
    expect(res.status).toBe(403);
    expect((await res.json()).errorDetail.code).toBe("parental_consent_required");
    expect(touchedTrackingJobs()).toBe(false);
    expect(modalCalls).toHaveLength(0);
  });

  it("no se puede comprobar (base caída) → 500 consent_check_failed, NUNCA 503", async () => {
    db.failures.gdpr_audit_log = { status: 500, body: "boom" };
    const res = await trackAsync(post({ videoUrl: VIDEO_URL, attestation: ATTESTATION }));
    expect(res.status).toBe(500);
    expect((await res.json()).errorDetail.code).toBe("consent_check_failed");
    expect(modalCalls).toHaveLength(0);
  });
});

describe("track-async · Modal sin cambios para un vídeo declarado", () => {
  it("spawn BYTE A BYTE igual que antes + declaración guardada (quién = JWT) + callback firmado cierra el job", async () => {
    const res = await trackAsync(post({ videoUrl: VIDEO_URL, attestation: ATTESTATION }));
    expect(res.status).toBe(202);

    // Declaración guardada ANTES del spawn, con el usuario del JWT.
    expect(mock.inserts).toHaveLength(1);
    expect(mock.inserts[0]).toMatchObject({
      user_id: USER,
      action: "video_analysis_attested",
      resource_type: "video_ref",
      resource_id: VIDEO_URL,
      metadata: { version: "2026-09-28.v1", endpoint: "coaching/track-async" },
    });

    // Request a Modal: misma URL, mismas cabeceras y el MISMO body serializado que el
    // código anterior al gate (claves y orden: video_url, sample_fps, classes, job_id,
    // callback_url). Nada del consentimiento viaja a Modal.
    expect(modalCalls).toHaveLength(1);
    const { init } = modalCalls[0];
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer modal-key" });
    expect(init.body).toBe(
      JSON.stringify({
        video_url: VIDEO_URL,
        sample_fps: 5,
        classes: [0, 32],
        job_id: "job-1",
        callback_url: "https://vitas.test/api/webhooks/modal-tracking",
      }),
    );

    // Callback de Modal (contrato HMAC X-Vitas-Signature sobre el rawBody) → done.
    const raw = JSON.stringify({ job_id: "job-1", status: "done", result: { totalPlayerTracks: 20 } });
    const sig = await hmacSha256Hex("cb-secret", raw);
    const cb = await modalTracking(
      new Request("https://example.com/api/webhooks/modal-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Vitas-Signature": sig },
        body: raw,
      }),
    );
    expect(cb.status).toBe(200);
    const done = jobPatches.find((p) => p.status === "done");
    expect(done).toBeDefined();
    expect((done!.result as { totalPlayerTracks: number }).totalPlayerTracks).toBe(20);
  });

  it("llamada de SERVICIO → el gate no se consulta y el spawn es el mismo", async () => {
    const res = await trackAsync(post({ videoUrl: VIDEO_URL }, "Bearer svc-token"));
    expect(res.status).toBe(202);
    expect(mock.calls.some((c) => c.url.includes("/rest/v1/gdpr_audit_log"))).toBe(false);
    expect(modalCalls).toHaveLength(1);
    expect(JSON.parse(String(modalCalls[0].init.body))).toEqual({
      video_url: VIDEO_URL,
      sample_fps: 5,
      classes: [0, 32],
      job_id: "job-1",
      callback_url: "https://vitas.test/api/webhooks/modal-tracking",
    });
  });
});
