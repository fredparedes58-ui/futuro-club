/**
 * VITAS · CoachDashboardPage (Sprint 16)
 *
 * Page at /coach. Visible for "coach" and "director" roles.
 * Wraps CoachDashboard with page chrome (header, back button).
 */
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ClipboardList } from "lucide-react";
import CoachDashboard from "@/components/coaching/CoachDashboard";
import { useAuth, getUserDisplayName } from "@/context/AuthContext";
import { RoleGuard } from "@/components/RoleGuard";

export default function CoachDashboardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, orgId } = useAuth();

  // teamId real: prioridad URL (?teamId=) → organización del coach → id de
  // usuario → fallback demo. Así /coach opera sobre el equipo del coach
  // autenticado en lugar de un equipo ficticio.
  const teamId =
    searchParams.get("teamId") ?? orgId ?? user?.id ?? "default-team";
  const teamName =
    searchParams.get("teamName") ??
    (user ? `Equipo de ${getUserDisplayName(user)}` : "Mi equipo");

  return (
    <RoleGuard
      roles={["coach", "director"]}
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="text-center space-y-3">
            <p className="font-display font-bold text-lg text-foreground">Acceso restringido</p>
            <p className="text-sm text-muted-foreground">
              Solo entrenadores y directores pueden acceder al Coaching Assistant.
            </p>
            <button onClick={() => navigate("/pulse")} className="text-primary text-sm font-display underline">
              Volver al dashboard
            </button>
          </div>
        </div>
      }
    >
    <motion.div
      className="min-h-screen pb-24 px-4 pt-4 max-w-6xl mx-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft size={18} className="text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <ClipboardList size={20} className="text-primary" />
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">
              Coaching Assistant
            </h1>
            <p className="text-[10px] text-muted-foreground">
              {teamName} — Análisis y planificación de sesiones
            </p>
          </div>
        </div>
      </div>

      <CoachDashboard teamId={teamId} teamName={teamName} />
    </motion.div>
    </RoleGuard>
  );
}
