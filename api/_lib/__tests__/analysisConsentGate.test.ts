/**
 * Tests · api/_lib/analysisConsentGate — decisión del owner (30 sep): declaración del
 * entrenador SIEMPRE (guardada con el vídeo: quién/cuándo/versión) + consentimiento
 * parental verificado si el jugador es menor de 14 CONOCIDO. Falla cerrado, nunca 503.
 * Run: npx vitest run --config vitest.api.config.ts api/_lib/__tests__/analysisConsentGate.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  enforceClipConsent,
  enforceStoredConsentForVideoUrl,
  enforceUserVideoObservationConsent,
  bunnyGuidFromVideoUrl,
  videoUrlReferencesBunnyGuid,
} from "../analysisConsentGate";
import { ATTESTATION, consentFetch, emptyConsentDb, type ConsentDbState } from "./consentFetchMock";

const USER = "11111111-1111-4111-8111-111111111111";
const TENANT = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-09-30T12:00:00Z");
const actor = { userId: USER, tenantId: TENANT, ip: "203.0.113.7" };

let db: ConsentDbState;
let mock: ReturnType<typeof consentFetch>;

beforeEach(() => {
  process.env.SUPABASE_URL = "https://sb.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-key";
  db = emptyConsentDb();
  mock = consentFetch(db);
  vi.stubGlobal("fetch", mock.fn);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

const base = {
  resource: { type: "videos" as const, id: "vid-1", bunnyVideoId: "g-1" },
  actor,
  endpoint: "test",
  now: NOW,
};

describe("declaración del entrenador", () => {
  it("sin declaración (ni body ni guardada) → 400 attestation_required, sin guardar nada", async () => {
    const r = await enforceClipConsent({ ...base, playerId: null });
    expect(r).toMatchObject({ allowed: false, code: "attestation_required", status: 400 });
    expect(mock.inserts).toHaveLength(0);
  });

  it.each([
    [{ accepted: false, version: "2026-09-28.v1" }],
    [{ accepted: true, version: "2020-01-01.v0" }],
    [{ accepted: true }],
    ["true"],
  ])("declaración inválida o de otra versión (%j) → attestation_required", async (attestation) => {
    const r = await enforceClipConsent({ ...base, attestation, playerId: null });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("attestation_required");
  });

  it("declaración del body → se GUARDA: quién = usuario del JWT, versión, recurso, sin tomar nada más del body", async () => {
    const r = await enforceClipConsent({ ...base, attestation: { ...ATTESTATION }, playerId: null, scope: "team" });
    expect(r).toMatchObject({ allowed: true, attestation: "recorded" });
    expect(mock.inserts).toHaveLength(1);
    expect(mock.inserts[0]).toEqual({
      user_id: USER,
      tenant_id: TENANT,
      action: "video_analysis_attested",
      resource_type: "videos",
      resource_id: "vid-1",
      metadata: { version: "2026-09-28.v1", scope: "team", player_id: null, bunny_video_id: "g-1", endpoint: "test" },
      ip: "203.0.113.7",
    });
    // "cuándo" = reloj de la base (DEFAULT now()): el cliente no manda created_at.
    expect(mock.inserts[0]).not.toHaveProperty("created_at");
    const post = mock.calls.find((c) => c.init.method === "POST")!;
    expect((post.init.headers as Record<string, string>).Authorization).toBe("Bearer svc-key");
  });

  it("idempotente: la misma declaración del mismo usuario para el mismo vídeo no se duplica", async () => {
    await enforceClipConsent({ ...base, attestation: ATTESTATION, playerId: null });
    await enforceClipConsent({ ...base, attestation: ATTESTATION, playerId: null });
    expect(mock.inserts).toHaveLength(1);
  });

  it("declaración ya GUARDADA para la fila videos → basta en rutas automáticas (storedOnly)", async () => {
    db.storedAttestations.push({ resource_type: "videos", resource_id: "vid-1" });
    const r = await enforceClipConsent({ ...base, storedOnly: true, playerId: null, actor: { userId: null, tenantId: null } });
    expect(r).toMatchObject({ allowed: true, attestation: "stored" });
  });

  it("storedOnly ignora la declaración del body (una ruta sin usuario no puede declarar)", async () => {
    const r = await enforceClipConsent({ ...base, storedOnly: true, attestation: ATTESTATION, playerId: null });
    expect(r).toMatchObject({ allowed: false, code: "attestation_required" });
    expect(mock.inserts).toHaveLength(0);
  });

  it("sin usuario, una declaración en el body no cuenta", async () => {
    const r = await enforceClipConsent({ ...base, attestation: ATTESTATION, playerId: null, actor: { userId: null, tenantId: null } });
    expect(r).toMatchObject({ allowed: false, code: "attestation_required" });
  });

  it("una declaración 'video_ref' guardada NUNCA desbloquea un vídeo 'videos'", async () => {
    db.storedAttestations.push({ resource_type: "video_ref", resource_id: "vid-1" });
    const r = await enforceClipConsent({ ...base, storedOnly: true, playerId: null });
    expect(r).toMatchObject({ allowed: false, code: "attestation_required" });
  });

  it("una declaración guardada de OTRA versión no cuenta", async () => {
    db.storedAttestations.push({ resource_type: "videos", resource_id: "vid-1", version: "2026-01-01.v0" });
    const r = await enforceClipConsent({ ...base, storedOnly: true, playerId: null });
    expect(r.allowed).toBe(false);
  });

  it("video_ref: no se busca guardada, la declaración tiene que venir en la petición", async () => {
    db.storedAttestations.push({ resource_type: "video_ref", resource_id: "local-1" });
    const r = await enforceClipConsent({ ...base, resource: { type: "video_ref", id: "local-1" }, playerId: null });
    expect(r).toMatchObject({ allowed: false, code: "attestation_required" });
  });

  it("record:false → decide pero NO guarda (el llamador la guarda cuando existe el id)", async () => {
    const r = await enforceClipConsent({ ...base, attestation: ATTESTATION, playerId: null, record: false, lookupStored: false });
    expect(r).toMatchObject({ allowed: true, attestation: "pending", pendingAttestation: ATTESTATION });
    expect(mock.inserts).toHaveLength(0);
  });

  it("tenant/ip raros no van a columnas uuid/inet (un INSERT roto bloquearía todo)", async () => {
    await enforceClipConsent({ ...base, attestation: ATTESTATION, playerId: null, actor: { userId: USER, tenantId: "no-uuid", ip: "unknown" } });
    expect(mock.inserts[0]).toMatchObject({ tenant_id: null, ip: null });
  });
});

describe("menor de 14 conocido → consentimiento parental de parental_consents", () => {
  it("fecha de nacimiento desconocida (NULL) → basta la declaración; NO se consulta parental_consents", async () => {
    db.birthDates.p1 = null;
    const r = await enforceClipConsent({ ...base, attestation: ATTESTATION, playerId: "p1" });
    expect(r).toMatchObject({ allowed: true, minor: "unknown" });
    expect(mock.calls.some((c) => c.url.includes("parental_consents"))).toBe(false);
  });

  it("14 años cumplidos → basta la declaración", async () => {
    db.birthDates.p1 = "2012-09-30"; // cumple 14 hoy
    const r = await enforceClipConsent({ ...base, attestation: ATTESTATION, playerId: "p1" });
    expect(r).toMatchObject({ allowed: true, minor: "not_minor" });
  });

  it("13 años (la víspera de cumplir 14) sin consentimiento → 403 parental_consent_required, sin guardar la declaración", async () => {
    db.birthDates.p1 = "2012-10-01";
    const r = await enforceClipConsent({ ...base, attestation: ATTESTATION, playerId: "p1" });
    expect(r).toMatchObject({ allowed: false, code: "parental_consent_required", status: 403, minor: "minor" });
    expect(mock.inserts).toHaveLength(0);
  });

  it("13 años con consentimiento verificado y no retirado → permitido; la consulta usa el predicado canónico", async () => {
    db.birthDates.p1 = "2013-05-01";
    db.activeConsents.push("p1");
    const r = await enforceClipConsent({ ...base, attestation: ATTESTATION, playerId: "p1" });
    expect(r).toMatchObject({ allowed: true, minor: "minor" });
    const q = mock.calls.find((c) => c.url.includes("/parental_consents"))!.url;
    expect(q).toContain("email_verified=is.true");
    expect(q).toContain("withdrawn_at=is.null");
    expect(q).toContain("player_id=eq.p1");
  });

  it("vídeo de EQUIPO (sin jugador) → la comprobación por jugador no aplica", async () => {
    const r = await enforceClipConsent({ ...base, attestation: ATTESTATION, playerId: null });
    expect(r.allowed).toBe(true);
    expect(mock.calls.some((c) => c.url.includes("/players"))).toBe(false);
  });

  it("columna birth_date inexistente (036 sin aplicar) → fecha desconocida, basta la declaración", async () => {
    db.failures.players = { status: 400, body: JSON.stringify({ code: "42703", message: "column players.birth_date does not exist" }) };
    const r = await enforceClipConsent({ ...base, attestation: ATTESTATION, playerId: "p1" });
    expect(r).toMatchObject({ allowed: true, minor: "unknown" });
  });

  it("jugador inexistente → falla cerrado (500), nunca 'permitido'", async () => {
    const r = await enforceClipConsent({ ...base, attestation: ATTESTATION, playerId: "no-existe" });
    expect(r).toMatchObject({ allowed: false, code: "consent_check_failed", status: 500 });
  });

  it("fecha que no es una fecha → falla cerrado", async () => {
    db.birthDates.p1 = "2014-02-30";
    const r = await enforceClipConsent({ ...base, attestation: ATTESTATION, playerId: "p1" });
    expect(r).toMatchObject({ allowed: false, code: "consent_check_failed" });
  });
});

describe("falla cerrado (nunca 503)", () => {
  it.each(["gdpr_audit_log", "parental_consents"])("error de %s → consent_check_failed 500", async (table) => {
    db.birthDates.p1 = "2014-01-01";
    db.failures[table] = { status: 500, body: "boom" };
    const r = await enforceClipConsent({ ...base, attestation: ATTESTATION, playerId: "p1", storedOnly: table === "gdpr_audit_log" });
    expect(r).toMatchObject({ allowed: false, code: "consent_check_failed", status: 500 });
  });

  it("no se puede GUARDAR la declaración → no se analiza (500)", async () => {
    db.failures.gdpr_insert = { status: 401, body: "permission denied" };
    const r = await enforceClipConsent({ ...base, attestation: ATTESTATION, playerId: null });
    expect(r).toMatchObject({ allowed: false, code: "consent_check_failed", status: 500 });
  });

  it("gdpr_audit_log inexistente (PGRST205) → 500, no permitido", async () => {
    db.failures.gdpr_audit_log = { status: 404, body: JSON.stringify({ code: "PGRST205" }) };
    const r = await enforceClipConsent({ ...base, attestation: ATTESTATION, playerId: null });
    expect(r).toMatchObject({ allowed: false, code: "consent_check_failed" });
  });

  it("sin Supabase configurado → 500 sin llamar a nada", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await enforceClipConsent({ ...base, attestation: ATTESTATION, playerId: null });
    expect(r).toMatchObject({ allowed: false, code: "consent_check_failed", status: 500 });
    expect(mock.calls).toHaveLength(0);
  });

  it("el motivo sale en el idioma pedido", async () => {
    const r = await enforceClipConsent({ ...base, playerId: null, locale: "en" });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.gate_reason).toMatch(/declaration/i);
  });
});

describe("helpers de vídeo", () => {
  it("videoUrlReferencesBunnyGuid: el GUID tiene que ser un segmento de la ruta", () => {
    expect(videoUrlReferencesBunnyGuid("https://cdn.test/g-1/play_720p.mp4", "g-1")).toBe(true);
    expect(videoUrlReferencesBunnyGuid("https://cdn.test/g-10/play_720p.mp4", "g-1")).toBe(false);
    expect(videoUrlReferencesBunnyGuid("https://cdn.test/x/play.mp4?g-1", "g-1")).toBe(false);
    expect(videoUrlReferencesBunnyGuid("https://cdn.test/g-1/play.mp4", null)).toBe(false);
  });

  it("bunnyGuidFromVideoUrl: pull zone (primer segmento) y API de librería (tras /videos/)", () => {
    expect(bunnyGuidFromVideoUrl("https://vz-1.b-cdn.net/abc-guid/play_720p.mp4")).toBe("abc-guid");
    expect(bunnyGuidFromVideoUrl("https://video.bunnycdn.com/library/42/videos/abc-guid/play.mp4")).toBe("abc-guid");
    expect(bunnyGuidFromVideoUrl("not a url")).toBeNull();
  });

  const ownsYes = async () => true;
  const ownsNo = async () => false;

  it("enforceStoredConsentForVideoUrl: fila videos PROPIA por GUID + declaración guardada → permitido", async () => {
    db.videos.push({ id: "g-1", user_id: USER, tenant_id: TENANT, player_id: null, bunny_video_id: "g-1" });
    db.storedAttestations.push({ resource_type: "videos", resource_id: "g-1" });
    const r = await enforceStoredConsentForVideoUrl({ videoUrl: "https://cdn.test/g-1/play_720p.mp4", actor, endpoint: "t", ownsVideo: ownsYes });
    expect(r.allowed).toBe(true);
  });

  it("enforceStoredConsentForVideoUrl: vídeo AJENO con declaración de su dueño → bloqueado (no vale para otro)", async () => {
    db.videos.push({ id: "g-1", user_id: "99999999-9999-4999-8999-999999999999", tenant_id: null, player_id: null, bunny_video_id: "g-1" });
    db.storedAttestations.push({ resource_type: "videos", resource_id: "g-1" });
    const r = await enforceStoredConsentForVideoUrl({ videoUrl: "https://cdn.test/g-1/play_720p.mp4", actor, endpoint: "t", ownsVideo: ownsNo });
    expect(r).toMatchObject({ allowed: false, code: "attestation_required" });
  });

  it("enforceStoredConsentForVideoUrl: sin fila videos → attestation_required", async () => {
    const r = await enforceStoredConsentForVideoUrl({ videoUrl: "https://cdn.test/g-9/play_720p.mp4", actor, endpoint: "t", ownsVideo: ownsYes });
    expect(r).toMatchObject({ allowed: false, code: "attestation_required" });
  });

  it("enforceStoredConsentForVideoUrl: vídeo con jugador menor de 14 sin consentimiento → parental_consent_required", async () => {
    db.videos.push({ id: "g-2", user_id: USER, tenant_id: TENANT, player_id: "p1", bunny_video_id: "g-2" });
    db.storedAttestations.push({ resource_type: "videos", resource_id: "g-2" });
    // Este helper usa el reloj real: 10 años antes de hoy ⇒ menor de 14 siempre.
    db.birthDates.p1 = `${new Date().getUTCFullYear() - 10}-01-01`;
    const r = await enforceStoredConsentForVideoUrl({ videoUrl: "https://cdn.test/g-2/play_720p.mp4", actor, endpoint: "t", ownsVideo: ownsYes });
    expect(r).toMatchObject({ allowed: false, code: "parental_consent_required" });
  });
});

describe("enforceUserVideoObservationConsent (llamadas de usuario a video-observation)", () => {
  const owns = vi.fn(async () => true);
  const call = (over: Record<string, unknown> = {}) =>
    enforceUserVideoObservationConsent({
      videoId: "g-1",
      videoUrl: "https://cdn.test/g-1/play_720p.mp4",
      hasBase64: false,
      attestation: ATTESTATION,
      scope: "team",
      actor,
      ownsVideo: owns,
      ...over,
    });

  beforeEach(() => {
    owns.mockResolvedValue(true);
    db.videos.push({ id: "g-1", user_id: USER, tenant_id: TENANT, player_id: null, bunny_video_id: "g-1" });
  });

  it("fichero en base64 → 400 video_reference_required", async () => {
    const r = await call({ hasBase64: true });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.response.status).toBe(400);
      expect((await r.response.json()).errorDetail.code).toBe("video_reference_required");
    }
  });

  it("sin videoId → 400 video_reference_required", async () => {
    const r = await call({ videoId: undefined });
    expect(r.allowed).toBe(false);
  });

  it("vídeo ajeno → 403", async () => {
    owns.mockResolvedValue(false);
    const r = await call();
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.response.status).toBe(403);
  });

  it("URL de OTRO vídeo → 400 video_url_mismatch", async () => {
    const r = await call({ videoUrl: "https://cdn.test/otro-guid/play_720p.mp4" });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect((await r.response.json()).errorDetail.code).toBe("video_url_mismatch");
  });

  it("ámbito jugador sobre un vídeo sin jugador → 400 (no se puede comprobar al menor)", async () => {
    const r = await call({ scope: "player" });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect((await r.response.json()).errorDetail.code).toBe("player_scope_requires_player_video");
  });

  it("sin declaración → 400 attestation_required", async () => {
    const r = await call({ attestation: undefined });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect((await r.response.json()).errorDetail.code).toBe("attestation_required");
  });

  it("vídeo propio + URL correcta + declaración → permitido y guardado con la fila", async () => {
    const r = await call();
    expect(r.allowed).toBe(true);
    expect(mock.inserts[0]).toMatchObject({ resource_type: "videos", resource_id: "g-1" });
  });
});
