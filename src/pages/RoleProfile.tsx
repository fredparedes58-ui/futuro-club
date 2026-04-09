import { useState, useCallback, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import TopNav from "@/components/TopNav";
import PlayerHeader from "@/components/role-profile/PlayerHeader";
import IdentityCard from "@/components/role-profile/IdentityCard";
import CapabilityCards from "@/components/role-profile/CapabilityCards";
import PositionFitRanking from "@/components/role-profile/PositionFitRanking";
import ArchetypeRanking from "@/components/role-profile/ArchetypeRanking";
import StrengthsRisksPanel from "@/components/role-profile/StrengthsRisksPanel";
import ProjectionComparator from "@/components/role-profile/ProjectionComparator";
import ViewModeToggle, { ViewMode } from "@/components/role-profile/ViewModeToggle";
import RoleProfileFilterBar, { type RoleProfileFilters } from "@/components/role-profile/RoleProfileFilterBar";
import EmptyState from "@/components/role-profile/EmptyState";
import { PlayerHeaderSkeleton, IdentityCardSkeleton, CapabilityCardsSkeleton, PositionFitSkeleton } from "@/components/role-profile/Skeletons";
import { useRoleProfile } from "@/hooks/useRoleProfile";
import { Button } from "@/components/ui/button";
import { FileText, GitCompare, Table2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function RoleProfile() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [mode, setMode] = useState<ViewMode>("scout");
  const [filters, setFilters] = useState<RoleProfileFilters | null>(null);
  const { data, isLoading, isError, error, refetch } = useRoleProfile(id);

  const handleFilterChange = useCallback((f: RoleProfileFilters) => {
    setFilters(f);
  }, []);

  useEffect(() => {
    if (isError) toast.error(t("toasts.roleProfileError", { error: error?.message || t("errors.unknownError") }));
  }, [isError, error]);

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t("roleProfile.subtitle")}</p>
            <h2 className="font-display text-2xl font-bold">{t("roleProfile.title")}</h2>
          </div>
          <div className="flex items-center gap-3">
            <ViewModeToggle mode={mode} onChange={setMode} />
            <Link to={`/players/${id}/role-profile/compare`}>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <GitCompare className="w-3.5 h-3.5" />
                {t("common.compare")}
              </Button>
            </Link>
            <Link to={`/players/${id}/role-profile/audit`}>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Table2 className="w-3.5 h-3.5" />
                {t("common.audit")}
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <FileText className="w-3.5 h-3.5" />
              {t("common.export")}
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <RoleProfileFilterBar onChange={handleFilterChange} />

        {/* Loading state */}
        {isLoading && (
          <>
            <PlayerHeaderSkeleton />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <IdentityCardSkeleton />
              <div className="lg:col-span-2"><CapabilityCardsSkeleton /></div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <PositionFitSkeleton />
              <PositionFitSkeleton />
            </div>
          </>
        )}

        {/* Error / empty state */}
        {isError && (
          <EmptyState type="no-data" onAction={() => refetch()} actionLabel={t("roleProfile.retryLoad")} />
        )}

        {/* Data loaded */}
        {data && (
          <>
            <PlayerHeader data={data} />

            {/* Low confidence warning */}
            {data.overall_confidence < 0.5 && (
              <div className="p-3 bg-gold/10 border border-gold/20 rounded-md">
                <p className="text-sm text-gold">
                  {t("roleProfile.lowConfidenceWarning")}
                </p>
              </div>
            )}

            {/* Partial data warnings */}
            {data.risks.some(r => r.code === "tracking_physical_partial") && (
              <div className="p-2 bg-muted/50 border border-border rounded-md">
                <p className="text-xs text-muted-foreground">
                  ℹ️ Datos de tracking/GPS parciales — las métricas físicas pueden estar subestimadas.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1">
                <IdentityCard data={data} />
              </div>
              <div className="lg:col-span-2">
                <CapabilityCards data={data} filters={filters} />
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <PositionFitRanking data={data} filters={filters} />
              <ArchetypeRanking data={data} />
            </div>

            <StrengthsRisksPanel data={data} />

            {(mode === "scout" || filters?.showProjected) && <ProjectionComparator data={data} />}

            <div className="text-xs text-muted-foreground border-t border-border pt-4 flex items-center gap-4">
              <span>Run: <span className="font-mono">{data.run_id}</span></span>
              <span>Confianza global: {Math.round(data.overall_confidence * 100)}%</span>
              <span>Muestra: {data.sample_tier}</span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
