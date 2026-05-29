/**
 * VITAS · Parental Consent Hooks
 *
 * TanStack Query hooks around ParentalConsentService for the RGPD
 * workflow (/admin/consent and /family/:playerId).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ParentalConsentService,
  type ParentalConsent,
} from "@/services/real/parentalConsentService";
import { toast } from "sonner";

const STALE = 1000 * 60 * 2; // 2 min

/** Get consent state for one player */
export function usePlayerConsent(playerId: string | undefined) {
  return useQuery<ParentalConsent | null>({
    queryKey: ["parental-consent", playerId],
    queryFn: () => (playerId ? ParentalConsentService.getForPlayer(playerId) : Promise.resolve(null)),
    enabled: !!playerId,
    staleTime: STALE,
  });
}

/** List all consents (for /admin/consent) */
export function useAllConsents() {
  return useQuery({
    queryKey: ["parental-consents", "all"],
    queryFn: () => ParentalConsentService.listAll(),
    staleTime: STALE,
  });
}

/** Only pending consents */
export function usePendingConsents() {
  return useQuery({
    queryKey: ["parental-consents", "pending"],
    queryFn: () => ParentalConsentService.listPending(),
    staleTime: STALE,
  });
}

/** Stats for the dashboard widget */
export function useConsentStats() {
  return useQuery({
    queryKey: ["parental-consents", "stats"],
    queryFn: () => ParentalConsentService.getStats(),
    staleTime: STALE,
  });
}

interface GrantInput {
  playerId: string;
  guardianName: string;
  guardianEmail: string;
}

export function useGrantConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ playerId, guardianName, guardianEmail }: GrantInput) =>
      ParentalConsentService.grant(playerId, guardianName, guardianEmail),
    onSuccess: () => {
      toast.success("Consentimiento parental concedido");
      qc.invalidateQueries({ queryKey: ["parental-consent"] });
      qc.invalidateQueries({ queryKey: ["parental-consents"] });
    },
    onError: () => toast.error("No se pudo guardar el consentimiento"),
  });
}

export function useDenyConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ playerId, guardianName }: { playerId: string; guardianName?: string }) =>
      ParentalConsentService.deny(playerId, guardianName),
    onSuccess: () => {
      toast.warning("Consentimiento denegado · datos del menor anonimizados");
      qc.invalidateQueries({ queryKey: ["parental-consent"] });
      qc.invalidateQueries({ queryKey: ["parental-consents"] });
    },
  });
}

export function useSendConsentReminder() {
  return useMutation({
    mutationFn: (playerId: string) => ParentalConsentService.sendReminder(playerId),
    onSuccess: (res) => {
      if (res.ok) toast.success("Recordatorio enviado al tutor");
      else if (res.reason === "email_service_not_configured")
        toast.info("Servicio de email no configurado todavía");
      else toast.error("Fallo enviando recordatorio");
    },
  });
}
