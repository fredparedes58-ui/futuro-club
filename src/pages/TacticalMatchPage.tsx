/**
 * VITAS · TacticalMatchPage
 * /tactical/:matchId
 *
 * Página de detalle de un match con heatmaps por fase. Feature gate Pro+.
 */
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Activity, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

import { usePlan } from "@/hooks/usePlan";
import { TacticalDashboard } from "@/components/tactical/TacticalDashboard";
import { PlayerService } from "@/services/real/playerService";

export default function TacticalMatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { canUseBehavioral } = usePlan(); // reuse same gate as other Pro+ modules

  // Pick first player as upload target (the modal needs a playerId because
  // the analysis pipeline is per-player; team matches use the captain or
  // first available player as anchor).
  const uploadTarget = useMemo(() => {
    const players = PlayerService.getAll();
    return players[0] ?? null;
  }, []);

  if (!canUseBehavioral) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-30 glass-strong border-b border-border">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft size={18} />
            </Button>
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-cyan-400" />
              <h1 className="text-lg font-display font-bold">Heatmap táctico</h1>
            </div>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-12 text-center">
          <Lock size={32} className="text-amber-400 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Función Pro+</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            El análisis táctico con heatmaps por fase está disponible en el plan Pro y Club.
          </p>
          <Button onClick={() => navigate("/billing")}>Ver planes</Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <Activity size={18} className="text-cyan-400 shrink-0" />
            <h1 className="text-lg font-display font-bold truncate">
              Heatmap táctico
              {matchId && (
                <span className="text-muted-foreground font-normal ml-2 text-sm">
                  · Match {matchId.slice(0, 8)}
                </span>
              )}
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {!matchId ? (
          <div className="text-center text-muted-foreground py-12">
            Match no especificado
          </div>
        ) : (
          <TacticalDashboard
            matchId={matchId}
            uploadTargetPlayerId={uploadTarget?.id}
            uploadTargetPlayerName={uploadTarget?.name}
          />
        )}
      </main>
    </div>
  );
}
