import { mockScoutInsights, type ScoutInsight } from "@/lib/mockData";
import { PlayerService } from "@/services/real/playerService";
import { AgentService } from "@/services/real/agentService";
import { adaptInsightForUI } from "@/services/real/adapters";
import type { ScoutInsightInput } from "@/agents/contracts";

export async function fetchScoutInsights(): Promise<ScoutInsight[]> {
  PlayerService.seedIfEmpty();
  const players = PlayerService.getAll();

  if (players.length === 0) return mockScoutInsights as ScoutInsight[];

  try {
    // Genera insights en paralelo para todos los jugadores
    const insightPromises = players.slice(0, 6).map((player) => {
      const vsiHistory = player.vsiHistory ?? [player.vsi];
      const prevVSI = vsiHistory.at(-2) ?? player.vsi;
      const delta = player.vsi - prevVSI;
      const vsiTrend: "up" | "down" | "stable" =
        delta > 2 ? "up" : delta < -2 ? "down" : "stable";

      const context: ScoutInsightInput["context"] =
        player.vsi > 75 && vsiTrend === "up" ? "breakout"
        : player.phvCategory === "early" && player.metrics.speed > 75 ? "phv_alert"
        : Math.max(...Object.values(player.metrics)) > 85 ? "drill_record"
        : "general";

      const input: ScoutInsightInput = {
        player: {
          id: player.id,
          name: player.name,
          age: player.age,
          position: player.position,
          vsi: player.vsi,
          vsiTrend,
          phvCategory: player.phvCategory ?? "ontme",
          recentMetrics: player.metrics,
        },
        context,
      };

      return AgentService.generateScoutInsight(input).then((res) => {
        if (!res.success || !res.data) return null;
        return adaptInsightForUI(res.data, player);
      });
    });

    const results = await Promise.allSettled(insightPromises);
    const insights = results
      .filter((r) => r.status === "fulfilled" && r.value !== null)
      .map((r) => (r as PromiseFulfilledResult<ReturnType<typeof adaptInsightForUI>>).value);

    // Fallback a mock si la API no respondió correctamente
    if (insights.length === 0) return mockScoutInsights as ScoutInsight[];
    return insights as unknown as ScoutInsight[];

  } catch {
    // Si la API key no está configurada en dev, usa mock
    return mockScoutInsights as ScoutInsight[];
  }
}
