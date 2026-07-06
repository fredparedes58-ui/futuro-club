/**
 * RequirePermission — Renderizado condicional por permiso específico.
 * A diferencia de RoleGuard (que chequea roles), este chequea permisos granulares.
 *
 * Uso:
 *   <RequirePermission permission="canEditPlayers" fallback={<UpgradeBanner />}>
 *     <EditPlayerForm />
 *   </RequirePermission>
 */

import { useUserProfile } from "@/hooks/useUserProfile";
import type { RolePermissions } from "@/services/real/userProfileService";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

// ── Tipos ───────────────────────────────────────────────────────────────────

export type PermissionKey = keyof RolePermissions;

interface RequirePermissionProps {
  /** El permiso requerido (debe ser true en RolePermissions) */
  permission: PermissionKey;
  children: React.ReactNode;
  /** Qué mostrar si no tiene permiso. Default: mensaje genérico */
  fallback?: React.ReactNode;
  /** Si true, renderiza children pero deshabilitado (opacity + pointer-events-none) */
  disableInstead?: boolean;
}

// ── Fallback por defecto ────────────────────────────────────────────────────

function DefaultFallback({ permission }: { permission: PermissionKey }) {
  const { t } = useTranslation();

  const labels: Record<PermissionKey, string> = {
    canCreatePlayers: t("requirePermission.canCreatePlayers"),
    canEditPlayers: t("requirePermission.canEditPlayers"),
    canDeletePlayers: t("requirePermission.canDeletePlayers"),
    canRunAnalysis: t("requirePermission.canRunAnalysis"),
    canViewAllPlayers: t("requirePermission.canViewAllPlayers"),
    canManageTeam: t("requirePermission.canManageTeam"),
    canViewDirectorDashboard: t("requirePermission.canViewDirectorDashboard"),
    canExportPDF: t("requirePermission.canExportPDF"),
    canViewVideoAnalysis: t("requirePermission.canViewVideoAnalysis"),
  };

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">
      <Lock size={12} className="shrink-0" />
      <span>{t("requirePermission.noPermission", { action: labels[permission] ?? permission })}</span>
    </div>
  );
}

// ── Componente ──────────────────────────────────────────────────────────────

export function RequirePermission({
  permission,
  children,
  fallback,
  disableInstead = false,
}: RequirePermissionProps) {
  const { permissions } = useUserProfile();

  const hasPermission = permissions[permission];

  if (hasPermission) return <>{children}</>;

  if (disableInstead) {
    return (
      <div className="opacity-40 pointer-events-none select-none" aria-disabled="true">
        {children}
      </div>
    );
  }

  return <>{fallback ?? <DefaultFallback permission={permission} />}</>;
}

// ── Hook helper (para uso imperativo, no JSX) ──────────────────────────────

export function usePermission(permission: PermissionKey): boolean {
  const { permissions } = useUserProfile();
  return permissions[permission];
}
