/**
 * Tests · cron process-analyses-queue con el gate de consentimiento REAL (defensa en
 * profundidad). Un análisis en cola (p. ej. escrito desde el navegador bajo RLS, o
 * encolado antes del gate) cuyo jugador NO es el del vídeo: el `player_id` de la fila
 * `videos` (y de cualquier otra fila del mismo vídeo de Bunny) se comprueba igualmente
 * (mismo defecto que B1 de la review del PR #308).
 *
 * Run: npx vitest run --config vitest.api.config.ts api/crons/__tests__/process-analyses-queue-consent.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MINOR_BIRTH_DATE, consentFetch, emptyConsentDb, type ConsentDbState } from "../../_lib/__tests__/consentFetchMock";

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
    single: async () => ({ data: table === "videos" ? { bunny_video_id: "g-1" } : null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: isUpdate ? [] : null, error: null }).then(resolve, reject),
  });
  return chain;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (t: string) => chainFor(t),
    // Análisis en cola para el jugador p1 sobre la fila `videos` v1.
    rpc: async () => ({ data: [{ id: "a1", player_id: "p1", video_id: "v1", tenant_id: "t1" }], error: null }),
  }),
}));

process.env.SUPABASE_URL = "https://sb.test";
process.env.VITE_SUPABASE_URL = "https://sb.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-key";

let db: ConsentDbState;
let mock: ReturnType<typeof consentFetch>;
const calledUrls = () => mock.calls.map((c) => c.url);

beforeEach(() => {
  process.env.CRON_SECRET = "cron-secret";
  updates.length = 0;
  db = emptyConsentDb();
  db.birthDates.p1 = null; // jugador del análisis: fecha desconocida
  db.storedAttestations.push({ resource_type: "videos", resource_id: "v1" });
  mock = consentFetch(db, {
    fallback: async () => new Response(JSON.stringify({ success: true, data: { abstained: false } }), { status: 200 }),
  });
  vi.stubGlobal("fetch", mock.fn);
});
afterEach(() => vi.unstubAllGlobals());

async function runCron() {
  const { default: handler } = await import("../process-analyses-queue");
  return handler(new Request("https://x.test/api/crons/process-analyses-queue", { headers: { Authorization: "Bearer cron-secret" } }));
}

describe("cron · consentimiento con los jugadores de la fila videos (B1)", () => {
  it("la fila videos es de un menor de 14 sin consentimiento y el análisis es de OTRO jugador → failed; ni Gemini ni informes", async () => {
    db.videos.push({ id: "v1", user_id: null, tenant_id: null, player_id: "pMinor", bunny_video_id: "g-1" });
    db.birthDates.pMinor = MINOR_BIRTH_DATE;
    await runCron();
    expect(calledUrls().some((u) => u.includes("/api/pipeline/gemini-analyze"))).toBe(false);
    expect(calledUrls().some((u) => u.includes("/api/agents/pipeline-orchestrator"))).toBe(false);
    const failed = updates.filter((u) => u.table === "analyses" && u.values.status === "failed" && /14/.test(String(u.values.status_message)));
    expect(failed).toHaveLength(1);
  });

  it("OTRA fila con el mismo GUID liga el vídeo a un menor sin consentimiento → también failed", async () => {
    db.videos.push({ id: "v1", user_id: null, tenant_id: null, player_id: null, bunny_video_id: "g-1" });
    db.videos.push({ id: "v1-dup", user_id: null, tenant_id: null, player_id: "pMinor", bunny_video_id: "g-1" });
    db.birthDates.pMinor = MINOR_BIRTH_DATE;
    await runCron();
    expect(calledUrls().some((u) => u.includes("/api/pipeline/gemini-analyze"))).toBe(false);
  });

  it("control: la fila videos sin jugador (o con un adulto) → se despacha a gemini-analyze", async () => {
    db.videos.push({ id: "v1", user_id: null, tenant_id: null, player_id: "pAdult", bunny_video_id: "g-1" });
    db.birthDates.pAdult = "1990-01-01";
    await runCron();
    expect(calledUrls().some((u) => u.includes("/api/pipeline/gemini-analyze"))).toBe(true);
  });
});
