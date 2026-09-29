/**
 * POST /api/reports/pdf — la sección «Evolución VSI» solo con evaluaciones del
 * entrenador con fecha (src/lib/scoring/vsiDelta.ts#realVsiEvaluations).
 *
 * Antes graficaba `data.vsiHistory` (legacy SIN fechas, con el 57.5 fabricado antes de
 * #146) con etiquetas «#1, #2»: para Samu ([57.5, 67.4]) el PDF mostraba una subida que
 * el panel de familia y el ScoutFeed ya bloquean (invariante #7).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true, remaining: 9, limit: 10, resetAt: Date.now() + 60000,
  }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("../../_lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ userId: "user-pdf-1", email: "coach@example.com", error: null }),
}));

import pdfHandler from "../_pdf";

const METRICS = { speed: 70, technique: 70, vision: 70, stamina: 70, shooting: 70, defending: 70 };

function mockSupabase(playerData: Record<string, unknown>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes("/subscriptions")) {
      return new Response(JSON.stringify([{ plan: "pro", status: "active" }]));
    }
    if (u.includes("/players?")) {
      return new Response(JSON.stringify([{ data: playerData }]));
    }
    if (u.includes("/player_analyses?")) {
      return new Response(JSON.stringify([]));
    }
    return new Response("[]");
  });
}

async function renderPdf(): Promise<string> {
  const req = new Request("https://example.com/api/reports/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify({ playerId: "p-samu" }),
  });
  const res = await pdfHandler(req);
  expect(res.status).toBe(200);
  return res.text();
}

describe("/api/reports/pdf — Evolución VSI solo con evaluaciones con fecha", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("caso Samu (solo vsiHistory legacy [57.5, 67.4]): NO hay sección de evolución ni 57.5", async () => {
    mockSupabase({ name: "Samu", age: 9, vsi: 67.4, metrics: METRICS, vsiHistory: [57.5, 67.4] });
    const html = await renderPdf();
    expect(html).not.toContain("Evolución VSI");
    expect(html).not.toContain(">58<"); // Math.round(57.5) como barra
    expect(html).not.toMatch(/>#\d+</); // etiquetas «#1, #2» sin fecha
  });

  it("dos evaluaciones reales con fecha: barras con sus valores y FECHAS (no «#1, #2»)", async () => {
    mockSupabase({
      name: "Samu", age: 9, vsi: 70, metrics: METRICS, vsiHistory: [57.5, 70],
      vsiEvaluations: [
        { value: 60, at: "2026-09-01T10:00:00.000Z", source: "coach_form" },
        { value: 70, at: "2026-09-20T10:00:00.000Z", source: "players_api" },
      ],
    });
    const html = await renderPdf();
    expect(html).toContain("Evolución VSI · evaluaciones del entrenador con fecha");
    expect(html).toContain("01/09/26");
    expect(html).toContain("20/09/26");
    // Valores de las barras (span de 9px), en orden: 60 → 70; nunca el 57.5 legacy.
    const bars = [...html.matchAll(/font-size:9px;color:#6b7280">(\d+)</g)].map((m) => m[1]);
    expect(bars).toEqual(["60", "70"]);
    expect(html).not.toContain(">58<");
    expect(html).not.toMatch(/>#\d+</); // etiquetas «#1, #2» sin fecha
  });

  it("evaluaciones de semilla demo (no reales): solo queda una real ⇒ sin sección", async () => {
    mockSupabase({
      name: "Demo", age: 12, vsi: 70, metrics: METRICS,
      vsiEvaluations: [
        { value: 60, at: "2026-09-01T10:00:00.000Z", source: "demo_seed" },
        { value: 70, at: "2026-09-20T10:00:00.000Z", source: "coach_form" },
      ],
    });
    const html = await renderPdf();
    expect(html).not.toContain("Evolución VSI");
  });
});
