/**
 * RoleGuard — Renderizado condicional por rol de usuario
 */

import { Loader2 } from "lucide-react";
import { useUserProfile } from "@/hooks/useUserProfile";
import type { UserRole } from "@/services/real/userProfileService";

interface RoleGuardProps {
  /** Roles que tienen acceso */
  roles: UserRole[];
  children: React.ReactNode;
  /** Qué mostrar si el rol no tiene acceso. Por defecto: null */
  fallback?: React.ReactNode;
}

export function RoleGuard({ roles, children, fallback = null }: RoleGuardProps) {
  const { role, isLoading } = useUserProfile();

  // Mientras el perfil carga (incluye syncFromSupabase), role cae al default
  // "scout" → un director legítimo veía un flash de "Acceso restringido".
  // Esperamos a que resuelva antes de decidir el gate.
  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }

  if (roles.includes(role)) return <>{children}</>;
  return <>{fallback}</>;
}
