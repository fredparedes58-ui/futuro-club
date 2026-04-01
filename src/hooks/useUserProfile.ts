/**
 * useUserProfile — Perfil y rol del usuario autenticado
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import {
  UserProfileService,
  type UserProfile,
  type ProfileType,
  type UserRole,
  ROLE_PERMISSIONS,
  type RolePermissions,
} from "@/services/real/userProfileService";

export interface UserProfileState {
  profile: UserProfile | null;
  role: UserRole;
  permissions: RolePermissions;
  isOnboardingCompleted: boolean;
  isDirector: boolean;
  isLoading: boolean;
}

export function useUserProfile(): UserProfileState {
  const { user } = useAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      await UserProfileService.syncFromSupabase(user.id);
      return UserProfileService.get(user.id);
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!user?.id,
  });

  const role: UserRole = profile?.role ?? "scout";
  const permissions = ROLE_PERMISSIONS[role];

  return {
    profile: profile ?? null,
    role,
    permissions,
    isOnboardingCompleted: profile?.onboardingCompleted ?? false,
    isDirector: role === "director",
    isLoading,
  };
}

export function useCreateUserProfile() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: {
      profileType: ProfileType;
      role: UserRole;
      organizationName?: string;
    }) => {
      if (!user?.id) throw new Error("No user");
      return Promise.resolve(
        UserProfileService.create({
          userId: user.id,
          profileType: data.profileType,
          role: data.role,
          organizationName: data.organizationName,
          onboardingCompleted: false,
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile", user?.id] });
    },
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: () => {
      if (!user?.id) throw new Error("No user");
      UserProfileService.completeOnboarding(user.id);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile", user?.id] });
    },
  });
}
