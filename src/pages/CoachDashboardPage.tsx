/**
 * VITAS · CoachDashboardPage (Sprint 16)
 *
 * Page at /coach. Visible for "coach" and "director" roles.
 * Wraps CoachDashboard with page chrome (header, back button).
 */
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ClipboardList } from "lucide-react";
import CoachDashboard from "@/components/coaching/CoachDashboard";

export default function CoachDashboardPage() {
  const navigate = useNavigate();

  // TODO: get teamId from auth context or URL params when multi-team support is added
  const teamId = "default-team";
  const teamName = "Equipo Sub-14";

  return (
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
  );
}
