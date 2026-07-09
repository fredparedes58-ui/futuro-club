/**
 * VITAS · TacticalMatchPage
 * /tactical/:matchId
 *
 * Página de detalle de un match con heatmaps por fase. Feature gate Pro+.
 */
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Activity, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

import { usePlan } from "@/hooks/usePlan";
import { TacticalDashboard } from "@/components/tactical/TacticalDashboard";
import { useAllPlayers } from "@/hooks/usePlayers";

export default function TacticalMatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { canUseBehavioral } = usePlan(); // reuse same gate as other Pro+ modules

  // Pick first player as upload target (the modal needs a playerId because
  // the analysis pipeline is per-player; team matches use the captain or
  // first available player as anchor). Fuente reactiva (Supabase) en vez de un
  // snapshot de localStorage congelado, para no perder el target si el pull
  // aún no había terminado.
  const { data: players = [] } = useAllPlayers();
  const uploadTarget = players[0] ?? null;

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
              <h1 className="text-lg font-display font-bold">{t("tacticalMatchPage.title")}</h1>
            </div>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-12 text-center">
          <Lock size={32} className="text-amber-400 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-foreground mb-2">{t("tacticalMatchPage.proFeatureHeading")}</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            {t("tacticalMatchPage.proFeatureDescription")}
          </p>
          <Button onClick={() => navigate("/billing")}>{t("tacticalMatchPage.viewPlans")}</Button>
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
              {t("tacticalMatchPage.title")}
              {matchId && (
                <span className="text-muted-foreground font-normal ml-2 text-sm">
                  {t("tacticalMatchPage.matchLabel", { id: matchId.slice(0, 8) })}
                </span>
              )}
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {!matchId ? (
          <div className="text-center text-muted-foreground py-12">
            {t("tacticalMatchPage.matchNotSpecified")}
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
