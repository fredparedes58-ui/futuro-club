/**
 * VITAS · Tests unitarios de ownsMatch (autorización por tenant, sin BD live)
 *
 * ownsMatch() es la puerta de autorización a nivel de objeto de los endpoints
 * de api/tactical/. Como esos endpoints consultan Supabase con SERVICE_ROLE_KEY
 * (que SALTA la RLS), el scoping por tenant DEBE hacerse en código. Este test
 * blinda dos propiedades críticas:
 *
 *   1. Fail-closed: ante cualquier duda (sin tenant, sin Supabase, query no-ok,
 *      error de red, match inexistente) → false. Nunca "abre por defecto".
 *   2. El predicado consultado coincide EXACTAMENTE con el de la RLS de tenant
 *      (migración 055): analyses WHERE id = matchId AND tenant_id = tenant.
 *
 * No necesita Supabase: mockeamos `fetch`. La verificación end-to-end contra la
 * BD real (tenant A no puede leer/escribir el match de B) vive en el bloque
 * tactical de rls-isolation.test.ts (SKIP sin credenciales).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ownsMatch } from "../_lib/ownership";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const MATCH = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

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

describe("ownsMatch · autorización por tenant (fail-closed)", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("true cuando la analysis del match pertenece al tenant", async () => {
    const spy = mockFetchOnce((url) => {
      // Debe consultar por id + tenant_id (mismo predicado que la RLS 055)
      expect(url).toContain(`id=eq.${MATCH}`);
      expect(url).toContain(`tenant_id=eq.${TENANT_A}`);
      return { ok: true, json: async () => [{ id: MATCH }] };
    });
    expect(await ownsMatch(MATCH, TENANT_A)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("false cuando el match es de OTRO tenant (query devuelve [])", async () => {
    mockFetchOnce((url) => {
      expect(url).toContain(`tenant_id=eq.${TENANT_B}`);
      return { ok: true, json: async () => [] };
    });
    // El match existe pero pertenece a A; B pregunta por su tenant → RLS-equivalente vacío
    expect(await ownsMatch(MATCH, TENANT_B)).toBe(false);
  });

  it("false sin llamar a la red cuando no hay tenantId (JWT sin claim)", async () => {
    const spy = mockFetchOnce(() => ({ ok: true, json: async () => [{ id: MATCH }] }));
    expect(await ownsMatch(MATCH, null)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("false sin llamar a la red cuando no hay matchId", async () => {
    const spy = mockFetchOnce(() => ({ ok: true, json: async () => [{ id: MATCH }] }));
    expect(await ownsMatch(null, TENANT_A)).toBe(false);
    expect(await ownsMatch(undefined, TENANT_A)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("false para un match demo (no es UUID → PostgREST 400 → no-ok)", async () => {
    mockFetchOnce(() => ({ ok: false, json: async () => ({ code: "22P02" }) }));
    expect(await ownsMatch("demo-abc123", TENANT_A)).toBe(false);
  });

  it("false cuando la query devuelve no-ok (fail-closed)", async () => {
    mockFetchOnce(() => ({ ok: false }));
    expect(await ownsMatch(MATCH, TENANT_A)).toBe(false);
  });

  it("false cuando fetch lanza (error de red → fail-closed)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await ownsMatch(MATCH, TENANT_A)).toBe(false);
  });

  it("false cuando Supabase no está configurado", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const spy = mockFetchOnce(() => ({ ok: true, json: async () => [{ id: MATCH }] }));
    expect(await ownsMatch(MATCH, TENANT_A)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
