/**
 * useLegalAcceptance — Legal document acceptance state
 *
 * Checks if user has accepted current versions of terms/privacy.
 * Provides methods to accept documents and track status.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/apiAuth";

// ── Types ────────────────────────────────────────────────────────────────────

export interface LegalStatus {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  needsAcceptance: boolean;
  currentVersions: Record<string, string>;
  acceptances: Array<{
    document: string;
    version: string;
    acceptedAt: string;
    isCurrent: boolean;
  }>;
}

// ── Local storage cache key ──────────────────────────────────────────────────

const CACHE_KEY = "legal_acceptance_cache";

function getCachedStatus(): LegalStatus | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LegalStatus;
  } catch {
    return null;
  }
}

function setCachedStatus(status: LegalStatus): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(status));
  } catch { /* ignore */ }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useLegalAcceptance() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<LegalStatus>({
    queryKey: ["legal-status", user?.id],
    queryFn: async (): Promise<LegalStatus> => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/legal/status", { headers });
        if (res.ok) {
          const data = await res.json() as { data: LegalStatus };
          const status = data.data ?? (data as unknown as LegalStatus);
          setCachedStatus(status);
          return status;
        }
      } catch { /* fallback below */ }

      // Fallback: check cache or assume accepted
      const cached = getCachedStatus();
      if (cached) return cached;

      return {
        termsAccepted: true,
        privacyAccepted: true,
        needsAcceptance: false,
        currentVersions: {},
        acceptances: [],
      };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });

  const acceptMutation = useMutation({
    mutationFn: async ({ document, version }: { document: string; version: string }) => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/legal/accept", {
        method: "POST",
        headers,
        body: JSON.stringify({ document, version }),
      });
      if (!res.ok) throw new Error("Error al aceptar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legal-status"] });
    },
  });

  const acceptAll = async () => {
    const versions = query.data?.currentVersions ?? {};
    const promises: Promise<unknown>[] = [];

    if (!query.data?.termsAccepted && versions.terms) {
      promises.push(acceptMutation.mutateAsync({ document: "terms", version: versions.terms }));
    }
    if (!query.data?.privacyAccepted && versions.privacy) {
      promises.push(acceptMutation.mutateAsync({ document: "privacy", version: versions.privacy }));
    }

    await Promise.all(promises);
  };

  return {
    ...query.data,
    isLoading: query.isLoading,
    needsAcceptance: query.data?.needsAcceptance ?? false,
    acceptDocument: acceptMutation.mutateAsync,
    acceptAll,
    isAccepting: acceptMutation.isPending,
  };
}
