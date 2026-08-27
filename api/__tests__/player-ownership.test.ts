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
import { ownsPlayer } from "../_lib/ownership";

const USER_A = "aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb";
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
