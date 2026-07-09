/**
 * VITAS · WellbeingDashboardPage (Sprint 23)
 * /wellbeing
 *
 * Page wrapper for the team wellbeing dashboard.
 * Only visible for roles "coach" and "director".
 * Feature gate: Club plan.
 */
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import WellbeingDashboard from "@/components/wellbeing/WellbeingDashboard";
import { RoleGuard } from "@/components/RoleGuard";
import { usePlan } from "@/hooks/usePlan";

export default function WellbeingDashboardPage() {
  const navigate = useNavigate();
  const { canUseTeamWellbeing } = usePlan();

  return (
    <RoleGuard
      roles={["coach", "director"]}
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="text-center space-y-3">
            <p className="font-display font-bold text-lg text-foreground">Acceso restringido</p>
            <p className="text-sm text-muted-foreground">
              Solo entrenadores y directores pueden ver el bienestar del equipo.
            </p>
            <button onClick={() => navigate("/pulse")} className="text-primary text-sm font-display underline">
              Volver al dashboard
            </button>
          </div>
        </div>
      }
    >
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft size={18} />
            </Button>
            <div className="flex items-center gap-2">
              <Heart size={18} className="text-rose-400" />
              <h1 className="text-lg font-display font-bold text-foreground">
                Bienestar del Equipo
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* Content — gate de plan Club (además del gate de rol) */}
      {!canUseTeamWellbeing ? (
        <main className="max-w-3xl mx-auto px-4 py-12 text-center">
          <Lock size={32} className="text-amber-400 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Función del plan Club
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            El panel de Bienestar del Equipo (riesgo de abandono, engagement e
            intervención) está disponible en el plan Club.
          </p>
          <Button onClick={() => navigate("/billing")}>Ver planes</Button>
        </main>
      ) : (
        <main className="max-w-5xl mx-auto px-4 py-6">
          <WellbeingDashboard />
        </main>
      )}
    </div>
    </RoleGuard>
  );
}
