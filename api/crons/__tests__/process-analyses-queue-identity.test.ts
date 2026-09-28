/**
 * VITAS · Tests — cron process-analyses-queue: abstención por identidad
 * Run: npx vitest run --config vitest.api.config.ts api/crons/__tests__/process-analyses-queue-identity.test.ts
 *
 * identidad.md: si Gemini no identificó al jugador, el cron NO debe disparar los
 * informes (que se renderizan bajo el nombre del menor). Antes el cron ignoraba la
 * respuesta de gemini-analyze y lanzaba el orchestrator siempre.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const updates: Array<{ table: string; values: Record<string, unknown> }> = [];

function chainFor(table: string) {
  let isUpdate = false;
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: self,
    in: self,
    or: self,
    order: self,
    limit: self,
    update: (values: Record<string, unknown>) => {
      isUpdate = true;
      updates.push({ table, values });
      return chain;
    },
    single: async () => ({ data: table === "videos" ? { bunny_video_id: "bunny-1" } : null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: isUpdate ? [] : null, error: null }).then(resolve, reject),
  });
  return chain;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (t: string) => chainFor(t),
    rpc: async () => ({
      data: [{ id: "a1", player_id: "p1", video_id: "v1", tenant_id: "t1" }],
      error: null,
    }),
  }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.CRON_SECRET = "cron-secret";
  updates.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function cronRequest() {
  return new Request("https://x.test/api/crons/process-analyses-queue", {
    headers: { Authorization: "Bearer cron-secret" },
  });
}

const calledUrls = () => fetchMock.mock.calls.map(([u]) => String(u));

describe("cron · abstención de gemini-analyze", () => {
  it("gemini-analyze responde abstained ⇒ NO se dispara el orchestrator ni el Gemini inline", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/pipeline/gemini-analyze")) {
        return new Response(
          JSON.stringify({ success: true, data: { abstained: true, gate_reason: "Jugador no identificado" } }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    });
    const { default: handler } = await import("../process-analyses-queue");
    const res = await handler(cronRequest());
    const json = (await res.json()) as { data: { abstained: number; completed: number } };
    expect(calledUrls().some((u) => u.includes("/api/agents/pipeline-orchestrator"))).toBe(false);
    expect(calledUrls().some((u) => u.includes("/api/agents/video-observation"))).toBe(false);
    expect(json.data.abstained).toBe(1);
    expect(json.data.completed).toBe(0);
  });

  it("gemini-analyze OK (atribuible) ⇒ sí se dispara el orchestrator", async () => {
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ success: true, data: { abstained: false } }), { status: 200 }),
    );
    const { default: handler } = await import("../process-analyses-queue");
    await handler(cronRequest());
    expect(calledUrls().some((u) => u.includes("/api/agents/pipeline-orchestrator"))).toBe(true);
  });
});

describe("persistInlineGeminiResult · fallback inline con la misma regla de identidad", () => {
  it("no identificado ⇒ failed con motivo y cifras null (no processing_reports)", async () => {
    const { persistInlineGeminiResult } = await import("../process-analyses-queue");
    const client = { from: (t: string) => chainFor(t) } as never;
    const r = await persistInlineGeminiResult(
      client,
      "a1",
      {
        identificacion: { estado: "no_identificado", confianza: "alta", motivo: "dorsal no visible" },
        dimensiones: { tecnicaConBalon: { observaciones: [], score_estimado: 7 } },
        eventosContados: { pasesCompletados: 5 },
      },
      { referenceProvided: false },
    );
    expect(r.abstained).toBe(true);
    const upd = updates.filter((u) => u.table === "analyses").pop()!.values;
    expect(upd.status).toBe("failed");
    expect((upd.biomechanics as Record<string, unknown>).technical_score).toBeNull();
  });
});
