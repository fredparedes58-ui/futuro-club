/**
 * VITAS Phase 2 — VideoUpload component
 *
 * Drag & drop + click-to-browse video upload.
 * Shows full upload pipeline progress:
 *   idle → uploading (%) → processing (encode %) → analyzing → done / error
 */

import { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Video, X, CheckCircle2, AlertCircle,
  Loader2, Zap, Film, RefreshCw,
} from "lucide-react";
import { useVideoUpload, type UploadPhase, type DuplicateInfo } from "@/hooks/useVideoUpload";

interface VideoUploadProps {
  playerId?: string;
  onDone?: (videoId: string) => void;
  className?: string;
}

const ACCEPTED = "video/mp4,video/quicktime,video/x-msvideo,video/webm,video/*";
const MAX_SIZE_MB = 2048;

const phaseLabel: Record<UploadPhase, string> = {
  idle: "",
  hashing: "Verificando si ya subiste este video…",
  init: "Preparando upload…",
  uploading: "Subiendo video…",
  processing: "Procesando en Bunny Stream…",
  analyzing: "Analizando con IA…",
  done: "¡Listo!",
  error: "Error",
};

export default function VideoUpload({ playerId, onDone, className = "" }: VideoUploadProps) {
  const { state, upload, cancel, reset } = useVideoUpload(playerId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");

  /**
   * Callback para duplicados: muestra confirm nativo.
   * "OK" → reusar video existente (ahorra Bunny + IA)
   * "Cancel" → subir de nuevo (si el usuario quiere re-analizar)
   */
  const handleDuplicate = useCallback(async (dup: DuplicateInfo): Promise<"reuse" | "upload"> => {
    const fecha = dup.dateUploaded
      ? new Date(dup.dateUploaded).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
      : "fecha desconocida";
    const tituloPrev = dup.title || "(sin título)";
    const tieneAnalisis = dup.hasAnalysis ? "\n\n✅ Ese video YA tiene análisis IA generado." : "";
    const msg =
      `Ya subiste este mismo video anteriormente:\n\n` +
      `📹 "${tituloPrev}"\n` +
      `📅 ${fecha}` +
      tieneAnalisis +
      `\n\n¿Quieres reusarlo (ahorras costes de Bunny + IA) o subirlo de nuevo?\n\n` +
      `Aceptar = Reusar existente\n` +
      `Cancelar = Subir de nuevo y re-analizar`;
    const wantsReuse = typeof window !== "undefined" && window.confirm(msg);
    return wantsReuse ? "reuse" : "upload";
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        alert(`Archivo muy grande. Máximo ${MAX_SIZE_MB} MB.`);
        return;
      }
      upload(file, { title: title || file.name, onDuplicate: handleDuplicate }).then(() => {
        if (state.videoId && onDone) onDone(state.videoId);
      });
    },
    [upload, title, state.videoId, onDone, handleDuplicate]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const isActive = state.phase !== "idle" && state.phase !== "error" && state.phase !== "done";

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Title input (optional) */}
      {state.phase === "idle" && (
        <input
          type="text"
          placeholder="Título del video (opcional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm font-display text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
        />
      )}

      {/* Drop zone */}
      <AnimatePresence mode="wait">
        {state.phase === "idle" && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
              dragging
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/40 hover:bg-secondary/50"
            }`}
          >
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload size={24} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-display font-semibold text-foreground">
                {dragging ? "Suelta el video aquí" : "Arrastra un video o haz clic"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                MP4, MOV, AVI, WebM · Máximo {MAX_SIZE_MB} MB
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={onInputChange}
            />
          </motion.div>
        )}

        {/* Progress */}
        {isActive && (
          <motion.div
            key="progress"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="text-primary animate-spin" />
                <span className="text-sm font-display font-semibold text-foreground">
                  {phaseLabel[state.phase]}
                </span>
              </div>
              <button
                onClick={cancel}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Hashing progress */}
            {state.phase === "hashing" && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground font-display">
                  <span>Comprobando duplicados</span>
                  <span>{state.progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-muted-foreground/60"
                    animate={{ width: `${state.progress}%` }}
                    transition={{ type: "spring", stiffness: 50 }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Calculando hash del archivo para evitar re-subidas.
                </p>
              </div>
            )}

            {/* Upload progress bar */}
            {(state.phase === "uploading" || state.phase === "init") && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground font-display">
                  <span>Subiendo archivo</span>
                  <span>{state.progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    animate={{ width: `${state.progress}%` }}
                    transition={{ type: "spring", stiffness: 50 }}
                  />
                </div>
                {state.uploadSpeed > 0 && (
                  <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                    <span>
                      {state.uploadSpeed > 1024 * 1024
                        ? `${(state.uploadSpeed / (1024 * 1024)).toFixed(1)} MB/s`
                        : `${(state.uploadSpeed / 1024).toFixed(0)} KB/s`}
                    </span>
                    <span>
                      {state.etaSeconds > 60
                        ? `~${Math.ceil(state.etaSeconds / 60)} min restantes`
                        : `~${state.etaSeconds}s restantes`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Encode progress bar */}
            {state.phase === "processing" && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground font-display">
                  <div className="flex items-center gap-1">
                    <Film size={10} />
                    <span>Codificando video</span>
                  </div>
                  <span>{state.encodeProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-electric"
                    animate={{ width: `${state.encodeProgress}%` }}
                    transition={{ type: "spring", stiffness: 30 }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Bunny Stream está procesando el video. Esto puede tomar 1-3 minutos.
                </p>
              </div>
            )}

            {/* Analysis phase */}
            {state.phase === "analyzing" && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <Zap size={16} className="text-primary animate-pulse" />
                <div>
                  <p className="text-xs font-display font-semibold text-foreground">
                    Análisis táctico con IA
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Roboflow detecta jugadores → Claude genera informe táctico
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Done */}
        {state.phase === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass rounded-xl p-5 space-y-3"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 size={20} className="text-primary" />
              <div>
                <p className="text-sm font-display font-semibold text-foreground">
                  Video subido y analizado
                </p>
                <p className="text-xs text-muted-foreground">
                  ID: {state.videoId}
                </p>
              </div>
            </div>
            {state.analysis && (
              <div className="p-3 rounded-lg bg-secondary space-y-1">
                <p className="text-xs font-display font-semibold text-foreground">
                  {state.analysis.formationHint}
                </p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {state.analysis.notes}
                </p>
                <div className="flex gap-2 flex-wrap mt-1">
                  {state.analysis.keyMovements.map((m, i) => (
                    <span
                      key={i}
                      className="text-[9px] font-display px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-display transition-colors"
            >
              <RefreshCw size={12} />
              Subir otro video
            </button>
          </motion.div>
        )}

        {/* Error */}
        {state.phase === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass rounded-xl p-5 space-y-3"
          >
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-display font-semibold text-foreground">
                  {state.phase2Pending ? "Módulo disponible en Fase 2" : "Error al subir"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {state.phase2Pending
                    ? "Configura BUNNY_STREAM_LIBRARY_ID y BUNNY_STREAM_API_KEY en Vercel para activar uploads reales."
                    : state.error}
                </p>
              </div>
              {state.phase2Pending && (
                <span className="ml-auto text-[9px] font-display font-bold uppercase tracking-wider px-2 py-1 rounded bg-primary/10 text-primary shrink-0">
                  FASE 2
                </span>
              )}
            </div>
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-display transition-colors"
            >
              <RefreshCw size={12} />
              Reintentar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase 2 badge when idle */}
      {state.phase === "idle" && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-display">
          <Video size={10} />
          <span>Powered by Bunny Stream · Análisis Roboflow + Claude</span>
        </div>
      )}
    </div>
  );
}
