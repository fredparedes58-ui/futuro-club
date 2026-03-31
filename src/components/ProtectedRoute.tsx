/**
 * VITAS — ProtectedRoute
 *
 * Si el usuario no tiene sesión activa → redirige a /login.
 * Si Supabase no está configurado → deja pasar (modo dev offline).
 * Mientras carga la sesión → muestra splash de carga.
 */

import { Navigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, configured } = useAuth();
  const location = useLocation();

  // Supabase no configurado → permite acceso sin auth (modo dev)
  if (!configured) return <>{children}</>;

  // Cargando sesión → splash
  if (loading) {
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

  return <>{children}</>;
}
