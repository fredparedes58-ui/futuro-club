import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, TrendingUp, Brain, Dna, Zap,
  RefreshCw, ChevronRight, UserCircle2, AlertCircle,
  Pencil, Trash2, Video, Plus, ChevronDown, Sparkles, Filter, FileDown,
  Activity, ClipboardList,
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { calculateAdvancedMetrics, VAEPService } from "@/services/real/advancedMetricsService";
import { useMatchEvents, useLogMatchEvent } from "@/hooks/useMatchEvents";
import { EVENT_TYPES, EVENT_ZONES, type EventType, type EventZone } from "@/services/real/matchEventsService";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { PlanGuard } from "@/components/PlanGuard";
import { usePlayerById, useRawPlayerById, useDeletePlayer } from "@/hooks/usePlayers";
import { usePHVCalculator } from "@/hooks/useAgents";
import { useVideos, useDeleteVideo } from "@/hooks/useVideos";
import VsiGauge from "@/components/VsiGauge";
import RadarChartComponent from "@/components/RadarChart";
import VSIHistoryChart from "@/components/VSIHistoryChart";
import { PDFService } from "@/services/real/pdfService";
import VideoCard from "@/components/VideoCard";
import VideoPlayer from "@/components/VideoPlayer";
import VideoUpload from "@/components/VideoUpload";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { PHVInput } from "@/agents/contracts";
import type { VideoRecord } from "@/services/real/videoService";

// ─── Animaciones ──────────────────────────────────────────────────────────────
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

// ─── Mapa PHV ─────────────────────────────────────────────────────────────────
const phvInfo: Record<string, { labelKey: string; color: string; descKey: string }> = {
  early: {
    labelKey: "players.profile.phv.earlyLabel",
    color: "text-gold",
    descKey: "players.profile.phv.earlyDesc",
  },
  "on-time": {
    labelKey: "players.profile.phv.onTimeLabel",
    color: "text-electric",
    descKey: "players.profile.phv.onTimeDesc",
  },
  late: {
    labelKey: "players.profile.phv.lateLabel",
    color: "text-primary",
    descKey: "players.profile.phv.lateDesc",
  },
};

// ─── Skeleton de carga ────────────────────────────────────────────────────────
function ProfileSkeleton() {
  return (
    <div className="px-4 pt-4 pb-24 space-y-5 max-w-lg mx-auto animate-pulse">
      <div className="h-4 w-16 bg-muted rounded" />
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-40 bg-muted rounded" />
          <div className="h-3 w-32 bg-muted rounded" />
        </div>
        <div className="w-14 h-14 rounded-full bg-muted" />
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="glass rounded-xl p-4 h-28 bg-muted/50" />
      ))}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
