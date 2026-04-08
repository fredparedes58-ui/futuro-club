/**
 * usePlayers — Hooks para operaciones sobre jugadores
 * Conecta PlayerService + adaptadores con React Query.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PlayerService, type CreatePlayerInput } from "@/services/real/playerService";
import { adaptPlayerForUI } from "@/services/real/adapters";
import { useAuth } from "@/context/AuthContext";
import { SupabasePlayerService } from "@/services/real/supabasePlayerService";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";

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
      if (!SUPABASE_CONFIGURED) {
        PlayerService.seedIfEmpty(); // only seed in local/demo mode
      }
      return PlayerService.getAll().map(adaptPlayerForUI);
    },
    staleTime: 1000 * 60 * 2, // 2 minutos
  });
}

// ─── Mutation: Crear jugador ──────────────────────────────────────────────────
export function useCreatePlayer() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: CreatePlayerInput) => {
      if (user && SUPABASE_CONFIGURED) {
        return SupabasePlayerService.create(user.id, input);
      }
      return PlayerService.create(input);
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
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, metrics }: { id: string; metrics: CreatePlayerInput["metrics"] }) => {
      if (user && SUPABASE_CONFIGURED) {
        return SupabasePlayerService.updateMetrics(user.id, id, metrics);
      }
      return await PlayerService.updateMetrics(id, metrics);
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
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (user && SUPABASE_CONFIGURED) {
        await SupabasePlayerService.delete(user.id, id);
      } else {
        PlayerService.delete(id);
      }
      return id;
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
