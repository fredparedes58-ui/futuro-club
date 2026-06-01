/**
 * VITAS · IDPPage
 * /idp/:playerId
 *
 * Página principal del módulo Plan de Desarrollo Individual.
 * Hidrata `IDPArchitectInput` desde los hooks existentes (jugador + VSI +
 * PHV + behavioral profile + wellbeing) y monta el IDPDashboard.
 *
 * Feature gate: Pro+ (canUseIDP). Si no, muestra upgrade prompt.
 */

import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Target, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

import { usePlan } from "@/hooks/usePlan";
import { useIDPArchitectInput } from "@/hooks/useIDPArchitectInput";
import { IDPDashboard } from "@/components/idp/IDPDashboard";

export default function IDPPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const { canUseIDP } = usePlan();

  const { architectInput, liveMetrics, playerName, loading: loadingPlayer, dataRichness } =
    useIDPArchitectInput(playerId);

  // ── Feature gate ──
  if (!canUseIDP) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-30 glass-strong border-b border-border">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft size={18} />
            </Button>
            <div className="flex items-center gap-2">
              <Target size={18} className="text-cyan-400" />
              <h1 className="text-lg font-display font-bold text-foreground">
                Plan de Desarrollo
              </h1>
            </div>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-12 text-center">
          <Lock size={32} className="text-amber-400 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Función Pro+
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            Los Planes de Desarrollo Individual con IA están disponibles en el plan
            Pro y Club. Genera objetivos mensuales personalizados, asigna drills
            automáticamente y mide progreso con checkins.
          </p>
          <Button onClick={() => navigate("/billing")}>Ver planes</Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(-1)}>
              <ArrowLeft size={18} />
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              <Target size={18} className="text-cyan-400 shrink-0" />
              <h1 className="text-lg font-display font-bold text-foreground truncate">
                Plan de Desarrollo
                {playerName && (
                  <span className="text-muted-foreground font-normal ml-2 text-sm">
                    · {playerName}
                  </span>
                )}
              </h1>
            </div>
          </div>
          {playerId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/player/${playerId}`)}
              className="text-xs"
            >
              Ver perfil
            </Button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {!playerId ? (
          <div className="text-center text-muted-foreground py-12">
            ID de jugador no especificado
          </div>
        ) : loadingPlayer ? (
          <div className="text-center text-muted-foreground py-12">
            Cargando datos del jugador…
          </div>
        ) : !architectInput ? (
          <div className="text-center text-muted-foreground py-12">
            No se encontró el jugador
          </div>
        ) : (
          <IDPDashboard
            playerId={playerId}
            playerName={playerName}
            architectInput={architectInput}
            liveMetrics={liveMetrics}
            dataRichness={dataRichness}
          />
        )}
      </main>
    </div>
  );
}
