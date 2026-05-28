/**
 * VITAS · WellbeingDashboardPage (Sprint 23)
 * /wellbeing
 *
 * Page wrapper for the team wellbeing dashboard.
 * Only visible for roles "coach" and "director".
 * Feature gate: Club plan.
 */
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import WellbeingDashboard from "@/components/wellbeing/WellbeingDashboard";

export default function WellbeingDashboardPage() {
  const navigate = useNavigate();

  return (
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

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        <WellbeingDashboard />
      </main>
    </div>
  );
}
