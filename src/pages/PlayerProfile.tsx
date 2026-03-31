import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, TrendingUp, Brain, Dna, Zap,
  RefreshCw, ChevronRight, UserCircle2, AlertCircle,
  Pencil, Trash2, Video, Plus, ChevronDown,
} from "lucide-react";
import { usePlayerById, useRawPlayerById, useDeletePlayer } from "@/hooks/usePlayers";
import { usePHVCalculator } from "@/hooks/useAgents";
import { useVideos, useDeleteVideo } from "@/hooks/useVideos";
import VsiGauge from "@/components/VsiGauge";
import RadarChartComponent from "@/components/RadarChart";
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
import { useState } from "react";
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
const phvInfo: Record<string, { label: string; color: string; desc: string }> = {
  early: {
    label: "Madurador Precoz",
    color: "text-gold",
    desc: "Ventaja física temporal. VSI ajustado a la baja para evitar sesgo.",
  },
  "on-time": {
    label: "Maduración Normal",
    color: "text-electric",
    desc: "Desarrollo acorde a su edad cronológica.",
  },
  late: {
    label: "Madurador Tardío",
    color: "text-primary",
    desc: "Potencial oculto. VSI ajustado al alza. ⭐ Alta prioridad de seguimiento.",
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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [phvInput, setPhvInput] = useState<PHVInput | null>(null);
  const [showVideoUpload, setShowVideoUpload] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoRecord | null>(null);

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

  if (phvResult) {
    toast.success(`PHV calculado: ${phvResult.category === "early" ? "Precoz" : phvResult.category === "late" ? "Tardío" : "Normal"} (offset ${phvResult.offset > 0 ? "+" : ""}${phvResult.offset})`);
  }

  const handleDelete = async () => {
    if (!id) return;
    await deletePlayer.mutateAsync(id);
    toast.success(`${player?.name ?? "Jugador"} eliminado`);
    navigate("/rankings");
  };

  const handleCalculatePHV = () => {
    if (!rawPlayer) return;
    setPhvInput({
      playerId: rawPlayer.id,
      chronologicalAge: rawPlayer.age,
      height: rawPlayer.height,
      weight: rawPlayer.weight,
      gender: "male", // TODO: agregar campo gender en formulario (Sprint 1.2)
    });
    toast.info("Calculando PHV con IA…");
  };

  // ─── Estados ───────────────────────────────────────────────────────────────
  if (isLoading) return <ProfileSkeleton />;

  if (isError || !player) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-8 text-center">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-display font-bold text-lg text-foreground">Jugador no encontrado</p>
        <p className="text-sm text-muted-foreground">
          El jugador no existe o fue eliminado.
        </p>
        <Button variant="outline" onClick={() => navigate("/rankings")}>
          <ArrowLeft size={16} className="mr-2" />
          Volver al ranking
        </Button>
      </div>
    );
  }

  const phv = phvInfo[player.phvCategory] ?? phvInfo["on-time"];
  const phvBarPosition = ((player.phvOffset + 2) / 4) * 100;
  const hasPHV = !!rawPlayer?.phvCategory;
  const trendText =
    player.trending === "up" ? "En ascenso 📈"
    : player.trending === "down" ? "En descenso 📉"
    : "Estable ➡️";

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
        <span className="font-display">Volver</span>
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
            {hasPHV ? phv.label : "PHV no calculado"}
          </span>
          {hasPHV && (
            <span className="text-[10px] text-muted-foreground ml-auto">
              Offset: {player.phvOffset > 0 ? "+" : ""}{player.phvOffset.toFixed(2)}
            </span>
          )}
        </div>

        {hasPHV ? (
          <>
            <p className="text-xs text-muted-foreground">{phv.desc}</p>
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-gold via-electric to-primary"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, Math.max(0, phvBarPosition))}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
              <span>Precoz (−2.0)</span>
              <span>Normal (0)</span>
              <span>Tardío (+2.0)</span>
            </div>
          </>
        ) : (
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Calcula la maduración biológica con IA para corregir el VSI.
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
                  Calculando…
                </>
              ) : (
                <>
                  <Dna size={12} className="mr-1" />
                  Calcular PHV
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
          <h2 className="font-display font-semibold text-sm text-foreground">Perfil Técnico</h2>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {hasPHV ? "Ajustado por PHV" : "Sin ajuste PHV"}
          </span>
        </div>
        <RadarChartComponent stats={player.stats} />
      </motion.div>

      {/* Métricas detalladas */}
      <motion.div variants={item} className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={14} className="text-primary" />
          <h2 className="font-display font-semibold text-sm text-foreground">Métricas Detalladas</h2>
        </div>
        <div className="space-y-3">
          {Object.entries(player.stats).map(([key, value]) => {
            const labels: Record<string, string> = {
              speed: "Velocidad",
              technique: "Técnica",
              vision: "Visión",
              stamina: "Resistencia",
              shooting: "Disparo",
              defending: "Defensa",
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
      </motion.div>

      {/* Actividad */}
      <motion.div variants={item} className="glass rounded-xl p-4">
        <h2 className="font-display font-semibold text-sm text-foreground mb-2">Actividad</h2>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{player.recentDrills} drills registrados</span>
          <span className="text-[10px]">
            Actualizado: {new Date(player.lastActive).toLocaleDateString("es-ES")}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <TrendingUp size={14} className="text-primary" />
          <span className="text-xs text-primary font-display font-medium">
            Tendencia: {trendText}
          </span>
        </div>
      </motion.div>

      {/* ── Sección de Videos ─────────────────────────────────────────────── */}
      <motion.div variants={item} className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Video size={14} className="text-primary" />
            <h2 className="font-display font-semibold text-sm text-foreground">Videos</h2>
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
            {showVideoUpload ? "Cerrar" : "Subir video"}
          </button>
        </div>

        {/* Upload inline */}
        {showVideoUpload && (
          <div className="mb-4 p-3 rounded-xl bg-secondary/40 border border-border">
            <VideoUpload
              playerId={id}
              onDone={(videoId) => {
                setShowVideoUpload(false);
                toast.success("Video subido y asociado al jugador");
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
              Cerrar reproductor
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
              Sin videos registrados para este jugador
            </p>
            <button
              onClick={() => setShowVideoUpload(true)}
              className="text-xs text-primary font-display font-semibold hover:underline"
            >
              Subir primer video →
            </button>
          </div>
        ) : null}

        {playerVideos.length > 4 && (
          <button
            onClick={() => navigate("/reports")}
            className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground font-display flex items-center justify-center gap-1 transition-colors"
          >
            Ver todos en Reports <ChevronRight size={12} />
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
              <p className="text-sm font-display font-semibold text-foreground">Perfil de Rol Táctico</p>
              <p className="text-[10px] text-muted-foreground">Análisis IA — arquetipos, posiciones, capacidades</p>
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
                <p className="text-sm font-display font-semibold text-foreground">VITAS Intelligence</p>
                <span className="text-[8px] font-display font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary uppercase tracking-wider">NEW</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Clon · Proyección · Plan de desarrollo</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-primary group-hover:translate-x-0.5 transition-transform" />
        </button>
      </motion.div>

      {/* Acciones: Editar + Eliminar */}
      <motion.div variants={item} className="flex gap-3 pt-1">
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={() => navigate(`/players/${player.id}/edit`)}
        >
          <Pencil size={14} />
          Editar jugador
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="gap-2">
              <Trash2 size={14} />
              Eliminar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar a {player.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. Se eliminarán todos los datos del jugador,
                incluyendo su historial VSI y los análisis PHV calculados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Sí, eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    </motion.div>
  );
};

export default PlayerProfile;
