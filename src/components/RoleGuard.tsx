/**
 * RoleGuard — Renderizado condicional por rol de usuario
 */

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
  const { role } = useUserProfile();

  if (roles.includes(role)) return <>{children}</>;
  return <>{fallback}</>;
}
