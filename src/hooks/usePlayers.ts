/**
 * usePlayers — Hooks para operaciones sobre jugadores
 * Conecta PlayerService + adaptadores con React Query.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PlayerService, type CreatePlayerInput } from "@/services/real/playerService";
import { adaptPlayerForUI } from "@/services/real/adapters";

// ─── Hook: Un jugador por ID ──────────────────────────────────────────────────
export function usePlayerById(id: string | undefined) {
  return useQuery({
    queryKey: ["player", id],
    queryFn: () => {
      if (!id) return null;
      const player = PlayerService.getById(id);
      if (!player) return null;
      return adaptPlayerForUI(player);
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
}

// ─── Hook: Jugador raw (sin adaptar) — para formularios y agentes ─────────────
export function useRawPlayerById(id: string | undefined) {
  return useQuery({
    queryKey: ["player-raw", id],
    queryFn: () => {
      if (!id) return null;
      return PlayerService.getById(id);
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  });
}

// ─── Hook: Todos los jugadores adaptados para UI ──────────────────────────────
export function useAllPlayers() {
  return useQuery({
    queryKey: ["players-all"],
    queryFn: () => {
      PlayerService.seedIfEmpty();
      return PlayerService.getAll().map(adaptPlayerForUI);
    },
    staleTime: 1000 * 60 * 2, // 2 minutos
  });
}

// ─── Mutation: Crear jugador ──────────────────────────────────────────────────
export function useCreatePlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlayerInput) => {
      const player = PlayerService.create(input);
      return Promise.resolve(player);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players-all"] });
      queryClient.invalidateQueries({ queryKey: ["rankings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ─── Mutation: Actualizar métricas ────────────────────────────────────────────
export function useUpdateMetrics() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, metrics }: { id: string; metrics: CreatePlayerInput["metrics"] }) => {
      const player = PlayerService.updateMetrics(id, metrics);
      return Promise.resolve(player);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["player", id] });
      queryClient.invalidateQueries({ queryKey: ["player-raw", id] });
      queryClient.invalidateQueries({ queryKey: ["players-all"] });
      queryClient.invalidateQueries({ queryKey: ["rankings"] });
    },
  });
}

// ─── Mutation: Eliminar jugador ───────────────────────────────────────────────
export function useDeletePlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      PlayerService.delete(id);
      return Promise.resolve(id);
    },
    onSuccess: (id) => {
      queryClient.removeQueries({ queryKey: ["player", id] });
      queryClient.removeQueries({ queryKey: ["player-raw", id] });
      queryClient.invalidateQueries({ queryKey: ["players-all"] });
      queryClient.invalidateQueries({ queryKey: ["rankings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
