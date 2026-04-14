import { useParams, Link } from "react-router-dom";
import TopNav from "@/components/TopNav";
import ProjectionComparator from "@/components/role-profile/ProjectionComparator";
import CapabilityCards from "@/components/role-profile/CapabilityCards";
import EmptyState from "@/components/role-profile/EmptyState";
import { PlayerHeaderSkeleton, CapabilityCardsSkeleton, PositionFitSkeleton } from "@/components/role-profile/Skeletons";
import { useRoleProfile } from "@/hooks/useRoleProfile";
import { POSITION_LABELS } from "@/lib/roleProfileData";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function RoleProfileCompare() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { data, isLoading, isError, error, refetch } = useRoleProfile(id);
  const [selectedHorizon, setSelectedHorizon] = useState<"0_6m" | "6_18m" | "18_36m">("18_36m");

  useEffect(() => {
    if (isError) toast.error(t("toasts.compareLoadError", { error: error?.message || t("errors.unknownError") }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError, error]);

  const horizons = [
    { key: "0_6m" as const, label: t("roleProfile.compare.horizons.0_6m") },
    { key: "6_18m" as const, label: t("roleProfile.compare.horizons.6_18m") },
    { key: "18_36m" as const, label: t("roleProfile.compare.horizons.18_36m") },
  ];

  const dims = [
    { key: "tactical" as const, label: t("roleProfile.compare.dimensions.tactical") },
    { key: "technical" as const, label: t("roleProfile.compare.dimensions.technical") },
    { key: "physical" as const, label: t("roleProfile.compare.dimensions.physical") },
  ];

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to={`/players/${id}/role-profile`}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("roleProfile.subtitle")}</p>
              <h2 className="font-display text-2xl font-bold">{t("roleProfile.compareTitle")}</h2>
            </div>
          </div>
          <div className="flex gap-1 bg-muted rounded-md p-0.5">
            {horizons.map(h => (
              <Button
                key={h.key}
                variant={selectedHorizon === h.key ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSelectedHorizon(h.key)}
              >
                {h.label}
              </Button>
            ))}
          </div>
        </div>

        {isLoading && (
          <>
            <PlayerHeaderSkeleton />
            <CapabilityCardsSkeleton />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PositionFitSkeleton />
              <PositionFitSkeleton />
            </div>
          </>
        )}

        {isError && (
          <EmptyState type="no-data" onAction={() => refetch()} actionLabel={t("common.retry")} />
        )}

        {!isLoading && !isError && data === null && (
          <EmptyState type="agent-unavailable" onAction={() => window.history.back()} actionLabel={t("roleProfile.backToProfile")} />
        )}

        {data && (() => {
          const positions = [...data.positions].sort((a, b) => b.score - a.score);

          return (
            <>
              <div className="font-display text-lg font-semibold">
                {data.player_name} — {data.player_age} años
              </div>

              <CapabilityCards data={data} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border-border bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-display">Posiciones actuales (top 5)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {positions.slice(0, 5).map((pos, i) => (
                      <div key={pos.code} className="flex items-center gap-3 p-2 rounded bg-muted/30">
                        <span className="text-xs font-mono text-primary w-4">{i + 1}</span>
                        <span className="font-display font-bold text-sm w-10">{pos.code}</span>
                        <span className="text-xs text-muted-foreground flex-1">{POSITION_LABELS[pos.code]}</span>
                        <span className="font-mono text-sm">{pos.score.toFixed(1)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-display">
                      Posiciones proyectadas ({horizons.find(h => h.key === selectedHorizon)?.label})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {positions.slice(0, 5).map((pos, i) => {
                      const proj = data.projections[selectedHorizon];
                      const boost = (proj.tactical - data.current.tactical) * 0.3 +
                        (proj.technical - data.current.technical) * 0.4 +
                        (proj.physical - data.current.physical) * 0.3;
                      return (
                        <div key={pos.code} className="flex items-center gap-3 p-2 rounded bg-muted/30">
                          <span className="text-xs font-mono text-electric w-4">{i + 1}</span>
                          <span className="font-display font-bold text-sm w-10">{pos.code}</span>
                          <span className="text-xs text-muted-foreground flex-1">{POSITION_LABELS[pos.code]}</span>
                          <span className="font-mono text-sm text-electric">{(pos.score + boost).toFixed(1)}</span>
                          <span className="font-mono text-xs text-primary">+{boost.toFixed(1)}</span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-display">Detalle de delta por dimensión</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-6">
                    {dims.map(({ key, label }) => {
                      const now = data.current[key];
                      const proj = data.projections[selectedHorizon][key];
                      const delta = proj - now;
                      return (
                        <div key={key} className="space-y-2">
                          <p className="text-sm font-medium">{label}</p>
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-display font-bold">{now.toFixed(1)}</span>
                            <ArrowRight className="w-4 h-4 text-muted-foreground" />
                            <span className="text-2xl font-display font-bold text-electric">{proj.toFixed(1)}</span>
                          </div>
                          <span className={`text-sm font-mono ${delta > 0 ? "text-primary" : "text-danger"}`}>
                            {delta > 0 ? "+" : ""}{delta.toFixed(1)} pts
                          </span>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary/50 rounded-full" style={{ width: `${Math.min((delta / 20) * 100, 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <ProjectionComparator data={data} />
            </>
          );
        })()}
      </main>
    </div>
  );
}
