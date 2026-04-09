/**
 * VITAS Agent Hooks
 * Conecta los agentes Claude con React Query.
 * Cachea resultados para no llamar la API en cada render.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AgentService } from "@/services/real/agentService";
import { PlayerService } from "@/services/real/playerService";
import { ragService } from "@/services/real/ragService";
import type { PHVInput, RoleProfileInput } from "@/agents/contracts";

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
      await PlayerService.updatePHV(
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

// NOTE: useScoutInsights lives in useScoutFeed.ts (single source of truth)
// Do NOT duplicate it here — ScoutFeed.tsx imports from useScoutFeed.ts

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
            // NOTE: pressing y positioning eliminados — eran aproximaciones falsas
            // (pressing ≈ stamina, positioning ≈ vision). El prompt de Role Profile
            // solo usa las 6 métricas VSI reales: speed, technique, vision, stamina, shooting, defending.
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
// Hook: RAG Drill Recommendations
// Busca ejercicios en la base de conocimiento RAG
// a partir de las áreas de desarrollo identificadas.
// Cache 1h (los drills no cambian seguido).
// ─────────────────────────────────────────
export function useRAGDrillRecommendations(areasDesarrollo: string[] | undefined) {
  return useQuery({
    queryKey: ["rag-drills", ...(areasDesarrollo ?? [])],
    queryFn: async () => {
      if (!areasDesarrollo || areasDesarrollo.length === 0) return [];

      // Para cada área de desarrollo, buscar drills relevantes en el RAG
      const traceId = `rag_drill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const results = await Promise.all(
        areasDesarrollo.map(async (area) => {
          const res = await ragService.query(area, {
            category: "drill",
            limit: 2,
          });
          return {
            area,
            traceId,
            drills: res.results.map((r) => ({
              id: r.id,
              content: r.content,
              similarity: r.similarity,
              metadata: r.metadata,
              traceId,
            })),
          };
        })
      );

      return results.filter((r) => r.drills.length > 0);
    },
    enabled: !!areasDesarrollo && areasDesarrollo.length > 0,
    staleTime: 1000 * 60 * 60, // 1 hora
    retry: 1,
  });
}

// ─────────────────────────────────────────
// Mutation: Recalcular PHV manualmente
// ─────────────────────────────────────────
export function useRecalculatePHV() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PHVInput) => AgentService.calculatePHV(input),
    onSuccess: async (result, input) => {
      // Persist PHV result in player storage (same as usePHVCalculator queryFn)
      if (result.success && result.data) {
        await PlayerService.updatePHV(
          input.playerId,
          result.data.category,
          result.data.offset,
          result.data.adjustedVSI,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["phv", input.playerId] });
      queryClient.invalidateQueries({ queryKey: ["role-profile-agent", input.playerId] });
    },
  });
}
