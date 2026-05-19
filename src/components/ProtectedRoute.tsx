/**
 * VITAS — ProtectedRoute
 *
 * Si el usuario no tiene sesión activa → redirige a /login.
 * Si Supabase no está configurado → deja pasar (modo dev offline).
 * Mientras carga la sesión → muestra splash de carga.
 *
 * Onboarding check uses server-authoritative async verification
 * to prevent localStorage bypass.
 */

import { useState, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { UserProfileService } from "@/services/real/userProfileService";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, configured } = useAuth();
  const location = useLocation();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);

  // Server-authoritative onboarding check
  useEffect(() => {
    if (!user || !configured || location.pathname === "/onboarding") {
      setOnboardingChecked(true);
      setOnboardingDone(true);
      return;
    }

    // Fast sync check first (avoids flash)
    const syncResult = UserProfileService.isOnboardingCompleted(user.id);
    if (syncResult) {
      setOnboardingDone(true);
      setOnboardingChecked(true);
      return;
    }

    // Async server check (authoritative)
    UserProfileService.isOnboardingCompletedAsync(user.id).then((done) => {
      setOnboardingDone(done);
      setOnboardingChecked(true);
    });
  }, [user, configured, location.pathname]);

  // Supabase no configurado → permite acceso sin auth (modo dev)
  if (!configured) return <>{children}</>;

  // Cargando sesión o onboarding check → splash
  if (loading || !onboardingChecked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 size={28} className="text-primary" />
        </motion.div>
        <p className="text-xs font-display text-muted-foreground tracking-widest uppercase">
          Verificando sesión…
        </p>
      </div>
    );
  }

  // Sin sesión → login, guardando la ruta original
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Onboarding no completado → redirigir (excepto si ya está en /onboarding)
  if (location.pathname !== "/onboarding" && !onboardingDone) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
