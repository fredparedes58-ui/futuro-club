/**
 * VITAS — useTeam hooks
 * TanStack Query v5 wrappers para TeamService.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TeamService } from "@/services/real/teamService";
import type { UserRole } from "@/services/real/userProfileService";

export function useTeamMembers(orgOwnerId?: string) {
  return useQuery({
    queryKey: ["team-members", orgOwnerId],
    queryFn: () => TeamService.getMembers(orgOwnerId!),
    enabled: !!orgOwnerId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useTeamInvitations(orgOwnerId?: string) {
  return useQuery({
    queryKey: ["team-invitations", orgOwnerId],
    queryFn: () => TeamService.getInvitations(orgOwnerId!),
    enabled: !!orgOwnerId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useInviteMember(orgOwnerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: UserRole }) =>
      TeamService.invite(orgOwnerId, email, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-invitations", orgOwnerId] });
    },
  });
}

export function useRemoveMember(orgOwnerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => TeamService.removeMember(orgOwnerId, memberId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-members", orgOwnerId] });
    },
  });
}

export function useCancelInvitation(orgOwnerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) => TeamService.cancelInvitation(invitationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-invitations", orgOwnerId] });
    },
  });
}

// ── Acceso a club (Rama B) ─────────────────────────────────────────────────

/** Código de invitación del club del director (se genera si falta). */
export function useJoinCode(enabled: boolean) {
  return useQuery({
    queryKey: ["club-join-code"],
    queryFn: () => TeamService.getJoinCode(),
    enabled,
    staleTime: 1000 * 60 * 5,
  });
}

export function useRegenJoinCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => TeamService.regenJoinCode(),
    onSuccess: (code) => qc.setQueryData(["club-join-code"], code),
  });
}

/** Solicitudes de acceso pendientes al club del director. */
export function useAccessRequests(enabled: boolean) {
  return useQuery({
    queryKey: ["club-access-requests"],
    queryFn: () => TeamService.listRequests(),
    enabled,
    staleTime: 1000 * 30,
  });
}

export function useDecideRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, decision }: { requestId: string; decision: "approve" | "reject" }) =>
      TeamService.decideRequest(requestId, decision),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club-access-requests"] });
    },
  });
}

/** Un usuario solicita unirse a un club por su código. */
export function useRequestAccess() {
  return useMutation({
    mutationFn: ({ code, message }: { code: string; message?: string }) =>
      TeamService.requestAccess(code, message),
  });
}
