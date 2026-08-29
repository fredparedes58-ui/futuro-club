/**
 * VITAS · Tests unitarios de ownsPlayer (autorización por usuario, sin BD live)
 *
 * ownsPlayer() es la puerta de autorización a nivel de objeto de los endpoints
 * que sirven datos de UN jugador (api/analyses/reports.ts, api/reports/_pdf.ts,
 * api/players/_crud.ts). Como esos endpoints consultan Supabase con
 * SERVICE_ROLE_KEY (que SALTA la RLS), el check de propiedad DEBE hacerse en
 * código. Este test blinda dos propiedades críticas:
 *
 *   1. Fail-closed: ante cualquier duda (sin userId, sin playerId, sin Supabase,
 *      query no-ok, error de red) → false. Nunca "abre por defecto".
 *   2. El predicado consultado es players WHERE id = playerId AND user_id = userId
 *      (la propiedad por usuario del modelo).
 *
 * No necesita Supabase: mockeamos `fetch`. La verificación end-to-end contra la
 * BD real vive en rls-isolation.test.ts (SKIP sin credenciales).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ownsPlayer, ownsPlayerOrTenant, ownedPlayersOrFilter, ownsVideo } from "../_lib/ownership";

const USER_A = "aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb";
const TENANT_A = "cccccccc-3333-3333-3333-cccccccccccc";
const TENANT_B = "dddddddd-4444-4444-4444-dddddddddddd";
const PLAYER = "demo-a";

function mockFetchOnce(impl: (url: string) => { ok: boolean; json?: () => Promise<unknown> }) {
  const spy = vi.fn(async (url: string | URL | Request) => {
    const res = impl(String(url));
    return {
      ok: res.ok,
      json: res.json ?? (async () => []),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("ownsPlayer · autorización por usuario (fail-closed)", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("true cuando el jugador pertenece al usuario (query devuelve fila)", async () => {
    const spy = mockFetchOnce((url) => {
      // Predicado: id + user_id (propiedad por usuario)
      expect(url).toContain(`id=eq.${PLAYER}`);
      expect(url).toContain(`user_id=eq.${USER_A}`);
      return { ok: true, json: async () => [{ id: PLAYER }] };
    });
    expect(await ownsPlayer(PLAYER, USER_A)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("false cuando el jugador es de OTRO usuario (query devuelve []) — el caso IDOR", async () => {
    mockFetchOnce((url) => {
      expect(url).toContain(`user_id=eq.${USER_B}`);
      return { ok: true, json: async () => [] };
    });
    expect(await ownsPlayer(PLAYER, USER_B)).toBe(false);
  });

  it("false sin llamar a la red cuando no hay userId (JWT sin sub)", async () => {
    const spy = mockFetchOnce(() => ({ ok: true, json: async () => [{ id: PLAYER }] }));
    expect(await ownsPlayer(PLAYER, null)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("false sin llamar a la red cuando no hay playerId", async () => {
    const spy = mockFetchOnce(() => ({ ok: true, json: async () => [{ id: PLAYER }] }));
    expect(await ownsPlayer(null, USER_A)).toBe(false);
    expect(await ownsPlayer(undefined, USER_A)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("false cuando la query devuelve no-ok (fail-closed)", async () => {
    mockFetchOnce(() => ({ ok: false }));
    expect(await ownsPlayer(PLAYER, USER_A)).toBe(false);
  });

  it("false cuando fetch lanza (error de red → fail-closed)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await ownsPlayer(PLAYER, USER_A)).toBe(false);
  });

  it("false cuando Supabase no está configurado (sin red)", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const spy = mockFetchOnce(() => ({ ok: true, json: async () => [{ id: PLAYER }] }));
    expect(await ownsPlayer(PLAYER, USER_A)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("ownsPlayerOrTenant · usuario CON respaldo por tenant (fail-closed)", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("selecciona user_id,tenant_id y da true si el user_id del jugador coincide", async () => {
    const spy = mockFetchOnce((url) => {
      expect(url).toContain(`id=eq.${PLAYER}`);
      expect(url).toContain("select=user_id,tenant_id");
      return { ok: true, json: async () => [{ user_id: USER_A, tenant_id: TENANT_A }] };
    });
    expect(await ownsPlayerOrTenant(PLAYER, USER_A, TENANT_A)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("true por RESPALDO de tenant aunque el user_id no coincida (caso multi-seat)", async () => {
    // El jugador lo creó otro usuario (USER_A) pero mismo tenant → un miembro
    // (USER_B, tenant A) que generó/compartió el informe puede verlo.
    mockFetchOnce(() => ({ ok: true, json: async () => [{ user_id: USER_A, tenant_id: TENANT_A }] }));
    expect(await ownsPlayerOrTenant(PLAYER, USER_B, TENANT_A)).toBe(true);
  });

  it("false cuando ni user_id ni tenant coinciden (jugador de otra academia)", async () => {
    mockFetchOnce(() => ({ ok: true, json: async () => [{ user_id: USER_A, tenant_id: TENANT_A }] }));
    expect(await ownsPlayerOrTenant(PLAYER, USER_B, TENANT_B)).toBe(false);
  });

  it("no cuenta un tenant nulo del jugador como coincidencia (evita abrir por null==null)", async () => {
    mockFetchOnce(() => ({ ok: true, json: async () => [{ user_id: USER_A, tenant_id: null }] }));
    // USER_B con tenant null NO debe pasar por el respaldo (p.tenant_id es null).
    expect(await ownsPlayerOrTenant(PLAYER, USER_B, null)).toBe(false);
  });

  it("false sin llamar a la red cuando no hay ni userId ni tenantId", async () => {
    const spy = mockFetchOnce(() => ({ ok: true, json: async () => [{ user_id: USER_A, tenant_id: TENANT_A }] }));
    expect(await ownsPlayerOrTenant(PLAYER, null, null)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("false sin red cuando no hay playerId", async () => {
    const spy = mockFetchOnce(() => ({ ok: true, json: async () => [{ user_id: USER_A, tenant_id: TENANT_A }] }));
    expect(await ownsPlayerOrTenant(null, USER_A, TENANT_A)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("false cuando el jugador no existe (query devuelve [])", async () => {
    mockFetchOnce(() => ({ ok: true, json: async () => [] }));
    expect(await ownsPlayerOrTenant(PLAYER, USER_A, TENANT_A)).toBe(false);
  });

  it("false fail-closed: query no-ok / fetch lanza", async () => {
    mockFetchOnce(() => ({ ok: false }));
    expect(await ownsPlayerOrTenant(PLAYER, USER_A, TENANT_A)).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await ownsPlayerOrTenant(PLAYER, USER_A, TENANT_A)).toBe(false);
  });
});

describe("ownsVideo · autorización de VÍDEO (finalize/identify-player/candidates, fail-closed)", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("true para service-call, sin tocar la red", async () => {
    const spy = mockFetchOnce(() => ({ ok: true, json: async () => [] }));
    expect(await ownsVideo({ player_id: PLAYER }, null, null, true)).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("true si el uploader (videos.user_id) coincide, sin red", async () => {
    const spy = mockFetchOnce(() => ({ ok: true, json: async () => [] }));
    expect(await ownsVideo({ user_id: USER_A, player_id: PLAYER }, USER_A, null)).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("true si el tenant del vídeo coincide, sin red", async () => {
    const spy = mockFetchOnce(() => ({ ok: true, json: async () => [] }));
    expect(await ownsVideo({ tenant_id: TENANT_A, player_id: PLAYER }, USER_B, TENANT_A)).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("cae al jugador del vídeo (ownsPlayerOrTenant) si no casan user/tenant del vídeo", async () => {
    mockFetchOnce(() => ({ ok: true, json: async () => [{ user_id: USER_A, tenant_id: TENANT_A }] }));
    // El vídeo no tiene user_id/tenant propios, pero su player_id pertenece a USER_A.
    expect(await ownsVideo({ player_id: PLAYER }, USER_A, null)).toBe(true);
  });

  it("false (IDOR) si el vídeo es de otro tenant y su jugador es de otra academia", async () => {
    mockFetchOnce(() => ({ ok: true, json: async () => [{ user_id: USER_A, tenant_id: TENANT_A }] }));
    expect(await ownsVideo({ tenant_id: TENANT_A, player_id: PLAYER }, USER_B, TENANT_B)).toBe(false);
  });

  it("false sin player_id y sin coincidencia de user/tenant (fail-closed, sin red)", async () => {
    const spy = mockFetchOnce(() => ({ ok: true, json: async () => [] }));
    expect(await ownsVideo({ tenant_id: TENANT_A }, USER_B, TENANT_B)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("ownedPlayersOrFilter · scoping multi-fila (query .or)", () => {
  it("con tenant: incluye ambas cláusulas user_id + tenant_id", () => {
    expect(ownedPlayersOrFilter(USER_A, TENANT_A)).toBe(
      `user_id.eq.${USER_A},tenant_id.eq.${TENANT_A}`,
    );
  });

  it("sin tenant (null): solo user_id (no abre a otros tenants)", () => {
    expect(ownedPlayersOrFilter(USER_A, null)).toBe(`user_id.eq.${USER_A}`);
    expect(ownedPlayersOrFilter(USER_A, "")).toBe(`user_id.eq.${USER_A}`);
  });

  it("valida UUID: un valor no-UUID no se interpola (no inyección en .or)", () => {
    // userId no-UUID (p. ej. intento de inyección) → cláusula descartada →
    // fail-closed a UUID nil que no casa ningún jugador.
    expect(ownedPlayersOrFilter("evil,tenant_id.eq.x", null)).toBe(
      "user_id.eq.00000000-0000-0000-0000-000000000000",
    );
    // tenant no-UUID se ignora, user_id válido se mantiene.
    expect(ownedPlayersOrFilter(USER_A, "x,or,injection")).toBe(`user_id.eq.${USER_A}`);
  });
});
