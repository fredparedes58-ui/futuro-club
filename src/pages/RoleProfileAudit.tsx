import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import TopNav from "@/components/TopNav";
import PlayerHeader from "@/components/role-profile/PlayerHeader";
import IndicatorsAuditTable from "@/components/role-profile/IndicatorsAuditTable";
import EvidenceDrawer from "@/components/role-profile/EvidenceDrawer";
import EmptyState from "@/components/role-profile/EmptyState";
import { PlayerHeaderSkeleton, AuditTableSkeleton } from "@/components/role-profile/Skeletons";
import { useRoleProfile } from "@/hooks/useRoleProfile";
import { PhaseOfPlay, EvidenceIndicator } from "@/lib/roleProfileData";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function RoleProfileAudit() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { data, isLoading, isError, error, refetch } = useRoleProfile(id);

  const [phaseFilter, setPhaseFilter] = useState<PhaseOfPlay | "all">("all");
  const [drawerIndicator, setDrawerIndicator] = useState<EvidenceIndicator | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (isError) toast.error(t("toasts.auditLoadError", { error: error?.message || t("errors.unknownError") }));
  }, [isError, error]);

  const phases = [
    { key: "all" as const, label: t("roleProfile.audit.phases.all") },
    { key: "in_possession" as const, label: t("roleProfile.audit.phases.inPossession") },
    { key: "out_of_possession" as const, label: t("roleProfile.audit.phases.outOfPossession") },
    { key: "transition" as const, label: t("roleProfile.audit.phases.transition") },
  ];

  const handleOpenEvidence = (indicatorKey: string) => {
    const found = data?.evidence.find(e => e.indicator === indicatorKey);
    if (found) {
      setDrawerIndicator(found);
      setDrawerOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to={`/players/${id}/role-profile`}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("roleProfile.subtitle")}</p>
              <h2 className="font-display text-2xl font-bold">{t("roleProfile.auditTitle")}</h2>
            </div>
          </div>
          <div className="flex gap-1 bg-muted rounded-md p-0.5">
            {phases.map(p => (
              <Button
                key={p.key}
                variant={phaseFilter === p.key ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setPhaseFilter(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {isLoading && (
          <>
            <PlayerHeaderSkeleton />
            <AuditTableSkeleton />
          </>
        )}

        {isError && (
          <EmptyState type="no-data" onAction={() => refetch()} actionLabel={t("common.retry")} />
        )}

        {data && (
          <>
            <PlayerHeader data={data} />

            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <span>{data.evidence.length} indicadores registrados</span>
              <span>{data.evidence.filter(e => e.reliability >= 0.75).length} con fiabilidad alta</span>
              <span>{data.evidence.filter(e => e.impact === "positivo").length} con impacto positivo</span>
            </div>

            <div className="bg-card border border-border rounded-lg">
              <IndicatorsAuditTable
                data={data}
                phaseFilter={phaseFilter}
                onOpenEvidence={handleOpenEvidence}
              />
            </div>

            <EvidenceDrawer
              indicator={drawerIndicator}
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
            />

            <div className="text-xs text-muted-foreground border-t border-border pt-4">
              <span>Run: <span className="font-mono">{data.run_id}</span></span>
              <span className="ml-4">Haz clic en una fila para ver el detalle de evidencia</span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
