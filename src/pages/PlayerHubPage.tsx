/**
 * VITAS · PlayerHubPage
 *
 * Página única consolidada del jugador. Reemplaza la fragmentación entre:
 *   - /players/:id            (perfil clásico)
 *   - /players/:id/intelligence  (reporte IA)
 *   - /players/:id/role-profile  (perfil de rol)
 *
 * Estructura:
 *   - Header sticky con avatar + nombre + edad + posición + VSI + acciones
 *   - Tabs: Resumen · Stats · Movimiento · Rol · Histórico
 *   - Empty state grande cuando no hay análisis (1 botón "Subir video")
 *
 * Tabs leen el estado del search param `?tab=` para que las URLs sean
 * shareables. Las rutas /intelligence y /role-profile redirigen aquí.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Edit, Video, Activity, FlaskConical, Compass, Clock,
  Sparkles, ChevronRight, AlertCircle, Brain, Zap, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import { PlayerService, type Player } from "@/services/real/playerService";
import { useSavedAnalysesV2 } from "@/hooks/usePlayerAnalysisV2";
import { useRoleProfile } from "@/hooks/useRoleProfile";
import { PlayerTrackingService, type TrackingSnapshot } from "@/services/real/playerTrackingService";

import VsiGauge from "@/components/VsiGauge";
import MatchStatsPanel from "@/components/MatchStatsPanel";
import { AdvancedMetricsPanel } from "@/components/AdvancedMetricsPanel";
import TrackingSnapshotPanel from "@/components/TrackingSnapshotPanel";
import PlayerHeatmap from "@/components/PlayerHeatmap";
import { calculateAdvancedMetrics } from "@/services/real/advancedMetricsService";
import TalentoOcultoAlert from "@/components/TalentoOcultoAlert";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import NotEvaluatedSection from "@/components/NotEvaluatedSection";

// Componentes del role-profile reutilizados sin envoltorio
import PositionDiscoveryBanner from "@/components/PositionDiscoveryBanner";
import PositionRollup, { type PositionRollupRow } from "@/components/PositionRollup";
import PositionComparison from "@/components/PositionComparison";
import BestMatchProByPosition from "@/components/BestMatchProByPosition";
import { getPositionRollup } from "@/services/real/positionRollupService";
import { EmptyVideo, EmptyInsights, EmptyTracking } from "@/components/illustrations/EmptyIllustrations";
import IdentityCard from "@/components/role-profile/IdentityCard";
import CapabilityCards from "@/components/role-profile/CapabilityCards";
import PositionFitRanking from "@/components/role-profile/PositionFitRanking";
import ArchetypeRanking from "@/components/role-profile/ArchetypeRanking";
import StrengthsRisksPanel from "@/components/role-profile/StrengthsRisksPanel";
import ProjectionComparator from "@/components/role-profile/ProjectionComparator";

type TabKey = "resumen" | "stats" | "movimiento" | "rol" | "historico";

const TABS: Array<{ key: TabKey; label: string; icon: React.ElementType; needsAnalysis?: boolean }> = [
  { key: "resumen",    label: "Resumen",     icon: Sparkles },
  { key: "stats",      label: "Stats",       icon: Activity,    needsAnalysis: true },
  { key: "movimiento", label: "Movimiento",  icon: Compass },
  { key: "rol",        label: "Rol",         icon: Brain,       needsAnalysis: true },
  { key: "historico",  label: "Histórico",   icon: Clock,       needsAnalysis: true },
];

export default function PlayerHubPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = (searchParams.get("tab") as TabKey) || "resumen";
  const [tab, setTab] = useState<TabKey>(tabParam);

  // Sync URL when tab changes
  useEffect(() => {
    if (tab !== tabParam) setSearchParams({ tab }, { replace: true });
  }, [tab, tabParam, setSearchParams]);

  // Player
  const player: Player | null = useMemo(() => (id ? PlayerService.getById(id) : null), [id]);

  // Analyses
  const { data: analyses } = useSavedAnalysesV2(id ?? "");
  const latestAnalysis = analyses?.[0];
  const latestReport = latestAnalysis?.report;
  const hasAnalysis = !!latestReport;

  // Tracking snapshot del Lab
  const [snapshot, setSnapshot] = useState<TrackingSnapshot | null>(null);
  useEffect(() => {
    if (!id) return;
    setSnapshot(PlayerTrackingService.get(id));
    const onFocus = () => id && setSnapshot(PlayerTrackingService.get(id));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [id]);

  // Position rollup · agregado de todos los videos por posición
  const [positionRollup, setPositionRollup] = useState<PositionRollupRow[]>([]);
  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    getPositionRollup(player).then((r) => { if (!cancelled) setPositionRollup(r); });
    return () => { cancelled = true; };
  }, [player, analyses]);

  // Métricas avanzadas
  const advancedMetrics = useMemo(() => {
    if (!player) return null;
    return calculateAdvancedMetrics(player as Parameters<typeof calculateAdvancedMetrics>[0]);
  }, [player]);

  // Role profile (lazy · solo si hay análisis y se mira la pestaña)
  const { data: roleData } = useRoleProfile(tab === "rol" ? id : undefined, null);

  // ── Estados principales ─────────────────────────────────────────
  if (!player) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-8 text-center">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-display font-bold text-lg text-foreground">Jugador no encontrado</p>
        <Button variant="outline" onClick={() => navigate("/equipo")}>
          <ArrowLeft size={16} className="mr-2" />
          Volver
        </Button>
      </div>
    );
  }

  const phvIcon = player.phvCategory === "early" ? "🟢" : player.phvCategory === "late" ? "🔵" : player.phvCategory ? "🟡" : "⚪";
  const phvLabel = player.phvCategory === "early" ? "Pre-PHV" : player.phvCategory === "late" ? "Post-PHV" : player.phvCategory ? "En PHV" : "Sin datos PHV";

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* ── Header sticky ───────────────────────────────────────── */}
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Volver"
            >
              <ArrowLeft size={16} />
            </button>

            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-display font-bold text-primary shrink-0">
              {player.name.slice(0, 2).toUpperCase()}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-bold text-base text-foreground truncate">{player.name}</h1>
              <p className="text-[11px] text-muted-foreground truncate">
                {player.age}a · {player.position}
                {player.secondaryPositions && player.secondaryPositions.length > 0 && (
                  <span className="text-muted-foreground/70"> / {player.secondaryPositions.join(" / ")}</span>
                )}
                {" · "}{phvIcon} {phvLabel}
              </p>
            </div>

            {/* VSI gauge mini */}
            <div className="hidden sm:block">
              <VsiGauge value={player.vsi} size="sm" />
            </div>

            {/* Acciones */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/players/${id}/print?auto=1`, "_blank", "noopener")}
              className="gap-1.5 text-xs"
              title="Descargar PDF · 2 páginas, listo para compartir"
            >
              <Printer size={12} /> <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/players/${id}/edit`)}
              className="gap-1.5 text-xs"
            >
              <Edit size={12} /> <span className="hidden sm:inline">Editar</span>
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3 overflow-x-auto no-scrollbar">
            {TABS.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.key;
              const isLocked = t.needsAnalysis && !hasAnalysis;
              return (
                <button
                  key={t.key}
                  onClick={() => !isLocked && setTab(t.key)}
                  disabled={isLocked}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-semibold transition-all whitespace-nowrap ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isLocked
                        ? "text-muted-foreground/50 cursor-not-allowed"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                  title={isLocked ? "Requiere un análisis de video" : undefined}
                >
                  <Icon size={12} />
                  {t.label}
                  {isLocked && <span className="text-[8px]">🔒</span>}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── Contenido ───────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        <AnimatePresence mode="wait">
          {tab === "resumen" && (
            <motion.div
              key="resumen"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Empty state grande si no hay análisis · ilustración + CTAs */}
              {!hasAnalysis && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="glass rounded-2xl p-8 border border-primary/30 bg-gradient-to-br from-primary/5 to-electric/5 space-y-5 text-center"
                >
                  <EmptyVideo className="w-44 mx-auto" />
                  <div className="space-y-2 max-w-md mx-auto">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">
                      Sube tu primer video de {player.name}
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Desbloquea pases, duelos, recuperaciones, escaneo, mapa de calor,
                      VAEP, cobertura de campo, DrillScore y perfil de rol.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
                    <Button onClick={() => navigate(`/lab?playerId=${id}`)} className="flex-1 gap-2">
                      <FlaskConical size={14} /> Analizar en VITAS Lab
                    </Button>
                    <Button variant="outline" onClick={() => navigate(`/reports?playerId=${id}`)} className="gap-2">
                      <Video size={14} /> Subir video
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* B1: Talento Oculto · PHV alert */}
              <TalentoOcultoAlert player={player} />

              {/* B2: Confidence badge */}
              <ConfidenceBadge
                videosCount={analyses?.length ?? 0}
                hasTracking={!!snapshot}
                player={player}
              />

              {/* VSI + métricas avanzadas siempre visibles */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="glass rounded-xl p-6 flex flex-col items-center justify-center gap-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-bold">VSI Global</p>
                  <VsiGauge value={player.vsi} size="xl" showTier />
                  {player.vsiHistory && player.vsiHistory.length > 1 && (
                    <p className="text-[11px] text-muted-foreground">
                      {player.vsiHistory.length} actualizaciones registradas
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <h3 className="font-display font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Métricas base
                  </h3>
                  {(["speed", "technique", "vision", "stamina", "shooting", "defending"] as const).map((k) => {
                    const v = player.metrics[k] ?? 0;
                    return (
                      <div key={k} className="flex items-center gap-2 text-xs">
                        <span className="w-20 text-muted-foreground capitalize">{k}</span>
                        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${v}%` }} />
                        </div>
                        <span className="w-8 text-right font-mono text-foreground">{v}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Solo mostrar Métricas Avanzadas si hay video O snapshot del Lab.
                  Sin datos las cards aparecen como STUB y confunden al coach. */}
              {advancedMetrics && (hasAnalysis || snapshot) && (
                <AdvancedMetricsPanel metrics={advancedMetrics} trackingSnapshot={snapshot} />
              )}

              {/* B3: No evaluado — transparencia radical */}
              <NotEvaluatedSection
                player={player}
                hasAnalysis={hasAnalysis}
                hasTracking={!!snapshot}
                latestReport={latestReport}
              />
            </motion.div>
          )}

          {tab === "stats" && hasAnalysis && (
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {latestReport?.metricasCuantitativas ? (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    Estadísticas del último video analizado el {new Date(latestAnalysis!.created_at).toLocaleDateString("es-ES")}
                  </p>
                  <MatchStatsPanel
                    data={latestReport.metricasCuantitativas}
                    title={`Estadísticas — ${player.name}`}
                  />
                  {latestReport.metricasCuantitativas.heatmapPositions &&
                    latestReport.metricasCuantitativas.heatmapPositions.length > 0 && (
                    <PlayerHeatmap
                      positions={latestReport.metricasCuantitativas.heatmapPositions}
                      title={`Mapa de Calor — ${player.name}`}
                    />
                  )}
                </>
              ) : (
                <EmptyAnalysisState
                  playerId={id ?? ""}
                  playerName={player.name}
                  message="Este análisis es antiguo y no incluye stats. Genera uno nuevo."
                />
              )}
            </motion.div>
          )}

          {tab === "movimiento" && (
            <motion.div
              key="movimiento"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <TrackingSnapshotPanel playerId={id ?? ""} snapshot={snapshot} />
            </motion.div>
          )}

          {tab === "rol" && hasAnalysis && (
            <motion.div
              key="rol"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {roleData ? (
                <>
                  {/* Header con tier + cita explícita al video fuente */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                      roleData.sample_tier === "platinum" ? "bg-purple-100 text-purple-700" :
                      roleData.sample_tier === "gold" ? "bg-yellow-100 text-yellow-700" :
                      roleData.sample_tier === "silver" ? "bg-gray-100 text-gray-700" :
                      "bg-orange-100 text-orange-700"
                    }`}>
                      {roleData.sample_tier === "platinum" ? "💎 Platino" : roleData.sample_tier === "gold" ? "🥇 Oro" : roleData.sample_tier === "silver" ? "🥈 Plata" : "🥉 Bronce"}
                      {" · "}{Math.round(roleData.overall_confidence * 100)}%
                    </span>
                    {roleData.source_videos && roleData.source_videos.length > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        Basado en {roleData.source_videos.length} video{roleData.source_videos.length > 1 ? "s" : ""} · último análisis {new Date(roleData.source_videos[0].analyzed_at).toLocaleDateString("es-ES")}
                      </span>
                    )}
                  </div>

                  {/* Banner descubrimiento · sugiere añadir nuevas posiciones detectadas en video */}
                  {Array.isArray((roleData as { positionAlternatives?: Array<{ code: string; fit: number; alreadyDeclared: boolean; reason: string; confidence: number }> }).positionAlternatives) && (
                    <PositionDiscoveryBanner
                      player={player}
                      alternatives={(roleData as unknown as { positionAlternatives: Array<{ code: string; fit: number; alreadyDeclared: boolean; reason: string; confidence: number }> }).positionAlternatives}
                    />
                  )}

                  {/* Rollup agregado por posición · todos los videos */}
                  <PositionRollup player={player} rows={positionRollup} />

                  {/* Comparativa por posición · solo si polivalente con datos */}
                  <PositionComparison rows={positionRollup} />

                  {/* Referentes pro por posición declarada */}
                  <BestMatchProByPosition player={player} />

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <IdentityCard data={roleData} />
                    <div className="lg:col-span-2"><CapabilityCards data={roleData} filters={null} /></div>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <PositionFitRanking data={roleData} filters={null} />
                    <ArchetypeRanking data={roleData} />
                  </div>
                  <StrengthsRisksPanel data={roleData} />
                  <ProjectionComparator data={roleData} />

                  {/* Cita explícita de los videos fuente al final del informe */}
                  {roleData.source_videos && roleData.source_videos.length > 0 && (
                    <div className="glass rounded-xl p-4 border-l-4 border-primary/40 text-xs text-muted-foreground">
                      <p className="font-display font-semibold text-foreground mb-1">📹 Fuente del informe</p>
                      <p>
                        Este perfil de rol está construido sobre el análisis de {roleData.source_videos.length} video{roleData.source_videos.length > 1 ? "s" : ""} de {player.name}.
                        Si subes más videos en VITAS Lab, la confianza del informe sube y el sample tier mejora (Bronce → Plata → Oro → Platino).
                      </p>
                      <ul className="mt-2 space-y-0.5">
                        {roleData.source_videos.slice(0, 3).map((v, i) => (
                          <li key={i}>• Video {v.video_id.slice(0, 8)} · analizado {new Date(v.analyzed_at).toLocaleString("es-ES")}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className="glass rounded-xl p-6 text-center">
                  <Sparkles size={20} className="mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Generando perfil de rol…</p>
                </div>
              )}
            </motion.div>
          )}

          {tab === "historico" && (
            <motion.div
              key="historico"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {analyses && analyses.length > 0 ? (
                <div className="glass rounded-xl divide-y divide-border">
                  {analyses.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => {
                        toast.info(`Análisis #${a.id.slice(0, 6)} · ${new Date(a.created_at).toLocaleString("es-ES")}`);
                      }}
                      className="w-full flex items-center gap-3 p-4 hover:bg-secondary/30 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                        <Video size={14} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display font-semibold text-foreground">
                          Análisis · {new Date(a.created_at).toLocaleDateString("es-ES")}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          VSI {a.report?.vsi ?? "—"} · {a.report?.metricasCuantitativas ? "con stats" : "sin stats"}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-muted-foreground" />
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyAnalysisState playerId={id ?? ""} playerName={player.name} />
              )}
            </motion.div>
          )}

          {/* Tabs bloqueados pero el usuario hace click sin ser posible · fallback */}
          {(tab === "stats" || tab === "rol") && !hasAnalysis && (
            <motion.div
              key="locked"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <EmptyAnalysisState playerId={id ?? ""} playerName={player.name} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ── Empty state reusable ──────────────────────────────────────────

function EmptyAnalysisState({
  playerId, playerName, message,
}: { playerId: string; playerName: string; message?: string }) {
  const navigate = useNavigate();
  return (
    <div className="glass rounded-2xl p-6 border border-dashed border-border space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          <Zap size={20} className="text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-display font-bold text-base text-foreground">
            {message ?? `Aún no hay análisis de video para ${playerName}`}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Cuando subas y analices un video, aquí verás pases, duelos, recuperaciones, mapa de calor y perfil de rol.
          </p>
        </div>
      </div>
      <Button onClick={() => navigate(`/lab?playerId=${playerId}`)} className="w-full gap-2">
        <FlaskConical size={14} /> Analizar en VITAS Lab
      </Button>
    </div>
  );
}
