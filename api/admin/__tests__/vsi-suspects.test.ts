/**
 * GET /api/admin/vsi-suspects — orden de despliegue.
 *
 * El código se despliega ANTES de que el operador aplique la migración 070. Sin la vista
 * v_vsi_default_suspects, PostgREST responde 404 (PGRST205): el endpoint debe devolver
 * un gate explícito (503 + código), nunca un 500. Con la vista, lista las filas sin
 * nombres de jugador (minimización: son menores).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.ADMIN_EMAILS = "admin@vitas.test";
});

vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true, remaining: 29, limit: 30, resetAt: Date.now() + 60000,
  }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("../../_lib/auth", () => ({
  verifyAuth: vi.fn(async () => ({ userId: "admin-1", email: "admin@vitas.test", tenantId: null, error: null })),
}));

import vsiSuspects from "../_vsi-suspects";

function get(): Promise<Response> {
  return vsiSuspects(
    new Request("https://example.com/api/admin/vsi-suspects", { headers: { Authorization: "Bearer test" } }),
  );
}

describe("/api/admin/vsi-suspects", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("migración 070 sin aplicar (vista inexistente, PGRST205) ⇒ 503 con gate explícito, no 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.v_vsi_default_suspects'" }),
          { status: 404 },
        ),
      ),
    );
    const res = await get();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; errorDetail: { code: string; message: string } };
    expect(body.ok).toBe(false);
    expect(body.errorDetail.code).toBe("VSI_REVIEW_UNAVAILABLE");
    expect(body.errorDetail.message).toMatch(/migración 070/);
  });

  it("con la vista: devuelve las filas marcadas, sin nombre de jugador", async () => {
    const row = {
      id: "p-samu", user_id: "u-1", created_at: "2026-08-01T00:00:00Z", vsi: 67.4,
      vsi_history: [57.5, 67.4], data_vsi_history: [57.5, 67.4], review_reason: "default_bars_57_5",
      flagged_at: "2026-09-29T00:00:00Z", current_vsi_is_default: false, metrics_are_default: false,
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([row])));
    vi.stubGlobal("fetch", fetchMock);
    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { suspects: Array<Record<string, unknown>>; total: number } };
    expect(body.data.total).toBe(1);
    expect(body.data.suspects[0]).not.toHaveProperty("name");
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("/rest/v1/v_vsi_default_suspects?select=");
    expect(url).not.toMatch(/select=[^&]*\bname\b/);
  });
});