const PlayerProfile = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [phvInput, setPhvInput] = useState<PHVInput | null>(null);
  const [showVideoUpload, setShowVideoUpload] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoRecord | null>(null);
  const [showLogSheet, setShowLogSheet] = useState(false);
  const [logForm, setLogForm] = useState<{
    type: EventType; result: "success" | "fail"; minute: number; xZone: EventZone;
  }>({ type: "pass", result: "success", minute: 1, xZone: "middle" });

  // Datos adaptados para UI
  const { data: player, isLoading, isError } = usePlayerById(id);
  // Datos crudos para calcular PHV
  const { data: rawPlayer } = useRawPlayerById(id);
  // Mutación de eliminación
  const deletePlayer = useDeletePlayer();

  // Videos del jugador
  const { data: playerVideos = [] } = useVideos(id);
  const { mutate: deleteVideo } = useDeleteVideo();

  // Agente PHV — solo se activa cuando el usuario pulsa "Calcular PHV"
  const { data: phvResult, isFetching: isCalculatingPHV } = usePHVCalculator(phvInput);

  // VAEP — eventos de partido logueados manualmente
  const { data: matchEvents = [] } = useMatchEvents(id);
  const logEvent = useLogMatchEvent(id ?? "");
  const vaepFromEvents = useMemo(
    () => VAEPService.calculateFromEvents(matchEvents, rawPlayer?.minutesPlayed ?? 0),
    [matchEvents, rawPlayer]
  );

  useEffect(() => {
    if (phvResult) {
      toast.success(t("toasts.phvCalculated", { category: phvResult.category === "early" ? "Precoz" : phvResult.category === "late" ? "Tardío" : "Normal", offset: `${phvResult.offset > 0 ? "+" : ""}${phvResult.offset}` }));
    }
  }, [phvResult]);

  const handleLogEvent = () => {
    if (!id) return;
    logEvent.mutate({
      type:      logForm.type,
      result:    logForm.result,
      minute:    logForm.minute,
      matchDate: new Date().toISOString().slice(0, 10),
      xZone:     logForm.xZone,
    });
    setShowLogSheet(false);
  };

  const handleDelete = async () => {
    if (!id) return;
    await deletePlayer.mutateAsync(id);
    toast.success(t("toasts.playerDeleted", { name: player?.name ?? "Jugador" }));
    navigate("/rankings");
  };

  const handleCalculatePHV = () => {
    if (!rawPlayer) return;
    setPhvInput({
      playerId: rawPlayer.id,
      chronologicalAge: rawPlayer.age,
      height: rawPlayer.height,
      weight: rawPlayer.weight,
      gender: (rawPlayer as Player & { gender?: "M" | "F" }).gender ?? "M",
      ...((rawPlayer as any).sittingHeight ? { sittingHeight: (rawPlayer as any).sittingHeight } : {}),
      ...((rawPlayer as any).legLength ? { legLength: (rawPlayer as any).legLength } : {}),
    });
    toast.info(t("toasts.phvCalculating"));
  };

  // ─── Métricas avanzadas — MUST be before early returns (Rules of Hooks) ──
  const advancedMetrics = useMemo(() => {
    if (!rawPlayer) return null;
    return calculateAdvancedMetrics(rawPlayer as Parameters<typeof calculateAdvancedMetrics>[0]);
  }, [rawPlayer]);

  // ─── Estados ───────────────────────────────────────────────────────────────
  if (isLoading) return <ProfileSkeleton />;

  if (isError || !player) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-8 text-center">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-display font-bold text-lg text-foreground">{t("players.profile.notFound")}</p>
        <p className="text-sm text-muted-foreground">
          {t("players.profile.notFoundDesc")}
        </p>
        <Button variant="outline" onClick={() => navigate("/rankings")}>
          <ArrowLeft size={16} className="mr-2" />
          {t("players.profile.backToRanking")}
        </Button>
      </div>
    );
  }

  const phv = phvInfo[player.phvCategory] ?? phvInfo["on-time"];
  const phvBarPosition = ((player.phvOffset + 2) / 4) * 100;
  const hasPHV = !!rawPlayer?.phvCategory;

  const trendText =
    player.trending === "up" ? t("players.profile.trendUp")
    : player.trending === "down" ? t("players.profile.trendDown")
    : t("players.profile.trendStable");

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="px-4 pt-4 pb-24 space-y-5 max-w-lg mx-auto"
    >
      {/* Volver */}
      <motion.button
        variants={item}
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={16} />
        <span className="font-display">{t("common.back")}</span>
      </motion.button>

      {/* Header del jugador */}
      <motion.div variants={item} className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary/30 bg-secondary flex items-center justify-center">
          <UserCircle2 size={40} className="text-muted-foreground" />
        </div>
        <div className="flex-1">
          <h1 className="font-display font-bold text-2xl text-foreground">{player.name}</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-electric font-display font-semibold">{player.position}</span>
            <span>·</span>
            <span>{player.age} años</span>
            <span>·</span>
            <span>{player.academy}</span>
          </div>
        </div>
        <VsiGauge value={player.vsi} size="md" />
      </motion.div>

      {/* Banner PHV */}
      <motion.div variants={item} className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Dna size={14} className={hasPHV ? phv.color : "text-muted-foreground"} />
          <span
            className={`text-xs font-display font-semibold uppercase tracking-wider ${
              hasPHV ? phv.color : "text-muted-foreground"
            }`}
          >
            {hasPHV ? t(phv.labelKey) : t("players.profile.phv.notCalculated")}
          </span>
          {hasPHV && (
            <span className="text-[10px] text-muted-foreground ml-auto">
              Offset: {player.phvOffset > 0 ? "+" : ""}{player.phvOffset.toFixed(2)}
            </span>
          )}
        </div>

        {hasPHV ? (
          <>
            <p className="text-xs text-muted-foreground">{t(phv.descKey)}</p>
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-gold via-electric to-primary"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, Math.max(0, phvBarPosition))}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
              <span>{t("players.profile.phv.scaleEarly")}</span>
              <span>{t("players.profile.phv.scaleNormal")}</span>
              <span>{t("players.profile.phv.scaleLate")}</span>
            </div>
          </>
        ) : (
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {t("players.profile.phv.calculateDesc")}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="ml-3 text-xs shrink-0"
              onClick={handleCalculatePHV}
              disabled={isCalculatingPHV || !rawPlayer}
            >
              {isCalculatingPHV ? (
                <>
                  <RefreshCw size={12} className="mr-1 animate-spin" />
                  {t("players.profile.phv.calculating")}
                </>
              ) : (
                <>
                  <Dna size={12} className="mr-1" />
                  {t("players.profile.phv.calculateBtn")}
                </>
              )}
            </Button>
          </div>
        )}
      </motion.div>

      {/* Radar de métricas */}
      <motion.div variants={item} className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Brain size={14} className="text-electric" />
          <h2 className="font-display font-semibold text-sm text-foreground">{t("players.profile.technicalProfile")}</h2>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {hasPHV ? t("players.profile.adjustedByPHV") : t("players.profile.noAdjustPHV")}
          </span>
        </div>
        <RadarChartComponent stats={player.stats} />
      </motion.div>

      {/* Métricas detalladas */}
      <motion.div variants={item} className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={14} className="text-primary" />
          <h2 className="font-display font-semibold text-sm text-foreground">{t("players.profile.detailedMetrics")}</h2>
        </div>
        <div className="space-y-3">
          {Object.entries(player.stats).map(([key, value]) => {
            const labels: Record<string, string> = {
              speed: t("players.form.metrics.speed"),
              technique: t("players.form.metrics.technique"),
              vision: t("players.form.metrics.vision"),
              stamina: t("players.form.metrics.stamina"),
              shooting: t("players.form.metrics.shooting"),
              defending: t("players.form.metrics.defending"),
            };
            const getBarColor = (v: number) => {
              if (v >= 85) return "bg-primary";
              if (v >= 70) return "bg-electric";
              if (v >= 50) return "bg-gold";
              return "bg-destructive/60";
            };
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground font-display">
                    {labels[key] || key}
                  </span>
                  <span className="text-xs font-display font-bold text-foreground">{value}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${getBarColor(value)}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${value}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* VSI History Chart */}
        {rawPlayer?.vsiHistory && rawPlayer.vsiHistory.length >= 2 && (
          <div className="mt-4 pt-3 border-t border-border">
            <p className="text-[10px] font-display text-muted-foreground mb-2 uppercase tracking-wider">{t("players.profile.vsiEvolution")}</p>
            <VSIHistoryChart
              vsiHistory={rawPlayer.vsiHistory}
              currentVSI={player.vsi}
              trend={player.trending}
            />
          </div>
        )}
      </motion.div>

      {/* Actividad */}
      <motion.div variants={item} className="glass rounded-xl p-4">
        <h2 className="font-display font-semibold text-sm text-foreground mb-2">{t("players.profile.activity")}</h2>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("players.profile.drillsRegistered", { count: player.recentDrills })}</span>
          <span className="text-[10px]">
            {t("players.profile.updated")}: {new Date(player.lastActive).toLocaleDateString("es-ES")}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <TrendingUp size={14} className="text-primary" />
          <span className="text-xs text-primary font-display font-medium">
            {t("players.profile.trend")}: {trendText}
          </span>
        </div>
      </motion.div>

      {/* ── Análisis Avanzado (TruthFilter + Dominant Features) ──────────── */}
      {advancedMetrics && (
        <motion.div variants={item} className="glass rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-gold" />
            <h2 className="font-display font-semibold text-sm text-foreground">{t("players.profile.advancedAnalysis")}</h2>
            <span className="ml-auto text-[9px] text-muted-foreground font-display uppercase tracking-wider">
              TruthFilter · UBI
            </span>
          </div>

          {/* TruthFilter — VSI ajustado */}
          <div className="rounded-lg bg-secondary/40 border border-border p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Filter size={11} className="text-primary" />
                <span className="text-[11px] font-display font-semibold text-foreground">
                  {t("players.profile.truthFilter")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground line-through">
                  {advancedMetrics.truthFilter.originalVSI}
                </span>
                <span className={`text-sm font-display font-bold ${
                  advancedMetrics.truthFilter.delta > 0 ? "text-primary" :
                  advancedMetrics.truthFilter.delta < 0 ? "text-gold" : "text-electric"
                }`}>
                  {advancedMetrics.truthFilter.adjustedVSI}
                </span>
                {advancedMetrics.truthFilter.delta !== 0 && (
                  <span className={`text-[10px] font-display ${
                    advancedMetrics.truthFilter.delta > 0 ? "text-primary" : "text-gold"
                  }`}>
                    ({advancedMetrics.truthFilter.delta > 0 ? "+" : ""}{advancedMetrics.truthFilter.delta})
                  </span>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {advancedMetrics.truthFilter.explanation}
            </p>
            <div className="flex items-center gap-1 mt-2">
              <div className="h-1 rounded-full bg-muted flex-1 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/60"
                  style={{ width: `${Math.round(advancedMetrics.truthFilter.confidence * 100)}%` }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground font-display shrink-0">
                {Math.round(advancedMetrics.truthFilter.confidence * 100)}% conf.
              </span>
            </div>
          </div>

          {/* UBI */}
          <div className="rounded-lg bg-secondary/40 border border-border p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-display font-semibold text-foreground">
                {t("players.profile.ubiBiasIndex")}
              </span>
              <span className={`text-sm font-display font-bold ${
                advancedMetrics.ubi.ubi >= 0.6 ? "text-destructive" :
                advancedMetrics.ubi.ubi >= 0.3 ? "text-gold" : "text-electric"
              }`}>
                {(advancedMetrics.ubi.ubi * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">{advancedMetrics.ubi.description}</p>
            <div className="flex gap-3 mt-2 text-[9px] text-muted-foreground font-display">
              <span>RAE: {(advancedMetrics.ubi.raeComponent * 100).toFixed(0)}%</span>
              <span>PHV: {(advancedMetrics.ubi.phvComponent * 100).toFixed(0)}%</span>
              <span className="ml-auto text-primary">
                x{advancedMetrics.ubi.vsICorrectionFactor} {t("players.profile.correctionFactor")}
              </span>
            </div>
          </div>

          {/* Dominant Features */}
          <div className="rounded-lg bg-secondary/40 border border-border p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-display font-semibold text-foreground">
                {t("players.profile.dominantFeatures")}
              </span>
              <span className="text-[9px] font-display px-1.5 py-0.5 rounded bg-electric/10 text-electric">
                {advancedMetrics.dominantFeatures.playStyle}
              </span>
            </div>
            <div className="space-y-1.5">
              {advancedMetrics.dominantFeatures.dominant.map((feat) => (
                <div key={feat.key} className="flex items-center gap-2">
                  <span className="text-[10px] text-foreground font-display w-20 shrink-0">
                    {feat.label}
                  </span>
                  <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-electric to-primary"
                      style={{ width: `${feat.value}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-display text-primary shrink-0">
                    z={feat.zScore >= 0 ? "+" : ""}{feat.zScore.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
            {advancedMetrics.dominantFeatures.underdeveloped.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <span className="text-[9px] text-muted-foreground font-display">{t("players.profile.areasToDevelope")}:</span>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {advancedMetrics.dominantFeatures.underdeveloped.map((feat) => (
                    <span
                      key={feat.key}
                      className="text-[9px] font-display px-1.5 py-0.5 rounded bg-gold/10 text-gold"
                    >
                      {feat.label} (−{feat.gap})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── VAEP · Valor por Evento ───────────────────────────────────── */}
          <PlanGuard feature="vaep" showLock>
          <div className="rounded-lg bg-secondary/40 border border-border p-3 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Activity size={11} className="text-electric" />
                <span className="text-[11px] font-display font-semibold text-foreground">
                  {t("players.profile.vaepTitle")}
                </span>
              </div>
              <Button size="sm" variant="outline"
                className="h-6 text-[10px] px-2 font-display"
                onClick={() => setShowLogSheet(true)}
              >
                <Plus size={10} className="mr-1" /> LOG
              </Button>
            </div>

            {/* Métricas */}
            {vaepFromEvents.status === "calculated" ? (
              <div className="flex gap-4">
                <div className="text-center">
                  <p className="text-xs font-display font-bold text-primary">
                    {vaepFromEvents.vaep90 !== null
                      ? (vaepFromEvents.vaep90 > 0 ? "+" : "") + vaepFromEvents.vaep90.toFixed(2)
                      : "—"}
                  </p>
                  <p className="text-[9px] text-muted-foreground font-display">VAEP/90</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-display font-bold text-electric">
                    {vaepFromEvents.vaepTotal !== null
                      ? (vaepFromEvents.vaepTotal > 0 ? "+" : "") + vaepFromEvents.vaepTotal.toFixed(2)
                      : "—"}
                  </p>
                  <p className="text-[9px] text-muted-foreground font-display">Total xG</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-display font-bold text-gold">{matchEvents.length}</p>
                  <p className="text-[9px] text-muted-foreground font-display">{t("players.profile.events")}</p>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground font-display">
                {t("players.profile.vaepNoEvents")}
              </p>
            )}

            {/* Top acciones */}
            {vaepFromEvents.topActions.length > 0 && (
              <div className="space-y-1">
                <p className="text-[9px] font-display text-muted-foreground uppercase tracking-wider">
                  {t("players.profile.topActions")}
                </p>
                {vaepFromEvents.topActions.slice(0, 5).map((action) => {
                  const evt = matchEvents.find((e) => e.id === action.actionId);
                  if (!evt) return null;
                  return (
                    <div key={action.actionId} className="flex items-center gap-2">
                      <span className={`text-[10px] ${action.impact >= 0 ? "text-primary" : "text-destructive"}`}>
                        {action.impact >= 0 ? "✓" : "✗"}
                      </span>
                      <span className="text-[10px] font-display text-foreground capitalize">
                        {evt.type} (min {evt.minute})
                      </span>
                      <span className={`ml-auto text-[10px] font-display font-semibold ${action.impact >= 0 ? "text-primary" : "text-destructive"}`}>
                        {action.impact > 0 ? "+" : ""}{action.impact.toFixed(3)} xG
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Registrar evento */}
            <button
              onClick={() => setShowLogSheet(true)}
              className="w-full text-[10px] font-display text-primary hover:underline flex items-center justify-center gap-1 pt-1"
            >
              <ClipboardList size={10} /> {t("players.profile.registerEvent")}
            </button>
          </div>
          </PlanGuard>
        </motion.div>
      )}

      {/* ── Sección de Videos ─────────────────────────────────────────────── */}
      <motion.div variants={item} className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Video size={14} className="text-primary" />
            <h2 className="font-display font-semibold text-sm text-foreground">{t("players.profile.videos")}</h2>
            {playerVideos.length > 0 && (
              <span className="text-[9px] font-display px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {playerVideos.length}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowVideoUpload(!showVideoUpload)}
            className="flex items-center gap-1 text-[10px] text-primary font-display font-semibold hover:underline"
          >
            {showVideoUpload ? <ChevronDown size={10} /> : <Plus size={10} />}
            {showVideoUpload ? t("common.close") : t("players.profile.uploadVideo")}
          </button>
        </div>

        {/* Upload inline */}
        {showVideoUpload && (
          <div className="mb-4 p-3 rounded-xl bg-secondary/40 border border-border">
            <VideoUpload
              playerId={id}
              onDone={(videoId) => {
                setShowVideoUpload(false);
                toast.success(t("toasts.videoUploaded"));
              }}
            />
          </div>
        )}

        {/* Video player (selected) */}
        {selectedVideo && (
          <div className="mb-3">
            <VideoPlayer video={selectedVideo} />
            {selectedVideo.analysisResult && (
              <div className="mt-2 p-2 rounded-lg bg-secondary text-xs text-muted-foreground leading-relaxed">
                <span className="font-display font-semibold text-primary">
                  {selectedVideo.analysisResult.formationHint}
                </span>
                {" — "}
                {selectedVideo.analysisResult.notes}
              </div>
            )}
            <button
              onClick={() => setSelectedVideo(null)}
              className="mt-1 text-[10px] text-muted-foreground hover:text-foreground font-display transition-colors"
            >
              {t("players.profile.closePlayer")}
            </button>
          </div>
        )}

        {/* Video grid */}
        {playerVideos.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {playerVideos.slice(0, 4).map((v) => (
              <VideoCard
                key={v.id}
                video={v}
                onClick={(vid) => setSelectedVideo(vid)}
                onDelete={(vid) => deleteVideo(vid)}
                showDelete
              />
            ))}
          </div>
        ) : !showVideoUpload ? (
          <div className="text-center py-6 space-y-2">
            <Video size={24} className="text-muted-foreground mx-auto" />
            <p className="text-xs font-display text-muted-foreground">
              {t("players.profile.noVideos")}
            </p>
            <button
              onClick={() => setShowVideoUpload(true)}
              className="text-xs text-primary font-display font-semibold hover:underline"
            >
              {t("players.profile.uploadFirstVideo")}
            </button>
          </div>
        ) : null}

        {playerVideos.length > 4 && (
          <button
            onClick={() => navigate("/reports")}
            className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground font-display flex items-center justify-center gap-1 transition-colors"
          >
            {t("players.profile.seeAllInReports")} <ChevronRight size={12} />
          </button>
        )}
      </motion.div>

      {/* Acción: Ver Role Profile */}
      <motion.div variants={item}>
        <button
          onClick={() => navigate(`/players/${player.id}/role-profile`)}
          className="w-full glass rounded-xl p-4 flex items-center justify-between hover:border-primary/40 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Brain size={16} className="text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-display font-semibold text-foreground">{t("players.profile.roleProfileTitle")}</p>
              <p className="text-[10px] text-muted-foreground">{t("players.profile.roleProfileDesc")}</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
        </button>
      </motion.div>

      {/* Acción: VITAS Intelligence */}
      <motion.div variants={item}>
        <button
          onClick={() => navigate(`/players/${player.id}/intelligence`)}
          className="w-full glass rounded-xl p-4 flex items-center justify-between hover:border-primary/40 border border-primary/20 transition-colors group relative overflow-hidden"
        >
          {/* Glow background */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Zap size={16} className="text-primary" />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <p className="text-sm font-display font-semibold text-foreground">{t("players.profile.intelligenceTitle")}</p>
                <span className="text-[8px] font-display font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary uppercase tracking-wider">NEW</span>
              </div>
              <p className="text-[10px] text-muted-foreground">{t("players.profile.intelligenceDesc")}</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-primary group-hover:translate-x-0.5 transition-transform" />
        </button>
      </motion.div>

      {/* Comparar reportes de video */}
      {playerVideos && playerVideos.length >= 2 && (
        <motion.div variants={item}>
          <button
            onClick={() => navigate(`/players/${player.id}/intelligence?compare=1`)}
            className="w-full glass rounded-xl p-4 flex items-center justify-between hover:border-electric/40 border border-electric/20 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-electric/20 flex items-center justify-center">
                <Activity size={16} className="text-electric" />
              </div>
              <div className="text-left">
                <p className="text-sm font-display font-semibold text-foreground">{t("players.profile.compareReports")}</p>
                <p className="text-[10px] text-muted-foreground">{t("players.profile.compareReportsDesc")}</p>
              </div>
            </div>
            <ChevronRight size={16} className="text-electric group-hover:translate-x-0.5 transition-transform" />
          </button>
        </motion.div>
      )}

      {/* Acciones: Editar + PDF + Eliminar */}
      <motion.div variants={item} className="flex gap-3 pt-1">
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={() => navigate(`/players/${player.id}/edit`)}
        >
          <Pencil size={14} />
          {t("players.profile.editPlayer")}
        </Button>

        <Button
          variant="outline"
          className="gap-2"
          onClick={() => PDFService.exportPlayerReport(id!)}
        >
          <FileDown size={14} />
          {t("players.profile.exportPDF")}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="gap-2">
              <Trash2 size={14} />
              {t("common.delete")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("players.profile.deleteConfirmTitle", { name: player.name })}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("players.profile.deleteConfirmDesc")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t("players.profile.confirmDelete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>

      {/* ── Sheet: Log Evento VAEP ─────────────────────────────────────────── */}
      <Sheet open={showLogSheet} onOpenChange={setShowLogSheet}>
        <SheetContent side="bottom" className="h-auto pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle className="font-display text-base">{t("players.profile.vaepLog.title")}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            {/* Tipo */}
            <div className="space-y-1.5">
              <label className="text-xs font-display text-muted-foreground uppercase tracking-wider">
                {t("players.profile.vaepLog.actionType")}
              </label>
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.map((t) => (
                  <button key={t}
                    onClick={() => setLogForm((f) => ({ ...f, type: t }))}
                    className={`px-3 py-1 rounded-full text-xs font-display border transition-colors ${
                      logForm.type === t
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {/* Resultado */}
            <div className="space-y-1.5">
              <label className="text-xs font-display text-muted-foreground uppercase tracking-wider">
                {t("players.profile.vaepLog.result")}
              </label>
              <div className="flex gap-2">
                {(["success", "fail"] as const).map((r) => (
                  <button key={r}
                    onClick={() => setLogForm((f) => ({ ...f, result: r }))}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-display border transition-colors ${
                      logForm.result === r
                        ? r === "success"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-destructive text-destructive-foreground border-destructive"
                        : "bg-secondary text-foreground border-border"
                    }`}
                  >
                    {r === "success" ? t("players.profile.vaepLog.success") : t("players.profile.vaepLog.fail")}
                  </button>
                ))}
              </div>
            </div>
            {/* Minuto */}
            <div className="space-y-1.5">
              <label className="text-xs font-display text-muted-foreground uppercase tracking-wider">
                {t("players.profile.vaepLog.minute")}
              </label>
              <Input type="number" min={1} max={120} value={logForm.minute}
                onChange={(e) => setLogForm((f) => ({ ...f, minute: Number(e.target.value) }))}
                className="h-9 text-sm font-display"
              />
            </div>
            {/* Zona */}
            <div className="space-y-1.5">
              <label className="text-xs font-display text-muted-foreground uppercase tracking-wider">
                {t("players.profile.vaepLog.fieldZone")}
              </label>
              <div className="flex gap-2">
                {EVENT_ZONES.map((z) => (
                  <button key={z}
                    onClick={() => setLogForm((f) => ({ ...f, xZone: z }))}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-display border capitalize transition-colors ${
                      logForm.xZone === z
                        ? "bg-primary/10 text-primary border-primary"
                        : "bg-secondary text-foreground border-border"
                    }`}
                  >
                    {z}
                  </button>
                ))}
              </div>
            </div>
            {/* Guardar */}
            <Button className="w-full mt-2" onClick={handleLogEvent} disabled={logEvent.isPending}>
              {logEvent.isPending
                ? <><RefreshCw size={14} className="mr-2 animate-spin" /> {t("common.saving")}</>
                : t("common.save")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </motion.div>
  );
};

export default PlayerProfile;
