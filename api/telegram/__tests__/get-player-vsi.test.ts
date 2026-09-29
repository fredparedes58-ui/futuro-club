/**
 * Bot de Telegram · herramienta get_player — lo que recibe el LLM no incluye el
 * historial VSI legacy SIN fechas (players.vsi_history, con el 57.5 fabricado antes de
 * #146) ni la serie retirada de analyses.vsi (trend/history). Con ellos el LLM podía
 * contestar «Samu ha subido de 57.5 a 67.4»: una cifra escrita por el LLM sobre una
 * variación que la app bloquea (src/lib/scoring/vsiDelta.ts).
 */
import { describe, it, expect } from "vitest";
import { execTool } from "../webhook";

const PLAYER_ROW = {
  id: "p-samu", name: "Samu", age: 9, position: "MC", foot: "right",
  height_cm: 135, weight_kg: 30, vsi: 67.4, vsi_history: [57.5, 67.4],
  phv_category: null, phv_offset: null,
  metric_speed: 70, metric_technique: 68, metric_vision: 66, metric_stamina: 67,
  metric_shooting: 65, metric_defending: 66,
};
const ANALYSIS_ROW = {
  id: "an-1", status: "completed", completed_at: "2026-08-20T10:00:00Z",
  vsi: {
    vsi: 67, tierLabel: "Talento",
    trend: { slope: 4.75, momentum: "up", confidence: "medium", delta: null, samples: 3 },
    history: [57.5, 67.4, 67],
  },
};

function fakeSupabase() {
  return {
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      const chain = () => b;
      Object.assign(b, {
        select: chain, eq: chain, ilike: chain, in: chain, order: chain,
        limit: () => (table === "players" ? Promise.resolve({ data: [structuredClone(PLAYER_ROW)] }) : b),
        maybeSingle: async () =>
          table === "analyses" ? { data: structuredClone(ANALYSIS_ROW) } : { data: null },
      });
      return b;
    },
  };
}

describe("telegram get_player — sin serie VSI legacy para el LLM", () => {
  it("el JSON de la herramienta no lleva vsi_history ni vsi.trend/history, y sí el VSI actual", async () => {
    const out = await execTool(
      fakeSupabase(),
      { userId: "user-coach-1", tenantId: "t-1", chatId: 1 },
      "get_player",
      { name_query: "samu" },
    );
    const parsed = JSON.parse(out) as {
      player: Record<string, unknown>;
      lastAnalysis: { vsi: Record<string, unknown> };
    };
    expect(parsed.player).not.toHaveProperty("vsi_history");
    expect(parsed.lastAnalysis.vsi).not.toHaveProperty("trend");
    expect(parsed.lastAnalysis.vsi).not.toHaveProperty("history");
    expect(out).not.toContain("57.5");
    expect(parsed.player.vsi).toBe(67.4);
    expect(parsed.lastAnalysis.vsi.vsi).toBe(67);
  });
});
