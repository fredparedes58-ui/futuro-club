/**
 * VITAS — useOrganization hook
 * Carga y gestiona la organización activa del usuario.
 * Se inicializa al login y mantiene el org_id disponible para todas las queries.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { OrganizationService, type Organization } from "@/services/real/organizationService";

const STALE_TIME = 1000 * 60 * 10; // 10 minutos

/**
 * Hook principal: obtiene la org activa del usuario.
 * - Al cargar, busca la org en Supabase (o cache local)
 * - Expone org, orgId, y helpers
 */
export function useOrganization() {
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ["organization", userId],
    queryFn: () => OrganizationService.fetchForUser(userId!),
    enabled: !!userId,
    staleTime: STALE_TIME,
    retry: 1,
    // Si ya hay una org en cache local, usarla como initialData
    initialData: () => OrganizationService.getCurrent(),
  });

  return {
    org: query.data ?? null,
    orgId: query.data?.id ?? null,
    orgName: query.data?.name ?? null,
    orgPlan: query.data?.plan ?? "free",
    isOwner: query.data?.owner_id === userId,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * Crear organización (usado en onboarding).
 */
export function useCreateOrganization() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => {
      if (!user?.id) throw new Error("No user");
      return OrganizationService.create(user.id, name);
    },
    onSuccess: (org) => {
      if (org) {
        queryClient.setQueryData(["organization", user?.id], org);
      }
    },
  });
}

/**
 * Actualizar organización (nombre, logo).
 */
export function useUpdateOrganization() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, updates }: { orgId: string; updates: Partial<Pick<Organization, "name" | "logo_url">> }) => {
      return OrganizationService.update(orgId, updates);
    },
    onSuccess: (org) => {
      if (org) {
        queryClient.setQueryData(["organization", user?.id], org);
      }
    },
  });
}

/**
 * Obtener miembros de la org activa.
 */
export function useOrgMembers(orgId: string | null) {
  return useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => OrganizationService.getMembers(orgId!),
    enabled: !!orgId,
    staleTime: STALE_TIME,
  });
}
