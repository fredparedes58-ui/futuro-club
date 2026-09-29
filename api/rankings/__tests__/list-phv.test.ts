/**
 * VITAS · Tests — /api/rankings/list · PHV por el gate único
 * Run: npx vitest run --config vitest.api.config.ts api/rankings/__tests__/list-phv.test.ts
 *
 * Antes (origin/main, _list.ts:144-151 y :221-222): la ruta RPC esparcía el blob
 * DESPUÉS de mapear la columna (el phvCategory persistido del blob llegaba tal
 * cual al cliente) y la ruta en memoria rellenaba phvCategory «ontme»/offset 0
 * para quien no tenía nada — un pre-púber sin medidas salía «on-time».
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, limit: 60, resetAt: Date.now() + 60000 }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));
vi.mock("../../_lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ userId: "coach-rank", error: null }),
}));

import listHandler from "../_list";
import { phvGate } from "../../../src/lib/phv/phvGate";

const SAMU = {
  name: "Samu", age: 9, position: "DC", height: 135, weight: 30, gender: "M",
  metrics: { speed: 70, technique: 70, vision: 65, stamina: 65, shooting: 60, defending: 55 },
  vsi: 67.4, phvCategory: "early", phvOffset: -1.2,
};
const COMPLETE = {
  name: "Completo", age: 14, position: "MC", height: 165, weight: 55, sittingHeight: 85, legLength: 80,
  birthDate: "2012-03-15", gender: "M",
  metrics: { speed: 60, technique: 60, vision: 60, stamina: 60, shooting: 60, defending: 60 },
  vsi: 60, phvCategory: "late", phvOffset: 9,
};

let rpcOk = true;

beforeEach(() => {
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = typeof url === "string" ? url : url.toString();
    if (u.includes("/rpc/get_ranked_players")) {
      if (!rpcOk) return new Response("no rpc", { status: 404 });
      return new Response(JSON.stringify({
        players: [
          { id: "samu", name: "Samu", vsi: 67.4, phv_category: "early", data: SAMU },
          { id: "full", name: "Completo", vsi: 60, phv_category: null, data: COMPLETE },
        ],
        total: 2,
      }));
    }
    if (u.includes("/rest/v1/players")) {
      return new Response(JSON.stringify([
        { id: "samu", data: SAMU, updated_at: "2026-09-01" },
        { id: "full", data: COMPLETE, updated_at: "2026-09-01" },
      ]));
    }
    return new Response("[]");
  });
});
afterEach(() => vi.restoreAllMocks());

async function list(): Promise<Array<Record<string, unknown>>> {
  const res = await listHandler(
    new Request("https://x.test/api/rankings/list", { headers: { Authorization: "Bearer user-jwt" } }),
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { data: { players: Array<Record<string, unknown>> } };
  return body.data.players;
}

const g = phvGate(COMPLETE);
const expectedCat = g.ok ? (g.category === "ontme" ? "on-time" : g.category) : null;

describe.each([
  ["RPC", true],
  ["fallback en memoria", false],
])("rankings (%s)", (_label, useRpc) => {
  it("el phvCategory persistido de Samu (sin medidas) NO llega: null + motivo", async () => {
    rpcOk = useRpc as boolean;
    const players = await list();
    const samu = players.find((p) => p.id === "samu")!;
    expect(samu.phvCategory).toBeNull();
    expect(samu.phvOffset).toBeNull();
    expect(String(samu.phvGateReason)).toContain("Falta: talla sentado, longitud de pierna, fecha de nacimiento del jugador");
  });

  it("jugador con entradas completas ⇒ categoría RECALCULADA por el gate (no la persistida)", async () => {
    rpcOk = useRpc as boolean;
    const players = await list();
    const full = players.find((p) => p.id === "full")!;
    expect(g.ok).toBe(true);
    expect(full.phvCategory).toBe(expectedCat);
    expect(full.phvOffset).toBe(g.ok ? g.offset.value : null);
    expect(full.phvGateReason).toBeNull();
  });
});
