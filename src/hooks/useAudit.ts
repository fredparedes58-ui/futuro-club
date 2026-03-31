/**
 * useAudit — Hook para auditoría de sistema VITAS
 * Expone AuditService a la UI con React Query.
 */

import { useQuery } from "@tanstack/react-query";
import { AuditService, type AuditReport } from "@/services/real/auditService";

// ─── Auditoría frontend (síncrona, sin agentes) ───────────────────────────────
export function useAuditSync() {
  return useQuery<AuditReport>({
    queryKey: ["audit", "sync"],
    queryFn: () => AuditService.runSync(),
    staleTime: 60_000,        // reauditar cada 1 minuto
    refetchOnWindowFocus: false,
  });
}

// ─── Auditoría completa (incluye ping a agentes) ──────────────────────────────
export function useAuditFull() {
  return useQuery<AuditReport>({
    queryKey: ["audit", "full"],
    queryFn: () => AuditService.runFull(),
    staleTime: 120_000,       // reauditar cada 2 minutos
    refetchOnWindowFocus: false,
  });
}

// ─── Solo el estado general (para badges en TopNav o dashboard) ───────────────
export function useSystemStatus() {
  const { data, isLoading } = useAuditSync();
  return {
    status: data?.overall ?? "ok",
    isLoading,
    summary: data?.summary ?? { total: 0, ok: 0, warnings: 0, errors: 0 },
  };
}
