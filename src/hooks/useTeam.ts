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
