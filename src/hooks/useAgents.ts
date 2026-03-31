/**
 * VITAS Agent Hooks
 * Conecta los agentes Claude con React Query.
 * Cachea resultados para no llamar la API en cada render.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AgentService } from "@/services/real/agentService";
import { PlayerService } from "@/services/real/playerService";
import type { PHVInput, ScoutInsightInput, RoleProfileInput } from "@/agents/contracts";

// ─────────────────────────────────────────
// Hook: PHV Calculator
// Calcula maduración biológica. Cache 24h (no cambia seguido).
// ─────────────────────────────────────────
export function usePHVCalculator(input: PHVInput | null) {
  return useQuery({
    queryKey: ["phv", input?.playerId, input?.height, input?.weight],
    queryFn: async () => {
      if (!input) throw new Error("No hay datos para calcular PHV");
      const res = await AgentService.calculatePHV(input);
      if (!res.success || !res.data) throw new Error(res.error ?? "Error en PHV Agent");

      // Persiste el resultado en el jugador
      PlayerService.updatePHV(
        input.playerId,
        res.data.category,
        res.data.offset,
        res.data.adjustedVSI
      );

      return res.data;
    },
    enabled: !!input,
    staleTime: 1000 * 60 * 60 * 24, // 24 horas
    retry: 2,
  });
}

// ─────────────────────────────────────────
// Hook: Scout Insights
// Genera insights para ScoutFeed. Cache 5 min.
// ─────────────────────────────────────────
export function useScoutInsights() {
  const players = PlayerService.getAll();

  return useQuery({
    queryKey: ["scout-insights", players.map((p) => `${p.id}-${p.vsi}`).join(",")],
    queryFn: async () => {
      if (players.length === 0) return [];

      // Genera un insight por cada jugador con tendencia relevante
      const insightPromises = players.slice(0, 6).map((player) => {
        const prevVSI = player.vsiHistory?.at(-2) ?? player.vsi;
        const vsiTrend = player.vsi > prevVSI + 2 ? "up" : player.vsi < prevVSI - 2 ? "down" : "stable";

        const input: ScoutInsightInput = {
          player: {
            id: player.id,
            name: player.name,
            age: player.age,
            position: player.position,
            vsi: player.vsi,
            vsiTrend: vsiTrend as "up" | "down" | "stable",
            phvCategory: player.phvCategory ?? "ontme",
            recentMetrics: player.metrics,
          },
          context:
            player.vsi > 75 && vsiTrend === "up" ? "breakout"
            : player.phvCategory === "early" && player.metrics.speed > 75 ? "phv_alert"
            : Math.max(...Object.values(player.metrics)) > 85 ? "drill_record"
            : "general",
        };
        return AgentService.generateScoutInsight(input);
      });

      const results = await Promise.allSettled(insightPromises);
      return results
        .filter((r) => r.status === "fulfilled" && r.value.success && r.value.data)
        .map((r) => (r as PromiseFulfilledResult<typeof r>).value.data!);
    },
    enabled: players.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutos
    retry: 1,
  });
}

// ─────────────────────────────────────────
// Hook: Role Profile por jugador
// Cache 30 min (análisis costoso, no cambia seguido)
// ─────────────────────────────────────────
export function useRoleProfileAgent(playerId: string | undefined) {
  return useQuery({
    queryKey: ["role-profile-agent", playerId],
    queryFn: async () => {
      if (!playerId) throw new Error("No hay playerId");
      const player = PlayerService.getById(playerId);
      if (!player) throw new Error(`Jugador ${playerId} no encontrado`);

      const input: RoleProfileInput = {
        player: {
          id: player.id,
          name: player.name,
          age: player.age,
          foot: player.foot,
          position: player.position,
          minutesPlayed: player.minutesPlayed,
          competitiveLevel: player.competitiveLevel,
          metrics: {
            ...player.metrics,
            pressing: player.metrics.stamina,      // aproximación
            positioning: player.metrics.vision,    // aproximación
          },
          phvCategory: player.phvCategory ?? "ontme",
          phvOffset: player.phvOffset ?? 0,
        },
      };

      const res = await AgentService.buildRoleProfile(input);
      if (!res.success || !res.data) throw new Error(res.error ?? "Error en RoleProfile Agent");
      return res.data;
    },
    enabled: !!playerId,
    staleTime: 1000 * 60 * 30, // 30 minutos
    retry: 2,
  });
}

// ─────────────────────────────────────────
// Mutation: Recalcular PHV manualmente
// ─────────────────────────────────────────
export function useRecalculatePHV() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PHVInput) => AgentService.calculatePHV(input),
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["phv", input.playerId] });
      queryClient.invalidateQueries({ queryKey: ["role-profile-agent", input.playerId] });
    },
  });
}
