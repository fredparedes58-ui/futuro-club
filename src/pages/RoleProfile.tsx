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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, GitCompare, Table2, Zap, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { POSITION_CODES, POSITION_LABELS, type PositionCode } from "@/lib/roleProfileData";

export default function RoleProfile() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [mode, setMode] = useState<ViewMode>("scout");
  const [filters, setFilters] = useState<RoleProfileFilters | null>(null);
  const [positionOverride, setPositionOverride] = useState<string | null>(null);
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useRoleProfile(id, positionOverride);

  const handleFilterChange = useCallback((f: RoleProfileFilters) => {
    setFilters(f);
  }, []);

  useEffect(() => {
    if (isError) toast.error(t("toasts.roleProfileError", { error: error?.message || t("errors.unknownError") }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

        {/* No data at all (shouldn't happen with metrics-only fallback, but safety net) */}
        {!isLoading && !isError && data === null && (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Zap className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-display text-lg font-bold mb-2">
              No se pudo generar el perfil de rol
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mb-4 leading-relaxed">
              Verifica que el jugador tiene métricas registradas.
            </p>
            <div className="flex gap-3">
              <Button variant="default" size="sm" className="gap-1.5" onClick={() => refetch()}>
                Reintentar
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.history.back()}>
                Volver
              </Button>
            </div>
          </div>
        )}

        {/* Data loaded */}
        {data && (
          <>
            <PlayerHeader data={data} />

            {/* Confidence tier badge + Position override */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  data.sample_tier === "platinum" ? "bg-purple-100 text-purple-700" :
                  data.sample_tier === "gold" ? "bg-yellow-100 text-yellow-700" :
                  data.sample_tier === "silver" ? "bg-gray-100 text-gray-700" :
                  "bg-orange-100 text-orange-700"
                }`}>
                  {data.sample_tier === "platinum" ? "💎" : data.sample_tier === "gold" ? "🥇" : data.sample_tier === "silver" ? "🥈" : "🥉"}
                  {data.sample_tier === "platinum" ? "Platino" : data.sample_tier === "gold" ? "Oro" : data.sample_tier === "silver" ? "Plata" : "Bronce"}
                  {" · "}{Math.round(data.overall_confidence * 100)}%
                </span>
                {data.sample_tier === "bronze" && (
                  <span className="text-xs text-muted-foreground">
                    Sube un video y genera un informe IA para subir la precisión
                  </span>
                )}
              </div>

              {/* Position override selector */}
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t("roleProfile.positionOverride", "Forzar posición")}:</span>
                <Select
                  value={positionOverride ?? "auto"}
                  onValueChange={(val) => setPositionOverride(val === "auto" ? null : val)}
                >
                  <SelectTrigger className="h-7 w-[180px] text-xs">
                    <SelectValue placeholder={t("roleProfile.autoPosition", "Automático")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t("roleProfile.autoPosition", "Automático")}</SelectItem>
                    {POSITION_CODES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {POSITION_LABELS[code]} ({code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {positionOverride && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => setPositionOverride(null)}
                  >
                    ✕
                  </Button>
                )}
              </div>
            </div>

            {/* Low confidence warning */}
            {data.overall_confidence < 0.5 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-sm text-amber-700">
                  {data.risks.some(r => r.code === "NO_VIDEO_ANALYSIS")
                    ? "⚠ Perfil basado solo en métricas manuales. Genera un informe VITAS Intelligence para un análisis más preciso."
                    : t("roleProfile.lowConfidenceWarning")}
                </p>
                {data.risks.some(r => r.code === "NO_VIDEO_ANALYSIS") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 gap-1.5 text-xs"
                    onClick={() => navigate(`/players/${id}/intelligence`)}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Generar Informe IA
                  </Button>
                )}
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
