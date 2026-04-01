import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MatchEventsService,
  type CreateMatchEventInput,
} from "@/services/real/matchEventsService";
import { toast } from "sonner";

const STALE = 1000 * 60; // 1 min

// ── List events for a player ─────────────────────────────────────────────────
export function useMatchEvents(playerId: string | undefined) {
  return useQuery({
    queryKey: ["match-events", playerId],
    queryFn:  () => playerId ? MatchEventsService.getByPlayerId(playerId) : [],
    enabled:  !!playerId,
    staleTime: STALE,
  });
}

// ── Log a new event ───────────────────────────────────────────────────────────
export function useLogMatchEvent(playerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreateMatchEventInput, "playerId">) =>
      MatchEventsService.create({ ...input, playerId }),
    onSuccess: () => {
      toast.success("Evento registrado");
      void qc.invalidateQueries({ queryKey: ["match-events", playerId] });
    },
    onError: (err: Error) => {
      toast.error(`Error al registrar: ${err.message}`);
    },
  });
}

// ── Delete a single event ─────────────────────────────────────────────────────
export function useDeleteMatchEvent(playerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => MatchEventsService.delete(eventId),
    onSuccess: () => {
      toast.success("Evento eliminado");
      void qc.invalidateQueries({ queryKey: ["match-events", playerId] });
    },
  });
}
