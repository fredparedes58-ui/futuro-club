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
import { useTranslation } from "react-i18next";
import { ArrowLeft, Target, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

import { usePlan } from "@/hooks/usePlan";
import { useIDPArchitectInput } from "@/hooks/useIDPArchitectInput";
import { IDPDashboard } from "@/components/idp/IDPDashboard";

export default function IDPPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
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
                {t("idpPage.title")}
              </h1>
            </div>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-12 text-center">
          <Lock size={32} className="text-amber-400 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            {t("idpPage.proFeature")}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            {t("idpPage.proFeatureDescription")}
          </p>
          <Button onClick={() => navigate("/billing")}>{t("idpPage.viewPlans")}</Button>
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
                {t("idpPage.title")}
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
              onClick={() => navigate(`/players/${playerId}`)}
              className="text-xs"
            >
              {t("idpPage.viewProfile")}
            </Button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {!playerId ? (
          <div className="text-center text-muted-foreground py-12">
            {t("idpPage.noPlayerId")}
          </div>
        ) : loadingPlayer ? (
          <div className="text-center text-muted-foreground py-12">
            {t("idpPage.loadingPlayer")}
          </div>
        ) : !architectInput ? (
          <div className="text-center text-muted-foreground py-12">
            {t("idpPage.playerNotFound")}
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
