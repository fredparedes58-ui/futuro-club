/**
 * VITAS · Tests — cron process-analyses-queue: el fallback INLINE pasa la referencia
 * del jugador (dorsal + color de equipación, mig 068) a video-observation.
 * Run: npx vitest run --config vitest.api.config.ts api/crons/__tests__/process-analyses-queue-reference.test.ts
 *
 * Antes el inline llamaba a buildGeminiPlayerContext(player, anthro) SIN referencia →
 * referenceProvided siempre false → en un clip con varios jugadores, abstención aunque
 * el usuario hubiera tecleado dorsal y color.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
let analysesRow: Record<string, unknown> | null = null;

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
    single: async () => ({
      data:
        table === "videos"
          ? { bunny_video_id: "bunny-1" }
          : table === "players"
            ? { name: "Ana", position: "MC", foot: "derecho", tenant_id: "t1" }
            : null,
      error: null,
    }),
    maybeSingle: async () => ({ data: table === "analyses" ? analysesRow : null, error: null }),
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

const identifiedObservation = {
  identificacion: {
    estado: "identificado",
    metodo: "dorsal_y_color",
    dorsalObservado: "10",
    colorObservado: "rojo",
    confianza: "alta",
    motivo: "dorsal 10 legible",
  },
  dimensiones: { tecnicaConBalon: { observaciones: ["x"], score_estimado: 6 } },
  eventosContados: { pasesCompletados: 2 },
};

beforeEach(() => {
  process.env.CRON_SECRET = "cron-secret";
  updates.length = 0;
  analysesRow = null;
  fetchMock.mockReset();
  // gemini-analyze (endpoint dedicado) FALLA → el cron usa el Gemini inline.
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/api/pipeline/gemini-analyze")) return new Response("boom", { status: 500 });
    if (url.includes("/api/agents/video-observation")) {
      return new Response(JSON.stringify({ success: true, data: { observations: identifiedObservation } }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
  });
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
function inlinePlayerContext(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/agents/video-observation"));
  return JSON.parse((call?.[1] as RequestInit).body as string).playerContext;
}
const lastAnalysesUpdate = () => updates.filter((u) => u.table === "analyses").pop()?.values ?? {};

describe("cron · fallback inline con la referencia del jugador", () => {
  it("dorsal + color en la fila ⇒ se envían a Gemini, atribuible por dorsal ⇒ informes", async () => {
    analysesRow = { jersey_number: "10", kit_color: "rojo" };
    const { default: handler } = await import("../process-analyses-queue");
    await handler(cronRequest());
    const ctx = inlinePlayerContext();
    expect(ctx.jerseyNumber).toBe("10");
    expect(ctx.teamColor).toBe("rojo");
    expect(lastAnalysesUpdate().status).toBe("processing_reports");
    expect(calledUrls().some((u) => u.includes("/api/agents/pipeline-orchestrator"))).toBe(true);
  });

  it("solo color (sin dorsal) ⇒ referenceProvided false: «identificado» se descarta, sin informes", async () => {
    analysesRow = { jersey_number: null, kit_color: "rojo" };
    const { default: handler } = await import("../process-analyses-queue");
    await handler(cronRequest());
    expect(inlinePlayerContext().jerseyNumber).toBeNull();
    expect(lastAnalysesUpdate().status).toBe("failed");
    expect(calledUrls().some((u) => u.includes("/api/agents/pipeline-orchestrator"))).toBe(false);
  });

  it("sin referencia en la fila ⇒ nada inventado (null) y abstención", async () => {
    analysesRow = null;
    const { default: handler } = await import("../process-analyses-queue");
    await handler(cronRequest());
    const ctx = inlinePlayerContext();
    expect(ctx.jerseyNumber).toBeNull();
    expect(ctx.teamColor).toBeNull();
    expect(lastAnalysesUpdate().status).toBe("failed");
  });
});
