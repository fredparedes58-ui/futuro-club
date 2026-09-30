/**
 * Tests for /api/scout/generate — Insight Generation
 * Tests context detection logic and handler flow with mocked external calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true, remaining: 9, limit: 10, resetAt: Date.now() + 120000,
  }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("../../_lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ userId: "user-gen-123", error: null }),
}));

import generateHandler from "../generate";

function makeRequest(body?: unknown): Request {
  return new Request("https://example.com/api/scout/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    },
    body: JSON.stringify(body ?? {}),
  });
}

describe("/api/scout/generate", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 503 when Supabase not configured", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await generateHandler(makeRequest());
    expect(res.status).toBe(503);
  });

  it("returns 503 when Anthropic not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const res = await generateHandler(makeRequest());
    expect(res.status).toBe(503);
  });

  it("returns empty insights when no players found", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/rest/v1/players")) {
        return new Response(JSON.stringify([]));
      }
      return new Response("{}");
    });

    const res = await generateHandler(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.insights).toEqual([]);
  });

  it("generates insight for a single player end-to-end", async () => {
    // Fila REAL de players: no hay columna `metrics` (024) — las barras viven en el
    // blob `data.metrics`, y las evaluaciones con fecha en `data.vsiEvaluations`.
    const mockPlayer = {
      id: "p1",
      name: "Lucas Test",
      age: 15,
      position: "RW",
      vsi: 72,
      phv_category: "ontme",
      phv_offset: 0.5,
      vsi_history: [65, 72],
      minutes_played: 840,
      updated_at: "2026-01-01",
      data: {
        vsi: 72,
        metrics: { speed: 80, technique: 75, vision: 70, stamina: 76, shooting: 78, defending: 45 },
        vsiEvaluations: [
          { value: 65, at: "2026-09-01T10:00:00.000Z", source: "coach_form" },
          { value: 72, at: "2026-09-20T10:00:00.000Z", source: "coach_form" },
        ],
      },
    };

    const mockClaudeResponse = {
      content: [{
        type: "text",
        text: JSON.stringify({
          type: "breakout",
          headline: "Lucas muestra crecimiento explosivo",
          body: "VSI subió 7 puntos en el último periodo.",
          metric: "VSI",
          metricValue: "72 (+7)",
          urgency: "high",
          tags: ["breakout", "velocidad"],
          recommendedDrills: [{ name: "Sprint drill", reason: "Potenciar velocidad" }],
          actionItems: ["Aumentar minutos en partido"],
          benchmark: "Percentil 78 en velocidad Sub-15",
        }),
      }],
    };

    const savedInsight = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      player_name: "Lucas Test",
      insight_type: "breakout",
      title: "Lucas muestra crecimiento explosivo",
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const urlStr = typeof url === "string" ? url : url.toString();

      // Players query
      if (urlStr.includes("/rest/v1/players")) {
        return new Response(JSON.stringify([mockPlayer]));
      }

      // Analyses query
      if (urlStr.includes("/rest/v1/player_analyses")) {
        return new Response(JSON.stringify([]));
      }

      // RAG query
      if (urlStr.includes("/api/rag/query")) {
        return new Response(JSON.stringify({ data: { context: "", results: [] } }));
      }

      // Claude API
      if (urlStr.includes("anthropic.com")) {
        return new Response(JSON.stringify(mockClaudeResponse));
      }

      // Insert scout_insights
      if (urlStr.includes("/rest/v1/scout_insights") && init?.method === "POST") {
        return new Response(JSON.stringify([savedInsight]));
      }

      return new Response("{}", { status: 404 });
    });

    const res = await generateHandler(makeRequest({ playerId: "p1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.generated).toBe(1);
    expect(body.data.insights).toHaveLength(1);
    expect(body.data.insights[0].insight_type).toBe("breakout");
  });

  it("handles Claude API failure gracefully", async () => {
    const mockPlayer = {
      id: "p2", name: "Player Fail", age: 14, position: "CM",
      vsi: 60, phv_category: "ontme", phv_offset: 0,
      vsi_history: [60], minutes_played: 620, updated_at: "2026-01-01",
      // Barras reales con una > 85 ⇒ contexto real "drill-record" (sin él se abstendría).
      data: { vsi: 60, metrics: { speed: 65, technique: 70, vision: 78, stamina: 80, shooting: 50, defending: 88 } },
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/rest/v1/players")) return new Response(JSON.stringify([mockPlayer]));
      if (urlStr.includes("/rest/v1/player_analyses")) return new Response(JSON.stringify([]));
      if (urlStr.includes("/api/rag/query")) return new Response(JSON.stringify({ data: {} }));
      if (urlStr.includes("anthropic.com")) return new Response("Error", { status: 500 });
      return new Response("{}", { status: 404 });
    });

    const res = await generateHandler(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.generated).toBe(0);
    expect(body.data.errors).toBeDefined();
    expect(body.data.errors.length).toBeGreaterThan(0);
  });
});

// ── fix/vsi-delta-provenance: ninguna cifra escrita por el LLM ──────────────────
describe("/api/scout/generate — variación del VSI calculada en el servidor", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  /** El LLM "intenta" escribir cifras, tipo y urgencia: todo eso debe ignorarse. */
  const LLM_OUTPUT = {
    type: "milestone",
    headline: "Progresión sostenida",
    body: "Ha escalado de 57.5 a 67.4 VSI.",
    metric: "VSI",
    metricValue: "67.4 (+9.9)",
    urgency: "low",
    tags: ["progreso"],
    recommendedDrills: [],
    actionItems: ["Mantener carga"],
    benchmark: "Percentil 72 en técnica para Sub-10",
  };

  interface Captured {
    inserted: Array<Record<string, unknown>>;
    claudeBodies: Array<{ system: string; messages: Array<{ content: string }> }>;
    ragQueries: string[];
  }

  function mockBackend(
    players: unknown[],
    opts: { analyses?: unknown[]; llm?: Record<string, unknown> } = {},
  ): Captured {
    const captured: Captured = { inserted: [], claudeBodies: [], ragQueries: [] };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("/rest/v1/players")) return new Response(JSON.stringify(players));
      if (u.includes("/rest/v1/player_analyses")) return new Response(JSON.stringify(opts.analyses ?? []));
      if (u.includes("/api/rag/query")) {
        captured.ragQueries.push(JSON.parse(String(init?.body)).query);
        return new Response(JSON.stringify({ data: { context: "", results: [] } }));
      }
      if (u.includes("anthropic.com")) {
        captured.claudeBodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({
          content: [{ type: "text", text: JSON.stringify(opts.llm ?? LLM_OUTPUT) }],
        }));
      }
      if (u.includes("/rest/v1/scout_insights") && init?.method === "POST") {
        const row = JSON.parse(String(init.body)) as Record<string, unknown>;
        captured.inserted.push(row);
        return new Response(JSON.stringify([{ id: "ins-1", ...row }]));
      }
      return new Response("{}", { status: 404 });
    });
    return captured;
  }

  // El caso del docx: historial legacy [57.5, 67.4] (57.5 = barras por defecto antes de #146).
  const samuLegacy = {
    id: "p-samu", name: "Samu", age: 9, position: "CM",
    vsi: 67.4, phv_category: "early", phv_offset: -1.2,
    vsi_history: [57.5, 67.4], minutes_played: 300, updated_at: "2026-08-22",
    data: { vsi: 67.4, vsiHistory: [57.5, 67.4] }, // sin barras ni evaluaciones con fecha
  };

  it("solo historial legacy sin fechas ⇒ NO hay variación, NO 'breakout', se abstiene sin llamar al LLM", async () => {
    const cap = mockBackend([samuLegacy]);
    const res = await generateHandler(makeRequest({ playerId: "p-samu" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.generated).toBe(0);
    expect(body.data.skippedNoSignal).toBe(1);
    expect(cap.claudeBodies).toHaveLength(0);
    expect(cap.inserted).toHaveLength(0);
  });

  it("dos evaluaciones reales con fecha ⇒ vsi_delta DERIVADA en el servidor; cifras/tipo/urgencia del LLM ignorados", async () => {
    const samuDated = {
      ...samuLegacy,
      data: {
        vsi: 67.4,
        vsiHistory: [57.5, 67.4],
        metrics: { speed: 70, technique: 68, vision: 66, stamina: 65, shooting: 67, defending: 69 },
        vsiEvaluations: [
          { value: 57.5, at: "2026-09-01T10:00:00.000Z", source: "coach_form" },
          { value: 67.4, at: "2026-09-20T10:00:00.000Z", source: "players_api" },
        ],
      },
    };
    const cap = mockBackend([samuDated]);
    const res = await generateHandler(makeRequest({ playerId: "p-samu" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.generated).toBe(1);

    const row = cap.inserted[0];
    // Ninguna cifra escrita por el LLM en la fila.
    expect(row.metric_value).toBeNull();
    expect(row.metric).toBeNull();
    // El benchmark con percentil inventado se descarta.
    expect(row.benchmark).toBeNull();
    // Tipo y urgencia: del servidor (+9.9 > 5 ⇒ breakout/high), no el "milestone/low" del LLM.
    expect(row.insight_type).toBe("breakout");
    expect(row.urgency).toBe("high");
    const ctx = row.context_data as Record<string, unknown>;
    expect(ctx.vsi_delta).toMatchObject({
      value: 9.9,
      provenance: "DERIVADA",
      units: "pts",
      gate_reason: null,
      from_at: "2026-09-01T10:00:00.000Z",
      to_at: "2026-09-20T10:00:00.000Z",
      from_value: 57.5,
      to_value: 67.4,
    });

    // El LLM recibe la variación calculada (con fechas) y NO el historial legacy.
    const userContent = JSON.parse(cap.claudeBodies[0].messages[0].content) as Record<string, unknown>;
    expect(userContent.vsiVariacion).toEqual({
      puntos: 9.9, desde: "2026-09-01T10:00:00.000Z", hasta: "2026-09-20T10:00:00.000Z",
      valorAnterior: 57.5, valorActual: 67.4,
    });
    expect(userContent).not.toHaveProperty("vsiHistory");
    expect(userContent.barrasEntrenador).toEqual(samuDated.data.metrics);
    // El prompt ya no pide metricValue ni percentiles.
    expect(cap.claudeBodies[0].system).not.toContain("metricValue");
    expect(cap.claudeBodies[0].system).not.toMatch(/Percentil 85/);
  });

  it("sin variación calculable, las barras reales del blob deciden (drill-record) y el vsi_delta viaja bloqueado", async () => {
    const player = {
      ...samuLegacy,
      data: {
        vsi: 67.4,
        vsiHistory: [57.5, 67.4],
        metrics: { speed: 90, technique: 60, vision: 60, stamina: 60, shooting: 60, defending: 60 },
      },
    };
    const cap = mockBackend([player]);
    await generateHandler(makeRequest({ playerId: "p-samu" }));
    const row = cap.inserted[0];
    expect(row.insight_type).toBe("drill-record");
    expect(row.urgency).toBe("medium");
    expect((row.context_data as Record<string, unknown>).vsi_delta).toMatchObject({
      value: null,
      gate_code: "legacy_undated",
      gate_reason: "historial anterior sin fecha ni origen",
    });
    const userContent = JSON.parse(cap.claudeBodies[0].messages[0].content) as Record<string, unknown>;
    expect(userContent).not.toHaveProperty("vsiVariacion");
  });

  it("RAG: usa las barras reales del blob y NUNCA 'velocidad 0' fabricada", async () => {
    const withBars = {
      ...samuLegacy,
      data: { vsi: 67.4, metrics: { speed: 90, technique: 61, vision: 62, stamina: 60, shooting: 60, defending: 60 } },
    };
    const cap = mockBackend([withBars]);
    await generateHandler(makeRequest({ playerId: "p-samu" }));
    expect(cap.ragQueries[0]).toContain("velocidad 90");
    expect(cap.ragQueries[0]).toContain("técnica 61");
    expect(cap.ragQueries[0]).not.toMatch(/\b0\b/);
  });

  it("RAG sin barras (jugador con análisis pero sin evaluar) ⇒ la consulta no inventa métricas", async () => {
    const noBars = { ...samuLegacy, data: { vsi: null } , vsi: null, vsi_history: [] };
    const analyses = [
      {
        id: "a2", player_id: "p-samu", created_at: "2026-09-20", video_id: "v2",
        report: { estadoActual: { dimensionesMedidas: true, dimensiones: { tecnica: { score: 8 } }, nivelActual: "alto" } },
      },
      {
        id: "a1", player_id: "p-samu", created_at: "2026-09-01", video_id: "v1",
        report: { estadoActual: { dimensionesMedidas: true, dimensiones: { tecnica: { score: 6 } }, nivelActual: "medio" } },
      },
    ];
    const cap = mockBackend([noBars], { analyses });
    await generateHandler(makeRequest({ playerId: "p-samu" }));
    expect(cap.ragQueries[0]).not.toMatch(/velocidad|técnica 0|visión 0/);
    // Columna `report` (no `report_data`): el contexto de análisis llega al prompt y la
    // dimensión real +2 (>1.5) es el "breakout".
    expect(cap.claudeBodies[0].system).toContain("Último análisis (2026-09-20)");
    expect(cap.inserted[0].insight_type).toBe("breakout");
    expect(cap.inserted[0].context_data).toMatchObject({ source_video_id: "v2", source_analysis_id: "a2" });
  });
});
